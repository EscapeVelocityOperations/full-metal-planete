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
  TideLevel,
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
  type RebuildTowerAction,
  type PlaceBridgeAction,
  type PickupBridgeAction,
} from './types';
import { hexDistance, hexKey, hexNeighbors, getUnitFootprint, getOccupiedHexes } from './hex';
import {
  canUnitEnterTerrain,
  getEffectiveTerrain,
  canVoluntarilyNeutralize,
  getVoluntaryNeutralizationResult,
  canPlaceBridge,
  isAdjacentToLandOrBridge,
  canUnitEnterBridgedHex,
} from './terrain';
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
  /** If the move involves voluntary neutralization, indicates resulting status */
  voluntaryNeutralization?: 'stuck' | 'grounded';
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
      const isLastStep = i === path.length - 1;
      let hasVoluntaryNeutralization = false;

      for (const footprintHex of footprint) {
        // Check for bridge on this hex
        const hasBridge = state.bridges.some(
          (b) => b.position.q === footprintHex.q && b.position.r === footprintHex.r
        );

        // If there's a bridge, check if unit can enter bridged hex
        if (hasBridge) {
          if (!canUnitEnterBridgedHex(unit.type)) {
            return { valid: false, error: `Sea units cannot enter bridged hex at step ${i}` };
          }
          // Bridge makes hex land - skip normal terrain check for this hex
        } else {
          // Check terrain is valid for each hex in footprint
          const terrain = getTerrainAt(footprintHex);
          if (!canUnitEnterTerrain(unit.type, terrain, state.currentTide)) {
            // Check if this is a valid voluntary neutralization (only allowed on final step)
            if (isLastStep && canVoluntarilyNeutralize(unit.type, terrain, state.currentTide)) {
              hasVoluntaryNeutralization = true;
            } else {
              return { valid: false, error: `Unit cannot enter ${terrain} terrain at step ${i}` };
            }
          }
        }

        // Check not under enemy fire for any hex in footprint
        if (allUnderFire.has(hexKey(footprintHex))) {
          return { valid: false, error: `Cannot move into hex under fire at step ${i}` };
        }
      }

      // Check for collisions with other units at final destination
      if (isLastStep) {
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
      const isLastStep = i === path.length - 1;

      // Check for bridge on this hex
      const hasBridge = state.bridges.some(
        (b) => b.position.q === to.q && b.position.r === to.r
      );

      // If there's a bridge, check if unit can enter bridged hex
      if (hasBridge) {
        if (!canUnitEnterBridgedHex(unit.type)) {
          return { valid: false, error: `Sea units cannot enter bridged hex at step ${i}` };
        }
        // Bridge makes hex land - skip normal terrain check for this hex
      } else if (!canUnitEnterTerrain(unit.type, terrain, state.currentTide)) {
        // Check if this is a valid voluntary neutralization (only allowed on final hex)
        // Per rules Section 3.4: "A unit may voluntarily enter impassable terrain
        // and become stuck/grounded on the first impassable hex."
        if (isLastStep && canVoluntarilyNeutralize(unit.type, terrain, state.currentTide)) {
          // Voluntary neutralization is valid - unit will become stuck/grounded
          // Continue validation, we'll mark this in the result
        } else {
          return { valid: false, error: `Unit cannot enter ${terrain} terrain at step ${i}` };
        }
      }

      // Check not occupied (only final hex matters for single-hex units)
      if (isLastStep && isHexOccupied(state, to, unitId)) {
        return { valid: false, error: 'Destination hex is occupied' };
      }

      // Check not under enemy fire
      if (allUnderFire.has(hexKey(to))) {
        return { valid: false, error: `Cannot move into hex under fire at step ${i}` };
      }
    }
  }

  // Check if final destination involves voluntary neutralization
  const finalHex = path[path.length - 1];
  const finalTerrain = getTerrainAt(finalHex);
  const neutralizationResult = getVoluntaryNeutralizationResult(unit.type, finalTerrain, state.currentTide);

  if (neutralizationResult) {
    return { valid: true, apCost: cost, voluntaryNeutralization: neutralizationResult };
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

// ============================================================================
// Tower Rebuild Validation (Section 10)
// ============================================================================

/**
 * Validate a rebuild tower action.
 *
 * Rules for rebuilding a tower:
 * 1. Only the player who owns the astronef can rebuild its towers
 * 2. The tower at the specified pode must be destroyed
 * 3. Cost is 2 AP per tower
 * 4. Cannot rebuild while the astronef is under enemy fire
 * 5. The astronef must not have lifted off
 */
export function validateRebuildTowerAction(
  state: GameState,
  action: RebuildTowerAction
): ActionValidationResult {
  // Find the astronef
  const astronef = state.units.find((u) => u.id === action.astronefId);
  if (!astronef) {
    return { valid: false, error: 'Astronef not found' };
  }

  // Check astronef belongs to current player
  if (astronef.owner !== state.currentPlayer) {
    return { valid: false, error: 'Can only rebuild towers on your own astronef' };
  }

  // Check astronef is actually an astronef
  if (astronef.type !== UnitType.Astronef) {
    return { valid: false, error: 'Target is not an astronef' };
  }

  // Check astronef has not lifted off
  if (astronef.hasLiftedOff || astronef.position === null) {
    return { valid: false, error: 'Cannot rebuild towers on astronef that has lifted off' };
  }

  // Check podeIndex is valid
  if (action.podeIndex < 0 || action.podeIndex > 2) {
    return { valid: false, error: 'Invalid pode index (must be 0, 1, or 2)' };
  }

  // Check astronef has turret data
  if (!astronef.turrets) {
    return { valid: false, error: 'Astronef has no turret data' };
  }

  // Check the tower at this pode is actually destroyed
  const turret = astronef.turrets.find((t) => t.podeIndex === action.podeIndex);
  if (!turret) {
    return { valid: false, error: 'Turret not found at specified pode' };
  }
  if (!turret.isDestroyed) {
    return { valid: false, error: 'Tower is not destroyed and does not need rebuilding' };
  }

  // Check sufficient AP
  if (state.actionPoints < GAME_CONSTANTS.AP_COST_REBUILD_TOWER) {
    return { valid: false, error: `Insufficient action points (need ${GAME_CONSTANTS.AP_COST_REBUILD_TOWER})` };
  }

  // Check astronef is not under enemy fire
  const getTerrainAt = createTerrainGetter(state.terrain);
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  // Get all astronef hexes and check if any are under fire
  const astronefHexes = getAstronefOccupiedHexes(astronef);
  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    for (const hex of astronefHexes) {
      if (underFire.has(hexKey(hex))) {
        return { valid: false, error: 'Cannot rebuild tower while astronef is under enemy fire' };
      }
    }
  }

  return { valid: true, apCost: GAME_CONSTANTS.AP_COST_REBUILD_TOWER };
}

