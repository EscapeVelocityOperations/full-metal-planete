import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { nanoid } from 'nanoid';
import { Room } from './room.js';
import { WebSocketHandler } from './websocket.js';
import type { Player, PlayerColor, CreateGameResponse, JoinGameResponse, GameStatusResponse } from './types.js';

const COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow'];

// Client URL for game links (Vite dev server or production URL)
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

export function createServer() {
  const fastify = Fastify({ logger: true });
  const rooms = new Map<string, Room>();
  const wsHandler = new WebSocketHandler();

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

        if (gameId !== id) {
          return reply.code(401).send({ error: 'Token mismatch' });
        }

        const room = rooms.get(gameId);
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

    const gameId = nanoid(6);
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

    const room = rooms.get(id);
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
    const room = rooms.get(id);

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
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    rooms.forEach((room, id) => {
      const age = now - room.createdAt.getTime();
      if (age > maxAge || (room.state === 'finished' && age > 60 * 60 * 1000)) {
        wsHandler.closeRoom(id);
        rooms.delete(id);
      }
    });
  }, 60 * 60 * 1000); // Every hour

  fastify.addHook('onClose', () => {
    clearInterval(cleanupInterval);
    wsHandler.stopPingInterval();
  });

  return fastify;
}
