/**
 * Redis Storage Implementation
 *
 * Implements GameStorage interface using Redis for fast real-time access.
 */

import type { Redis } from 'ioredis';
import type { GameState } from '../../shared/game/types.js';
import type { GameRoom } from '../types.js';
import type { GameStorage, StoredAction, GameMetadata, StorageConfig } from './types.js';

const DEFAULT_TTL = 86400; // 24 hours

export class RedisStorage implements GameStorage {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private config: StorageConfig;
  private messageHandlers: Map<string, (message: unknown) => void> = new Map();

  constructor(config: StorageConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.client) return;

    const Redis = (await import('ioredis')).default;
    this.client = new Redis(this.config.url || 'redis://localhost:6379');
    this.subscriber = new Redis(this.config.url || 'redis://localhost:6379');

    // Set up subscriber message handler
    this.subscriber.on('message', (channel: string, message: string) => {
      const handler = this.messageHandlers.get(channel);
      if (handler) {
        try {
          const parsed = JSON.parse(message);
          handler(parsed);
        } catch (error) {
          console.error('Error parsing Redis message:', error);
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    this.messageHandlers.clear();
  }

  isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  private getTtl(): number {
    return this.config.ttl || DEFAULT_TTL;
  }

  // ============================================================================
  // Room Operations
  // ============================================================================

  async saveRoom(room: GameRoom): Promise<void> {
    const client = this.getClient();
    const key = `room:${room.id}`;
    const data = this.serializeRoom(room);
    await client.set(key, data);
    await client.expire(key, this.getTtl());

    // Update room index
    await client.hset('rooms:index', room.id, JSON.stringify({
      gameId: room.id,
      state: room.state,
      turn: room.gameState?.turn || 0,
      playerCount: room.players.length,
      createdAt: room.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  async getRoom(gameId: string): Promise<GameRoom | null> {
    const client = this.getClient();
    const key = `room:${gameId}`;
    const data = await client.get(key);
    if (!data) return null;
    return this.deserializeRoom(data);
  }

  async deleteRoom(gameId: string): Promise<void> {
    const client = this.getClient();
    await client.del(
      `room:${gameId}`,
      `game:${gameId}:state`,
      `game:${gameId}:actions`,
      `game:${gameId}:sessions`
    );
    await client.hdel('rooms:index', gameId);
  }

  async listRooms(state?: string): Promise<GameMetadata[]> {
    const client = this.getClient();
    const allRooms = await client.hgetall('rooms:index');

    const rooms: GameMetadata[] = [];
    for (const [_, value] of Object.entries(allRooms)) {
      const metadata = JSON.parse(value) as GameMetadata;
      metadata.createdAt = new Date(metadata.createdAt);
      metadata.updatedAt = new Date(metadata.updatedAt);

      if (!state || metadata.state === state) {
        rooms.push(metadata);
      }
    }

    return rooms.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ============================================================================
  // Game State Operations
  // ============================================================================

  async saveGameState(state: GameState): Promise<void> {
    const client = this.getClient();
    const key = `game:${state.gameId}:state`;
    const data = this.serializeGameState(state);
    await client.set(key, data);
    await client.expire(key, this.getTtl());
  }

  async getGameState(gameId: string): Promise<GameState | null> {
    const client = this.getClient();
    const key = `game:${gameId}:state`;
    const data = await client.get(key);
    if (!data) return null;
    return this.deserializeGameState(data);
  }

  // ============================================================================
  // Action Log Operations
  // ============================================================================

  async logAction(gameId: string, action: StoredAction): Promise<void> {
    const client = this.getClient();
    const key = `game:${gameId}:actions`;
    await client.rpush(key, JSON.stringify(action));
    await client.expire(key, this.getTtl());
  }

  async getActions(gameId: string, fromSeq: number = 0): Promise<StoredAction[]> {
    const client = this.getClient();
    const key = `game:${gameId}:actions`;
    const actions = await client.lrange(key, fromSeq, -1);
    return actions.map(a => JSON.parse(a) as StoredAction);
  }

  // ============================================================================
  // Player Session Operations
  // ============================================================================

  async addPlayerSession(gameId: string, playerId: string, sessionId: string): Promise<void> {
    const client = this.getClient();
    const key = `game:${gameId}:sessions`;
    await client.hset(key, playerId, sessionId);
    await client.expire(key, this.getTtl());
  }

  async removePlayerSession(gameId: string, playerId: string): Promise<void> {
    const client = this.getClient();
    const key = `game:${gameId}:sessions`;
    await client.hdel(key, playerId);
  }

  async getPlayerSessions(gameId: string): Promise<Map<string, string>> {
    const client = this.getClient();
    const key = `game:${gameId}:sessions`;
    const sessions = await client.hgetall(key);
    return new Map(Object.entries(sessions));
  }

  // ============================================================================
  // Pub/Sub Operations
  // ============================================================================

  async subscribe(gameId: string, handler: (message: unknown) => void): Promise<void> {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not connected');
    }
    const channel = `game:${gameId}:events`;
    this.messageHandlers.set(channel, handler);
    await this.subscriber.subscribe(channel);
  }

  async unsubscribe(gameId: string): Promise<void> {
    if (!this.subscriber) return;
    const channel = `game:${gameId}:events`;
    this.messageHandlers.delete(channel);
    await this.subscriber.unsubscribe(channel);
  }

  async publish(gameId: string, message: unknown): Promise<void> {
    const client = this.getClient();
    const channel = `game:${gameId}:events`;
    await client.publish(channel, JSON.stringify(message));
  }

  // ============================================================================
  // Serialization Helpers
  // ============================================================================

  private serializeRoom(room: GameRoom): string {
    return JSON.stringify({
      ...room,
      createdAt: room.createdAt.toISOString(),
      players: room.players.map(p => ({
        ...p,
        lastSeen: p.lastSeen.toISOString(),
      })),
    });
  }

  private deserializeRoom(data: string): GameRoom {
    const room = JSON.parse(data);
    return {
      ...room,
      createdAt: new Date(room.createdAt),
      players: room.players.map((p: { lastSeen: string }) => ({
        ...p,
        lastSeen: new Date(p.lastSeen),
      })),
    };
  }

  private serializeGameState(state: GameState): string {
    // GameState is already JSON-serializable
    // Just ensure Date fields are converted to ISO strings if present
    return JSON.stringify(state);
  }

  private deserializeGameState(data: string): GameState {
    return JSON.parse(data) as GameState;
  }
}

/**
 * Create a Redis storage instance
 */
export function createRedisStorage(url?: string, ttl?: number): RedisStorage {
  return new RedisStorage({
    type: 'redis',
    url: url || process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: ttl || DEFAULT_TTL,
  });
}
