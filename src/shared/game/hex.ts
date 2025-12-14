/**
 * Full Metal Planete - Hex Coordinate System
 *
 * Implements axial/cube coordinate conversions, distance calculations,
 * neighbor finding, and range utilities for flat-top hexagonal grids.
 */

import type { HexCoord, CubeCoord, UnitType, TerrainType, TideLevel } from './types';
import { UNIT_SHAPES, UNIT_PROPERTIES } from './types';
import { canUnitEnterTerrain, canAstronefLandOn } from './terrain';

// ============================================================================
// Flat-Top Hex Directions
// ============================================================================

/**
 * Flat-top hex neighbor directions in axial coordinates.
 * Order: E, NE, NW, W, SW, SE (clockwise from East)
 */
export const FLAT_TOP_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 }, // E
  { q: 1, r: -1 }, // NE
  { q: 0, r: -1 }, // NW
  { q: -1, r: 0 }, // W
  { q: -1, r: 1 }, // SW
  { q: 0, r: 1 }, // SE
] as const;

// ============================================================================
// Coordinate Conversion
// ============================================================================

/**
 * Convert axial coordinates to cube coordinates.
 * Cube constraint: x + y + z = 0
 */
export function axialToCube(hex: HexCoord): CubeCoord {
  const x = hex.q;
  const z = hex.r;
  // Use (0 - x - z) || 0 to avoid -0
  const y = (-x - z) || 0;
  return { x, y: y, z };
}

/**
 * Convert cube coordinates to axial coordinates.
 */
export function cubeToAxial(cube: CubeCoord): HexCoord {
  return { q: cube.x, r: cube.z };
}

// ============================================================================
// Distance Calculation
// ============================================================================

/**
 * Calculate the distance between two hexes in hex steps.
 * Uses cube coordinate Manhattan distance formula.
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const aCube = axialToCube(a);
  const bCube = axialToCube(b);

  return Math.max(
    Math.abs(aCube.x - bCube.x),
    Math.abs(aCube.y - bCube.y),
    Math.abs(aCube.z - bCube.z)
  );
}

// ============================================================================
// Neighbor Finding
// ============================================================================

/**
 * Get all 6 neighbors of a hex (flat-top orientation).
 */
export function hexNeighbors(hex: HexCoord): HexCoord[] {
  return FLAT_TOP_DIRECTIONS.map((dir) => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  }));
}

// ============================================================================
// Range Finding
// ============================================================================

/**
 * Get all hexes within a given range (inclusive) of a center hex.
 * Returns hexes at distance 0 to range.
 *
 * Formula for count: 3*n*(n+1) + 1 for range n
 */
export function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];

  for (let q = -range; q <= range; q++) {
    const r1 = Math.max(-range, -q - range);
    const r2 = Math.min(range, -q + range);

    for (let r = r1; r <= r2; r++) {
      results.push({
        q: center.q + q,
        r: center.r + r,
      });
    }
  }

  return results;
}

/**
 * Get all hexes at exactly a given distance (ring) from a center hex.
 * Returns hexes at exactly the specified radius.
 *
 * Ring n has 6*n hexes (for n > 0), ring 0 has 1 hex (the center).
 */
export function hexesInRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) {
    return [center];
  }

  const results: HexCoord[] = [];

  // Start at the hex "radius" steps in direction 4 (SW: -1, +1)
  let hex: HexCoord = {
    q: center.q + FLAT_TOP_DIRECTIONS[4].q * radius,
    r: center.r + FLAT_TOP_DIRECTIONS[4].r * radius,
  };

  // Walk around the ring
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push({ ...hex });
      // Move in direction i
      hex = {
        q: hex.q + FLAT_TOP_DIRECTIONS[i].q,
        r: hex.r + FLAT_TOP_DIRECTIONS[i].r,
      };
    }
  }

  return results;
}

// ============================================================================
// Equality and Key Functions
// ============================================================================

/**
 * Check if two hexes are equal.
 */
export function hexEqual(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

/**
 * Create a string key for a hex coordinate (for use in Maps/Sets).
 */
export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

/**
 * Parse a hex key back to coordinates.
 */
export function hexFromKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

// ============================================================================
// Line Drawing
// ============================================================================

/**
 * Linearly interpolate between two numbers.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Round cube coordinates to nearest hex.
 */
function cubeRound(x: number, y: number, z: number): CubeCoord {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = (-ry - rz) || 0;
  } else if (yDiff > zDiff) {
    ry = (-rx - rz) || 0;
  } else {
    rz = (-rx - ry) || 0;
  }

  return { x: rx || 0, y: ry || 0, z: rz || 0 };
}

/**
 * Get all hexes on a line between two hexes (inclusive).
 */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const n = hexDistance(a, b);
  if (n === 0) {
    return [a];
  }

  const aCube = axialToCube(a);
  const bCube = axialToCube(b);
  const results: HexCoord[] = [];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cube = cubeRound(
      lerp(aCube.x, bCube.x, t),
      lerp(aCube.y, bCube.y, t),
      lerp(aCube.z, bCube.z, t)
    );
    results.push(cubeToAxial(cube));
  }

  return results;
}

// ============================================================================
// Rotation
// ============================================================================

/**
 * Rotate a hex coordinate 60 degrees clockwise around the origin.
 */
export function hexRotateClockwise(hex: HexCoord): HexCoord {
  const cube = axialToCube(hex);
  // Clockwise rotation in cube coords: (x, y, z) -> (-z, -x, -y)
  const rotated: CubeCoord = { x: (-cube.z) || 0, y: (-cube.x) || 0, z: (-cube.y) || 0 };
  return cubeToAxial(rotated);
}

