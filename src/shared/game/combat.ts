/**
 * Full Metal Planete - Combat System
 *
 * Implements combat range calculation, "under fire" zone detection,
 * destruction rules (2 units required), and capture rules.
 */

import {
  TerrainType,
  UnitType,
  UNIT_PROPERTIES,
  GAME_CONSTANTS,
  type Unit,
  type HexCoord,
  type ValidationResult,
} from './types';
import { hexDistance, hexKey, hexesInRange } from './hex';

// ============================================================================
// Combat Range Calculation
// ============================================================================

/**
 * Get the combat range for a unit based on its type and current terrain.
 * Tanks get +1 range bonus when on mountains.
 */
export function getCombatRange(unit: Unit, terrain: TerrainType): number {
  const props = UNIT_PROPERTIES[unit.type];

  if (props.combatRange === 0) {
    return 0;
  }

  // Check for mountain bonus
  if (terrain === TerrainType.Mountain && props.mountainRangeBonus > 0) {
    return props.combatRange + props.mountainRangeBonus;
  }

  return props.combatRange;
}

/**
 * Check if a unit can shoot at a target hex.
 * Considers range, shots remaining, stuck/neutralized status.
 */
export function canShootTarget(
  unit: Unit,
  targetHex: HexCoord,
  attackerTerrain: TerrainType,
  ignoreNeutralized = false
): boolean {
  const props = UNIT_PROPERTIES[unit.type];

  // Non-combat units cannot shoot
  if (props.combatRange === 0) {
    return false;
  }

  // Check shots remaining
  if (unit.shotsRemaining <= 0) {
    return false;
  }

  // Stuck units cannot shoot
  if (unit.isStuck) {
    return false;
  }

  // Neutralized units cannot shoot (except Towers can fire back)
  if (unit.isNeutralized && !ignoreNeutralized) {
    if (unit.type !== UnitType.Tower) {
      return false;
    }
  }

  // Check range
  const range = getCombatRange(unit, attackerTerrain);
  const distance = hexDistance(unit.position, targetHex);

  return distance <= range && distance > 0; // Cannot shoot own hex
}

// ============================================================================
// Under Fire Zone Detection
// ============================================================================

export type TerrainGetter = (coord: HexCoord) => TerrainType;

/**
 * Get all hexes that are under fire from a player's combat units.
 * A hex is "under fire" when it's within range of 2+ combat units of the same player.
 */
export function getHexesUnderFire(
  units: Unit[],
  playerId: string,
  getTerrainAt: TerrainGetter
): Set<string> {
  const underFire = new Set<string>();

  // Get all active combat units for this player
  const combatUnits = units.filter(
    (u) =>
      u.owner === playerId &&
      UNIT_PROPERTIES[u.type].combatRange > 0 &&
      !u.isStuck &&
      !u.isNeutralized &&
      u.shotsRemaining > 0
  );

  // Need at least 2 combat units to create an under-fire zone
  if (combatUnits.length < 2) {
    return underFire;
  }

  // Count coverage for each hex
  const coverage = new Map<string, number>();

  for (const unit of combatUnits) {
    const terrain = getTerrainAt(unit.position);
    const range = getCombatRange(unit, terrain);
    const reachableHexes = hexesInRange(unit.position, range);

    for (const hex of reachableHexes) {
      // Skip the unit's own hex
      if (hex.q === unit.position.q && hex.r === unit.position.r) {
        continue;
      }

      const key = hexKey(hex);
      coverage.set(key, (coverage.get(key) || 0) + 1);
    }
  }

  // Mark hexes covered by 2+ units as under fire
  for (const [key, count] of coverage) {
    if (count >= GAME_CONSTANTS.UNITS_REQUIRED_TO_DESTROY) {
      underFire.add(key);
    }
  }

  return underFire;
}

/**
 * Get hexes under fire by each player.
 * Returns a map of player ID to set of hex keys under fire.
 */
export function getHexesUnderFireByPlayer(
  units: Unit[],
  playerIds: string[],
  getTerrainAt: TerrainGetter
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  for (const playerId of playerIds) {
    result.set(playerId, getHexesUnderFire(units, playerId, getTerrainAt));
  }

  return result;
}

/**
 * Check if a specific hex is under fire from a player's units.
 */
export function isHexUnderFire(
  hex: HexCoord,
  units: Unit[],
  playerId: string,
  getTerrainAt: TerrainGetter
): boolean {
  const underFire = getHexesUnderFire(units, playerId, getTerrainAt);
  return underFire.has(hexKey(hex));
}

// ============================================================================
// Destruction Rules
// ============================================================================

/**
 * Check if a target can be destroyed by the given attackers.
 * Requires 2 combat units from the same player, both in range.
 */
