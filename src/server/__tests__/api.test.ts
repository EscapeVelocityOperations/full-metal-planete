import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../api.js';
import type { FastifyInstance } from 'fastify';

describe('API Endpoints', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = createServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/games', () => {
    it('should create a new game room', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.gameId).toBeDefined();
      expect(data.playerId).toBeDefined();
      expect(data.playerToken).toBeDefined();
      expect(data.joinUrl).toContain(data.gameId);
    });

    it('should reject empty player name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should trim player name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: '  Alice  ' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/games/:id/join', () => {
    it('should allow player to join existing game', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      const { gameId } = JSON.parse(createResponse.body);

      const joinResponse = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: 'Bob' },
      });

      expect(joinResponse.statusCode).toBe(200);
      const data = JSON.parse(joinResponse.body);
      expect(data.gameId).toBe(gameId);
      expect(data.playerId).toBeDefined();
      expect(data.playerToken).toBeDefined();
      expect(data.players).toHaveLength(2);
    });

    it('should reject joining non-existent game', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/games/nonexistent/join',
        payload: { playerName: 'Bob' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should assign different colors to players', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      const { gameId } = JSON.parse(createResponse.body);

      const joinResponse = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: 'Bob' },
      });

      const data = JSON.parse(joinResponse.body);
      expect(data.players[0].color).not.toBe(data.players[1].color);
    });

    it('should reject joining full room', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      const { gameId } = JSON.parse(createResponse.body);

      // Join 3 more players
      await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: 'Bob' },
      });

      await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: 'Carol' },
      });

      await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: 'Dave' },
      });

      // Try to join 5th player
      const response = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: 'Eve' },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('full');
    });

    it('should reject empty player name', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      const { gameId } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/games/:id', () => {
    it('should get game status', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      const { gameId } = JSON.parse(createResponse.body);

      const statusResponse = await app.inject({
        method: 'GET',
        url: `/api/games/${gameId}`,
      });

      expect(statusResponse.statusCode).toBe(200);
      const data = JSON.parse(statusResponse.body);
      expect(data.gameId).toBe(gameId);
      expect(data.state).toBe('waiting');
      expect(data.players).toHaveLength(1);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/games/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should include game state when playing', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      const { gameId } = JSON.parse(createResponse.body);

      const statusResponse = await app.inject({
        method: 'GET',
        url: `/api/games/${gameId}`,
      });

      expect(statusResponse.statusCode).toBe(200);
      const data = JSON.parse(statusResponse.body);
      expect(data.gameState).toBeUndefined(); // Not started yet
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.status).toBe('ok');
      expect(data.rooms).toBeDefined();
    });
  });

  describe('Integration flow', () => {
    it('should handle complete game creation and join flow', async () => {
      // Create game
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Alice' },
      });

      expect(createResponse.statusCode).toBe(200);
      const { gameId, playerId: player1Id } = JSON.parse(createResponse.body);

      // Second player joins
      const joinResponse = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/join`,
        payload: { playerName: 'Bob' },
      });

      expect(joinResponse.statusCode).toBe(200);
      const { playerId: player2Id, players } = JSON.parse(joinResponse.body);

      expect(players).toHaveLength(2);
      expect(players[0].name).toBe('Alice');
      expect(players[1].name).toBe('Bob');
      expect(players[0].id).toBe(player1Id);
      expect(players[1].id).toBe(player2Id);

      // Check game status
      const statusResponse = await app.inject({
        method: 'GET',
        url: `/api/games/${gameId}`,
      });

      expect(statusResponse.statusCode).toBe(200);
      const status = JSON.parse(statusResponse.body);
      expect(status.state).toBe('waiting');
      expect(status.players).toHaveLength(2);
    });
  });
});
