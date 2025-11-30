/**
 * Full Metal Planete - Game State Management
 *
 * Implements initial state factory, state reducer, turn management, and score calculation.
 */

import {
  TerrainType,
  TideLevel,
  UnitType,
  GamePhase,
  UNIT_PROPERTIES,
  GAME_CONSTANTS,
  type HexCoord,
  type GameState,
  type Unit,
  type Player,
  type HexTerrain,
  type Mineral,
  type MoveAction,
  type LoadAction,
  type UnloadAction,
  type FireAction,
  type CaptureAction,
  type EndTurnAction,
  type BuildAction,
  type TurretState,
} from './types';
import { getBaseActionPoints, calculateTotalActionPoints, calculateSavedAP } from './actions';
import { hexKey } from './hex';

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Fisher-Yates shuffle algorithm.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Tide Deck Management
// ============================================================================

/**
 * Create a new tide deck with 5 of each level.
 */
export function createTideDeck(): TideLevel[] {
  return [
    ...Array(GAME_CONSTANTS.TIDE_CARDS_LOW).fill(TideLevel.Low),
    ...Array(GAME_CONSTANTS.TIDE_CARDS_NORMAL).fill(TideLevel.Normal),
    ...Array(GAME_CONSTANTS.TIDE_CARDS_HIGH).fill(TideLevel.High),
  ];
}

/**
 * Draw a tide card from the deck.
 * Reshuffles discard into deck if empty.
 */
export function drawTideCard(state: GameState): GameState {
  let tideDeck = [...state.tideDeck];
  let tideDiscard = [...state.tideDiscard];

  // Reshuffle if deck is empty
  if (tideDeck.length === 0) {
    tideDeck = shuffleArray(tideDiscard);
    tideDiscard = [];
  }

  // Draw top card
  const drawnCard = tideDeck.shift()!;
  tideDiscard.push(drawnCard);

  return {
    ...state,
    currentTide: drawnCard,
    tideDeck,
    tideDiscard,
  };
}

// ============================================================================
// Starting Force Creation
// ============================================================================

/**
 * Create the starting force for a player.
 */
export function createStartingForce(playerId: string): Unit[] {
  const units: Unit[] = [];
  let unitIndex = 0;

  const createUnitOfType = (type: UnitType, count: number) => {
    for (let i = 0; i < count; i++) {
      units.push({
        id: `${type}-${playerId}-${unitIndex++}`,
        type,
        owner: playerId,
        position: { q: 0, r: 0 }, // Position set during deployment
        shotsRemaining: UNIT_PROPERTIES[type].maxShots ?? 0,
        isStuck: false,
        isNeutralized: false,
        cargo: UNIT_PROPERTIES[type].cargoSlots > 0 ? [] : undefined,
      });
    }
  };

  // Create each unit type according to starting force
  createUnitOfType(UnitType.Barge, GAME_CONSTANTS.STARTING_FORCE[UnitType.Barge]);
  createUnitOfType(UnitType.Crab, GAME_CONSTANTS.STARTING_FORCE[UnitType.Crab]);
  createUnitOfType(UnitType.Converter, GAME_CONSTANTS.STARTING_FORCE[UnitType.Converter]);
  createUnitOfType(UnitType.MotorBoat, GAME_CONSTANTS.STARTING_FORCE[UnitType.MotorBoat]);
  createUnitOfType(UnitType.Tank, GAME_CONSTANTS.STARTING_FORCE[UnitType.Tank]);
  createUnitOfType(UnitType.SuperTank, GAME_CONSTANTS.STARTING_FORCE[UnitType.SuperTank]);
  createUnitOfType(UnitType.Bridge, GAME_CONSTANTS.STARTING_FORCE[UnitType.Bridge]);

  return units;
}

/**
 * Create an astronef with turrets for a player.
 */
