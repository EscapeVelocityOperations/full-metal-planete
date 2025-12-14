/**
 * Full Metal Planete - Action System
 *
 * Implements action point calculation, move validation, load/unload validation,
 * fire/capture validation, and build validation.
 */

import {
  TerrainType,
  UnitType,
  GamePhase,
  UNIT_PROPERTIES,
  GAME_CONSTANTS,
  type HexCoord,
  type GameState,
  type Unit,
  type ValidationResult,
  type HexTerrain,
} from './types';
import { hexDistance, hexKey, hexNeighbors } from './hex';
import { canUnitEnterTerrain, getEffectiveTerrain } from './terrain';
import { getHexesUnderFire, canDestroyTarget, canCaptureTarget, type TerrainGetter } from './combat';

// ============================================================================
// Action Point Calculation
// ============================================================================

/**
 * Get base action points for a turn.
 * Turn 3: 5 AP, Turn 4: 10 AP, Turn 5+: 15 AP
 * Landing and Deployment phases: 0 AP
 */
export function getBaseActionPoints(turn: number, phase: GamePhase): number {
  if (phase === GamePhase.Landing || phase === GamePhase.Deployment) {
    return 0;
  }

  if (turn === 3) {
    return GAME_CONSTANTS.TURN_3_AP;
  }

  if (turn === 4) {
    return GAME_CONSTANTS.TURN_4_AP;
  }

  return GAME_CONSTANTS.BASE_AP;
}

/**
 * Calculate total available action points for a turn.
 * Includes base AP, saved AP (capped at 10), and captured astronef bonus.
 */
export function calculateTotalActionPoints(
  turn: number,
  phase: GamePhase,
  savedAP: number,
  capturedAstronefs: number
): number {
  const base = getBaseActionPoints(turn, phase);
  const saved = Math.min(savedAP, GAME_CONSTANTS.MAX_SAVED_AP);
  const bonus = capturedAstronefs * GAME_CONSTANTS.CAPTURED_ASTRONEF_BONUS_AP;

  return base + saved + bonus;
}

/**
 * Calculate saved AP after a turn ends.
 * Unused AP is saved up to MAX_SAVED_AP (10).
 */
export function calculateSavedAP(unusedAP: number, currentSaved: number): number {
  return Math.min(unusedAP + currentSaved, GAME_CONSTANTS.MAX_SAVED_AP);
}

/**
 * Calculate the AP cost for a movement path.
 * Cost depends on unit type's movementCost per hex.
 */
export function calculateMoveCost(path: HexCoord[], unitType: UnitType): number {
  if (path.length <= 1) {
    return 0;
  }
  const movementCost = UNIT_PROPERTIES[unitType].movementCost;
  if (!isFinite(movementCost)) {
    return Infinity; // Unit cannot move
  }
  return (path.length - 1) * movementCost;
}

// ============================================================================
// Validation Result with AP Cost
// ============================================================================

