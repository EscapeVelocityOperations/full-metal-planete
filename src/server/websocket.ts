import type { WebSocket } from 'ws';
import type { Room } from './room.js';
import type { WSMessage, GameAction } from './types.js';

export class WebSocketHandler {
  private connections: Map<string, Map<string, WebSocket>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startPingInterval();
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws: WebSocket, room: Room, playerId: string): void {
    if (!this.connections.has(room.id)) {
      this.connections.set(room.id, new Map());
    }

    this.connections.get(room.id)!.set(playerId, ws);
    room.setPlayerConnected(playerId, true);
    room.updatePlayerLastSeen(playerId, new Date());

    // Notify other players
    this.broadcast(room.id, {
      type: 'PLAYER_JOINED',
      payload: { player: room.getPlayer(playerId) },
      timestamp: Date.now(),
      playerId,
    }, [playerId]);

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
  private handleMessage(room: Room, playerId: string, data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);
      room.updatePlayerLastSeen(playerId, new Date());

      switch (message.type) {
        case 'READY':
          room.setPlayerReady(playerId, true);
          room.checkReadyState();
          this.broadcast(room.id, {
            type: 'PLAYER_READY',
            payload: { playerId },
            timestamp: Date.now(),
          });
          break;

        case 'ACTION':
          const action = message.payload as GameAction;
          this.broadcast(room.id, {
            type: 'ACTION',
            payload: action,
            timestamp: Date.now(),
            playerId,
          }, [playerId]);
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

    this.broadcast(room.id, {
      type: 'PLAYER_LEFT',
      payload: { playerId },
      timestamp: Date.now(),
    });
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
}
