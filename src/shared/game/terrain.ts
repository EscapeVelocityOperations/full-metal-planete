/**
 * Full Metal Planete - Terrain System
 *
 * Implements tide effects on terrain and movement validation for different unit types.
 */

import {
  TerrainType,
  TideLevel,
  UnitType,
  UNIT_PROPERTIES,
  type EffectiveTerrainType,
} from './types';

// ============================================================================
// Effective Terrain Calculation
// ============================================================================

/**
 * Get the effective terrain type (land or sea) based on base terrain and current tide.
 *
 * Tide Effects:
 * - Sea: Always sea
 * - Land: Always land
 * - Mountain: Always land (elevated)
 * - Marsh: Land at Low/Normal, Sea at High
 * - Reef: Land at Low, Sea at Normal/High
 */
export function getEffectiveTerrain(
  terrain: TerrainType,
  tide: TideLevel
): EffectiveTerrainType {
  switch (terrain) {
    case TerrainType.Sea:
      return 'sea';

    case TerrainType.Land:
    case TerrainType.Mountain:
      return 'land';

    case TerrainType.Marsh:
      return tide === TideLevel.High ? 'sea' : 'land';

    case TerrainType.Reef:
      return tide === TideLevel.Low ? 'land' : 'sea';

    default:
      return 'land';
  }
}

// ============================================================================
// Movement Validation
// ============================================================================

/**
 * Check if a unit type can enter a terrain type at the current tide.
 * This checks basic domain compatibility - land units on land, sea units on sea.
 * Does not check for stuck/grounded status of units already on the hex.
 */
export function canUnitEnterTerrain(
  unitType: UnitType,
  terrain: TerrainType,
  tide: TideLevel
): boolean {
  const props = UNIT_PROPERTIES[unitType];

  // Fixed and inert units cannot move normally
  if (props.domain === 'fixed' || props.domain === 'none') {
    return false;
  }

  // Check mountain restriction for SuperTank
  if (terrain === TerrainType.Mountain && !props.canEnterMountain) {
    return false;
  }

  const effectiveTerrain = getEffectiveTerrain(terrain, tide);

  // Land units can only enter effective land terrain
  if (props.domain === 'land') {
    return effectiveTerrain === 'land';
  }

  // Sea units can only enter effective sea terrain
  if (props.domain === 'sea') {
    return effectiveTerrain === 'sea';
  }

  return false;
}

// ============================================================================
// Stuck/Grounded Detection
// ============================================================================

/**
 * Check if a land unit is stuck on terrain that has become sea due to tide.
 * "Stuck" applies to land units that cannot move because tide has risen.
 */
export function isUnitStuck(
  unitType: UnitType,
  terrain: TerrainType,
  tide: TideLevel
): boolean {
  const props = UNIT_PROPERTIES[unitType];

  // Only land units can be stuck
  if (props.domain !== 'land') {
    return false;
  }

  // Land units are stuck when on terrain that is now sea
  const effectiveTerrain = getEffectiveTerrain(terrain, tide);
  return effectiveTerrain === 'sea';
}

/**
 * Check if a sea unit is grounded on terrain that has become land due to tide.
 * "Grounded" applies to sea units that cannot move because tide has fallen.
 */
export function isUnitGrounded(
  unitType: UnitType,
  terrain: TerrainType,
  tide: TideLevel
): boolean {
  const props = UNIT_PROPERTIES[unitType];

  // Only sea units can be grounded
  if (props.domain !== 'sea') {
    return false;
  }

  // Sea units are grounded when on terrain that is now land
  const effectiveTerrain = getEffectiveTerrain(terrain, tide);
  return effectiveTerrain === 'land';
}

// ============================================================================
// Movement Effect Type
// ============================================================================

export type TerrainMovementEffect = 'normal' | 'stuck' | 'grounded' | 'blocked';

