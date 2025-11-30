import type { Redis } from 'ioredis';
import type { GameRoom, GameState, GameAction } from './types.js';

export class RedisManager {
  private client: Redis;
  private subscriber: Redis;
  private messageHandlers: Map<string, (message: any) => void> = new Map();

  constructor(client: Redis, subscriber: Redis) {
    this.client = client;
    this.subscriber = subscriber;

    // Set up subscriber message handler
    this.subscriber.on('message', (channel: string, message: string) => {
      const handler = this.messageHandlers.get(channel);
      if (handler) {
        try {
          const parsed = JSON.parse(message);
          handler(parsed);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      }
    });
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
    await this.subscriber.quit();
  }

  /**
   * Save room information to Redis
   */
  async saveRoomInfo(room: GameRoom, ttl: number = 86400): Promise<void> {
    const key = `games:${room.id}:info`;
    await this.client.set(key, JSON.stringify(room));
    await this.client.expire(key, ttl);
  }

  /**
   * Get room information from Redis
   */
  async getRoomInfo(gameId: string): Promise<GameRoom | null> {
    const key = `games:${gameId}:info`;
    const data = await this.client.get(key);
    if (!data) return null;

    const room = JSON.parse(data);
    // Convert date strings back to Date objects
    room.createdAt = new Date(room.createdAt);
    room.players = room.players.map((p: any) => ({
      ...p,
      lastSeen: new Date(p.lastSeen),
    }));
    return room;
  }

  /**
   * Delete room and all associated data
   */
  async deleteRoom(gameId: string): Promise<void> {
    await this.client.del(
      `games:${gameId}:info`,
      `games:${gameId}:state`,
      `games:${gameId}:actions`,
      `games:${gameId}:players`
    );
  }

  /**
   * Save game state to Redis
   */
  async saveGameState(state: GameState, ttl: number = 3600): Promise<void> {
    const key = `games:${state.gameId}:state`;
    await this.client.set(key, JSON.stringify(state));
    await this.client.expire(key, ttl);
  }

  /**
   * Get game state from Redis
   */
  async getGameState(gameId: string): Promise<GameState | null> {
    const key = `games:${gameId}:state`;
    const data = await this.client.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Append action to game action log
   */
  async logAction(gameId: string, action: GameAction): Promise<void> {
    const key = `games:${gameId}:actions`;
    await this.client.rpush(key, JSON.stringify(action));
  }

  /**
   * Get all actions for a game
   */
  async getActions(gameId: string): Promise<GameAction[]> {
    const key = `games:${gameId}:actions`;
    const actions = await this.client.lrange(key, 0, -1);
    return actions.map(a => JSON.parse(a));
  }

  /**
   * Get actions since a specific sequence number
   */
  async getActionsSince(gameId: string, seq: number): Promise<GameAction[]> {
    const key = `games:${gameId}:actions`;
    const actions = await this.client.lrange(key, seq, -1);
    return actions.map(a => JSON.parse(a));
  }

  /**
   * Add player to room player set
   */
  async addPlayer(gameId: string, playerId: string): Promise<void> {
    const key = `games:${gameId}:players`;
    await this.client.sadd(key, playerId);
  }

  /**
   * Remove player from room player set
   */
  async removePlayer(gameId: string, playerId: string): Promise<void> {
    const key = `games:${gameId}:players`;
    await this.client.srem(key, playerId);
  }

  /**
   * Get all players in room
   */
  async getPlayers(gameId: string): Promise<string[]> {
    const key = `games:${gameId}:players`;
    return await this.client.smembers(key);
  }

  /**
   * Subscribe to game channel for pub/sub
   */
  async subscribe(gameId: string, handler: (message: any) => void): Promise<void> {
    const channel = `game:${gameId}`;
    this.messageHandlers.set(channel, handler);
    await this.subscriber.subscribe(channel);
  }

  /**
   * Unsubscribe from game channel
   */
  async unsubscribe(gameId: string): Promise<void> {
    const channel = `game:${gameId}`;
    this.messageHandlers.delete(channel);
    await this.subscriber.unsubscribe(channel);
  }

  /**
   * Publish message to game channel
   */
  async publish(gameId: string, message: any): Promise<void> {
    const channel = `game:${gameId}`;
    await this.client.publish(channel, JSON.stringify(message));
  }
}

/**
 * Create Redis manager with connection
 */
export function createRedisManager(redisUrl: string): RedisManager {
  const Redis = require('ioredis').default;
  const client = new Redis(redisUrl);
  const subscriber = new Redis(redisUrl);
  return new RedisManager(client, subscriber);
}
