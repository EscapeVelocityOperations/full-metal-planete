import type { WebSocket } from 'ws';
import type { Room } from './room.js';
import type { WSMessage, GameAction, HexCoord } from './types.js';
import { initializeGame } from './game-starter.js';
import type { GameStorage, StoredAction } from './storage/types.js';
import { UnitType, GamePhase } from '../shared/game/types.js';

interface LandAstronefAction extends GameAction {
  type: 'LAND_ASTRONEF';
  position: HexCoord[];
  playerId: string;
}

export class WebSocketHandler {
  private connections: Map<string, Map<string, WebSocket>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private storage: GameStorage | null = null;
  private actionSeq: Map<string, number> = new Map();

  constructor(storage?: GameStorage) {
    this.storage = storage || null;
    this.startPingInterval();
  }

  /**
   * Set storage backend (can be set after construction)
   */
  setStorage(storage: GameStorage): void {
    this.storage = storage;
  }

  /**
   * Handle new WebSocket connection (or reconnection)
   */
  handleConnection(ws: WebSocket, room: Room, playerId: string): void {
    if (!this.connections.has(room.id)) {
      this.connections.set(room.id, new Map());
    }

    const player = room.getPlayer(playerId);
    const wasConnected = player?.isConnected;
    const isReconnection = player && !wasConnected && room.state !== 'waiting';

    // Close any existing connection for this player (stale connection cleanup)
    const existingWs = this.connections.get(room.id)?.get(playerId);
    if (existingWs && existingWs !== ws && existingWs.readyState === 1) {
      existingWs.close();
    }

    this.connections.get(room.id)!.set(playerId, ws);
    room.setPlayerConnected(playerId, true);
    room.updatePlayerLastSeen(playerId, new Date());

    if (isReconnection) {
      // Send full game state to reconnecting player
      this.sendToPlayer(room.id, playerId, {
        type: 'RECONNECT',
        payload: {
          gameState: room.gameState,
          players: room.players,
          roomState: room.state,
        },
        timestamp: Date.now(),
      });

      // Notify other players of reconnection
      this.broadcast(room.id, {
        type: 'PLAYER_RECONNECTED',
        payload: { playerId, player: room.getPlayer(playerId) },
        timestamp: Date.now(),
      }, [playerId]);

      console.log(`Player ${playerId} reconnected to game ${room.id}`);
    } else {
      // New connection - notify other players
      this.broadcast(room.id, {
        type: 'PLAYER_JOINED',
        payload: { player: room.getPlayer(playerId) },
        timestamp: Date.now(),
        playerId,
      }, [playerId]);
    }

    ws.on('message', (data: Buffer) => {
      this.handleMessage(room, playerId, data.toString());
    });

    ws.on('close', () => {
      this.handleDisconnect(room, playerId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for player ${playerId}:`, error);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(room: Room, playerId: string, data: string): Promise<void> {
    try {
      const message: WSMessage = JSON.parse(data);
      room.updatePlayerLastSeen(playerId, new Date());

      switch (message.type) {
        case 'READY':
          room.setPlayerReady(playerId, true);
          this.broadcast(room.id, {
            type: 'PLAYER_READY',
            payload: { playerId },
            timestamp: Date.now(),
          });

          // Check if all players are ready to start
          if (room.checkReadyState()) {
            // Initialize the game
            const gameState = initializeGame(room.id, room.players);
            room.startGame(gameState);

            // Persist to storage
            await this.persistGameStart(room, gameState);

            // Broadcast game start to all players
            this.broadcast(room.id, {
              type: 'GAME_START',
              payload: { gameState },
              timestamp: Date.now(),
            });
          }
          break;

        case 'ACTION':
          const action = message.payload as GameAction;

          // Log action to storage
          await this.persistAction(room.id, playerId, action);

          // Handle LAND_ASTRONEF specially - update game state and broadcast to ALL
          if (action.type === 'LAND_ASTRONEF') {
            const landingResult = this.processLandAstronef(room, action as LandAstronefAction);
            if (landingResult.success) {
              // Broadcast state update to ALL players (including sender)
              this.broadcast(room.id, {
                type: 'STATE_UPDATE',
                payload: { gameState: room.gameState },
                timestamp: Date.now(),
              });
              console.log(`Player ${playerId} landed astronef. Next player: ${room.gameState?.currentPlayer}`);
            } else {
              this.sendError(room.id, playerId, 'INVALID_LANDING', landingResult.error || 'Landing failed');
            }
          } else {
            // For other actions, broadcast to others (excluding sender)
            this.broadcast(room.id, {
              type: 'ACTION',
              payload: action,
              timestamp: Date.now(),
              playerId,
            }, [playerId]);
          }
          break;

        case 'END_TURN':
          this.broadcast(room.id, {
            type: 'TURN_END',
            payload: { playerId, savedAP: message.payload?.savedAP || 0 },
            timestamp: Date.now(),
          });
          break;

        case 'PONG':
          // Just update last seen
          break;

        case 'SYNC_REQUEST':
          // Client is requesting full game state sync (e.g., after reconnection)
          this.sendToPlayer(room.id, playerId, {
            type: 'STATE_UPDATE',
            payload: {
              gameState: room.gameState,
              players: room.players,
              roomState: room.state,
            },
            timestamp: Date.now(),
          });
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(room.id, playerId, 'INVALID_MESSAGE', 'Failed to parse message');
    }
  }

  /**
   * Handle player disconnect
   */
  private handleDisconnect(room: Room, playerId: string): void {
    room.setPlayerConnected(playerId, false);
    const roomConnections = this.connections.get(room.id);
    if (roomConnections) {
      roomConnections.delete(playerId);
      if (roomConnections.size === 0) {
        this.connections.delete(room.id);
      }
    }

    // During gameplay, send PLAYER_DISCONNECTED (they might reconnect)
    // In waiting/ready state, send PLAYER_LEFT (they've truly left)
    if (room.state === 'playing') {
      this.broadcast(room.id, {
        type: 'PLAYER_DISCONNECTED',
        payload: { playerId },
        timestamp: Date.now(),
      });
      console.log(`Player ${playerId} disconnected from game ${room.id}`);
    } else {
      this.broadcast(room.id, {
        type: 'PLAYER_LEFT',
        payload: { playerId },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Broadcast message to all players in room
   */
  broadcast(roomId: string, message: WSMessage, exclude: string[] = []): void {
    const roomConnections = this.connections.get(roomId);
    if (!roomConnections) return;

    const data = JSON.stringify(message);

    roomConnections.forEach((ws, playerId) => {
      if (!exclude.includes(playerId) && ws.readyState === 1) { // 1 = OPEN
        ws.send(data);
      }
    });
  }

  /**
   * Send message to specific player
   */
  sendToPlayer(roomId: string, playerId: string, message: WSMessage): void {
    const ws = this.connections.get(roomId)?.get(playerId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message to player
   */
  sendError(roomId: string, playerId: string, code: string, errorMessage: string): void {
    this.sendToPlayer(roomId, playerId, {
      type: 'ERROR',
      payload: { code, message: errorMessage },
      timestamp: Date.now(),
    });
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.connections.forEach((roomConnections) => {
        roomConnections.forEach((ws) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
          }
        });
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop ping interval
   */
  stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Close all connections for a room
   */
  closeRoom(roomId: string): void {
    const roomConnections = this.connections.get(roomId);
    if (roomConnections) {
      roomConnections.forEach((ws) => {
        ws.close();
      });
      this.connections.delete(roomId);
    }
  }

  /**
   * Get active connection count for a room
   */
  getConnectionCount(roomId: string): number {
    return this.connections.get(roomId)?.size || 0;
  }

  /**
   * Persist game start to storage
   */
  private async persistGameStart(room: Room, gameState: import('../shared/game/types.js').GameState): Promise<void> {
    if (!this.storage) return;

    try {
      // Save game state
      await this.storage.saveGameState(gameState);

      // Save room state
      await this.storage.saveRoom({
        id: room.id,
        state: room.state,
        hostId: room.hostId,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          color: p.color,
          isReady: p.isReady,
          isConnected: p.isConnected,
          lastSeen: p.lastSeen,
        })),
        createdAt: room.createdAt,
        gameState,
      });

      // Initialize action sequence for this game
      this.actionSeq.set(room.id, 0);

      console.log(`Game ${room.id} persisted to storage`);
    } catch (error) {
      console.error(`Failed to persist game start for ${room.id}:`, error);
    }
  }

  /**
   * Persist action to storage
   */
  private async persistAction(gameId: string, playerId: string, action: GameAction): Promise<void> {
    if (!this.storage) return;

    try {
      // Get and increment sequence number
      const seq = (this.actionSeq.get(gameId) || 0) + 1;
      this.actionSeq.set(gameId, seq);

      const storedAction: StoredAction = {
        type: action.type,
        playerId,
        timestamp: Date.now(),
        data: action as unknown as Record<string, unknown>,
        seq,
      };

      await this.storage.logAction(gameId, storedAction);
    } catch (error) {
      console.error(`Failed to persist action for game ${gameId}:`, error);
    }
  }

  /**
   * Process LAND_ASTRONEF action - update game state and advance turn
   */
  private processLandAstronef(room: Room, action: LandAstronefAction): { success: boolean; error?: string } {
    const gameState = room.gameState;
    if (!gameState) {
      return { success: false, error: 'No game state' };
    }

    // Verify it's landing phase
    if (gameState.phase !== GamePhase.Landing) {
      return { success: false, error: 'Not in landing phase' };
    }

    // Verify it's this player's turn
    if (gameState.currentPlayer !== action.playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Verify positions array has 4 hexes
    if (!action.position || action.position.length !== 4) {
      return { success: false, error: 'Invalid astronef positions' };
    }

    // Update astronef position (position[0] is center)
    const astronef = gameState.units.find(
      u => u.type === UnitType.Astronef && u.owner === action.playerId
    );
    if (astronef) {
      astronef.position = action.position[0];
    }

    // Update tower positions (positions 1, 2, 3 are podes for towers)
    const towers = gameState.units.filter(
      u => u.type === UnitType.Tower && u.owner === action.playerId
    );
    towers.forEach((tower, index) => {
      if (action.position[index + 1]) {
        tower.position = action.position[index + 1];
      }
    });

    // Update player's astronef position
    const player = gameState.players.find(p => p.id === action.playerId);
    if (player) {
      player.astronefPosition = action.position;
    }

    // Advance to next player in landing sequence
    const currentIndex = gameState.turnOrder.indexOf(action.playerId);
    const nextIndex = (currentIndex + 1) % gameState.turnOrder.length;
    const nextPlayerId = gameState.turnOrder[nextIndex];

    // Check if all players have landed (we've cycled back to first player)
    const allLanded = gameState.players.every(p =>
      p.astronefPosition && p.astronefPosition.length === 4
    );

    if (allLanded) {
      // All players have landed - advance to deployment phase
      gameState.phase = GamePhase.Deployment;
      gameState.turn = 2;
      gameState.currentPlayer = gameState.turnOrder[0];
      console.log(`All players landed. Advancing to deployment phase.`);
    } else {
      // Move to next player for landing
      gameState.currentPlayer = nextPlayerId;
    }

    // Update room's game state
    room.updateGameState(gameState);

    return { success: true };
  }
}
