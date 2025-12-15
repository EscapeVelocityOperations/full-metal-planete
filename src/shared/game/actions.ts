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
  UNIT_SHAPES,
  type HexCoord,
  type GameState,
  type Unit,
  type ValidationResult,
  type HexTerrain,
  type RetreatAction,
  type CaptureAstronefAction,
} from './types';
import { hexDistance, hexKey, hexNeighbors, getUnitFootprint, getOccupiedHexes } from './hex';
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
    (u) => u.position !== null && u.position.q === hex.q && u.position.r === hex.r && u.id !== excludeUnitId
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

  // Get unit shape info for multi-hex units (Barges)
  const unitShape = UNIT_SHAPES[unit.type];
  const isMultiHexUnit = unitShape && unitShape.hexCount > 1;
  const unitRotation = unit.rotation || 0;

  // Validate each step of the path
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];

    // Check adjacent
    if (hexDistance(from, to) !== 1) {
      return { valid: false, error: `Path segments must be adjacent (step ${i})` };
    }

    // For multi-hex units, validate ALL hexes in the footprint
    if (isMultiHexUnit) {
      const footprint = getUnitFootprint(unit.type, to, unitRotation);
      for (const footprintHex of footprint) {
        // Check terrain is valid for each hex in footprint
        const terrain = getTerrainAt(footprintHex);
        if (!canUnitEnterTerrain(unit.type, terrain, state.currentTide)) {
          return { valid: false, error: `Unit cannot enter ${terrain} terrain at step ${i}` };
        }

        // Check not under enemy fire for any hex in footprint
        if (allUnderFire.has(hexKey(footprintHex))) {
          return { valid: false, error: `Cannot move into hex under fire at step ${i}` };
        }
      }

      // Check for collisions with other units at final destination
      if (i === path.length - 1) {
        const occupiedHexes = getOccupiedHexes(state.units.filter((u) => u.id !== unitId));
        for (const footprintHex of footprint) {
          if (occupiedHexes.has(hexKey(footprintHex))) {
            return { valid: false, error: 'Destination hexes are occupied' };
          }
        }
      }
    } else {
      // Single-hex unit validation (original logic)
      const terrain = getTerrainAt(to);
      if (!canUnitEnterTerrain(unit.type, terrain, state.currentTide)) {
        return { valid: false, error: `Unit cannot enter ${terrain} terrain at step ${i}` };
      }

      // Check not occupied (only final hex matters for single-hex units)
      if (i === path.length - 1 && isHexOccupied(state, to, unitId)) {
        return { valid: false, error: 'Destination hex is occupied' };
      }

      // Check not under enemy fire
      if (allUnderFire.has(hexKey(to))) {
        return { valid: false, error: `Cannot move into hex under fire at step ${i}` };
      }
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

  // Check max builds per turn (max 2)
  const buildsThisTurn = state.buildsThisTurn || [];
  if (buildsThisTurn.length >= 2) {
    return { valid: false, error: 'Maximum 2 units can be built per turn' };
  }

  // Check special unit restrictions (cannot build 2 of same special type per turn)
  const specialTypes = [UnitType.Crab, UnitType.Bridge];
  if (specialTypes.includes(unitType) && buildsThisTurn.includes(unitType)) {
    return { valid: false, error: `Cannot build two ${unitType}s in the same turn` };
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

// ============================================================================
// Retreat Action Validation (Section 6.5)
// ============================================================================

/**
 * Validate a retreat action.
 * Retreat is a special action that happens at the start of a player's turn
 * for units that are under fire. It costs 0 AP but must be done before any
 * other actions.
 *
 * Rules:
 * - Unit must be under enemy fire at start of turn
 * - Destination must be adjacent (1 hex away)
 * - Destination must not be under enemy fire
 * - Destination must be valid terrain for unit type
 * - Destination must be unoccupied
 */
export function validateRetreatAction(
  state: GameState,
  action: RetreatAction
): ValidationResult {
  // Find the unit
  const unit = state.units.find((u) => u.id === action.unitId);
  if (!unit) {
    return { valid: false, error: 'Unit not found' };
  }

  // Check unit belongs to the player
  if (unit.owner !== action.playerId) {
    return { valid: false, error: 'Unit does not belong to player' };
  }

  // Check unit has a position
  if (unit.position === null) {
    return { valid: false, error: 'Unit has no position' };
  }

  // Create terrain getter
  const getTerrainAt: TerrainGetter = (coord: HexCoord) => {
    const hex = state.terrain.find((t) => t.coord.q === coord.q && t.coord.r === coord.r);
    return hex?.type ?? TerrainType.Sea;
  };

  // Check unit is under fire from at least one enemy
  const enemyPlayers = state.players
    .filter((p) => p.id !== action.playerId)
    .map((p) => p.id);

  let isUnderFire = false;
  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(unit.position))) {
      isUnderFire = true;
      break;
    }
  }

  if (!isUnderFire) {
    return { valid: false, error: 'Unit is not under fire and cannot retreat' };
  }

  // Check destination is adjacent
  const distance = hexDistance(unit.position, action.destination);
  if (distance !== 1) {
    return { valid: false, error: 'Retreat must be to adjacent hex' };
  }

  // Check destination is not under fire
  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(action.destination))) {
      return { valid: false, error: 'Cannot retreat to hex under fire' };
    }
  }

  // Check terrain is valid
  const destTerrain = getTerrainAt(action.destination);
  if (!canUnitEnterTerrain(unit.type, destTerrain, state.currentTide)) {
    return { valid: false, error: 'Cannot retreat to invalid terrain' };
  }

  // Check destination is unoccupied
  const occupant = state.units.find(
    (u) => u.position !== null &&
      u.position.q === action.destination.q &&
      u.position.r === action.destination.r
  );
  if (occupant) {
    return { valid: false, error: 'Cannot retreat to occupied hex' };
  }

  // Retreat costs 0 AP
  return { valid: true, apCost: 0 };
}

