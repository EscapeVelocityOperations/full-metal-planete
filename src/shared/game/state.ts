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
  type LandAstronefAction,
  type DeployUnitAction,
  type ValidationResult,
  type CaptureAstronefAction,
  type RebuildTowerAction,
} from './types';
import { getBaseActionPoints, calculateTotalActionPoints, calculateSavedAP } from './actions';
import { hexKey, hexNeighbors, hexEqual } from './hex';
import { generateMinerals } from './map-generator';
import { isUnitStuck, isUnitGrounded, getEffectiveTerrain, canAstronefLandOn, canUnitEnterTerrain } from './terrain';
import { getHexesUnderFire, type TerrainGetter } from './combat';
import { isLandingZoneValid, getZoneDistance } from './maps';

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Seeded random number generator (mulberry32).
 * Returns a value between 0 and 1.
 */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle algorithm with optional seed for reproducibility.
 */
export function shuffleArray<T>(array: T[], seed?: number): T[] {
  const result = [...array];
  const random = seed !== undefined ? seededRandom(seed) : Math.random;
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
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

/**
 * Predict the next tide card (for Converter owners).
 * Returns the top card of the tide deck without drawing it.
 * Returns undefined if deck is empty and needs reshuffle.
 */
export function predictNextTide(state: GameState): TideLevel | undefined {
  // If deck is empty, can't predict until reshuffle (which happens at draw time)
  if (state.tideDeck.length === 0) {
    return undefined;
  }
  return state.tideDeck[0];
}

/**
 * Check if a player can predict the tide (owns a Converter).
 */
export function canPlayerPredictTide(state: GameState, playerId: string): boolean {
  return getPlayerConverterCount(state, playerId) > 0;
}

/**
 * Count converters owned by a player that are operational (not in cargo).
 * Each converter allows seeing one additional turn of tide forecast.
 */
export function getPlayerConverterCount(state: GameState, playerId: string): number {
  return state.units.filter((unit) => {
    if (unit.owner !== playerId || unit.type !== UnitType.Converter) {
      return false;
    }
    // Converter must not be in cargo (loaded on another unit)
    // In cargo units have position null or at special coordinate -9999
    if (unit.position === null) {
      return false;
    }
    return unit.position.q !== -9999;
  }).length;
}

/**
 * Get tide forecast for a player based on their converter count.
 * - 0 converters: empty array (no visibility)
 * - 1 converter: see 1 turn ahead
 * - 2+ converters: see 2 turns ahead
 * Returns array of TideLevel for future turns.
 */
export function getTideForecast(state: GameState, playerId: string): TideLevel[] {
  const converterCount = getPlayerConverterCount(state, playerId);

  if (converterCount === 0) {
    return [];
  }

  const forecastLength = Math.min(converterCount, 2); // Max 2 turns ahead
  const forecast: TideLevel[] = [];

  // Simulate drawing cards to get forecast
  let simulatedDeck = [...state.tideDeck];
  let simulatedDiscard = [...state.tideDiscard];

  for (let i = 0; i < forecastLength; i++) {
    // Reshuffle if deck is empty
    if (simulatedDeck.length === 0) {
      if (simulatedDiscard.length === 0) {
        break; // No more cards to draw
      }
      simulatedDeck = shuffleArray(simulatedDiscard);
      simulatedDiscard = [];
    }

    const card = simulatedDeck.shift();
    if (card) {
      forecast.push(card);
      simulatedDiscard.push(card);
    }
  }

  return forecast;
}

/**
 * Get tide probabilities based on remaining cards in deck.
 * Returns the probability of each tide level being drawn next.
 */
export function getTideProbabilities(state: GameState): Record<TideLevel, number> {
  const deck = state.tideDeck;
  const total = deck.length;

  if (total === 0) {
    // Deck is empty, will reshuffle discard - calculate from discard
    const discard = state.tideDiscard;
    const discardTotal = discard.length;
    if (discardTotal === 0) {
      return { [TideLevel.Low]: 0, [TideLevel.Normal]: 0, [TideLevel.High]: 0 };
    }
    return {
      [TideLevel.Low]: discard.filter((t) => t === TideLevel.Low).length / discardTotal,
      [TideLevel.Normal]: discard.filter((t) => t === TideLevel.Normal).length / discardTotal,
      [TideLevel.High]: discard.filter((t) => t === TideLevel.High).length / discardTotal,
    };
  }

  return {
    [TideLevel.Low]: deck.filter((t) => t === TideLevel.Low).length / total,
    [TideLevel.Normal]: deck.filter((t) => t === TideLevel.Normal).length / total,
    [TideLevel.High]: deck.filter((t) => t === TideLevel.High).length / total,
  };
}

/**
 * Update stuck status for all units based on current tide.
 * Land units on flooded terrain become stuck.
 * Sea units on exposed terrain become stuck (grounded).
 * Units that were stuck but are now on compatible terrain are no longer stuck.
 */
export function updateUnitsStuckStatus(state: GameState): GameState {
  const updatedUnits = state.units.map((unit) => {
    // Skip units in cargo (position at -9999)
    if (unit.position.q === -9999) {
      return unit;
    }

    // Find terrain at unit's position
    const terrain = state.terrain.find(
      (t) => t.coord.q === unit.position.q && t.coord.r === unit.position.r
    );

    if (!terrain) {
      return unit;
    }

    // Check if unit is stuck or grounded
    const stuck = isUnitStuck(unit.type, terrain.type, state.currentTide);
    const grounded = isUnitGrounded(unit.type, terrain.type, state.currentTide);

    // Update isStuck flag (covers both stuck and grounded)
    const newStuckStatus = stuck || grounded;

    if (unit.isStuck !== newStuckStatus) {
      return { ...unit, isStuck: newStuckStatus };
    }

    return unit;
  });

  return {
    ...state,
    units: updatedUnits,
  };
}

/**
 * Get all units that are currently stuck or grounded.
 */
export function getStuckUnits(state: GameState): Unit[] {
  return state.units.filter((unit) => unit.isStuck);
}

/**
 * Check if a specific unit is stuck at current tide.
 */
export function isUnitStuckAtPosition(
  state: GameState,
  unitId: string
): boolean {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.position.q === -9999) {
    return false;
  }

  const terrain = state.terrain.find(
    (t) => t.coord.q === unit.position.q && t.coord.r === unit.position.r
  );

  if (!terrain) {
    return false;
  }

  return (
    isUnitStuck(unit.type, terrain.type, state.currentTide) ||
    isUnitGrounded(unit.type, terrain.type, state.currentTide)
  );
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

  // Generate minerals on valid terrain
  const minerals = generateMinerals(terrain);

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
    buildsThisTurn: [], // Track builds per turn
    currentTide: TideLevel.Normal, // Turn 2 is always Normal
    tideDeck,
    tideDiscard,
    terrain,
    minerals,
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
 * Rotate turn order so the first player becomes last.
 * In FMP, turn order rotates each round.
 */
export function rotateTurnOrder(turnOrder: string[]): string[] {
  if (turnOrder.length <= 1) {
    return turnOrder;
  }
  const [first, ...rest] = turnOrder;
  return [...rest, first];
}

/**
 * Check if it's a specific player's turn.
 */
export function isPlayersTurn(state: GameState, playerId: string): boolean {
  return state.currentPlayer === playerId;
}

/**
 * Check if turn timer has expired.
 */
export function isTurnTimerExpired(state: GameState): boolean {
  const elapsed = Date.now() - state.turnStartTime;
  return elapsed >= state.turnTimeLimit;
}

/**
 * Get remaining time in current turn (in milliseconds).
 */
export function getRemainingTurnTime(state: GameState): number {
  const elapsed = Date.now() - state.turnStartTime;
  const remaining = state.turnTimeLimit - elapsed;
  return Math.max(0, remaining);
}

/**
 * Calculate initial turn order based on landing positions.
 * Player furthest from cliffs (left edge) goes first.
 * In FMP, the cliffs are on the left side of the board (q=0).
 */
export function calculateInitialTurnOrder(
  players: Player[]
): string[] {
  // Sort players by their astronef landing position (furthest from left edge first)
  const sortedPlayers = [...players].sort((a, b) => {
    const aMinQ = Math.min(...a.astronefPosition.map((pos) => pos.q));
    const bMinQ = Math.min(...b.astronefPosition.map((pos) => pos.q));
    // Higher q value = further from cliffs = goes first
    return bMinQ - aMinQ;
  });
  return sortedPlayers.map((p) => p.id);
}

/**
 * Handle turn timeout - forces turn end with 0 AP saved.
 */
export function handleTurnTimeout(state: GameState): GameState {
  // Force end turn with no AP saved
  return advanceTurn({
    ...state,
    // Clear any remaining AP - timeout means no saving
    actionPoints: 0,
  });
}

/**
 * Advance to the next player or next turn.
 */
export function advanceTurn(state: GameState): GameState {
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  const isNewRound = nextIndex === 0;

  let newTurn = state.turn;
  let newPhase = state.phase;
  let newTurnOrder = state.turnOrder;

  // Check if we're moving to a new round
  if (isNewRound) {
    newTurn = state.turn + 1;
    // Rotate turn order so first player from last round goes last
    newTurnOrder = rotateTurnOrder(state.turnOrder);

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

  // Get next player - from rotated order if new round, otherwise from current position
  const nextPlayer = isNewRound ? newTurnOrder[0] : state.turnOrder[nextIndex];

  // Calculate new AP
  const savedAP = state.savedActionPoints[nextPlayer] ?? 0;
  const capturedAstronefs = state.players.find((p) => p.id === nextPlayer)?.capturedAstronefs.length ?? 0;
  const newActionPoints = calculateTotalActionPoints(
    isNewRound ? newTurn : state.turn,
    newPhase,
    savedAP,
    capturedAstronefs
  );

  // Reset shots for all combat units at the start of each player's turn
  const updatedUnits = state.units.map((unit) => {
    // Only reset shots for units owned by the next player
    if (unit.owner === nextPlayer) {
      const maxShots = UNIT_PROPERTIES[unit.type].maxShots ?? 0;
      if (maxShots > 0) {
        return { ...unit, shotsRemaining: maxShots };
      }
    }
    return unit;
  });

  // Draw tide card on new round (starting from turn 3)
  let newState: GameState = {
    ...state,
    turn: newTurn,
    phase: newPhase,
    turnOrder: newTurnOrder,
    currentPlayer: nextPlayer,
    actionPoints: newActionPoints,
    turnStartTime: Date.now(),
    units: updatedUnits,
    buildsThisTurn: [], // Reset builds for new player's turn
  };

  if (isNewRound && newTurn >= 3) {
    newState = drawTideCard(newState);
    // Update stuck status for all units after tide changes
    newState = updateUnitsStuckStatus(newState);
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

  // Check if we're destroying a Tower - need to mark the astronef's turret as destroyed
  let towerPodeIndex: number | null = null;
  let towerOwner: string | null = null;
  if (targetUnit?.type === UnitType.Tower) {
    // Extract pode index from tower ID (format: tower-{playerId}-{podeIndex})
    const match = targetUnit.id.match(/tower-.*-(\d)/);
    if (match) {
      towerPodeIndex = parseInt(match[1], 10);
      towerOwner = targetUnit.owner;
    }
  }

  // Remove destroyed unit and decrement shots
  // Also mark the turret as destroyed on the astronef if we destroyed a tower
  const updatedUnits = state.units
    .filter((u) => u.id !== targetUnit?.id)
    .map((unit) => {
      // Decrement shots for attackers
      if (action.attackerIds.includes(unit.id)) {
        return { ...unit, shotsRemaining: unit.shotsRemaining - 1 };
      }
      // Mark turret as destroyed on the astronef
      if (
        towerPodeIndex !== null &&
        towerOwner !== null &&
        unit.type === UnitType.Astronef &&
        unit.owner === towerOwner &&
        unit.turrets
      ) {
        const updatedTurrets = unit.turrets.map((turret) =>
          turret.podeIndex === towerPodeIndex
            ? { ...turret, isDestroyed: true }
            : turret
        );
        return { ...unit, turrets: updatedTurrets };
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
 * Apply a rebuild tower action to the game state.
 *
 * This restores a destroyed tower on an astronef:
 * 1. Marks the turret as not destroyed on the astronef
 * 2. Creates a new Tower unit at the pode position
 * 3. Deducts 2 AP
 */
export function applyRebuildTowerAction(state: GameState, action: RebuildTowerAction): GameState {
  // Find the astronef
  const astronef = state.units.find((u) => u.id === action.astronefId);
  if (!astronef || !astronef.turrets || !astronef.position) return state;

  // Get the pode position for the tower
  const podePosition = getPodeHex(astronef, action.podeIndex);
  if (!podePosition) return state;

  // Create the new tower
  const towerId = `tower-${astronef.owner}-${action.podeIndex}`;
  const newTower: Unit = {
    id: towerId,
    type: UnitType.Tower,
    owner: astronef.owner,
    position: podePosition,
    shotsRemaining: UNIT_PROPERTIES[UnitType.Tower].maxShots || 2,
    isStuck: false,
    isNeutralized: false,
  };

  // Update astronef's turret state
  const updatedTurrets = astronef.turrets.map((turret) =>
    turret.podeIndex === action.podeIndex
      ? { ...turret, isDestroyed: false }
      : turret
  );

  // Update units: modify astronef turrets and add the new tower
  const updatedUnits = state.units.map((unit) =>
    unit.id === astronef.id
      ? { ...unit, turrets: updatedTurrets }
      : unit
  );

  return {
    ...state,
    units: [...updatedUnits, newTower],
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

  // Track build for this turn
  const buildsThisTurn = [...(state.buildsThisTurn || []), action.unitType];

  return {
    ...state,
    units: updatedUnits,
    minerals: updatedMinerals,
    actionPoints: state.actionPoints - action.apCost,
    buildsThisTurn,
  };
}

// ============================================================================
// Setup Phase Actions (Landing & Deployment)
// ============================================================================

/**
 * Get the 4 hex positions that form an astronef's footprint.
 * Astronef is a tri-hex shape (3 podes) arranged in a specific pattern.
 * The position array should contain 4 hexes (the astronef body).
 */
export function getAstronefHexes(centerHex: HexCoord): HexCoord[] {
  // Astronef occupies 4 hexes in a specific formation
  // The center hex and 3 adjacent hexes forming a compact shape
  return [
    centerHex,
    { q: centerHex.q + 1, r: centerHex.r },
    { q: centerHex.q, r: centerHex.r + 1 },
    { q: centerHex.q + 1, r: centerHex.r - 1 },
  ];
}

/**
 * Get the hex position of a pode (turret) for an astronef.
 * Podes are at indices 1, 2, 3 of the astronef hexes (index 0 is center).
 */
export function getPodeHex(astronef: Unit, podeIndex: number): HexCoord | null {
  if (astronef.position === null) return null;
  if (podeIndex < 0 || podeIndex > 2) return null;

  const hexes = getAstronefHexes(astronef.position);
  // Podes are at hexes 1, 2, 3 (not 0, which is center)
  return hexes[podeIndex + 1] || null;
}

/**
 * Get hexes adjacent to a pode that units can exit to.
 * These are hexes adjacent to the pode that are NOT part of the astronef.
 */
export function getPodeExitHexes(astronef: Unit, podeIndex: number): HexCoord[] {
  const podeHex = getPodeHex(astronef, podeIndex);
  if (!podeHex || astronef.position === null) return [];

  const astronefHexes = getAstronefHexes(astronef.position);
  const astronefHexSet = new Set(astronefHexes.map(h => hexKey(h)));

  // Get neighbors of pode hex that are not part of astronef
  const neighbors = hexNeighbors(podeHex);
  return neighbors.filter(hex => !astronefHexSet.has(hexKey(hex)));
}

// ============================================================================
// Enter/Exit Astronef Actions
// ============================================================================

/**
 * Apply an enter astronef action.
 * Unit moves from map into astronef cargo.
 */
export function applyEnterAstronefAction(
  state: GameState,
  action: { unitId: string; playerId: string; podeIndex: number }
): GameState {
  const unit = state.units.find(u => u.id === action.unitId);
  if (!unit) return state;

  const astronef = state.units.find(
    u => u.type === UnitType.Astronef && u.owner === action.playerId
  );
  if (!astronef) return state;

  // Add unit to astronef cargo
  const updatedAstronef = {
    ...astronef,
    cargo: [...(astronef.cargo || []), unit.id],
  };

  // Remove unit from map (set position to null)
  const updatedUnit = {
    ...unit,
    position: null,
  };

  const updatedUnits = state.units.map(u => {
    if (u.id === astronef.id) return updatedAstronef;
    if (u.id === unit.id) return updatedUnit;
    return u;
  });

  return {
    ...state,
    units: updatedUnits,
    actionPoints: state.actionPoints - GAME_CONSTANTS.AP_COST_ENTER_ASTRONEF,
  };
}

/**
 * Apply an exit astronef action.
 * Unit moves from astronef cargo to map at destination hex.
 */
export function applyExitAstronefAction(
  state: GameState,
  action: { unitId: string; playerId: string; podeIndex: number; destination: HexCoord }
): GameState {
  const astronef = state.units.find(
    u => u.type === UnitType.Astronef && u.owner === action.playerId
  );
  if (!astronef) return state;

  // Check unit is in astronef cargo
  if (!astronef.cargo?.includes(action.unitId)) return state;

  const unit = state.units.find(u => u.id === action.unitId);
  if (!unit) return state;

  // Remove unit from astronef cargo
  const updatedAstronef = {
    ...astronef,
    cargo: astronef.cargo.filter(id => id !== action.unitId),
  };

  // Place unit on map at destination
  const updatedUnit = {
    ...unit,
    position: action.destination,
  };

  const updatedUnits = state.units.map(u => {
    if (u.id === astronef.id) return updatedAstronef;
    if (u.id === unit.id) return updatedUnit;
    return u;
  });

  return {
    ...state,
    units: updatedUnits,
    actionPoints: state.actionPoints - GAME_CONSTANTS.AP_COST_EXIT_ASTRONEF,
  };
}

// ============================================================================
// Astronef Capture Actions (Section 10.5)
// ============================================================================

/**
 * Apply an astronef capture action.
 *
 * When an astronef is captured:
 * 1. The astronef's owner is changed to the captor
 * 2. The captor's capturedAstronefs list is updated
 * 3. All of the original owner's units transfer control to the captor
 *    (but retain their original colors for visual distinction)
 * 4. The captor gains +5 AP per turn bonus
 */
export function applyCaptureAstronefAction(
  state: GameState,
  action: CaptureAstronefAction
): GameState {
  const targetAstronef = state.units.find((u) => u.id === action.targetAstronefId);
  if (!targetAstronef) return state;

  const originalOwner = targetAstronef.owner;
  const captorId = action.playerId;

  // Update astronef ownership
  let updatedUnits = state.units.map((unit) => {
    if (unit.id === action.targetAstronefId) {
      return { ...unit, owner: captorId };
    }
    return unit;
  });

  // Transfer all of the original owner's units to the captor
  // Units retain their visual identity (color) but change owner
  updatedUnits = updatedUnits.map((unit) => {
    if (unit.owner === originalOwner) {
      return {
        ...unit,
        owner: captorId,
        // Store original owner for color display
        originalOwner: originalOwner,
      };
    }
    return unit;
  });

  // Update player's captured astronefs list
  const updatedPlayers = state.players.map((player) => {
    if (player.id === captorId) {
      return {
        ...player,
        capturedAstronefs: [...player.capturedAstronefs, originalOwner],
      };
    }
    return player;
  });

  return {
    ...state,
    units: updatedUnits,
    players: updatedPlayers,
    actionPoints: state.actionPoints - action.apCost,
  };
}

/**
 * Check if an astronef can be captured (all towers destroyed).
 */
export function canAstronefBeCaptured(astronef: Unit): boolean {
  if (astronef.type !== UnitType.Astronef) return false;
  if (!astronef.turrets) return false;
  if (astronef.hasLiftedOff) return false;

  // All 3 towers must be destroyed
  const destroyedCount = astronef.turrets.filter((t) => t.isDestroyed).length;
  return destroyedCount >= 3;
}

/**
 * Get astronefs that can be captured by a player.
 * Returns astronefs where all 3 towers are destroyed and player has
 * an adjacent combat unit.
 */
export function getCapturableAstronefs(state: GameState, playerId: string): Unit[] {
  // Get player's combat units that can perform capture
  const combatUnits = state.units.filter((u) => {
    if (u.owner !== playerId) return false;
    if (!u.position) return false;
    if (u.isStuck || u.isNeutralized) return false;
    const props = UNIT_PROPERTIES[u.type];
    return props.combatRange > 0;
  });

  if (combatUnits.length === 0) return [];

  // Find enemy astronefs with all towers destroyed
  const capturableAstronefs = state.units.filter((u) => {
    if (u.type !== UnitType.Astronef) return false;
    if (u.owner === playerId) return false;
    if (!canAstronefBeCaptured(u)) return false;
    if (!u.position) return false;

    // Check if any combat unit is adjacent to the astronef
    const astronefHexes = getAstronefHexesForCapture(u);

    return combatUnits.some((combatUnit) => {
      return astronefHexes.some((astroHex) => {
        const distance = Math.abs(combatUnit.position!.q - astroHex.q) +
          Math.abs(combatUnit.position!.r - astroHex.r) +
          Math.abs((-combatUnit.position!.q - combatUnit.position!.r) - (-astroHex.q - astroHex.r));
        return distance / 2 === 1; // Adjacent in cube coordinates
      });
    });
  });

  return capturableAstronefs;
}

/**
 * Get the hexes occupied by an astronef for capture adjacency check.
 */
function getAstronefHexesForCapture(astronef: Unit): HexCoord[] {
  if (!astronef.position) return [];

  const center = astronef.position;
  return [
    center,
    { q: center.q + 1, r: center.r },     // East
    { q: center.q, r: center.r + 1 },     // Southeast
    { q: center.q + 1, r: center.r - 1 }, // Northeast
  ];
}

/**
 * Validate astronef landing position.
 * Rules:
 * - Must be during Landing phase
 * - Player must not have already landed
 * - All 4 hexes must be on Land or Marsh terrain
 * - No other astronef can occupy those hexes
 * - Must be within player's assigned landing zone
 */
export function validateLandAstronefAction(
  state: GameState,
  action: LandAstronefAction
): ValidationResult {
  // Check phase
  if (state.phase !== GamePhase.Landing) {
    return { valid: false, error: 'Can only land astronef during Landing phase' };
  }

  // Check it's the player's turn
  if (state.currentPlayer !== action.playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Check player hasn't already landed
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) {
    return { valid: false, error: 'Player not found' };
  }

  // Check if astronef already has a valid position (not at origin)
  const playerAstronef = state.units.find(
    (u) => u.type === UnitType.Astronef && u.owner === action.playerId
  );
  if (playerAstronef && playerAstronef.position.q !== 0) {
    return { valid: false, error: 'Astronef already landed' };
  }

  // Must provide exactly 4 positions (for the astronef's 4-hex footprint)
  if (action.position.length !== 4) {
    return { valid: false, error: 'Must provide exactly 4 hex positions for astronef' };
  }

  // Check all hexes are valid terrain (Land or Marsh)
  for (const hex of action.position) {
    const terrain = state.terrain.find(
      (t) => t.coord.q === hex.q && t.coord.r === hex.r
    );
    if (!terrain) {
      return { valid: false, error: `Invalid hex position: (${hex.q}, ${hex.r})` };
    }
    if (!canAstronefLandOn(terrain.type)) {
      return {
        valid: false,
        error: `Cannot land on ${terrain.type} terrain at (${hex.q}, ${hex.r})`,
      };
    }
  }

  // Check no other astronef occupies these hexes
  for (const hex of action.position) {
    const occupyingUnit = state.units.find(
      (u) =>
        u.type === UnitType.Astronef &&
        u.owner !== action.playerId &&
        u.position.q === hex.q &&
        u.position.r === hex.r
    );
    if (occupyingUnit) {
      return {
        valid: false,
        error: `Hex (${hex.q}, ${hex.r}) is already occupied by another astronef`,
      };
    }
  }

  // Check landing zone distance from other astronefs
  // Per rules: Player 1 can choose any zone, subsequent players must land at least 2 zones away
  const centerHex = action.position[0]; // Astronef center position
  const targetTerrain = state.terrain.find(
    (t) => t.coord.q === centerHex.q && t.coord.r === centerHex.r
  );

  if (targetTerrain?.landingZone) {
    // Get zones of all existing astronefs
    const existingZones: number[] = [];
    for (const unit of state.units) {
      if (
        unit.type === UnitType.Astronef &&
        unit.owner !== action.playerId &&
        unit.position &&
        unit.position.q !== 0 // Check if astronef has actually landed (not at origin)
      ) {
        // Find the zone for this astronef's position
        const astronefTerrain = state.terrain.find(
          (t) => t.coord.q === unit.position!.q && t.coord.r === unit.position!.r
        );
        if (astronefTerrain?.landingZone) {
          existingZones.push(astronefTerrain.landingZone);
        }
      }
    }

    // Validate zone distance
    if (!isLandingZoneValid(targetTerrain.landingZone, existingZones)) {
      // Find the closest conflicting zone for a helpful error message
      let closestZone = 0;
      let closestDistance = Infinity;
      for (const existingZone of existingZones) {
        const dist = getZoneDistance(targetTerrain.landingZone, existingZone);
        if (dist < closestDistance) {
          closestDistance = dist;
          closestZone = existingZone;
        }
      }
      return {
        valid: false,
        error: `Must land at least 2 zones away from existing astronefs (zone ${targetTerrain.landingZone} is only ${closestDistance} zone(s) from zone ${closestZone})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Apply astronef landing action.
 * Places the astronef and its towers at the specified positions.
 */
export function applyLandAstronefAction(
  state: GameState,
  action: LandAstronefAction
): GameState {
  const validation = validateLandAstronefAction(state, action);
  if (!validation.valid) {
    return state; // Don't apply invalid actions
  }

  // Update astronef position
  const updatedUnits = state.units.map((unit) => {
    // Update astronef
    if (unit.type === UnitType.Astronef && unit.owner === action.playerId) {
      return { ...unit, position: action.position[0] };
    }
    // Update towers to their pode positions (positions 1, 2, 3)
    if (unit.type === UnitType.Tower && unit.owner === action.playerId) {
      const podeMatch = unit.id.match(/tower-.*-(\d)/);
      if (podeMatch) {
        const podeIndex = parseInt(podeMatch[1], 10);
        if (podeIndex < action.position.length) {
          return { ...unit, position: action.position[podeIndex + 1] || action.position[0] };
        }
      }
    }
    return unit;
  });

  // Update player's astronef position
  const updatedPlayers = state.players.map((player) => {
    if (player.id === action.playerId) {
      return { ...player, astronefPosition: action.position };
    }
    return player;
  });

  return {
    ...state,
    units: updatedUnits,
    players: updatedPlayers,
  };
}

/**
 * Validate unit deployment position.
 * Rules:
 * - Must be during Deployment phase
 * - Unit must belong to the current player
 * - Unit must not already be deployed
 * - Position must be adjacent to player's astronef
 * - Position must be valid terrain for the unit type
 * - Position must not be occupied
 */
export function validateDeployUnitAction(
  state: GameState,
  action: DeployUnitAction
): ValidationResult {
  // Check phase
  if (state.phase !== GamePhase.Deployment) {
    return { valid: false, error: 'Can only deploy units during Deployment phase' };
  }

  // Check it's the player's turn
  if (state.currentPlayer !== action.playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Find the unit
  const unit = state.units.find((u) => u.id === action.unitId);
  if (!unit) {
    return { valid: false, error: 'Unit not found' };
  }

  // Check unit belongs to player
  if (unit.owner !== action.playerId) {
    return { valid: false, error: 'Unit does not belong to you' };
  }

  // Check unit is not already deployed (position at 0,0 means undeployed)
  if (unit.position.q !== 0 || unit.position.r !== 0) {
    return { valid: false, error: 'Unit already deployed' };
  }

  // Skip deployment check for astronef and towers (already placed during landing)
  if (unit.type === UnitType.Astronef || unit.type === UnitType.Tower) {
    return { valid: false, error: 'Astronef and towers are placed during landing phase' };
  }

  // Get player's astronef positions
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player || player.astronefPosition.length === 0) {
    return { valid: false, error: 'Astronef not landed yet' };
  }

  // Check position is adjacent to astronef
  const isAdjacentToAstronef = player.astronefPosition.some((astroPos) => {
    const dq = Math.abs(action.position.q - astroPos.q);
    const dr = Math.abs(action.position.r - astroPos.r);
    const ds = Math.abs(-action.position.q - action.position.r - (-astroPos.q - astroPos.r));
    return (dq + dr + ds) / 2 <= 1;
  });

  if (!isAdjacentToAstronef) {
    return { valid: false, error: 'Must deploy adjacent to astronef' };
  }

  // Check terrain is valid for unit
  const terrain = state.terrain.find(
    (t) => t.coord.q === action.position.q && t.coord.r === action.position.r
  );
  if (!terrain) {
    return { valid: false, error: 'Invalid position' };
  }

  // Get effective terrain at tide (deployment is at Normal tide)
  const effectiveTerrain = getEffectiveTerrain(terrain.type, TideLevel.Normal);
  const unitProps = UNIT_PROPERTIES[unit.type];

  // Check domain compatibility
  if (unitProps.domain === 'land' && effectiveTerrain !== 'land') {
    return { valid: false, error: 'Land unit cannot deploy on sea terrain' };
  }
  if (unitProps.domain === 'sea' && effectiveTerrain !== 'sea') {
    return { valid: false, error: 'Sea unit cannot deploy on land terrain' };
  }

  // Check position is not occupied
  const occupyingUnit = state.units.find(
    (u) =>
      u.position.q === action.position.q &&
      u.position.r === action.position.r &&
      u.position.q !== 0 // Exclude undeployed units
  );
  if (occupyingUnit) {
    return { valid: false, error: 'Position is occupied' };
  }

  return { valid: true };
}

/**
 * Apply unit deployment action.
 */
export function applyDeployUnitAction(
  state: GameState,
  action: DeployUnitAction
): GameState {
  const validation = validateDeployUnitAction(state, action);
  if (!validation.valid) {
    return state; // Don't apply invalid actions
  }

  const updatedUnits = state.units.map((unit) => {
    if (unit.id === action.unitId) {
      return { ...unit, position: action.position };
    }
    return unit;
  });

  return {
    ...state,
    units: updatedUnits,
  };
}

/**
 * Check if all players have landed their astronef.
 */
export function haveAllPlayersLanded(state: GameState): boolean {
  return state.players.every((player) => {
    const astronef = state.units.find(
      (u) => u.type === UnitType.Astronef && u.owner === player.id
    );
    // Astronef has landed if position is not at origin (0,0)
    return astronef && (astronef.position.q !== 0 || astronef.position.r !== 0);
  });
}

/**
 * Check if all of a player's units are deployed.
 */
export function hasPlayerDeployedAllUnits(state: GameState, playerId: string): boolean {
  return state.units
    .filter((u) => u.owner === playerId)
    .every((unit) => {
      // Astronef and towers are placed during landing
      if (unit.type === UnitType.Astronef || unit.type === UnitType.Tower) {
        return true;
      }
      // Other units must have non-zero position
      return unit.position.q !== 0 || unit.position.r !== 0;
    });
}

/**
 * Check if all players have deployed all their units.
 */
export function haveAllPlayersDeployed(state: GameState): boolean {
  return state.players.every((player) => hasPlayerDeployedAllUnits(state, player.id));
}

/**
 * Get units that still need to be deployed for a player.
 */
export function getUndeployedUnits(state: GameState, playerId: string): Unit[] {
  return state.units.filter((unit) => {
    if (unit.owner !== playerId) return false;
    if (unit.type === UnitType.Astronef || unit.type === UnitType.Tower) return false;
    return unit.position.q === 0 && unit.position.r === 0;
  });
}

// ============================================================================
// Retreat and Neutralization (Section 6.5)
// ============================================================================

/**
 * Get all units of a player that are currently under enemy fire.
 */
export function getUnitsUnderFire(state: GameState, playerId: string): Unit[] {
  const terrainGetter: TerrainGetter = (coord) => getTerrainAt(state, coord);
  const underFireHexes = getHexesUnderFire(state.units, playerId, terrainGetter);

  return state.units.filter((unit) => {
    if (unit.owner !== playerId) return false;
    if (unit.position === null) return false;
    return underFireHexes.has(hexKey(unit.position));
  });
}

/**
 * Get valid retreat hexes for a unit under fire.
 * A retreat hex must be:
 * - Adjacent to current position (1 hex away)
 * - Not under enemy fire
 * - Valid terrain for the unit type
 * - Not occupied by another unit
 */
export function getRetreatHexes(state: GameState, unit: Unit): HexCoord[] {
  if (unit.position === null) return [];

  const playerId = unit.owner;
  const terrainGetter: TerrainGetter = (coord) => getTerrainAt(state, coord);
  const underFireHexes = getHexesUnderFire(state.units, playerId, terrainGetter);
  const tide = state.currentTide;

  // Get all adjacent hexes
  const neighbors = hexNeighbors(unit.position);

  // Filter to valid retreat destinations
  return neighbors.filter((hex) => {
    // Cannot retreat to hex under fire
    if (underFireHexes.has(hexKey(hex))) return false;

    // Check terrain is valid for unit
    const terrain = getTerrainAt(state, hex);
    if (!canUnitEnterTerrain(unit.type, terrain, tide)) return false;

    // Check hex is not occupied
    const occupant = state.units.find(
      (u) => u.position !== null && hexEqual(u.position, hex)
    );
    if (occupant) return false;

    return true;
  });
}

/**
 * Apply a retreat move for a unit.
 * Returns updated game state.
 */
export function applyRetreat(state: GameState, unitId: string, targetHex: HexCoord): GameState {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.position === null) return state;

  // Verify target is a valid retreat hex
  const validRetreatHexes = getRetreatHexes(state, unit);
  const isValidTarget = validRetreatHexes.some((hex) => hexEqual(hex, targetHex));
  if (!isValidTarget) return state;

  // Move unit to retreat hex
  const updatedUnits = state.units.map((u) =>
    u.id === unitId ? { ...u, position: targetHex } : u
  );

  return {
    ...state,
    units: updatedUnits,
  };
}

/**
 * Process the retreat phase at the start of a player's turn.
 * Units under fire can either retreat or become neutralized.
 *
 * @param state Current game state
 * @param playerId Player whose turn is starting
 * @param retreatChoices Map of unitId -> targetHex for units that choose to retreat
 * @returns Updated game state with retreats applied and neutralizations set
 */
export function processRetreatPhase(
  state: GameState,
  playerId: string,
  retreatChoices: Map<string, HexCoord>
): GameState {
  const unitsUnderFire = getUnitsUnderFire(state, playerId);

  let updatedState = { ...state };
  let updatedUnits = [...state.units];

  for (const unit of unitsUnderFire) {
    // Skip already neutralized units
    if (unit.isNeutralized) continue;

    // Check if player chose to retreat this unit
    const retreatTarget = retreatChoices.get(unit.id);

    if (retreatTarget) {
      // Apply retreat
      const validRetreatHexes = getRetreatHexes(updatedState, unit);
      const isValid = validRetreatHexes.some((hex) => hexEqual(hex, retreatTarget));

      if (isValid) {
        updatedUnits = updatedUnits.map((u) =>
          u.id === unit.id ? { ...u, position: retreatTarget } : u
        );
        updatedState = { ...updatedState, units: updatedUnits };
      } else {
        // Invalid retreat choice - neutralize unit
        updatedUnits = updatedUnits.map((u) =>
          u.id === unit.id ? { ...u, isNeutralized: true } : u
        );
      }
    } else {
      // No retreat chosen - check if retreat is possible
      const validRetreatHexes = getRetreatHexes(updatedState, unit);

      if (validRetreatHexes.length === 0) {
        // No escape possible - unit is neutralized
        updatedUnits = updatedUnits.map((u) =>
          u.id === unit.id ? { ...u, isNeutralized: true } : u
        );
      }
      // If retreat hexes exist but player chose not to retreat,
      // the unit is also neutralized (they had the chance to escape but didn't)
      else {
        updatedUnits = updatedUnits.map((u) =>
          u.id === unit.id ? { ...u, isNeutralized: true } : u
        );
      }
    }
  }

  return {
    ...updatedState,
    units: updatedUnits,
  };
}

/**
 * Clear neutralization for units that are no longer under fire.
 * This should be called when combat units move to rescue neutralized allies.
 */
export function updateNeutralizationStatus(state: GameState): GameState {
  const updatedUnits = state.units.map((unit) => {
    if (!unit.isNeutralized) return unit;
    if (unit.position === null) return unit;

    // Check if this unit is still under fire
    const terrainGetter: TerrainGetter = (coord) => getTerrainAt(state, coord);
    const underFireHexes = getHexesUnderFire(state.units, unit.owner, terrainGetter);

    if (!underFireHexes.has(hexKey(unit.position))) {
      // No longer under fire - remove neutralization
      return { ...unit, isNeutralized: false };
    }

    return unit;
  });

  return {
    ...state,
    units: updatedUnits,
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

// ============================================================================
// Mineral Statistics
// ============================================================================

/**
 * Mineral statistics for display purposes
 */
export interface MineralStats {
  /** Total minerals remaining on the board (not in any cargo) */
  onBoard: number;
  /** Minerals currently underwater (cannot be collected) */
  underwater: number;
  /** Minerals per player - in all their units' cargo */
  byPlayer: Record<string, number>;
  /** Minerals specifically in each player's astronef (for scoring) */
  inAstronef: Record<string, number>;
  /** Total minerals in the game (including those in cargo) */
  total: number;
}

/**
 * Calculate comprehensive mineral statistics for display.
 *
 * This function counts:
 * - Minerals on the board (not loaded)
 * - Minerals underwater (on flooded terrain)
 * - Minerals collected by each player (in unit cargo)
 * - Minerals specifically in astronefs (for scoring)
 */
export function getMineralStats(state: GameState): MineralStats {
  const stats: MineralStats = {
    onBoard: 0,
    underwater: 0,
    byPlayer: {},
    inAstronef: {},
    total: state.minerals.length,
  };

  // Initialize player stats
  for (const player of state.players) {
    stats.byPlayer[player.id] = 0;
    stats.inAstronef[player.id] = 0;
  }

  // Count minerals on board vs underwater
  for (const mineral of state.minerals) {
    // Check if mineral is loaded in any cargo
    const isInCargo = mineral.position.q === -999 || mineral.position.r === -999;

    if (!isInCargo) {
      stats.onBoard++;

      // Check if underwater based on terrain and tide
      const terrain = state.terrain.find(
        (t) => t.coord.q === mineral.position.q && t.coord.r === mineral.position.r
      );
      if (terrain) {
        const effectiveTerrain = getEffectiveTerrain(terrain.type, state.currentTide);
        if (effectiveTerrain === 'sea') {
          stats.underwater++;
        }
      }
    }
  }

  // Count minerals in unit cargo by player
  for (const unit of state.units) {
    if (!unit.cargo || unit.cargo.length === 0) continue;

    const mineralCount = unit.cargo.filter((id) => id.startsWith('mineral')).length;
    if (mineralCount > 0 && stats.byPlayer[unit.owner] !== undefined) {
      stats.byPlayer[unit.owner] += mineralCount;

      // Count specifically for astronefs
      if (unit.type === UnitType.Astronef) {
        stats.inAstronef[unit.owner] += mineralCount;
      }
    }
  }

  return stats;
}

/**
 * Get the number of minerals a player has collected (in any unit's cargo).
 */
export function getPlayerMineralCount(state: GameState, playerId: string): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.owner !== playerId || !unit.cargo) continue;
    count += unit.cargo.filter((id) => id.startsWith('mineral')).length;
  }
  return count;
}

/**
 * Get mineral positions that are currently collectible (on land at current tide).
 */
export function getCollectibleMineralPositions(state: GameState): HexCoord[] {
  return state.minerals
    .filter((mineral) => {
      // Skip minerals in cargo
      if (mineral.position.q === -999 || mineral.position.r === -999) {
        return false;
      }

      // Check terrain
      const terrain = state.terrain.find(
        (t) => t.coord.q === mineral.position.q && t.coord.r === mineral.position.r
      );
      if (!terrain) return false;

      const effectiveTerrain = getEffectiveTerrain(terrain.type, state.currentTide);
      return effectiveTerrain === 'land';
    })
    .map((m) => m.position);
}

// ============================================================================
// Lift-Off System
// ============================================================================

/**
 * Calculate the AP cost to lift off.
 * Base cost: 1 AP + 1 AP per destroyed turret
 */
export function calculateTakeOffCost(state: GameState, playerId: string): number {
  const astronef = state.units.find(
    (u) => u.type === UnitType.Astronef && u.owner === playerId
  );
  if (!astronef) return 999; // Cannot lift off without astronef

  const destroyedTurrets = astronef.turrets?.filter((t) => t.isDestroyed).length ?? 0;
  return 1 + destroyedTurrets;
}

/**
 * Check if a player can lift off.
 * Requires enough AP and must be in playing phase (turns 3+).
 */
export function canLiftOff(state: GameState, playerId: string): boolean {
  // Must be current player
  if (state.currentPlayer !== playerId) return false;

  // Must be in playing phase or lift-off decision phase
  if (state.phase !== GamePhase.Playing && state.phase !== GamePhase.LiftOffDecision) {
    return false;
  }

  // Must be turn 21+ for lift-off
  if (state.turn < 21) return false;

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasLiftedOff) return false;

  const cost = calculateTakeOffCost(state, playerId);
  return state.actionPoints >= cost;
}

/**
 * Execute the lift-off for a player.
 * Marks player as lifted off, deducts AP, and removes astronef from board.
 */
export function executeLiftOff(state: GameState, playerId: string): GameState {
  if (!canLiftOff(state, playerId)) {
    return state;
  }

  const cost = calculateTakeOffCost(state, playerId);
  const astronef = state.units.find(
    (u) => u.type === UnitType.Astronef && u.owner === playerId
  );

  if (!astronef) return state;

  // Mark astronef as lifted off (keep in units for score calculation)
  const newUnits = state.units.map((u) => {
    if (u.id === astronef.id) {
      return {
        ...u,
        hasLiftedOff: true,
        position: null, // Remove from board
      };
    }
    return u;
  });

  // Mark player as lifted off
  const newPlayers = state.players.map((p) => {
    if (p.id === playerId) {
      return {
        ...p,
        hasLiftedOff: true,
        liftOffTurn: state.turn,
      };
    }
    return p;
  });

  return {
    ...state,
    actionPoints: state.actionPoints - cost,
    units: newUnits,
    players: newPlayers,
  };
}

/**
 * Record a player's lift-off decision (Turn 21 secret decision).
 * true = lift off at turn 21, false = stay until turn 25
 */
export function setLiftOffDecision(
  state: GameState,
  playerId: string,
  decision: boolean
): GameState {
  if (state.phase !== GamePhase.LiftOffDecision) {
    return state;
  }

  return {
    ...state,
    liftOffDecisions: {
      ...state.liftOffDecisions,
      [playerId]: decision,
    },
  };
}

/**
 * Check if all players have made their lift-off decision.
 */
export function allLiftOffDecisionsMade(state: GameState): boolean {
  return state.players.every(
    (p) => state.liftOffDecisions[p.id] !== null && state.liftOffDecisions[p.id] !== undefined
  );
}

/**
 * Process lift-off decisions at the end of turn 21.
 * Players who chose to lift off immediately do so.
 */
export function processLiftOffDecisions(state: GameState): GameState {
  let newState = state;

  for (const player of state.players) {
    if (state.liftOffDecisions[player.id] === true && !player.hasLiftedOff) {
      // Give player enough AP to lift off if they decided to
      const cost = calculateTakeOffCost(newState, player.id);
      const tempState = {
        ...newState,
        currentPlayer: player.id,
        actionPoints: cost, // Ensure they have enough AP
      };
      newState = executeLiftOff(tempState, player.id);
    }
  }

  // Transition to Playing phase for remaining players
  return {
    ...newState,
    phase: GamePhase.Playing,
  };
}

/**
 * Force lift-off for all remaining players at turn 25.
 * Players who cannot pay the cost are stranded.
 */
export function forceFinalLiftOff(state: GameState): GameState {
  let newState = state;

  for (const player of state.players) {
    if (!player.hasLiftedOff) {
      // Check if player can afford lift-off
      const cost = calculateTakeOffCost(newState, player.id);
      if (newState.actionPoints >= cost) {
        const tempState = {
          ...newState,
          currentPlayer: player.id,
          actionPoints: cost,
        };
        newState = executeLiftOff(tempState, player.id);
      }
      // If they can't afford it, they're stranded (hasLiftedOff remains false)
    }
  }

  return {
    ...newState,
    phase: GamePhase.Finished,
  };
}

// ============================================================================
// Bridge Actions (Section 9)
// ============================================================================

/**
 * Apply a place bridge action to the game state.
 *
 * Per rules Section 9:
 * - Bridge is removed from transporter cargo
 * - Bridge is placed on the board at target position
 * - Bridge becomes neutral (any player can use)
 * - Costs 1 AP
 */
export function applyPlaceBridgeAction(
  state: GameState,
  action: { bridgeId: string; transporterId: string; position: HexCoord; playerId: string }
): GameState {
  // Find the transporter
  const transporter = state.units.find((u) => u.id === action.transporterId);
  if (!transporter) return state;

  // Remove bridge from transporter cargo
  const updatedTransporter = {
    ...transporter,
    cargo: (transporter.cargo ?? []).filter((id) => id !== action.bridgeId),
  };

  // Add bridge placement to board
  const bridgePlacement = {
    id: action.bridgeId,
    position: action.position,
    placedBy: action.playerId,
  };

  const updatedUnits = state.units.map((u) =>
    u.id === transporter.id ? updatedTransporter : u
  );

  return {
    ...state,
    units: updatedUnits,
    bridges: [...state.bridges, bridgePlacement],
    actionPoints: state.actionPoints - 1,
  };
}

/**
 * Apply a pickup bridge action to the game state.
 *
 * Per rules Section 9:
 * - Bridge is removed from the board
 * - Bridge is added to transporter cargo
 * - Costs 1 AP
 */
export function applyPickupBridgeAction(
  state: GameState,
  action: { bridgeId: string; transporterId: string; playerId: string }
): GameState {
  // Find the transporter
  const transporter = state.units.find((u) => u.id === action.transporterId);
  if (!transporter) return state;

  // Check bridge exists on board
  const bridgeIndex = state.bridges.findIndex((b) => b.id === action.bridgeId);
  if (bridgeIndex === -1) return state;

  // Add bridge to transporter cargo
  const updatedTransporter = {
    ...transporter,
    cargo: [...(transporter.cargo ?? []), action.bridgeId],
  };

  // Remove bridge from board
  const updatedBridges = state.bridges.filter((b) => b.id !== action.bridgeId);

  const updatedUnits = state.units.map((u) =>
    u.id === transporter.id ? updatedTransporter : u
  );

  return {
    ...state,
    units: updatedUnits,
    bridges: updatedBridges,
    actionPoints: state.actionPoints - 1,
  };
}

/**
 * Check and destroy bridges that have lost their land connection.
 *
 * Per rules Section 9.3:
 * - Bridge is destroyed if connecting bridge hex is destroyed
 * - Bridge is destroyed if connecting land hex is submerged by tide
 * - All units on destroyed bridges are also destroyed
 *
 * Returns updated state with invalid bridges removed and affected units destroyed.
 */
export function destroyDisconnectedBridges(state: GameState): GameState {
  const { validateBridgeConnections } = require('./actions');
  const validationResults = validateBridgeConnections(state);

  // Find invalid bridge IDs
  const invalidBridgeIds = validationResults
    .filter((r) => !r.valid)
    .map((r) => r.bridgeId);

  if (invalidBridgeIds.length === 0) {
    return state; // No bridges to destroy
  }

  // Remove invalid bridges from board
  const updatedBridges = state.bridges.filter(
    (b) => !invalidBridgeIds.includes(b.id)
  );

  // Destroy units on destroyed bridges
  const destroyedUnitIds: string[] = [];
  for (const bridgeId of invalidBridgeIds) {
    const bridge = state.bridges.find((b) => b.id === bridgeId);
    if (!bridge) continue;

    // Find units at this bridge position
    const unitsAtBridge = state.units.filter(
      (u) => u.position?.q === bridge.position.q && u.position?.r === bridge.position.r
    );
    destroyedUnitIds.push(...unitsAtBridge.map((u) => u.id));
  }

  // Remove destroyed units
  const updatedUnits = state.units.filter(
    (u) => !destroyedUnitIds.includes(u.id)
  );

  return {
    ...state,
    bridges: updatedBridges,
    units: updatedUnits,
  };
}