export interface ActionValidationResult extends ValidationResult {
  apCost?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a terrain getter function from game state.
 */
function createTerrainGetter(terrain: HexTerrain[]): TerrainGetter {
  const terrainMap = new Map<string, TerrainType>();
  for (const t of terrain) {
    terrainMap.set(hexKey(t.coord), t.type);
  }
  return (coord: HexCoord) => terrainMap.get(hexKey(coord)) ?? TerrainType.Sea;
}

/**
 * Find a unit by ID in game state.
 */
function findUnit(state: GameState, unitId: string): Unit | undefined {
  return state.units.find((u) => u.id === unitId);
}

/**
 * Check if a hex is occupied by another unit.
 */
function isHexOccupied(state: GameState, hex: HexCoord, excludeUnitId?: string): boolean {
  return state.units.some(
    (u) => u.position.q === hex.q && u.position.r === hex.r && u.id !== excludeUnitId
  );
}

/**
 * Get cargo size of a unit or mineral (for capacity checks).
 */
function getCargoSize(unitOrMineralId: string, state: GameState): number {
  // Minerals have size 1
  if (unitOrMineralId.startsWith('mineral')) {
    return 1;
  }

  const unit = findUnit(state, unitOrMineralId);
  if (!unit) {
    return 1; // Default size
  }

  return UNIT_PROPERTIES[unit.type].size;
}

/**
 * Get current cargo total size.
 */
function getCurrentCargoSize(cargo: (string | undefined)[] | undefined, state: GameState): number {
  if (!cargo) return 0;
  return cargo.reduce((total, id) => {
    if (!id) return total;
    return total + getCargoSize(id, state);
  }, 0);
}

// ============================================================================
// Move Validation
// ============================================================================

/**
 * Validate a move action.
 */
export function validateMoveAction(
  state: GameState,
  unitId: string,
  path: HexCoord[]
): ActionValidationResult {
  const unit = findUnit(state, unitId);

  if (!unit) {
    return { valid: false, error: `Unit ${unitId} not found` };
  }

  // Check unit belongs to current player
  if (unit.owner !== state.currentPlayer) {
    return { valid: false, error: 'Cannot move a unit you do not own' };
  }

  // Check unit is not stuck
  if (unit.isStuck) {
    return { valid: false, error: 'Unit is stuck and cannot move' };
  }

  // Check unit is not neutralized
  if (unit.isNeutralized) {
    return { valid: false, error: 'Unit is neutralized and cannot move' };
  }

  // Check path starts at unit position
  if (path.length === 0 || path[0].q !== unit.position.q || path[0].r !== unit.position.r) {
    return { valid: false, error: 'Path must start at unit position' };
  }

  // Check unit can move (not fixed)
  const movementCostPerHex = UNIT_PROPERTIES[unit.type].movementCost;
  if (!isFinite(movementCostPerHex)) {
    return { valid: false, error: `${unit.type} cannot move` };
  }

  // Calculate cost based on unit type
  const cost = calculateMoveCost(path, unit.type);

  // Check sufficient AP
  if (cost > state.actionPoints) {
    return { valid: false, error: `Insufficient action points (need ${cost}, have ${state.actionPoints})` };
  }

  const getTerrainAt = createTerrainGetter(state.terrain);

  // Get all enemy players
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  // Get all hexes under enemy fire
  const allUnderFire = new Set<string>();
  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    for (const key of underFire) {
      allUnderFire.add(key);
    }
  }

  // Validate each step of the path
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];

    // Check adjacent
    if (hexDistance(from, to) !== 1) {
      return { valid: false, error: `Path segments must be adjacent (step ${i})` };
    }

    // Check terrain is valid for unit
    const terrain = getTerrainAt(to);
    if (!canUnitEnterTerrain(unit.type, terrain, state.currentTide)) {
      return { valid: false, error: `Unit cannot enter ${terrain} terrain at step ${i}` };
    }

    // Check not occupied (only final hex matters for most cases, but check path)
    if (i === path.length - 1 && isHexOccupied(state, to, unitId)) {
      return { valid: false, error: 'Destination hex is occupied' };
    }

    // Check not under enemy fire
    if (allUnderFire.has(hexKey(to))) {
      return { valid: false, error: `Cannot move into hex under fire at step ${i}` };
    }
  }

  return { valid: true, apCost: cost };
}

// ============================================================================
// Load Validation
// ============================================================================

/**
 * Validate a load action.
 */
export function validateLoadAction(
  state: GameState,
  transporterId: string,
  cargoId: string
): ActionValidationResult {
  const transporter = findUnit(state, transporterId);

  if (!transporter) {
    return { valid: false, error: `Transporter ${transporterId} not found` };
  }

  // Check transporter belongs to current player
  if (transporter.owner !== state.currentPlayer) {
    return { valid: false, error: 'Cannot use a transporter you do not own' };
  }

  // Check unit is actually a transporter
  const props = UNIT_PROPERTIES[transporter.type];
  if (props.cargoSlots === 0) {
    return { valid: false, error: `${transporter.type} is not a transporter` };
  }

  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_LOAD) {
    return { valid: false, error: `Insufficient action points` };
  }

  // Get cargo position
  let cargoPosition: HexCoord | undefined;
  let cargoSize = 1;

  if (cargoId.startsWith('mineral')) {
    const mineral = state.minerals.find((m) => m.id === cargoId);
    if (!mineral) {
      return { valid: false, error: `Mineral ${cargoId} not found` };
    }
    cargoPosition = mineral.position;
    cargoSize = 1;
  } else {
    const cargoUnit = findUnit(state, cargoId);
    if (!cargoUnit) {
      return { valid: false, error: `Unit ${cargoId} not found` };
    }

    // Check cargo unit can be carried by this transporter
    const cargoProps = UNIT_PROPERTIES[cargoUnit.type];

    // Check if transporter can carry large items
    if (cargoProps.size >= 2 && !props.canCarryLarge) {
      return { valid: false, error: `${transporter.type} cannot carry ${cargoUnit.type}` };
    }

    // Check cargo is not stuck (cannot pick up stuck items except bridges)
    if (cargoUnit.isStuck && cargoUnit.type !== UnitType.Bridge) {
      return { valid: false, error: 'Cannot load a unit that is stuck' };
    }

    cargoPosition = cargoUnit.position;
    cargoSize = cargoProps.size;
  }

  // Check cargo is adjacent
  if (hexDistance(transporter.position, cargoPosition) !== 1) {
    return { valid: false, error: 'Cargo must be adjacent to transporter' };
  }

  // Check capacity
  const currentCargo = getCurrentCargoSize(transporter.cargo, state);
  if (currentCargo + cargoSize > props.cargoSlots) {
    return { valid: false, error: 'Transporter does not have enough capacity' };
  }

  const getTerrainAt = createTerrainGetter(state.terrain);

  // Check not under enemy fire
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(transporter.position))) {
      return { valid: false, error: 'Cannot load while under fire' };
    }
  }

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_LOAD };
}