// ============================================================================
// Astronef Capture Validation (Section 10.5)
// ============================================================================

/**
 * Validate an astronef capture action.
 *
 * Rules for capturing an enemy astronef:
 * 1. All 3 towers of the target astronef must be destroyed
 * 2. A hostile combat unit must move onto one of the astronef's hexes
 * 3. The capturing unit must not be stuck or neutralized
 * 4. The capturing unit must be adjacent to the astronef
 * 5. Cannot capture own astronef
 *
 * Effects of capture:
 * - Captor gains +5 AP per turn bonus
 * - All of the captured player's units retain their original color
 * - Captor now controls a mixed-color force
 */
export function validateCaptureAstronefAction(
  state: GameState,
  action: CaptureAstronefAction
): ValidationResult {
  // Find the combat unit
  const combatUnit = state.units.find((u) => u.id === action.combatUnitId);
  if (!combatUnit) {
    return { valid: false, error: 'Combat unit not found' };
  }

  // Check combat unit belongs to current player
  if (combatUnit.owner !== state.currentPlayer) {
    return { valid: false, error: 'Cannot use enemy unit for capture' };
  }

  // Check combat unit has combat capability
  const combatProps = UNIT_PROPERTIES[combatUnit.type];
  if (combatProps.combatRange === 0) {
    return { valid: false, error: 'Only combat units can capture astronefs' };
  }

  // Check combat unit is not stuck or neutralized
  if (combatUnit.isStuck) {
    return { valid: false, error: 'Unit is stuck and cannot capture' };
  }
  if (combatUnit.isNeutralized) {
    return { valid: false, error: 'Unit is neutralized and cannot capture' };
  }

  // Find the target astronef
  const targetAstronef = state.units.find((u) => u.id === action.targetAstronefId);
  if (!targetAstronef) {
    return { valid: false, error: 'Target astronef not found' };
  }

  // Check target is actually an astronef
  if (targetAstronef.type !== UnitType.Astronef) {
    return { valid: false, error: 'Target is not an astronef' };
  }

  // Check astronef is enemy
  if (targetAstronef.owner === state.currentPlayer) {
    return { valid: false, error: 'Cannot capture your own astronef' };
  }

  // Check astronef has not lifted off
  if (targetAstronef.hasLiftedOff || targetAstronef.position === null) {
    return { valid: false, error: 'Target astronef has already lifted off' };
  }

  // Check all 3 towers are destroyed
  if (!targetAstronef.turrets) {
    return { valid: false, error: 'Astronef has no turret data' };
  }

  const destroyedTurrets = targetAstronef.turrets.filter((t) => t.isDestroyed).length;
  if (destroyedTurrets < 3) {
    return {
      valid: false,
      error: `All 3 towers must be destroyed to capture (${destroyedTurrets}/3 destroyed)`,
    };
  }

  // Check combat unit is adjacent to the astronef
  // Astronef occupies 4 hexes, combat unit must be adjacent to any of them
  const astronefHexes = getAstronefOccupiedHexes(targetAstronef);
  if (!combatUnit.position) {
    return { valid: false, error: 'Combat unit has no position' };
  }

  const isAdjacent = astronefHexes.some(
    (astroHex) => hexDistance(combatUnit.position!, astroHex) === 1
  );

  if (!isAdjacent) {
    return { valid: false, error: 'Combat unit must be adjacent to astronef to capture' };
  }

  // Check sufficient AP (uses standard movement cost)
  const movementCost = combatProps.movementCost;
  if (state.actionPoints < movementCost) {
    return { valid: false, error: `Insufficient action points (need ${movementCost})` };
  }

  // Check combat unit is not under enemy fire
  const getTerrainAt = createTerrainGetter(state.terrain);
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(combatUnit.position!))) {
      return { valid: false, error: 'Cannot capture while under fire' };
    }
  }

  return { valid: true, apCost: movementCost };
}

/**
 * Get all hexes occupied by an astronef.
 * Astronef occupies 4 hexes in a Y-shape pattern.
 */
function getAstronefOccupiedHexes(astronef: Unit): HexCoord[] {
  if (!astronef.position) return [];

  const center = astronef.position;
  return [
    center,
    { q: center.q + 1, r: center.r },     // East
    { q: center.q, r: center.r + 1 },     // Southeast
    { q: center.q + 1, r: center.r - 1 }, // Northeast
  ];
}
