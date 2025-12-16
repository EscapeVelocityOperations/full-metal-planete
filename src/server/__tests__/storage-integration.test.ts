import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../api.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import type { GameStorage } from '../storage/types.js';

describe('Storage Integration', () => {
  let storage: MemoryStorage;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();
    server = createServer(storage);
  });

  afterEach(async () => {
    await server.close();
    await storage.disconnect();
  });

  describe('Room Persistence', () => {
    it('should persist room on create', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'TestHost' },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);

      // Wait a bit for async persistence
      await new Promise(resolve => setImmediate(resolve));

      // Check room is in storage
      const storedRoom = await storage.getRoom(data.gameId);
      expect(storedRoom).not.toBeNull();
      expect(storedRoom?.id).toBe(data.gameId);
      expect(storedRoom?.players.length).toBe(1);
      expect(storedRoom?.players[0].name).toBe('TestHost');
    });

    it('should persist room on player join', async () => {
      // Create game
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'Host' },
      });

      const gameData = JSON.parse(createResponse.payload);

      // Join game
      const joinResponse = await server.inject({
        method: 'POST',
        url: `/api/games/${gameData.gameId}/join`,
        payload: { playerName: 'Joiner' },
      });

      expect(joinResponse.statusCode).toBe(200);

      // Wait for async persistence
      await new Promise(resolve => setImmediate(resolve));

      // Check both players are persisted
      const storedRoom = await storage.getRoom(gameData.gameId);
      expect(storedRoom?.players.length).toBe(2);
      expect(storedRoom?.players[1].name).toBe('Joiner');
    });
  });

  describe('Storage Factory', () => {
    it('should work without storage (backwards compatible)', async () => {
      const serverNoStorage = createServer();
      await serverNoStorage.ready();

      const response = await serverNoStorage.inject({
        method: 'POST',
        url: '/api/games',
        payload: { playerName: 'NoStorageHost' },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.gameId).toBeDefined();

      await serverNoStorage.close();
    });
  });
});

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('Room Operations', () => {
    it('should save and retrieve room', async () => {
      const room = {
        id: 'test123',
        state: 'waiting' as const,
        hostId: 'player1',
        players: [{
          id: 'player1',
          name: 'Host',
          color: 'red' as const,
          isReady: false,
          isConnected: true,
          lastSeen: new Date(),
        }],
        createdAt: new Date(),
      };

      await storage.saveRoom(room);
      const retrieved = await storage.getRoom('test123');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test123');
      expect(retrieved?.players[0].name).toBe('Host');
    });

    it('should delete room', async () => {
      const room = {
        id: 'delete-test',
        state: 'waiting' as const,
        hostId: 'player1',
        players: [{
          id: 'player1',
          name: 'Host',
          color: 'red' as const,
          isReady: false,
          isConnected: true,
          lastSeen: new Date(),
        }],
        createdAt: new Date(),
      };

      await storage.saveRoom(room);
      await storage.deleteRoom('delete-test');
      const retrieved = await storage.getRoom('delete-test');

      expect(retrieved).toBeNull();
    });

    it('should list rooms by state', async () => {
      const room1 = {
        id: 'room1',
        state: 'waiting' as const,
        hostId: 'p1',
        players: [{ id: 'p1', name: 'H1', color: 'red' as const, isReady: false, isConnected: true, lastSeen: new Date() }],
        createdAt: new Date(),
      };
      const room2 = {
        id: 'room2',
        state: 'playing' as const,
        hostId: 'p2',
        players: [{ id: 'p2', name: 'H2', color: 'blue' as const, isReady: true, isConnected: true, lastSeen: new Date() }],
        createdAt: new Date(),
      };

      await storage.saveRoom(room1);
      await storage.saveRoom(room2);

      const waitingRooms = await storage.listRooms('waiting');
      expect(waitingRooms.length).toBe(1);
      expect(waitingRooms[0].gameId).toBe('room1');

      const playingRooms = await storage.listRooms('playing');
      expect(playingRooms.length).toBe(1);
      expect(playingRooms[0].gameId).toBe('room2');

      const allRooms = await storage.listRooms();
      expect(allRooms.length).toBe(2);
    });
  });

  describe('Action Log', () => {
    it('should log and retrieve actions', async () => {
      const action1 = { type: 'MOVE', playerId: 'p1', timestamp: Date.now(), data: { unitId: 'u1' }, seq: 1 };
      const action2 = { type: 'FIRE', playerId: 'p1', timestamp: Date.now(), data: { target: 'u2' }, seq: 2 };

      await storage.logAction('game1', action1);
      await storage.logAction('game1', action2);

      const actions = await storage.getActions('game1');
      expect(actions.length).toBe(2);
      expect(actions[0].type).toBe('MOVE');
      expect(actions[1].type).toBe('FIRE');
    });

    it('should retrieve actions from sequence number', async () => {
      await storage.logAction('game2', { type: 'A', playerId: 'p', timestamp: 1, data: {}, seq: 1 });
      await storage.logAction('game2', { type: 'B', playerId: 'p', timestamp: 2, data: {}, seq: 2 });
      await storage.logAction('game2', { type: 'C', playerId: 'p', timestamp: 3, data: {}, seq: 3 });

      const fromSeq2 = await storage.getActions('game2', 1);
      expect(fromSeq2.length).toBe(2);
      expect(fromSeq2[0].type).toBe('B');
    });
  });

  describe('Player Sessions', () => {
    it('should manage player sessions', async () => {
      await storage.addPlayerSession('game1', 'player1', 'session-abc');
      await storage.addPlayerSession('game1', 'player2', 'session-def');

      const sessions = await storage.getPlayerSessions('game1');
      expect(sessions.get('player1')).toBe('session-abc');
      expect(sessions.get('player2')).toBe('session-def');

      await storage.removePlayerSession('game1', 'player1');
      const updatedSessions = await storage.getPlayerSessions('game1');
      expect(updatedSessions.has('player1')).toBe(false);
      expect(updatedSessions.get('player2')).toBe('session-def');
    });
  });

  describe('Pub/Sub', () => {
    it('should publish and receive messages', async () => {
      const received: unknown[] = [];
      await storage.subscribe('game1', (msg) => received.push(msg));

      await storage.publish('game1', { type: 'TEST', data: 123 });

      // Wait for async delivery
      await new Promise(resolve => setImmediate(resolve));

      expect(received.length).toBe(1);
      expect((received[0] as any).type).toBe('TEST');
    });

    it('should unsubscribe from channel', async () => {
      const received: unknown[] = [];
      await storage.subscribe('game2', (msg) => received.push(msg));
      await storage.unsubscribe('game2');

      await storage.publish('game2', { type: 'IGNORED' });
      await new Promise(resolve => setImmediate(resolve));

      expect(received.length).toBe(0);
    });
  });
});