// ============================================================================
// Unload Validation
// ============================================================================

/**
 * Validate an unload action.
 */
export function validateUnloadAction(
  state: GameState,
  transporterId: string,
  cargoId: string,
  destination: HexCoord
): ActionValidationResult {
  const transporter = findUnit(state, transporterId);

  if (!transporter) {
    return { valid: false, error: `Transporter ${transporterId} not found` };
  }

  // Check transporter belongs to current player
  if (transporter.owner !== state.currentPlayer) {
    return { valid: false, error: 'Cannot use a transporter you do not own' };
  }

  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_UNLOAD) {
    return { valid: false, error: `Insufficient action points` };
  }

  // Check cargo is in transporter
  if (!transporter.cargo?.includes(cargoId)) {
    return { valid: false, error: `${cargoId} is not in cargo` };
  }

  // Check destination is adjacent
  if (hexDistance(transporter.position, destination) !== 1) {
    return { valid: false, error: 'Destination must be adjacent to transporter' };
  }

  const getTerrainAt = createTerrainGetter(state.terrain);
  const terrain = getTerrainAt(destination);

  // Check destination is not sea
  const effectiveTerrain = getEffectiveTerrain(terrain, state.currentTide);
  if (effectiveTerrain === 'sea' && terrain === TerrainType.Sea) {
    return { valid: false, error: 'Cannot unload to sea hex' };
  }

  // Check destination is not occupied (unless bridge or transporter with space)
  if (isHexOccupied(state, destination)) {
    return { valid: false, error: 'Destination hex is occupied' };
  }

  // Check not under enemy fire
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(destination))) {
      return { valid: false, error: 'Cannot unload to hex under fire' };
    }
  }

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_UNLOAD };
}

// ============================================================================
// Fire Validation
// ============================================================================

/**
 * Validate a fire (destruction) action.
 */
export function validateFireAction(
  state: GameState,
  attackerIds: string[],
  targetHex: HexCoord
): ActionValidationResult {
  // Need exactly 2 attackers
  if (attackerIds.length < GAME_CONSTANTS.UNITS_REQUIRED_TO_DESTROY) {
    return {
      valid: false,
      error: `Need ${GAME_CONSTANTS.UNITS_REQUIRED_TO_DESTROY} combat units to destroy`,
    };
  }

  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_FIRE) {
    return { valid: false, error: 'Insufficient action points' };
  }

  // Get attackers
  const attackers: Unit[] = [];
  for (const id of attackerIds) {
    const unit = findUnit(state, id);
    if (!unit) {
      return { valid: false, error: `Unit ${id} not found` };
    }
    if (unit.owner !== state.currentPlayer) {
      return { valid: false, error: 'Cannot use enemy unit for attack' };
    }
    attackers.push(unit);
  }

  const getTerrainAt = createTerrainGetter(state.terrain);

  // Validate destruction
  const result = canDestroyTarget(attackers, targetHex, getTerrainAt);

  if (!result.valid) {
    return result;
  }

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_FIRE };
}

// ============================================================================
// Capture Validation
// ============================================================================

/**
 * Validate a capture action.
 */
export function validateCaptureAction(
  state: GameState,
  attackerIds: string[],
  targetId: string
): ActionValidationResult {
  // Need exactly 2 attackers
  if (attackerIds.length < GAME_CONSTANTS.UNITS_REQUIRED_TO_CAPTURE) {
    return {
      valid: false,
      error: `Need ${GAME_CONSTANTS.UNITS_REQUIRED_TO_CAPTURE} combat units to capture`,
    };
  }

  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_CAPTURE) {
    return { valid: false, error: 'Insufficient action points' };
  }

  // Get attackers
  const attackers: Unit[] = [];
  for (const id of attackerIds) {
    const unit = findUnit(state, id);
    if (!unit) {
      return { valid: false, error: `Unit ${id} not found` };
    }
    if (unit.owner !== state.currentPlayer) {
      return { valid: false, error: 'Cannot use enemy unit for capture' };
    }
    attackers.push(unit);
  }

  // Get target
  const target = findUnit(state, targetId);
  if (!target) {
    return { valid: false, error: `Target ${targetId} not found` };
  }

  const getTerrainAt = createTerrainGetter(state.terrain);

  // Validate capture
  const result = canCaptureTarget(attackers, target, state.units, getTerrainAt);

  if (!result.valid) {
    return result;
  }

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_CAPTURE };
}