// ============================================================================
// Bridge Actions (Section 9)
// ============================================================================

/**
 * Validate placing a bridge on the board.
 *
 * Per rules Section 9:
 * - Bridges are placed on sea hexes (effective terrain must be sea)
 * - Must connect to land or another bridge
 * - Cannot be laid under enemy fire
 * - Cost: 1 AP (standard unload cost)
 */
export function validatePlaceBridgeAction(
  state: GameState,
  action: PlaceBridgeAction
): ValidationResult {
  // Find the bridge unit being placed (should be in cargo of a transporter)
  const bridge = state.units.find((u) => u.id === action.bridgeId);
  if (!bridge) {
    return { valid: false, error: 'Bridge not found' };
  }

  // Check bridge is actually a bridge
  if (bridge.type !== UnitType.Bridge) {
    return { valid: false, error: 'Unit is not a bridge' };
  }

  // Check bridge is cargo of a unit belonging to current player
  const transporter = state.units.find(
    (u) => u.cargo && u.cargo.includes(action.bridgeId) && u.owner === state.currentPlayer
  );
  if (!transporter) {
    return { valid: false, error: 'Bridge must be carried by your unit' };
  }

  // Check transporter is not stuck or neutralized
  if (transporter.isStuck) {
    return { valid: false, error: 'Transporting unit is stuck' };
  }
  if (transporter.isNeutralized) {
    return { valid: false, error: 'Transporting unit is neutralized' };
  }

  // Check transporter position
  if (!transporter.position) {
    return { valid: false, error: 'Transporter has no position' };
  }

  // Check placement hex is adjacent to transporter
  const distance = hexDistance(transporter.position, action.position);
  if (distance !== 1) {
    return { valid: false, error: 'Bridge must be placed on adjacent hex' };
  }

  // Check terrain is effective sea at current tide
  const terrain = state.terrain.find(
    (t) => t.coord.q === action.position.q && t.coord.r === action.position.r
  );
  if (!terrain) {
    return { valid: false, error: 'Invalid hex position' };
  }

  if (!canPlaceBridge(terrain.type, state.currentTide)) {
    return { valid: false, error: 'Bridges can only be placed on sea terrain' };
  }

  // Check no bridge already exists at this position
  const existingBridge = state.bridges.find(
    (b) => b.position.q === action.position.q && b.position.r === action.position.r
  );
  if (existingBridge) {
    return { valid: false, error: 'A bridge already exists at this position' };
  }

  // Check bridge connects to land or another bridge
  const neighbors = hexNeighbors(action.position);
  const neighborData = neighbors.map((n) => {
    const t = state.terrain.find((t) => t.coord.q === n.q && t.coord.r === n.r);
    const hasBridge = state.bridges.some((b) => b.position.q === n.q && b.position.r === n.r);
    return {
      terrain: t?.type ?? TerrainType.Sea,
      hasBridge,
    };
  });

  if (!isAdjacentToLandOrBridge(neighborData, state.currentTide)) {
    return { valid: false, error: 'Bridge must connect to land or another bridge' };
  }

  // Check not under enemy fire
  const getTerrainAt = createTerrainGetter(state.terrain);
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(action.position))) {
      return { valid: false, error: 'Cannot place bridge under enemy fire' };
    }
  }

  // Check sufficient AP (1 AP for unload)
  if (state.actionPoints < 1) {
    return { valid: false, error: 'Insufficient action points (need 1)' };
  }

  return { valid: true, apCost: 1 };
}