export function createAstronef(playerId: string, position: HexCoord[]): Unit {
  const turrets: TurretState[] = [
    { podeIndex: 0, isDestroyed: false },
    { podeIndex: 1, isDestroyed: false },
    { podeIndex: 2, isDestroyed: false },
  ];

  return {
    id: `astronef-${playerId}`,
    type: UnitType.Astronef,
    owner: playerId,
    position: position[0] || { q: 0, r: 0 },
    shotsRemaining: 0,
    isStuck: false,
    isNeutralized: false,
    cargo: [],
    turrets,
    hasLiftedOff: false,
  };
}

/**
 * Create towers for an astronef.
 */
export function createTowers(playerId: string): Unit[] {
  return [0, 1, 2].map((podeIndex) => ({
    id: `tower-${playerId}-${podeIndex}`,
    type: UnitType.Tower,
    owner: playerId,
    position: { q: 0, r: 0 }, // Position set based on astronef
    shotsRemaining: GAME_CONSTANTS.SHOTS_PER_UNIT_PER_TURN,
    isStuck: false,
    isNeutralized: false,
  }));
}

// ============================================================================
// Initial State Factory
// ============================================================================

/**
 * Create the initial game state.
 */
export function createInitialGameState(
  gameId: string,
  players: Player[],
  terrain: HexTerrain[]
): GameState {
  // Create and shuffle tide deck
  const fullDeck = shuffleArray(createTideDeck());
  const tideDeck = fullDeck.slice(0, GAME_CONSTANTS.TIDE_CARDS_ACTIVE);
  const tideDiscard = fullDeck.slice(GAME_CONSTANTS.TIDE_CARDS_ACTIVE);

  // Create units for each player
  const units: Unit[] = [];
  for (const player of players) {
    units.push(...createStartingForce(player.id));
    units.push(createAstronef(player.id, player.astronefPosition));
    units.push(...createTowers(player.id));
  }

  // Initialize saved AP
  const savedActionPoints: Record<string, number> = {};
  const liftOffDecisions: Record<string, boolean | null> = {};
  for (const player of players) {
    savedActionPoints[player.id] = 0;
    liftOffDecisions[player.id] = null;
  }

  return {
    gameId,
    turn: 1,
    phase: GamePhase.Landing,
    currentPlayer: players[0]?.id ?? '',
    turnOrder: players.map((p) => p.id),
    turnStartTime: Date.now(),
    turnTimeLimit: GAME_CONSTANTS.TURN_TIME_LIMIT_MS,
    actionPoints: 0, // No AP during landing
    savedActionPoints,
    currentTide: TideLevel.Normal, // Turn 2 is always Normal
    tideDeck,
    tideDiscard,
    terrain,
    minerals: [], // Minerals placed separately
    units,
    bridges: [],
    players,
    liftOffDecisions,
  };
}

// ============================================================================
// Turn Management
// ============================================================================

/**
 * Advance to the next player or next turn.
 */
export function advanceTurn(state: GameState): GameState {
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  const isNewRound = nextIndex === 0;

  let newTurn = state.turn;
  let newPhase = state.phase;

  // Check if we're moving to a new round
  if (isNewRound) {
    newTurn = state.turn + 1;

    // Update phase based on turn
    if (newTurn === 2) {
      newPhase = GamePhase.Deployment;
    } else if (newTurn === 3) {
      newPhase = GamePhase.Playing;
    } else if (newTurn === 21) {
      newPhase = GamePhase.LiftOffDecision;
    } else if (newTurn > 25) {
      newPhase = GamePhase.Finished;
    }
  }

  // Calculate new AP
  const nextPlayer = state.turnOrder[nextIndex];
  const savedAP = state.savedActionPoints[nextPlayer] ?? 0;
  const capturedAstronefs = state.players.find((p) => p.id === nextPlayer)?.capturedAstronefs.length ?? 0;
  const newActionPoints = calculateTotalActionPoints(
    isNewRound ? newTurn : state.turn,
    newPhase,
    savedAP,
    capturedAstronefs
  );

  // Reset shots for all combat units
  const updatedUnits = state.units.map((unit) => {
    const maxShots = UNIT_PROPERTIES[unit.type].maxShots ?? 0;
    if (maxShots > 0) {
      return { ...unit, shotsRemaining: maxShots };
    }
    return unit;
  });

  // Draw tide card on new round (starting from turn 3)
  let newState: GameState = {
    ...state,
    turn: newTurn,
    phase: newPhase,
    currentPlayer: nextPlayer,
    actionPoints: newActionPoints,
    turnStartTime: Date.now(),
    units: updatedUnits,
  };

  if (isNewRound && newTurn >= 3) {
    newState = drawTideCard(newState);
  }

  return newState;
}

