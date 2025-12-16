import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { nanoid } from 'nanoid';
import { Room } from './room.js';
import { WebSocketHandler } from './websocket.js';
import type { Player, PlayerColor, CreateGameResponse, JoinGameResponse, GameStatusResponse, GameRoom } from './types.js';
import type { GameStorage } from './storage/types.js';

const COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow'];

// Client URL for game links (same as Vite dev server in dev, production URL in prod)
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:10000';

export function createServer(storage?: GameStorage) {
  const fastify = Fastify({ logger: true });
  const rooms = new Map<string, Room>();
  const wsHandler = new WebSocketHandler(storage);

  // Load existing games from storage on startup
  if (storage) {
    loadGamesFromStorage(storage, rooms).catch(err => {
      fastify.log.error('Failed to load games from storage:', err);
    });
  }

  fastify.register(cors, {
    origin: true,
  });

  fastify.register(websocket);

  // Register WebSocket route AFTER websocket plugin is fully loaded
  fastify.after(() => {
    /**
     * WebSocket connection endpoint - use route() with wsHandler for proper WS handling
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
        let gameId: string, playerId: string;
        try {
          const decoded = Buffer.from(token, 'base64').toString('utf-8');
          [gameId, playerId] = decoded.split(':');
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

        const player = room.getPlayer(playerId);
        if (!player) {
          return reply.code(403).send({ error: 'Player not in room' });
        }

        // Attach validated data to request for wsHandler
        (request as any).gameRoom = room;
        (request as any).playerId = playerId;
      },
      handler: (_request, reply) => {
        // HTTP fallback - shouldn't reach here for WS connections
        reply.code(400).send({ error: 'WebSocket connection required' });
      },
      wsHandler: (socket, request) => {
        const room = (request as any).gameRoom;
        const playerId = (request as any).playerId;
        wsHandler.handleConnection(socket, room, playerId);
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

    // Persist to storage
    if (storage) {
      await storage.saveRoom(roomToStorable(room));
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

    // Persist to storage
    if (storage) {
      await storage.saveRoom(roomToStorable(room));
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
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const finishedMaxAge = 60 * 60 * 1000; // 1 hour for finished games

    for (const [id, room] of rooms) {
      const age = now - room.createdAt.getTime();
      if (age > maxAge || (room.state === 'finished' && age > finishedMaxAge)) {
        wsHandler.closeRoom(id);
        rooms.delete(id);
        // Also delete from storage
        if (storage) {
          try {
            await storage.deleteRoom(id);
          } catch (err) {
            fastify.log.error(`Failed to delete room ${id} from storage: ${err}`);
          }
        }
      }
    }
  }, 60 * 60 * 1000); // Every hour

  fastify.addHook('onClose', () => {
    clearInterval(cleanupInterval);
    wsHandler.stopPingInterval();
  });

  return fastify;
}

/**
 * Convert Room instance to storable format
 */
function roomToStorable(room: Room): GameRoom {
  return {
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
    gameState: room.gameState,
  };
}

/**
 * Load active games from storage into memory
 */
async function loadGamesFromStorage(storage: GameStorage, rooms: Map<string, Room>): Promise<void> {
  // Load rooms that are waiting, ready, or playing (not finished)
  const activeStates = ['waiting', 'ready', 'playing'];

  for (const state of activeStates) {
    const gameMetadataList = await storage.listRooms(state);

    for (const metadata of gameMetadataList) {
      if (rooms.has(metadata.gameId)) continue;

      const storedRoom = await storage.getRoom(metadata.gameId);
      if (!storedRoom || storedRoom.players.length === 0) continue;

      // Recreate Room from stored data
      const hostPlayer = storedRoom.players[0];
      const room = new Room(storedRoom.id, hostPlayer);

      // Add remaining players
      for (let i = 1; i < storedRoom.players.length; i++) {
        try {
          room.addPlayer(storedRoom.players[i]);
        } catch {
          // Player already added or room full
        }
      }

      // Restore state
      for (const player of storedRoom.players) {
        room.setPlayerReady(player.id, player.isReady);
      }

      // Restore game state if game was in progress
      if (storedRoom.gameState) {
        room.startGame(storedRoom.gameState);
      }

      rooms.set(storedRoom.id, room);
      console.log(`Restored game ${storedRoom.id} from storage (state: ${storedRoom.state})`);
    }
  }
}
