import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { RedisManager } from '../redis.js';
import type { GameRoom, GameState, GameAction } from '../types.js';
import { GamePhase, TideLevel } from '../../shared/game/types.js';

// Skip under Bun - ioredis-mock has compatibility issues with Bun
const isBun = typeof globalThis.Bun !== 'undefined';

describe.skipIf(isBun)('RedisManager', () => {
  let redis: RedisManager;
  let mockClient: any;
  let mockSubscriber: any;

  beforeEach(() => {
    mockClient = new RedisMock();
    mockSubscriber = new RedisMock();
    redis = new RedisManager(mockClient, mockSubscriber);
  });

  afterEach(async () => {
    if (mockClient.status !== 'end') {
      await mockClient.flushall();
      mockClient.disconnect();
    }
    if (mockSubscriber.status !== 'end') {
      mockSubscriber.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect to Redis', async () => {
      expect(redis).toBeDefined();
      expect(mockClient).toBeDefined();
      expect(mockSubscriber).toBeDefined();
    });

    it('should disconnect from Redis', async () => {
      await expect(redis.disconnect()).resolves.not.toThrow();
    });
  });

  describe('Room Management', () => {
    const mockRoom: GameRoom = {
      id: 'abc123',
      state: 'waiting',
      hostId: 'p1-xyz',
      players: [
        {
          id: 'p1-xyz',
          name: 'Alice',
          color: 'red',
          isReady: false,
          isConnected: true,
          lastSeen: new Date(),
        },
      ],
      createdAt: new Date(),
    };

    it('should save room info', async () => {
      await redis.saveRoomInfo(mockRoom);
      const saved = await redis.getRoomInfo('abc123');
      expect(saved).toBeDefined();
      expect(saved?.id).toBe('abc123');
      expect(saved?.hostId).toBe('p1-xyz');
      expect(saved?.players).toHaveLength(1);
    });

    it('should return null for non-existent room', async () => {
      const room = await redis.getRoomInfo('nonexistent');
      expect(room).toBeNull();
    });

    it('should update room state', async () => {
      await redis.saveRoomInfo(mockRoom);
      mockRoom.state = 'ready';
      await redis.saveRoomInfo(mockRoom);
      const saved = await redis.getRoomInfo('abc123');
      expect(saved?.state).toBe('ready');
    });

    it('should delete room info', async () => {
      await redis.saveRoomInfo(mockRoom);
      await redis.deleteRoom('abc123');
      const room = await redis.getRoomInfo('abc123');
      expect(room).toBeNull();
    });
  });

  describe('Game State Persistence', () => {
    const mockGameState: GameState = {
      gameId: 'abc123',
      turn: 1,
      phase: GamePhase.Landing,
      currentPlayer: 'p1-xyz',
      turnOrder: ['p1-xyz', 'p2-abc'],
      turnStartTime: Date.now(),
      turnTimeLimit: 180000,
      actionPoints: 15,
      savedActionPoints: { 'p1-xyz': 0, 'p2-abc': 0 },
      currentTide: TideLevel.Normal,
      tideDeck: [TideLevel.Low, TideLevel.High, TideLevel.Normal],
      tideDiscard: [],
      terrain: [],
      units: [],
      minerals: [],
      bridges: [],
      players: [],
      buildsThisTurn: [],
      liftOffDecisions: { 'p1-xyz': null, 'p2-abc': null },
    };

    it('should save and retrieve game state', async () => {
      await redis.saveGameState(mockGameState);
      const saved = await redis.getGameState('abc123');
      expect(saved).toBeDefined();
      expect(saved?.turn).toBe(1);
      expect(saved?.currentPlayer).toBe('p1-xyz');
    });

    it('should return null for non-existent game state', async () => {
      const state = await redis.getGameState('nonexistent');
      expect(state).toBeNull();
    });

    it('should update game state', async () => {
      await redis.saveGameState(mockGameState);
      mockGameState.turn = 5;
      mockGameState.actionPoints = 10;
      await redis.saveGameState(mockGameState);
      const saved = await redis.getGameState('abc123');
      expect(saved?.turn).toBe(5);
      expect(saved?.actionPoints).toBe(10);
    });
  });

  describe('Action Log', () => {
    const mockAction: GameAction = {
      type: 'MOVE',
      unitId: 'tank-1',
      params: { to: { q: 5, r: 3 } },
      playerId: 'p1-xyz',
      timestamp: Date.now(),
    };

    it('should append action to log', async () => {
      await redis.logAction('abc123', mockAction);
      const actions = await redis.getActions('abc123');
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('MOVE');
      expect(actions[0].unitId).toBe('tank-1');
    });

    it('should retrieve multiple actions in order', async () => {
      const action1: GameAction = { ...mockAction, type: 'MOVE' };
      const action2: GameAction = { ...mockAction, type: 'FIRE', unitId: 'tank-2' };
      const action3: GameAction = { ...mockAction, type: 'LOAD', unitId: 'barge-1' };

      await redis.logAction('abc123', action1);
      await redis.logAction('abc123', action2);
      await redis.logAction('abc123', action3);

      const actions = await redis.getActions('abc123');
      expect(actions).toHaveLength(3);
      expect(actions[0].type).toBe('MOVE');
      expect(actions[1].type).toBe('FIRE');
      expect(actions[2].type).toBe('LOAD');
    });

    it('should return empty array for game with no actions', async () => {
      const actions = await redis.getActions('nonexistent');
      expect(actions).toEqual([]);
    });

    it('should retrieve actions since sequence number', async () => {
      await redis.logAction('abc123', { ...mockAction, type: 'MOVE' });
      await redis.logAction('abc123', { ...mockAction, type: 'FIRE' });
      await redis.logAction('abc123', { ...mockAction, type: 'LOAD' });

      const actions = await redis.getActionsSince('abc123', 1);
      expect(actions).toHaveLength(2);
      expect(actions[0].type).toBe('FIRE');
      expect(actions[1].type).toBe('LOAD');
    });
  });

  describe('Pub/Sub', () => {
    it('should publish and subscribe to game channel', async (context) => {
      const gameId = 'abc123';
      const testMessage = { type: 'PLAYER_JOINED', payload: { playerId: 'p2-abc' } };

      let receivedMessage: any = null;

      await redis.subscribe(gameId, (message) => {
        receivedMessage = message;
      });

      await redis.publish(gameId, testMessage);

      // Wait for message to be received
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.type).toBe('PLAYER_JOINED');
      expect(receivedMessage.payload.playerId).toBe('p2-abc');
    });

    it('should unsubscribe from game channel', async () => {
      const gameId = 'abc123';
      let messageCount = 0;

      await redis.subscribe(gameId, () => {
        messageCount++;
      });

      await redis.publish(gameId, { type: 'TEST' });
      await new Promise(resolve => setTimeout(resolve, 100));

      await redis.unsubscribe(gameId);

      await redis.publish(gameId, { type: 'TEST2' });
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only receive first message
      expect(messageCount).toBe(1);
    });

    it('should handle multiple subscribers', async () => {
      const gameId = 'abc123';
      let count1 = 0;
      let count2 = 0;

      // Create second Redis manager with separate clients
      const mockClient2 = new RedisMock();
      const mockSubscriber2 = new RedisMock();
      const redis2 = new RedisManager(mockClient2, mockSubscriber2);

      await redis.subscribe(gameId, () => { count1++; });
      await redis2.subscribe(gameId, () => { count2++; });

      await redis.publish(gameId, { type: 'TEST' });
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(count1).toBe(1);
      expect(count2).toBe(1);

      await redis2.disconnect();
    });
  });

  describe('TTL and Expiry', () => {
    it('should set TTL on room info', async () => {
      const mockRoom: GameRoom = {
        id: 'abc123',
        state: 'waiting',
        hostId: 'p1-xyz',
        players: [],
        createdAt: new Date(),
      };

      await redis.saveRoomInfo(mockRoom, 3600);
      const ttl = await mockClient.ttl('games:abc123:info');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should set TTL on game state', async () => {
      const mockGameState: GameState = {
        gameId: 'abc123',
        turn: 1,
        phase: GamePhase.Playing,
        currentPlayer: 'p1',
        turnOrder: ['p1'],
        turnStartTime: Date.now(),
        turnTimeLimit: 180000,
        actionPoints: 15,
        savedActionPoints: {},
        currentTide: TideLevel.Normal,
        tideDeck: [],
        tideDiscard: [],
        terrain: [],
        units: [],
        minerals: [],
        bridges: [],
        players: [],
        buildsThisTurn: [],
        liftOffDecisions: {},
      };

      await redis.saveGameState(mockGameState, 7200);
      const ttl = await mockClient.ttl('games:abc123:state');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(7200);
    });
  });

  describe('Player Management', () => {
    it('should add player to room', async () => {
      await redis.addPlayer('abc123', 'p1-xyz');
      const players = await mockClient.smembers('games:abc123:players');
      expect(players).toContain('p1-xyz');
    });

    it('should remove player from room', async () => {
      await redis.addPlayer('abc123', 'p1-xyz');
      await redis.addPlayer('abc123', 'p2-abc');
      await redis.removePlayer('abc123', 'p1-xyz');

      const players = await mockClient.smembers('games:abc123:players');
      expect(players).not.toContain('p1-xyz');
      expect(players).toContain('p2-abc');
    });

    it('should get all players in room', async () => {
      await redis.addPlayer('abc123', 'p1-xyz');
      await redis.addPlayer('abc123', 'p2-abc');
      await redis.addPlayer('abc123', 'p3-def');

      const players = await redis.getPlayers('abc123');
      expect(players).toHaveLength(3);
      expect(players).toContain('p1-xyz');
      expect(players).toContain('p2-abc');
      expect(players).toContain('p3-def');
    });
  });
});
