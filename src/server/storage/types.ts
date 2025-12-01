/**
 * Abstract Storage Types for Full Metal Planete
 *
 * Defines the interface for game state persistence, allowing easy
 * swap between Redis (cache/real-time) and PostgreSQL (persistent).
 */

import type { GameState } from '../../shared/game/types.js';
import type { GameRoom } from '../types.js';

/**
 * Serialized game action for storage
 */
export interface StoredAction {
  type: string;
  playerId: string;
  timestamp: number;
  data: Record<string, unknown>;
  seq: number;
}

/**
 * Game metadata for listing/searching
 */
export interface GameMetadata {
  gameId: string;
  state: string;
  turn: number;
  playerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Abstract storage interface for game persistence
 */
export interface GameStorage {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Room operations
  saveRoom(room: GameRoom): Promise<void>;
  getRoom(gameId: string): Promise<GameRoom | null>;
  deleteRoom(gameId: string): Promise<void>;
  listRooms(state?: string): Promise<GameMetadata[]>;

  // Game state operations
  saveGameState(state: GameState): Promise<void>;
  getGameState(gameId: string): Promise<GameState | null>;

  // Action log (for replay/audit)
  logAction(gameId: string, action: StoredAction): Promise<void>;
  getActions(gameId: string, fromSeq?: number): Promise<StoredAction[]>;

  // Player session tracking
  addPlayerSession(gameId: string, playerId: string, sessionId: string): Promise<void>;
  removePlayerSession(gameId: string, playerId: string): Promise<void>;
  getPlayerSessions(gameId: string): Promise<Map<string, string>>;

  // Pub/Sub for real-time updates (optional - may not apply to all backends)
  subscribe?(gameId: string, handler: (message: unknown) => void): Promise<void>;
  unsubscribe?(gameId: string): Promise<void>;
  publish?(gameId: string, message: unknown): Promise<void>;
}

/**
 * Storage configuration options
 */
export interface StorageConfig {
  type: 'redis' | 'postgresql' | 'memory';
  url?: string;
  ttl?: number; // Default TTL for cached items in seconds
}

/**
 * Factory function type for creating storage instances
 */
export type StorageFactory = (config: StorageConfig) => GameStorage;