/**
 * Validate picking up a bridge from the board.
 *
 * Per rules Section 9:
 * - Bridges can be picked up by any unit with cargo capacity
 * - Cannot be picked up under enemy fire
 * - Cost: 1 AP (standard load cost)
 */
export function validatePickupBridgeAction(
  state: GameState,
  action: PickupBridgeAction
): ValidationResult {
  // Find the bridge being picked up
  const bridgePlacement = state.bridges.find((b) => b.id === action.bridgeId);
  if (!bridgePlacement) {
    return { valid: false, error: 'Bridge not found on board' };
  }

  // Find the transporter
  const transporter = state.units.find((u) => u.id === action.transporterId);
  if (!transporter) {
    return { valid: false, error: 'Transporter not found' };
  }

  // Check transporter belongs to current player
  if (transporter.owner !== state.currentPlayer) {
    return { valid: false, error: 'Cannot use enemy unit to pick up bridge' };
  }

  // Check transporter is not stuck or neutralized
  if (transporter.isStuck) {
    return { valid: false, error: 'Transporting unit is stuck' };
  }
  if (transporter.isNeutralized) {
    return { valid: false, error: 'Transporting unit is neutralized' };
  }

  // Check transporter position
  if (!transporter.position) {
    return { valid: false, error: 'Transporter has no position' };
  }

  // Check transporter has cargo capacity
  const transporterProps = UNIT_PROPERTIES[transporter.type];
  if (transporterProps.cargoSlots === 0) {
    return { valid: false, error: 'Unit cannot carry cargo' };
  }

  // Check transporter has space for bridge
  const currentCargo = transporter.cargo?.length ?? 0;
  if (currentCargo >= transporterProps.cargoSlots) {
    return { valid: false, error: 'No cargo space available' };
  }

  // Check transporter is adjacent to bridge
  const distance = hexDistance(transporter.position, bridgePlacement.position);
  if (distance !== 1) {
    return { valid: false, error: 'Must be adjacent to bridge to pick it up' };
  }

  // Check not under enemy fire (both bridge and transporter)
  const getTerrainAt = createTerrainGetter(state.terrain);
  const enemyPlayers = state.players
    .filter((p) => p.id !== state.currentPlayer)
    .map((p) => p.id);

  for (const enemyId of enemyPlayers) {
    const underFire = getHexesUnderFire(state.units, enemyId, getTerrainAt);
    if (underFire.has(hexKey(bridgePlacement.position))) {
      return { valid: false, error: 'Cannot pick up bridge under enemy fire' };
    }
    if (underFire.has(hexKey(transporter.position))) {
      return { valid: false, error: 'Cannot pick up bridge while under enemy fire' };
    }
  }

  // Check sufficient AP (1 AP for load)
  if (state.actionPoints < 1) {
    return { valid: false, error: 'Insufficient action points (need 1)' };
  }

  return { valid: true, apCost: 1 };
}

