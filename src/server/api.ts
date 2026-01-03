import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { nanoid } from 'nanoid';
import { Room } from './room.js';
import { WebSocketHandler } from './websocket.js';
import { initializeStorage, shutdownStorage, getStorage } from './storage/index.js';
import type { GameStorage } from './storage/types.js';
import type { Player, PlayerColor, CreateGameResponse, JoinGameResponse, GameStatusResponse, GameRoom, SpectateGameResponse, Spectator } from './types.js';

const COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow'];

// Client URL for game links (same as Vite dev server in dev, production URL in prod)
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:10000';

// Cleanup configuration
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_GAME_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FINISHED_GAME_AGE_MS = 60 * 60 * 1000; // 1 hour for finished games

/**
 * Restore a Room instance from persisted GameRoom data
 */
function restoreRoom(data: GameRoom): Room {
  // Create a minimal host player for Room constructor
  const hostPlayer = data.players.find(p => p.id === data.hostId) || data.players[0];

  // Create room with host
  const room = new Room(data.id, {
    ...hostPlayer,
    lastSeen: new Date(hostPlayer.lastSeen),
  });

  // Restore additional players
  for (const player of data.players) {
    if (player.id !== room.hostId) {
      room.addPlayer({
        ...player,
        lastSeen: new Date(player.lastSeen),
      });
    }
  }

  // Restore spectators
  for (const spectator of data.spectators || []) {
    room.addSpectator({
      ...spectator,
      joinedAt: new Date(spectator.joinedAt),
    });
  }

  // Restore room state
  (room as any).state = data.state;
  (room as any).createdAt = new Date(data.createdAt);

  // Restore game state if exists
  if (data.gameState) {
    (room as any).gameState = data.gameState;
  }

  return room;
}