export function canDestroyTarget(
  attackers: Unit[],
  targetHex: HexCoord,
  getTerrainAt: TerrainGetter
): ValidationResult {
  // Need exactly 2 attackers
  if (attackers.length < GAME_CONSTANTS.UNITS_REQUIRED_TO_DESTROY) {
    return {
      valid: false,
      error: `Destruction requires ${GAME_CONSTANTS.UNITS_REQUIRED_TO_DESTROY} combat units firing simultaneously`,
    };
  }

  // All attackers must belong to same player
  const owner = attackers[0].owner;
  if (!attackers.every((a) => a.owner === owner)) {
    return {
      valid: false,
      error: 'All attackers must belong to the same player',
    };
  }

  // Each attacker must be able to shoot the target
  for (const attacker of attackers) {
    const terrain = getTerrainAt(attacker.position);
    if (!canShootTarget(attacker, targetHex, terrain)) {
      return {
        valid: false,
        error: `Unit ${attacker.id} cannot shoot target (out of range or unable to fire)`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// Capture Rules
// ============================================================================

/**
 * Check if a target unit can be captured by the given attackers.
 * Requirements:
 * - Both attackers must be adjacent to target
 * - All involved units must be free from enemy fire
 * - Target must be enemy unit
 */
export function canCaptureTarget(
  attackers: Unit[],
  target: Unit,
  allUnits: Unit[],
  getTerrainAt: TerrainGetter
): ValidationResult {
  // Need exactly 2 attackers
  if (attackers.length < GAME_CONSTANTS.UNITS_REQUIRED_TO_CAPTURE) {
    return {
      valid: false,
      error: `Capture requires ${GAME_CONSTANTS.UNITS_REQUIRED_TO_CAPTURE} combat units adjacent to target`,
    };
  }

  // All attackers must belong to same player
  const owner = attackers[0].owner;
  if (!attackers.every((a) => a.owner === owner)) {
    return {
      valid: false,
      error: 'All attackers must belong to the same player',
    };
  }

  // Target must be enemy
  if (target.owner === owner) {
    return {
      valid: false,
      error: 'Cannot capture your own unit, must target enemy unit',
    };
  }

  // Both attackers must be adjacent to target (distance 1)
  for (const attacker of attackers) {
    const distance = hexDistance(attacker.position, target.position);
    if (distance !== 1) {
      return {
        valid: false,
        error: `Unit ${attacker.id} must be adjacent to target for capture`,
      };
    }
  }

  // Check that attackers are combat units
  for (const attacker of attackers) {
    if (UNIT_PROPERTIES[attacker.type].combatRange === 0) {
      return {
        valid: false,
        error: `Unit ${attacker.id} is not a combat unit`,
      };
    }
  }

  // Check attackers are not stuck or neutralized
  for (const attacker of attackers) {
    if (attacker.isStuck) {
      return {
        valid: false,
        error: `Unit ${attacker.id} is stuck and cannot capture`,
      };
    }
    if (attacker.isNeutralized) {
      return {
        valid: false,
        error: `Unit ${attacker.id} is neutralized and cannot capture`,
      };
    }
  }

  // Get all enemy players (excluding the capturing player)
  const enemyPlayers = [...new Set(allUnits.map((u) => u.owner))].filter(
    (p) => p !== owner
  );

  // Check that attackers are not under enemy fire
  for (const enemyPlayer of enemyPlayers) {
    const underFire = getHexesUnderFire(allUnits, enemyPlayer, getTerrainAt);

    for (const attacker of attackers) {
      if (underFire.has(hexKey(attacker.position))) {
        return {
          valid: false,
          error: `Unit ${attacker.id} is under fire and cannot capture`,
        };
      }
    }

    // Target must also not be under fire from other enemies
    if (underFire.has(hexKey(target.position)) && enemyPlayer !== target.owner) {
      return {
        valid: false,
        error: 'Target is under fire from another enemy and cannot be captured',
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// Valid Attacker Pairs
// ============================================================================

/**
 * Get all valid pairs of units that can attack a target hex.
 * Used to show player which units can be used for destruction.
 */
export function getValidAttackerPairs(
  units: Unit[],
  playerId: string,
  targetHex: HexCoord,
  getTerrainAt: TerrainGetter
): [Unit, Unit][] {
  // Get all combat units that can shoot the target
  const validAttackers = units.filter((unit) => {
    if (unit.owner !== playerId) return false;

    const props = UNIT_PROPERTIES[unit.type];
    if (props.combatRange === 0) return false;
    if (unit.isStuck || unit.isNeutralized) return false;
    if (unit.shotsRemaining <= 0) return false;

    const terrain = getTerrainAt(unit.position);
    return canShootTarget(unit, targetHex, terrain);
  });

  // Generate all pairs
  const pairs: [Unit, Unit][] = [];

  for (let i = 0; i < validAttackers.length; i++) {
    for (let j = i + 1; j < validAttackers.length; j++) {
      pairs.push([validAttackers[i], validAttackers[j]]);
    }
  }

  return pairs;
}

// ============================================================================
// Combat Unit Detection
// ============================================================================

/**
 * Check if a unit is a combat unit (has non-zero combat range).
 */
export function isCombatUnit(unit: Unit): boolean {
  return UNIT_PROPERTIES[unit.type].combatRange > 0;
}

/**
 * Check if a unit can currently fire (has shots, not stuck/neutralized).
 */
export function canUnitFire(unit: Unit): boolean {
  if (!isCombatUnit(unit)) return false;
  if (unit.shotsRemaining <= 0) return false;
  if (unit.isStuck) return false;
  // Towers can always fire back
  if (unit.isNeutralized && unit.type !== UnitType.Tower) return false;
  return true;
}

/**
 * Get all combat units for a player that can currently fire.
 */
export function getActiveCombatUnits(units: Unit[], playerId: string): Unit[] {
  return units.filter((u) => u.owner === playerId && canUnitFire(u));
}