/**
 * Check if a hex has a bridge.
 */
export function hasBridgeAt(state: GameState, position: HexCoord): boolean {
  return state.bridges.some(
    (b) => b.position.q === position.q && b.position.r === position.r
  );
}

/**
 * Check if a bridge is still valid (connected to land or another valid bridge).
 * Used for bridge destruction cascade when tide rises.
 *
 * Per rules Section 9.3:
 * - Bridge is destroyed if connecting bridge hex is destroyed
 * - Bridge is destroyed if connecting land hex is submerged by tide
 */
export function validateBridgeConnections(
  state: GameState
): { bridgeId: string; valid: boolean }[] {
  const results: { bridgeId: string; valid: boolean }[] = [];
  const validBridges = new Set<string>();

  // First pass: find bridges directly connected to permanent or current-tide land
  for (const bridge of state.bridges) {
    const neighbors = hexNeighbors(bridge.position);
    const hasLandConnection = neighbors.some((n) => {
      const terrain = state.terrain.find(
        (t) => t.coord.q === n.q && t.coord.r === n.r
      );
      if (!terrain) return false;

      // Check if neighbor is land at current tide (not through another bridge)
      const effectiveTerrain = getEffectiveTerrain(terrain.type, state.currentTide);
      return effectiveTerrain === 'land';
    });

    if (hasLandConnection) {
      validBridges.add(bridge.id);
    }
  }

  // Second pass: propagate validity through connected bridges
  let changed = true;
  while (changed) {
    changed = false;
    for (const bridge of state.bridges) {
      if (validBridges.has(bridge.id)) continue;

      const neighbors = hexNeighbors(bridge.position);
      const hasValidBridgeConnection = neighbors.some((n) => {
        const connectedBridge = state.bridges.find(
          (b) => b.position.q === n.q && b.position.r === n.r
        );
        return connectedBridge && validBridges.has(connectedBridge.id);
      });

      if (hasValidBridgeConnection) {
        validBridges.add(bridge.id);
        changed = true;
      }
    }
  }

  // Generate results
  for (const bridge of state.bridges) {
    results.push({
      bridgeId: bridge.id,
      valid: validBridges.has(bridge.id),
    });
  }

  return results;
}