export function createServer() {
  const fastify = Fastify({ logger: true });
  const rooms = new Map<string, Room>();
  let storage: GameStorage | null = null;
  const wsHandler = new WebSocketHandler();

  fastify.register(cors, {
    origin: true,
  });

  fastify.register(websocket);

  /**
   * Initialize storage and load persisted rooms on startup
   */
  fastify.addHook('onReady', async () => {
    try {
      storage = await initializeStorage();
      wsHandler.setStorage(storage);
      fastify.log.info('Storage initialized');

      // Load existing rooms from storage
      const roomList = await storage.listRooms();
      for (const metadata of roomList) {
        const roomData = await storage.getRoom(metadata.gameId);
        if (roomData) {
          const room = restoreRoom(roomData);
          rooms.set(room.id, room);
          fastify.log.info(`Restored room ${room.id} (state: ${room.state}, turn: ${room.gameState?.turn || 0})`);
        }
      }

      if (roomList.length > 0) {
        fastify.log.info(`Restored ${roomList.length} rooms from storage`);
      }
    } catch (error) {
      fastify.log.error('Failed to initialize storage:', error);
      // Continue without persistence - in-memory only
    }
  });

  // Register WebSocket route AFTER websocket plugin is fully loaded
  fastify.after(() => {
    /**
     * WebSocket connection endpoint - use route() with wsHandler for proper WS handling
     * Supports both player and spectator connections
     */
    fastify.route({
      method: 'GET',
      url: '/api/games/:id/connect',
      // preValidation hook validates the token BEFORE WebSocket upgrade
      preValidation: async (request, reply) => {
        const { id } = request.params as { id: string };
        const token = (request.query as { token?: string }).token;

        if (!token) {
          return reply.code(401).send({ error: 'No token provided' });
        }

        // Decode token (simple base64, in production use JWT)
        // Player token format: gameId:playerId
        // Spectator token format: gameId:spectatorId:spectator
        let gameId: string, memberId: string, isSpectator: boolean;
        try {
          const decoded = Buffer.from(token, 'base64').toString('utf-8');
          const parts = decoded.split(':');
          gameId = parts[0];
          memberId = parts[1];
          isSpectator = parts[2] === 'spectator';
        } catch {
          return reply.code(401).send({ error: 'Invalid token' });
        }

        // Normalize for comparison (both should be lowercase now)
        if (gameId.toLowerCase() !== id.toLowerCase()) {
          return reply.code(401).send({ error: 'Token mismatch' });
        }

        const room = rooms.get(gameId.toLowerCase());
        if (!room) {
          return reply.code(404).send({ error: 'Game not found' });
        }

        if (isSpectator) {
          const spectator = room.getSpectator(memberId);
          if (!spectator) {
            return reply.code(403).send({ error: 'Spectator not in room' });
          }
          // Attach validated data to request for wsHandler
          (request as any).gameRoom = room;
          (request as any).spectatorId = memberId;
          (request as any).isSpectator = true;
        } else {
          const player = room.getPlayer(memberId);
          if (!player) {
            return reply.code(403).send({ error: 'Player not in room' });
          }
          // Attach validated data to request for wsHandler
          (request as any).gameRoom = room;
          (request as any).playerId = memberId;
          (request as any).isSpectator = false;
        }
      },
      handler: (_request, reply) => {
        // HTTP fallback - shouldn't reach here for WS connections
        reply.code(400).send({ error: 'WebSocket connection required' });
      },
      wsHandler: (socket, request) => {
        const room = (request as any).gameRoom;
        const isSpectator = (request as any).isSpectator;
        if (isSpectator) {
          const spectatorId = (request as any).spectatorId;
          wsHandler.handleSpectatorConnection(socket, room, spectatorId);
        } else {
          const playerId = (request as any).playerId;
          wsHandler.handleConnection(socket, room, playerId);
        }
      },
    });
  });

  /**
   * Create new game room
   */
  fastify.post<{
    Body: { playerName: string };
  }>('/api/games', async (request, reply) => {
    const { playerName } = request.body;

    if (!playerName || playerName.trim().length === 0) {
      return reply.status(400).send({ error: 'Player name is required' });
    }

    // Use lowercase for game IDs to avoid case-sensitivity issues
    const gameId = nanoid(6).toLowerCase();
    const playerId = `p1-${nanoid(6)}`;

    const hostPlayer: Player = {
      id: playerId,
      name: playerName.trim(),
      color: COLORS[0],
      isReady: false,
      isConnected: false,
      lastSeen: new Date(),
    };

    const room = new Room(gameId, hostPlayer);
    rooms.set(gameId, room);

    // Persist room to storage
    if (storage) {
      try {
        await storage.saveRoom(room.toJSON());
      } catch (error) {
        fastify.log.error(`Failed to persist new room ${gameId}:`, error);
      }
    }

    // Generate simple token (in production, use JWT)
    const playerToken = Buffer.from(`${gameId}:${playerId}`).toString('base64');

    const response: CreateGameResponse = {
      gameId,
      playerId,
      playerToken,
      joinUrl: `${CLIENT_URL}?gameId=${gameId}&playerId=${playerId}&token=${playerToken}`,
    };

    return reply.send(response);
  });

  /**
   * Join existing game room
   */
  fastify.post<{
    Params: { id: string };
    Body: { playerName: string };
  }>('/api/games/:id/join', async (request, reply) => {
    const { id } = request.params;
    const { playerName } = request.body;

    if (!playerName || playerName.trim().length === 0) {
      return reply.status(400).send({ error: 'Player name is required' });
    }

    // Normalize game ID to lowercase for case-insensitive lookup
    const room = rooms.get(id.toLowerCase());
    if (!room) {
      return reply.status(404).send({ error: 'Game not found' });
    }

    if (room.state !== 'waiting' && room.state !== 'ready') {
      return reply.status(400).send({ error: 'Game already in progress or finished' });
    }

    if (room.players.length >= 4) {
      return reply.status(400).send({ error: 'Room is full' });
    }

    const playerId = `p${room.players.length + 1}-${nanoid(6)}`;
    const usedColors = room.players.map(p => p.color);
    const availableColor = COLORS.find(c => !usedColors.includes(c))!;

    const player: Player = {
      id: playerId,
      name: playerName.trim(),
      color: availableColor,
      isReady: false,
      isConnected: false,
      lastSeen: new Date(),
    };

    try {
      room.addPlayer(player);
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }

    // Persist updated room to storage
    if (storage) {
      try {
        await storage.saveRoom(room.toJSON());
      } catch (error) {
        fastify.log.error(`Failed to persist room ${id} after player join:`, error);
      }
    }

    const playerToken = Buffer.from(`${id}:${playerId}`).toString('base64');

    const response: JoinGameResponse = {
      gameId: id,
      playerId,
      playerToken,
      players: room.players,
    };

    return reply.send(response);
  });

  /**
   * Join game as spectator (view-only)
   */
  fastify.post<{
    Params: { id: string };
    Body: { spectatorName?: string };
  }>('/api/games/:id/spectate', async (request, reply) => {
    const { id } = request.params;
    const { spectatorName } = request.body || {};

    // Normalize game ID to lowercase for case-insensitive lookup
    const room = rooms.get(id.toLowerCase());
    if (!room) {
      return reply.status(404).send({ error: 'Game not found' });
    }

    const spectatorId = `spec-${nanoid(6)}`;

    const spectator: Spectator = {
      id: spectatorId,
      name: spectatorName?.trim() || `Spectator ${room.spectators.length + 1}`,
      isConnected: false,
      joinedAt: new Date(),
    };

    try {
      room.addSpectator(spectator);
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }

    // Persist updated room to storage
    if (storage) {
      try {
        await storage.saveRoom(room.toJSON());
      } catch (error) {
        fastify.log.error(`Failed to persist room ${id} after spectator join:`, error);
      }
    }

    const spectatorToken = Buffer.from(`${id}:${spectatorId}:spectator`).toString('base64');

    const response: SpectateGameResponse = {
      gameId: id,
      spectatorId,
      spectatorToken,
      players: room.players,
      spectators: room.spectators,
      gameState: room.gameState,
    };

    return reply.send(response);
  });

  /**
   * Get game status
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/games/:id', async (request, reply) => {
    const { id } = request.params;
    // Normalize game ID to lowercase for case-insensitive lookup
    const room = rooms.get(id.toLowerCase());

    if (!room) {
      return reply.status(404).send({ error: 'Game not found' });
    }

    const response: GameStatusResponse = {
      gameId: room.id,
      state: room.state,
      turn: room.gameState?.turn || 0,
      currentPlayer: room.gameState?.currentPlayer || room.hostId,
      players: room.players,
      spectators: room.spectators,
      gameState: room.gameState,
    };

    return reply.send(response);
  });

  /**
   * Health check
   */
  fastify.get('/health', async () => {
    return { status: 'ok', rooms: rooms.size };
  });

  /**
   * Cleanup old rooms periodically
   */
  const cleanupInterval = setInterval(async () => {
    const now = Date.now();
    const roomsToDelete: string[] = [];

    rooms.forEach((room, id) => {
      const age = now - room.createdAt.getTime();
      const shouldDelete =
        age > MAX_GAME_AGE_MS ||
        (room.state === 'finished' && age > MAX_FINISHED_GAME_AGE_MS);

      if (shouldDelete) {
        roomsToDelete.push(id);
      }
    });

    for (const id of roomsToDelete) {
      wsHandler.closeRoom(id);
      rooms.delete(id);

      // Also delete from storage
      if (storage) {
        try {
          await storage.deleteRoom(id);
          fastify.log.info(`Cleaned up old room: ${id}`);
        } catch (error) {
          fastify.log.error(`Failed to delete room ${id} from storage:`, error);
        }
      }
    }

    if (roomsToDelete.length > 0) {
      fastify.log.info(`Cleaned up ${roomsToDelete.length} old rooms`);
    }
  }, CLEANUP_INTERVAL_MS);

  fastify.addHook('onClose', async () => {
    clearInterval(cleanupInterval);
    wsHandler.stopPingInterval();

    // Shutdown storage connection
    try {
      await shutdownStorage();
      fastify.log.info('Storage shutdown complete');
    } catch (error) {
      fastify.log.error('Failed to shutdown storage:', error);
    }
  });

  return fastify;
}