// ============================================================================
// Build Validation
// ============================================================================

/**
 * Validate a build action.
 */
export function validateBuildAction(
  state: GameState,
  converterId: string,
  unitType: UnitType
): ActionValidationResult {
  const converter = findUnit(state, converterId);

  if (!converter) {
    return { valid: false, error: `Unit ${converterId} not found` };
  }

  // Check it's a converter
  if (converter.type !== UnitType.Converter) {
    return { valid: false, error: 'Only Converter can build units' };
  }

  // Check converter belongs to current player
  if (converter.owner !== state.currentPlayer) {
    return { valid: false, error: 'Cannot use enemy converter' };
  }

  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_BUILD) {
    return { valid: false, error: 'Insufficient action points' };
  }

  // Check converter has mineral
  if (!converter.cargo || converter.cargo.length === 0) {
    return { valid: false, error: 'Converter has no mineral to convert' };
  }

  // Check converter is not stuck
  if (converter.isStuck) {
    return { valid: false, error: 'Converter is stuck and cannot build' };
  }

  // Check converter is not under fire
  const getTerrainAt = createTerrainGetter(state.terrain);
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(converter.position))) {
      return { valid: false, error: 'Cannot build while under fire' };
    }
  }

  // Check buildable unit type
  const buildableUnits = [
    UnitType.Tank,
    UnitType.SuperTank,
    UnitType.MotorBoat,
    UnitType.Crab,
    UnitType.Bridge,
    UnitType.Barge,
  ];

  if (!buildableUnits.includes(unitType)) {
    return { valid: false, error: `Cannot build ${unitType}` };
  }

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_BUILD };
}

// ============================================================================
// Enter/Exit Astronef Validation
// ============================================================================

/**
 * Validate entering astronef action.
 */
export function validateEnterAstronefAction(
  state: GameState,
  unitId: string,
  podeIndex: number
): ActionValidationResult {
  const unit = findUnit(state, unitId);

  if (!unit) {
    return { valid: false, error: `Unit ${unitId} not found` };
  }

  // Check unit belongs to current player
  if (unit.owner !== state.currentPlayer) {
    return { valid: false, error: 'Cannot control enemy unit' };
  }

  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_ENTER_ASTRONEF) {
    return { valid: false, error: 'Insufficient action points' };
  }

  // Find player's astronef
  const astronef = state.units.find(
    (u) => u.type === UnitType.Astronef && u.owner === state.currentPlayer
  );

  if (!astronef) {
    return { valid: false, error: 'No astronef found' };
  }

  // Check podeIndex is valid
  if (podeIndex < 0 || podeIndex > 2) {
    return { valid: false, error: 'Invalid pode index' };
  }

  // Check tower at pode is not destroyed (can enter via destroyed tower)
  // Per rules: Can enter via pode under fire if outside hex is clear

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_ENTER_ASTRONEF };
}

/**
 * Validate exiting astronef action.
 */
export function validateExitAstronefAction(
  state: GameState,
  unitId: string,
  podeIndex: number,
  destination: HexCoord
): ActionValidationResult {
  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_EXIT_ASTRONEF) {
    return { valid: false, error: 'Insufficient action points' };
  }

  // Find player's astronef
  const astronef = state.units.find(
    (u) => u.type === UnitType.Astronef && u.owner === state.currentPlayer
  );

  if (!astronef) {
    return { valid: false, error: 'No astronef found' };
  }

  // Check podeIndex is valid
  if (podeIndex < 0 || podeIndex > 2) {
    return { valid: false, error: 'Invalid pode index' };
  }

  // Check tower at pode is not destroyed
  if (astronef.turrets?.[podeIndex]?.isDestroyed) {
    return { valid: false, error: 'Cannot exit via destroyed tower' };
  }

  const getTerrainAt = createTerrainGetter(state.terrain);

  // Check destination is not under enemy fire
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(destination))) {
      return { valid: false, error: 'Cannot exit to hex under fire' };
    }
  }

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_EXIT_ASTRONEF };
}
