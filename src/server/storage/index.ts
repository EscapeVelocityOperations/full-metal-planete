/**
 * Storage Module - Abstract storage layer for game persistence
 *
 * Provides a pluggable storage interface with implementations for:
 * - Redis (fast real-time cache)
 * - Memory (development/testing)
 * - PostgreSQL (future - persistent storage)
 */

export * from './types.js';
export { RedisStorage, createRedisStorage } from './redis-storage.js';
export { MemoryStorage, createMemoryStorage } from './memory-storage.js';

import type { GameStorage, StorageConfig } from './types.js';
import { RedisStorage } from './redis-storage.js';
import { MemoryStorage } from './memory-storage.js';

/**
 * Create a storage instance based on configuration
 */
export function createStorage(config: StorageConfig): GameStorage {
  switch (config.type) {
    case 'redis':
      return new RedisStorage(config);

    case 'memory':
      return new MemoryStorage();

    case 'postgresql':
      // Placeholder for future PostgreSQL implementation
      throw new Error('PostgreSQL storage not yet implemented');

    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

/**
 * Create storage from environment variables
 *
 * Environment variables:
 * - STORAGE_TYPE: 'redis' | 'memory' | 'postgresql'
 * - REDIS_URL: Redis connection URL
 * - DATABASE_URL: PostgreSQL connection URL
 * - STORAGE_TTL: Default TTL for cached items
 */
export function createStorageFromEnv(): GameStorage {
  const type = (process.env.STORAGE_TYPE || 'memory') as StorageConfig['type'];

  const config: StorageConfig = {
    type,
    ttl: process.env.STORAGE_TTL ? parseInt(process.env.STORAGE_TTL, 10) : undefined,
  };

  switch (type) {
    case 'redis':
      config.url = process.env.REDIS_URL || 'redis://localhost:6379';
      break;

    case 'postgresql':
      config.url = process.env.DATABASE_URL;
      break;
  }

  return createStorage(config);
}

/**
 * Global storage instance (singleton)
 */
let globalStorage: GameStorage | null = null;

/**
 * Get or create the global storage instance
 */
export function getStorage(): GameStorage {
  if (!globalStorage) {
    globalStorage = createStorageFromEnv();
  }
  return globalStorage;
}

/**
 * Set a custom global storage instance (useful for testing)
 */
export function setStorage(storage: GameStorage): void {
  globalStorage = storage;
}

/**
 * Initialize the global storage (connect)
 */
export async function initializeStorage(): Promise<GameStorage> {
  const storage = getStorage();
  if (!storage.isConnected()) {
    await storage.connect();
  }
  return storage;
}

/**
 * Shutdown the global storage (disconnect)
 */
export async function shutdownStorage(): Promise<void> {
  if (globalStorage && globalStorage.isConnected()) {
    await globalStorage.disconnect();
  }
  globalStorage = null;
}
