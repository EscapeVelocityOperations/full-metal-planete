/**
 * Full Metal Planete - Game Replay Types and Utilities
 *
 * Implements game replay system for post-game analysis and sharing:
 * - Store all actions in order
 * - Replay at variable speed
 * - Step forward/backward through turns
 * - Export replay data for sharing
 */

import type { GameState, GameAction, HexCoord, Player, HexTerrain, TideLevel } from './types';

/**
 * A recorded game action with full metadata for replay
 */
export interface ReplayAction {
  /** Sequence number (1-indexed, global across game) */
  seq: number;
  /** Action type (MOVE, LOAD, FIRE, etc.) */
  type: string;
  /** Player who performed the action */
  playerId: string;
  /** Turn number when action occurred */
  turn: number;
  /** Timestamp when action was recorded */
  timestamp: number;
  /** Full action payload */
  data: GameAction;
  /** AP cost of this action */
  apCost: number;
  /** Human-readable description */
  description: string;
}

/**
 * Turn boundary marker for navigation
 */
export interface TurnMarker {
  /** Turn number */
  turn: number;
  /** Player whose turn it was */
  playerId: string;
  /** Player name for display */
  playerName: string;
  /** Player color for display */
  playerColor: string;
  /** First action sequence in this turn */
  startSeq: number;
  /** Last action sequence in this turn */
  endSeq: number;
  /** Game phase during this turn */
  phase: string;
  /** Tide level during this turn */
  tide: TideLevel;
}

/**
 * Full game replay data for export/import
 */
export interface ReplayData {
  /** Replay format version for compatibility */
  version: 1;
  /** Unique game identifier */
  gameId: string;
  /** When the game was played */
  playedAt: number;
  /** Game duration in milliseconds */
  duration: number;
  /** Initial game state (turn 1, before any actions) */
  initialState: GameState;
  /** All actions recorded during the game */
  actions: ReplayAction[];
  /** Turn boundaries for quick navigation */
  turnMarkers: TurnMarker[];
  /** Final scores */
  finalScores: Record<string, number>;
  /** Winner(s) player IDs */
  winners: string[];
  /** Player metadata for display */
  players: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  /** Map metadata */
  mapInfo: {
    width: number;
    height: number;
    terrain: HexTerrain[];
  };
}

/**
 * Current replay playback state
 */
export interface ReplayPlaybackState {
  /** Is replay currently playing */
  isPlaying: boolean;
  /** Playback speed multiplier (0.5, 1, 2, 4) */
  speed: number;
  /** Current action sequence position (0 = initial state, before first action) */
  currentSeq: number;
  /** Total number of actions */
  totalActions: number;
  /** Current turn being viewed */
  currentTurn: number;
  /** Total turns in the game */
  totalTurns: number;
  /** Current player at this point in replay */
  currentPlayerId: string;
  /** Game state at current position */
  gameState: GameState | null;
}

/**
 * Playback speed options
 */
export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/**
 * Default interval between actions during playback (ms)
 */
export const DEFAULT_ACTION_INTERVAL = 1000;

/**
 * Generate a human-readable description for an action
 */
export function describeAction(action: GameAction, state?: GameState): string {
  switch (action.type) {
    case 'MOVE': {
      const moveAction = action as GameAction & { unitId: string; path: HexCoord[] };
      const unit = state?.units.find(u => u.id === moveAction.unitId);
      const unitType = unit?.type || 'unit';
      const dest = moveAction.path[moveAction.path.length - 1];
      return `Moved ${unitType} to (${dest.q}, ${dest.r})`;
    }
    case 'LOAD': {
      const loadAction = action as GameAction & { transporterId: string; cargoId: string };
      const transporter = state?.units.find(u => u.id === loadAction.transporterId);
      const transporterType = transporter?.type || 'unit';
      const isMineral = loadAction.cargoId.includes('mineral');
      return `${transporterType} loaded ${isMineral ? 'mineral' : 'cargo'}`;
    }
    case 'UNLOAD': {
      const unloadAction = action as GameAction & { transporterId: string; cargoId: string; destination: HexCoord };
      const transporter = state?.units.find(u => u.id === unloadAction.transporterId);
      const transporterType = transporter?.type || 'unit';
      const dest = unloadAction.destination;
      return `${transporterType} dropped cargo at (${dest.q}, ${dest.r})`;
    }
    case 'FIRE': {
      const fireAction = action as GameAction & { targetHex: HexCoord };
      return `Fired at (${fireAction.targetHex.q}, ${fireAction.targetHex.r})`;
    }
    case 'CAPTURE': {
      return 'Captured unit';
    }
    case 'CAPTURE_ASTRONEF': {
      return 'Captured astronef!';
    }
    case 'BUILD': {
      const buildAction = action as GameAction & { unitType: string };
      return `Built ${buildAction.unitType}`;
    }
    case 'LAND_ASTRONEF': {
      const landAction = action as GameAction & { position: HexCoord[] };
      const pos = landAction.position[0];
      return `Landed astronef at (${pos.q}, ${pos.r})`;
    }
    case 'DEPLOY_UNIT': {
      const deployAction = action as GameAction & { unitId: string; position: HexCoord };
      const unit = state?.units.find(u => u.id === deployAction.unitId);
      const unitType = unit?.type || 'unit';
      return `Deployed ${unitType}`;
    }
    case 'LIFT_OFF': {
      return 'Lifted off!';
    }
    case 'END_TURN': {
      const endAction = action as GameAction & { savedAP?: number };
      const saved = endAction.savedAP || 0;
      return saved > 0 ? `Ended turn (saved ${saved} AP)` : 'Ended turn';
    }
    case 'REBUILD_TOWER': {
      return 'Rebuilt tower';
    }
    default:
      return action.type;
  }
}

