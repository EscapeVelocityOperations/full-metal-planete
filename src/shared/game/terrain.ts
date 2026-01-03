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
 * Check if a unit can voluntarily neutralize (enter impassable terrain and become stuck/grounded).
 *
 * Per rules Section 3.4:
 * "A unit may voluntarily enter impassable terrain and become stuck/grounded on the first impassable hex."
 *
 * This is a strategic option that allows units to sacrifice mobility for positioning.
 *
 * Returns true when:
 * - Land unit enters variable terrain (marsh/reef) that is currently sea → becomes stuck
 * - Sea unit enters variable terrain (marsh/reef) that is currently land → becomes grounded
 *
 * Returns false when:
 * - Terrain is permanently impassable (land unit on permanent sea, sea unit on permanent land/mountain)
 * - SuperTank trying to enter mountain
 * - Fixed/inert units
 */
export function canVoluntarilyNeutralize(
  unitType: UnitType,
  terrain: TerrainType,
  tide: TideLevel
): boolean {
  const effect = getTerrainMovementEffect(unitType, terrain, tide);
  // Can only voluntarily neutralize when result would be stuck or grounded
  // (not blocked, which means terrain is permanently impassable)
  return effect === 'stuck' || effect === 'grounded';
}

/**
 * Get the neutralization result for a voluntary neutralization move.
 * Returns 'stuck' for land units, 'grounded' for sea units, or null if not applicable.
 */
export function getVoluntaryNeutralizationResult(
  unitType: UnitType,
  terrain: TerrainType,
  tide: TideLevel
): 'stuck' | 'grounded' | null {
  const effect = getTerrainMovementEffect(unitType, terrain, tide);
  if (effect === 'stuck' || effect === 'grounded') {
    return effect;
  }
  return null;
}

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
// Bridge Rules (Section 9)
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
 *
 * Per rules Section 9.3:
 * - Bridge is destroyed if connecting bridge hex is destroyed
 * - Bridge is destroyed if connecting land hex is submerged by tide
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

  // Bridge survives as long as its connection remains valid
  return true;
}

/**
 * Check if a unit can enter a hex that has a bridge.
 *
 * Per rules Section 9.2:
 * - Bridge makes hex count as land (any player can use)
 * - Bridges block Barges and Motor Boats (sea units cannot enter)
 */
export function canUnitEnterBridgedHex(unitType: UnitType): boolean {
  const props = UNIT_PROPERTIES[unitType];

  // Fixed and inert units cannot move normally
  if (props.domain === 'fixed' || props.domain === 'none') {
    return false;
  }

  // Land units can enter bridged hexes (bridge creates land)
  if (props.domain === 'land') {
    return true;
  }

  // Sea units (Barges, Motor Boats) cannot enter bridged hexes
  // Per rules: "Blocks Barges and Motor Boats"
  if (props.domain === 'sea') {
    return false;
  }

  return false;
}

/**
 * Get effective terrain considering bridge presence.
 * When a bridge is present, sea hexes become land.
 */
export function getEffectiveTerrainWithBridge(
  terrain: TerrainType,
  tide: TideLevel,
  hasBridge: boolean
): EffectiveTerrainType {
  // Bridge makes the hex count as land
  if (hasBridge) {
    return 'land';
  }
  return getEffectiveTerrain(terrain, tide);
}

/**
 * Check if a hex is adjacent to land or another bridge.
 * Used for bridge placement validation.
 */
export function isAdjacentToLandOrBridge(
  neighbors: Array<{ terrain: TerrainType; hasBridge: boolean }>,
  tide: TideLevel
): boolean {
  return neighbors.some((neighbor) => {
    // If neighbor has a bridge, it counts as land
    if (neighbor.hasBridge) {
      return true;
    }
    // Check if neighbor terrain is land at current tide
    const effectiveTerrain = getEffectiveTerrain(neighbor.terrain, tide);
    return effectiveTerrain === 'land';
  });
}