/**
 * Get the movement effect for a unit on a specific terrain at current tide.
 *
 * Returns:
 * - 'normal': Unit can move freely
 * - 'stuck': Land unit on flooded terrain (cannot move until tide falls)
 * - 'grounded': Sea unit on exposed terrain (cannot move until tide rises)
 * - 'blocked': Unit cannot enter this terrain type at all
 */
export function getTerrainMovementEffect(
  unitType: UnitType,
  terrain: TerrainType,
  tide: TideLevel
): TerrainMovementEffect {
  const props = UNIT_PROPERTIES[unitType];

  // Fixed units are always blocked from normal movement
  if (props.domain === 'fixed' || props.domain === 'none') {
    return 'blocked';
  }

  const effectiveTerrain = getEffectiveTerrain(terrain, tide);

  // Check mountain restriction
  if (terrain === TerrainType.Mountain && !props.canEnterMountain) {
    return 'blocked';
  }

  // Land units
  if (props.domain === 'land') {
    if (effectiveTerrain === 'land') {
      return 'normal';
    }
    // Land unit on terrain that is now sea
    // Check if this is variable terrain (marsh/reef) or permanent sea
    if (terrain === TerrainType.Sea) {
      return 'blocked';
    }
    return 'stuck';
  }

  // Sea units
  if (props.domain === 'sea') {
    if (effectiveTerrain === 'sea') {
      return 'normal';
    }
    // Sea unit on terrain that is now land
    // Check if this is variable terrain or permanent land
    if (terrain === TerrainType.Land || terrain === TerrainType.Mountain) {
      return 'blocked';
    }
    return 'grounded';
  }

  return 'blocked';
}

// ============================================================================
// Mineral Collection
// ============================================================================

/**
 * Check if minerals can be collected from a terrain at the current tide.
 *
 * Per rules:
 * - Plain (Land): Always collectible
 * - Marsh: Collectible at Low and Normal tide (not High - flooded)
 * - Reef: Collectible at Low tide only (flooded at Normal/High)
 * - Sea: Never has minerals
 * - Mountain: Never has minerals (minerals only on plain, marsh, reef)
 */
export function canCollectMineral(terrain: TerrainType, tide: TideLevel): boolean {
  switch (terrain) {
    case TerrainType.Land:
      return true;

    case TerrainType.Marsh:
      return tide !== TideLevel.High;

    case TerrainType.Reef:
      return tide === TideLevel.Low;

    case TerrainType.Sea:
    case TerrainType.Mountain:
      return false;

    default:
      return false;
  }
}

// ============================================================================
// Astronef Landing Rules
// ============================================================================

/**
 * Check if terrain is valid for Astronef landing.
 * Astronef can only land on plain and marsh terrain.
 */
export function canAstronefLandOn(terrain: TerrainType): boolean {
  return terrain === TerrainType.Land || terrain === TerrainType.Marsh;
}

/**
 * Check if an Astronef is affected by tides.
 * Per rules: Astronef is immune to tides on marsh.
 */
export function isAstronefAffectedByTide(): boolean {
  // Astronef is explicitly immune to tides
  return false;
}

// ============================================================================
// Bridge Rules
// ============================================================================

/**
 * Check if a bridge can be placed on terrain.
 * Bridges are placed on sea hexes to create land passage.
 */
export function canPlaceBridge(terrain: TerrainType, tide: TideLevel): boolean {
  const effectiveTerrain = getEffectiveTerrain(terrain, tide);
  return effectiveTerrain === 'sea';
}

/**
 * Check if terrain with a bridge is still valid.
 * Bridges are destroyed if connecting land/bridge is submerged.
 */
export function isBridgeValid(
  baseTerrain: TerrainType,
  tide: TideLevel,
  hasConnectingLandOrBridge: boolean
): boolean {
  // Bridge must connect to land or another bridge
  if (!hasConnectingLandOrBridge) {
    return false;
  }

  // Bridge survives as long as base terrain is sea (or becomes sea)
  // and its connection remains valid
  return true;
}