// ============================================================================
// Action Reducers
// ============================================================================

/**
 * Apply a move action to the game state.
 */
export function applyMoveAction(state: GameState, action: MoveAction): GameState {
  const destination = action.path[action.path.length - 1];

  const updatedUnits = state.units.map((unit) => {
    if (unit.id === action.unitId) {
      return { ...unit, position: destination };
    }
    return unit;
  });

  return {
    ...state,
    units: updatedUnits,
    actionPoints: state.actionPoints - action.apCost,
  };
}

/**
 * Apply a load action to the game state.
 */
export function applyLoadAction(state: GameState, action: LoadAction): GameState {
  const updatedUnits = state.units.map((unit) => {
    if (unit.id === action.transporterId) {
      const cargo = [...(unit.cargo ?? []), action.cargoId];
      return { ...unit, cargo };
    }
    // If loading a unit (not mineral), update its position to be "in cargo"
    if (unit.id === action.cargoId) {
      return { ...unit, position: { q: -9999, r: -9999 } }; // Special position indicating loaded
    }
    return unit;
  });

  return {
    ...state,
    units: updatedUnits,
    actionPoints: state.actionPoints - action.apCost,
  };
}

/**
 * Apply an unload action to the game state.
 */
export function applyUnloadAction(state: GameState, action: UnloadAction): GameState {
  const updatedUnits = state.units.map((unit) => {
    if (unit.id === action.transporterId) {
      const cargo = (unit.cargo ?? []).filter((c) => c !== action.cargoId);
      return { ...unit, cargo };
    }
    // If unloading a unit, update its position
    if (unit.id === action.cargoId) {
      return { ...unit, position: action.destination };
    }
    return unit;
  });

  // If unloading a mineral, update its position
  const updatedMinerals = state.minerals.map((mineral) => {
    if (mineral.id === action.cargoId) {
      return { ...mineral, position: action.destination };
    }
    return mineral;
  });

  return {
    ...state,
    units: updatedUnits,
    minerals: updatedMinerals,
    actionPoints: state.actionPoints - action.apCost,
  };
}

/**
 * Apply a fire (destruction) action to the game state.
 */
export function applyFireAction(state: GameState, action: FireAction): GameState {
  // Find target unit at hex
  const targetUnit = state.units.find(
    (u) => u.position.q === action.targetHex.q && u.position.r === action.targetHex.r
  );

  // Remove destroyed unit and decrement shots
  const updatedUnits = state.units
    .filter((u) => u.id !== targetUnit?.id)
    .map((unit) => {
      if (action.attackerIds.includes(unit.id)) {
        return { ...unit, shotsRemaining: unit.shotsRemaining - 1 };
      }
      return unit;
    });

  return {
    ...state,
    units: updatedUnits,
    actionPoints: state.actionPoints - action.apCost,
  };
}

/**
 * Apply a capture action to the game state.
 */
export function applyCaptureAction(state: GameState, action: CaptureAction): GameState {
  const updatedUnits = state.units.map((unit) => {
    if (unit.id === action.targetId) {
      return { ...unit, owner: action.playerId };
    }
    return unit;
  });

  return {
    ...state,
    units: updatedUnits,
    actionPoints: state.actionPoints - action.apCost,
  };
}

/**
 * Apply an end turn action to the game state.
 */
export function applyEndTurnAction(state: GameState, action: EndTurnAction): GameState {
  const currentSaved = state.savedActionPoints[action.playerId] ?? 0;
  const newSaved = calculateSavedAP(action.savedAP, currentSaved);

  return {
    ...state,
    savedActionPoints: {
      ...state.savedActionPoints,
      [action.playerId]: newSaved,
    },
  };
}

