/**
 * Server-specific types for Full Metal Planète backend
 */

// Import GameState from shared types
import type { GameState as SharedGameState } from '../shared/game/types.js';

// Re-export GameState type
export type GameState = SharedGameState;

// Player colors
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';

// Room states
export type RoomState = 'waiting' | 'ready' | 'playing' | 'finished';

// WebSocket message types
export type WSMessageType =
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'PLAYER_READY'
  | 'PLAYER_RECONNECTED'
  | 'PLAYER_DISCONNECTED'
  | 'GAME_START'
  | 'ACTION'
  | 'STATE_UPDATE'
  | 'TURN_END'
  | 'GAME_END'
  | 'ERROR'
  | 'PING'
  | 'PONG'
  | 'READY'
  | 'END_TURN'
  | 'RECONNECT'
  | 'SYNC_REQUEST'
  | 'SPECTATOR_JOINED'
  | 'SPECTATOR_LEFT'
  | 'SPECTATOR_SYNC';

// Action types from game
export type ActionType =
  | 'MOVE'
  | 'LAND_ASTRONEF'
  | 'LOAD'
  | 'UNLOAD'
  | 'FIRE'
  | 'CAPTURE'
  | 'BUILD'
  | 'ENTER_ASTRONEF'
  | 'EXIT_ASTRONEF'
  | 'LIFT_OFF';

// Basic types
export interface HexCoord {
  q: number;
  r: number;
}

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  isReady: boolean;
  isConnected: boolean;
  lastSeen: Date;
}

export interface Spectator {
  id: string;
  name: string;
  isConnected: boolean;
  joinedAt: Date;
}

export interface GameRoom {
  id: string;
  state: RoomState;
  hostId: string;
  players: Player[];
  spectators: Spectator[];
  createdAt: Date;
  gameState?: GameState;
}

// GameState is re-exported from shared/game/types.js (see top of file)

// Game action from client
export interface GameAction {
  type: ActionType;
  unitId?: string;
  params: any;
  playerId: string;
  timestamp: number;
}

// WebSocket message structure
export interface WSMessage {
  type: WSMessageType;
  payload: any;
  timestamp: number;
  playerId?: string;
  seq?: number;
}

// API response types
export interface CreateGameResponse {
  gameId: string;
  playerId: string;
  playerToken: string;
  joinUrl: string;
}

export interface JoinGameResponse {
  gameId: string;
  playerId: string;
  playerToken: string;
  players: Player[];
}

export interface SpectateGameResponse {
  gameId: string;
  spectatorId: string;
  spectatorToken: string;
  players: Player[];
  spectators: Spectator[];
  gameState?: GameState;
}

export interface GameStatusResponse {
  gameId: string;
  state: RoomState;
  turn: number;
  currentPlayer: string;
  players: Player[];
  spectators: Spectator[];
  gameState?: GameState;
}

// Error types
export interface GameError {
  code: string;
  message: string;
}