/**
 * Rotate a hex coordinate 60 degrees counter-clockwise around the origin.
 */
export function hexRotateCounterClockwise(hex: HexCoord): HexCoord {
  const cube = axialToCube(hex);
  // Counter-clockwise rotation: (x, y, z) -> (-y, -z, -x)
  const rotated: CubeCoord = { x: (-cube.y) || 0, y: (-cube.z) || 0, z: (-cube.x) || 0 };
  return cubeToAxial(rotated);
}

/**
 * Rotate a hex coordinate around a center point by n * 60 degrees.
 * Positive n = clockwise, negative n = counter-clockwise.
 */
export function hexRotateAround(hex: HexCoord, center: HexCoord, steps: number): HexCoord {
  // Translate to origin
  let relative: HexCoord = {
    q: hex.q - center.q,
    r: hex.r - center.r,
  };

  // Normalize steps to 0-5
  const normalizedSteps = ((steps % 6) + 6) % 6;

  // Rotate
  for (let i = 0; i < normalizedSteps; i++) {
    relative = hexRotateClockwise(relative);
  }

  // Translate back
  return {
    q: relative.q + center.q,
    r: relative.r + center.r,
  };
}

// ============================================================================
// Multi-Hex Unit Footprint
// ============================================================================

/**
 * Get the actual hex coordinates occupied by a unit at a given position with rotation.
 * For single-hex units, returns just the position.
 * For multi-hex units, returns all hexes based on shape and rotation.
 *
 * @param unitType - Type of unit
 * @param anchor - The anchor/position hex of the unit
 * @param rotation - Rotation steps (0-5, each step is 60 degrees clockwise)
 * @returns Array of hex coordinates occupied by the unit
 */
export function getUnitFootprint(
  unitType: UnitType,
  anchor: HexCoord,
  rotation: number = 0
): HexCoord[] {
  const shape = UNIT_SHAPES[unitType];
  if (!shape) {
    return [anchor];
  }

  // Normalize rotation to 0-5
  const normalizedRotation = ((rotation % 6) + 6) % 6;

  return shape.offsets.map(offset => {
    // First rotate the offset around origin
    let rotatedOffset = offset;
    for (let i = 0; i < normalizedRotation; i++) {
      rotatedOffset = hexRotateClockwise(rotatedOffset);
    }

    // Then translate to anchor position
    return {
      q: anchor.q + rotatedOffset.q,
      r: anchor.r + rotatedOffset.r,
    };
  });
}

/**
 * Check if a unit placement is valid (no overlapping hexes with existing units).
 *
 * @param unitType - Type of unit being placed
 * @param anchor - The anchor/position hex for the unit
 * @param rotation - Rotation steps (0-5)
 * @param occupiedHexes - Set of hex keys that are already occupied
 * @returns True if placement is valid
 */
export function isPlacementValid(
  unitType: UnitType,
  anchor: HexCoord,
  rotation: number,
  occupiedHexes: Set<string>
): boolean {
  const footprint = getUnitFootprint(unitType, anchor, rotation);

  for (const hex of footprint) {
    const key = hexKey(hex);
    if (occupiedHexes.has(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a unit placement is valid including terrain validation.
 *
 * Validates:
 * - No overlapping hexes with existing units
 * - Unit domain matches terrain (land units on land, sea units on sea)
 * - Astronef only on plain/marsh
 *
 * @param unitType - Type of unit being placed
 * @param anchor - The anchor/position hex for the unit
 * @param rotation - Rotation steps (0-5)
 * @param occupiedHexes - Set of hex keys that are already occupied
 * @param getTerrainAt - Function to get terrain type at a hex
 * @param tide - Current tide level
 * @returns True if placement is valid
 */
export function isPlacementValidWithTerrain(
  unitType: UnitType,
  anchor: HexCoord,
  rotation: number,
  occupiedHexes: Set<string>,
  getTerrainAt: (coord: HexCoord) => TerrainType,
  tide: TideLevel
): boolean {
  const footprint = getUnitFootprint(unitType, anchor, rotation);
  const props = UNIT_PROPERTIES[unitType];

  for (const hex of footprint) {
    const key = hexKey(hex);

    // Check overlap with other units
    if (occupiedHexes.has(key)) {
      return false;
    }

    const terrain = getTerrainAt(hex);

    // Astronef has special landing rules
    if (unitType === 'astronef') {
      if (!canAstronefLandOn(terrain)) {
        return false;
      }
      continue;
    }

    // Fixed units (turret, bridge) and inert units (mineral) don't have domain movement
    if (props.domain === 'fixed' || props.domain === 'none') {
      // Turrets can only be placed on astronef hexes (handled separately)
      // Bridges can be placed on sea
      if (unitType === 'bridge') {
        // Bridge must be on sea terrain
        continue;
      }
      continue;
    }

    // Check terrain compatibility for mobile units
    if (!canUnitEnterTerrain(unitType, terrain, tide)) {
      return false;
    }
  }

  return true;
}

/**
 * Get all hexes occupied by all placed units.
 *
 * @param units - Array of units with position and rotation
 * @returns Set of hex keys that are occupied
 */
export function getOccupiedHexes(
  units: Array<{ type: UnitType; position: HexCoord | null; rotation?: number }>
): Set<string> {
  const occupied = new Set<string>();

  for (const unit of units) {
    if (!unit.position) continue;

    const footprint = getUnitFootprint(unit.type, unit.position, unit.rotation || 0);
    for (const hex of footprint) {
      occupied.add(hexKey(hex));
    }
  }

  return occupied;
}
