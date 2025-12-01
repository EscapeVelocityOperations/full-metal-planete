/**
 * In-Memory Storage Implementation
 *
 * Implements GameStorage interface using in-memory Maps for development/testing.
 * No persistence - data is lost on server restart.
 */

import type { GameState } from '../../shared/game/types.js';
import type { GameRoom } from '../types.js';
import type { GameStorage, StoredAction, GameMetadata } from './types.js';

export class MemoryStorage implements GameStorage {
  private rooms: Map<string, GameRoom> = new Map();
  private gameStates: Map<string, GameState> = new Map();
  private actions: Map<string, StoredAction[]> = new Map();
  private sessions: Map<string, Map<string, string>> = new Map();
  private subscribers: Map<string, Set<(message: unknown) => void>> = new Map();
  private connected: boolean = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.rooms.clear();
    this.gameStates.clear();
    this.actions.clear();
    this.sessions.clear();
    this.subscribers.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================================
  // Room Operations
  // ============================================================================

  async saveRoom(room: GameRoom): Promise<void> {
    // Deep clone to prevent reference issues
    this.rooms.set(room.id, JSON.parse(JSON.stringify(room)));
  }

  async getRoom(gameId: string): Promise<GameRoom | null> {
    const room = this.rooms.get(gameId);
    if (!room) return null;

    // Deep clone and restore Date objects
    const cloned = JSON.parse(JSON.stringify(room));
    cloned.createdAt = new Date(cloned.createdAt);
    cloned.players = cloned.players.map((p: { lastSeen: string }) => ({
      ...p,
      lastSeen: new Date(p.lastSeen),
    }));
    return cloned;
  }

  async deleteRoom(gameId: string): Promise<void> {
    this.rooms.delete(gameId);
    this.gameStates.delete(gameId);
    this.actions.delete(gameId);
    this.sessions.delete(gameId);
    this.subscribers.delete(gameId);
  }

  async listRooms(state?: string): Promise<GameMetadata[]> {
    const rooms: GameMetadata[] = [];

    for (const [gameId, room] of this.rooms) {
      if (!state || room.state === state) {
        rooms.push({
          gameId,
          state: room.state,
          turn: room.gameState?.turn || 0,
          playerCount: room.players.length,
          createdAt: new Date(room.createdAt),
          updatedAt: new Date(),
        });
      }
    }

    return rooms.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ============================================================================
  // Game State Operations
  // ============================================================================

  async saveGameState(state: GameState): Promise<void> {
    // Deep clone to prevent reference issues
    this.gameStates.set(state.gameId, JSON.parse(JSON.stringify(state)));
  }

  async getGameState(gameId: string): Promise<GameState | null> {
    const state = this.gameStates.get(gameId);
    if (!state) return null;
    return JSON.parse(JSON.stringify(state));
  }

  // ============================================================================
  // Action Log Operations
  // ============================================================================

  async logAction(gameId: string, action: StoredAction): Promise<void> {
    if (!this.actions.has(gameId)) {
      this.actions.set(gameId, []);
    }
    this.actions.get(gameId)!.push({ ...action });
  }

  async getActions(gameId: string, fromSeq: number = 0): Promise<StoredAction[]> {
    const actions = this.actions.get(gameId) || [];
    return actions.slice(fromSeq).map(a => ({ ...a }));
  }

  // ============================================================================
  // Player Session Operations
  // ============================================================================

  async addPlayerSession(gameId: string, playerId: string, sessionId: string): Promise<void> {
    if (!this.sessions.has(gameId)) {
      this.sessions.set(gameId, new Map());
    }
    this.sessions.get(gameId)!.set(playerId, sessionId);
  }

  async removePlayerSession(gameId: string, playerId: string): Promise<void> {
    this.sessions.get(gameId)?.delete(playerId);
  }

  async getPlayerSessions(gameId: string): Promise<Map<string, string>> {
    return new Map(this.sessions.get(gameId) || []);
  }

  // ============================================================================
  // Pub/Sub Operations (simulated)
  // ============================================================================

  async subscribe(gameId: string, handler: (message: unknown) => void): Promise<void> {
    if (!this.subscribers.has(gameId)) {
      this.subscribers.set(gameId, new Set());
    }
    this.subscribers.get(gameId)!.add(handler);
  }

  async unsubscribe(gameId: string): Promise<void> {
    this.subscribers.delete(gameId);
  }

  async publish(gameId: string, message: unknown): Promise<void> {
    const handlers = this.subscribers.get(gameId);
    if (handlers) {
      const clonedMessage = JSON.parse(JSON.stringify(message));
      handlers.forEach(handler => {
        // Simulate async behavior
        setImmediate(() => handler(clonedMessage));
      });
    }
  }

  // ============================================================================
  // Debug/Test Helpers
  // ============================================================================

  /**
   * Get all room IDs (for testing)
   */
  getAllRoomIds(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.rooms.clear();
    this.gameStates.clear();
    this.actions.clear();
    this.sessions.clear();
  }
}

/**
 * Create an in-memory storage instance
 */
export function createMemoryStorage(): MemoryStorage {
  return new MemoryStorage();
}