/**
 * Create turn markers from a list of actions
 */
export function createTurnMarkers(
  actions: ReplayAction[],
  players: Array<{ id: string; name: string; color: string }>
): TurnMarker[] {
  const markers: TurnMarker[] = [];
  let currentTurn = 0;
  let currentPlayerId = '';
  let turnStartSeq = 0;
  let phase = 'landing';
  let tide: TideLevel = TideLevel.Normal;

  const getPlayerInfo = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return {
      name: player?.name || 'Unknown',
      color: player?.color || 'gray',
    };
  };

  for (const action of actions) {
    // Detect turn/player changes
    if (action.turn !== currentTurn || action.playerId !== currentPlayerId) {
      // Save previous turn marker if we had one
      if (currentTurn > 0 && markers.length > 0) {
        const lastMarker = markers[markers.length - 1];
        lastMarker.endSeq = action.seq - 1;
      }

      // Start new turn marker if it's a new turn+player combination
      if (action.turn !== currentTurn || action.playerId !== currentPlayerId) {
        const playerInfo = getPlayerInfo(action.playerId);
        markers.push({
          turn: action.turn,
          playerId: action.playerId,
          playerName: playerInfo.name,
          playerColor: playerInfo.color,
          startSeq: action.seq,
          endSeq: action.seq, // Will be updated
          phase,
          tide,
        });

        currentTurn = action.turn;
        currentPlayerId = action.playerId;
        turnStartSeq = action.seq;
      }
    }
  }

  // Close the last marker
  if (markers.length > 0 && actions.length > 0) {
    markers[markers.length - 1].endSeq = actions[actions.length - 1].seq;
  }

  return markers;
}

/**
 * Create replay data from a completed game
 */
export function createReplayData(
  gameId: string,
  initialState: GameState,
  actions: ReplayAction[],
  finalScores: Record<string, number>,
  winners: string[],
  players: Array<{ id: string; name: string; color: string }>
): ReplayData {
  const startTime = actions.length > 0 ? actions[0].timestamp : Date.now();
  const endTime = actions.length > 0 ? actions[actions.length - 1].timestamp : Date.now();

  return {
    version: 1,
    gameId,
    playedAt: startTime,
    duration: endTime - startTime,
    initialState,
    actions,
    turnMarkers: createTurnMarkers(actions, players),
    finalScores,
    winners,
    players,
    mapInfo: {
      width: 27,
      height: 11,
      terrain: initialState.terrain,
    },
  };
}

/**
 * Validate replay data structure
 */
export function validateReplayData(data: unknown): data is ReplayData {
  if (!data || typeof data !== 'object') return false;

  const replay = data as Partial<ReplayData>;

  return (
    replay.version === 1 &&
    typeof replay.gameId === 'string' &&
    typeof replay.playedAt === 'number' &&
    Array.isArray(replay.actions) &&
    Array.isArray(replay.turnMarkers) &&
    Array.isArray(replay.players) &&
    replay.initialState !== undefined &&
    replay.finalScores !== undefined &&
    Array.isArray(replay.winners)
  );
}

/**
 * Export replay data to JSON string
 */
export function exportReplayData(replay: ReplayData): string {
  return JSON.stringify(replay, null, 2);
}

/**
 * Import replay data from JSON string
 */
export function importReplayData(json: string): ReplayData | null {
  try {
    const data = JSON.parse(json);
    if (validateReplayData(data)) {
      return data;
    }
    console.error('Invalid replay data structure');
    return null;
  } catch (error) {
    console.error('Failed to parse replay data:', error);
    return null;
  }
}

/**
 * Get the turn marker for a given sequence number
 */
export function getTurnMarkerForSeq(markers: TurnMarker[], seq: number): TurnMarker | null {
  for (const marker of markers) {
    if (seq >= marker.startSeq && seq <= marker.endSeq) {
      return marker;
    }
  }
  return markers[0] || null;
}

/**
 * Find the sequence number for the start of a specific turn
 */
export function getSeqForTurnStart(markers: TurnMarker[], turn: number, playerId?: string): number {
  for (const marker of markers) {
    if (marker.turn === turn && (!playerId || marker.playerId === playerId)) {
      return marker.startSeq;
    }
  }
  return 0;
}