/**
 * Apply a build action to the game state.
 */
export function applyBuildAction(state: GameState, action: BuildAction): GameState {
  // Find converter
  const converter = state.units.find((u) => u.id === action.converterId);
  if (!converter) return state;

  // Remove mineral from converter cargo
  const mineralId = converter.cargo?.[0];
  const updatedConverter = {
    ...converter,
    cargo: [],
  };

  // Create new unit
  const newUnitId = `${action.unitType}-${action.playerId}-built-${Date.now()}`;
  const newUnit: Unit = {
    id: newUnitId,
    type: action.unitType,
    owner: action.playerId,
    position: converter.position, // Created at converter position
    shotsRemaining: UNIT_PROPERTIES[action.unitType].maxShots ?? 0,
    isStuck: false,
    isNeutralized: false,
    cargo: UNIT_PROPERTIES[action.unitType].cargoSlots > 0 ? [] : undefined,
  };

  // Update units list
  const updatedUnits = state.units.map((u) =>
    u.id === converter.id ? updatedConverter : u
  );
  updatedUnits.push(newUnit);

  // Remove mineral from game
  const updatedMinerals = state.minerals.filter((m) => m.id !== mineralId);

  return {
    ...state,
    units: updatedUnits,
    minerals: updatedMinerals,
    actionPoints: state.actionPoints - action.apCost,
  };
}

// ============================================================================
// Score Calculation
// ============================================================================

/**
 * Calculate the score for a player.
 * Only counts if player has lifted off.
 */
export function calculateScore(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.hasLiftedOff) {
    return 0;
  }

  const astronef = state.units.find(
    (u) => u.type === UnitType.Astronef && u.owner === playerId
  );
  if (!astronef) return 0;

  let score = 0;

  // Count minerals in astronef cargo: 2 points each
  const mineralsInCargo = (astronef.cargo ?? []).filter((id) => id.startsWith('mineral'));
  score += mineralsInCargo.length * GAME_CONSTANTS.POINTS_PER_MINERAL;

  // Count equipment in astronef cargo: 1 point each
  const equipmentInCargo = (astronef.cargo ?? []).filter((id) => !id.startsWith('mineral'));
  score += equipmentInCargo.length * GAME_CONSTANTS.POINTS_PER_EQUIPMENT;

  // Count intact turrets: 1 point each
  const intactTurrets = astronef.turrets?.filter((t) => !t.isDestroyed).length ?? 0;
  score += intactTurrets * GAME_CONSTANTS.POINTS_PER_TURRET;

  return score;
}

/**
 * Calculate scores for all players.
 */
export function calculateAllScores(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const player of state.players) {
    scores[player.id] = calculateScore(state, player.id);
  }
  return scores;
}

// ============================================================================
// Game State Helpers
// ============================================================================

/**
 * Get the terrain at a specific hex coordinate.
 */
export function getTerrainAt(state: GameState, coord: HexCoord): TerrainType {
  const hex = state.terrain.find((t) => t.coord.q === coord.q && t.coord.r === coord.r);
  return hex?.type ?? TerrainType.Sea;
}

/**
 * Get unit at a specific hex coordinate.
 */
export function getUnitAt(state: GameState, coord: HexCoord): Unit | undefined {
  return state.units.find((u) => u.position.q === coord.q && u.position.r === coord.r);
}

/**
 * Get mineral at a specific hex coordinate.
 */
export function getMineralAt(state: GameState, coord: HexCoord): Mineral | undefined {
  return state.minerals.find((m) => m.position.q === coord.q && m.position.r === coord.r);
}

/**
 * Check if the game is finished.
 */
export function isGameFinished(state: GameState): boolean {
  return state.phase === GamePhase.Finished;
}

/**
 * Get the winner(s) of the game.
 */
export function getWinners(state: GameState): string[] {
  if (!isGameFinished(state)) return [];

  const scores = calculateAllScores(state);
  const maxScore = Math.max(...Object.values(scores));

  return Object.entries(scores)
    .filter(([_, score]) => score === maxScore)
    .map(([playerId]) => playerId);
}
