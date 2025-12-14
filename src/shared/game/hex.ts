/**
 * Full Metal Planete - Hex Coordinate System
 *
 * Implements axial/cube coordinate conversions, distance calculations,
 * neighbor finding, and range utilities for flat-top hexagonal grids.
 */

import { TideLevel, type HexCoord, type CubeCoord, type UnitType, type TerrainType } from './types';
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
// Pathfinding
// ============================================================================

/**
 * Type for terrain getter function used in pathfinding.
 */
export type PathTerrainGetter = (coord: HexCoord) => TerrainType;

/**
 * Find the shortest valid path between two hexes for a unit type.
 * Uses A* algorithm with terrain and obstacle validation.
 *
 * @param start - Starting hex coordinate
 * @param end - Target hex coordinate
 * @param unitType - Type of unit moving
 * @param getTerrainAt - Function to get terrain at a coordinate
 * @param tide - Current tide level
 * @param occupiedHexes - Set of hex keys that are occupied
 * @returns Array of hex coordinates forming the path (including start and end), or null if no path exists
 */
export function findPath(
  start: HexCoord,
  end: HexCoord,
  unitType: UnitType,
  getTerrainAt: PathTerrainGetter,
  tide: TideLevel,
  occupiedHexes: Set<string>
): HexCoord[] | null {
  // Check if unit can move at all
  const moveCost = UNIT_PROPERTIES[unitType].movementCost;
  if (!isFinite(moveCost)) {
    return null;
  }

  // Check if destination is valid terrain
  if (!canUnitEnterTerrain(unitType, getTerrainAt(end), tide)) {
    return null;
  }

  // Check if destination is occupied
  if (occupiedHexes.has(hexKey(end))) {
    return null;
  }

  // A* algorithm
  const startKey = hexKey(start);
  const endKey = hexKey(end);

  if (startKey === endKey) {
    return [start];
  }

  const openSet = new Map<string, { hex: HexCoord; f: number; g: number }>();
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, string>();

  const heuristic = (a: HexCoord, b: HexCoord) => hexDistance(a, b);

  openSet.set(startKey, { hex: start, f: heuristic(start, end), g: 0 });

  while (openSet.size > 0) {
    // Find node with lowest f score
    let current: { hex: HexCoord; f: number; g: number } | null = null;
    let currentKey = '';
    for (const [key, node] of openSet) {
      if (!current || node.f < current.f) {
        current = node;
        currentKey = key;
      }
    }

    if (!current) break;

    // Check if we reached the goal
    if (currentKey === endKey) {
      // Reconstruct path
      const path: HexCoord[] = [current.hex];
      let pathKey = currentKey;
      while (cameFrom.has(pathKey)) {
        pathKey = cameFrom.get(pathKey)!;
        path.unshift(hexFromKey(pathKey));
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    // Check all neighbors
    for (const neighbor of hexNeighbors(current.hex)) {
      const neighborKey = hexKey(neighbor);

      // Skip if already evaluated
      if (closedSet.has(neighborKey)) continue;

      // Skip if occupied (except destination which is already validated)
      if (neighborKey !== endKey && occupiedHexes.has(neighborKey)) continue;

      // Skip if unit can't enter this terrain
      if (!canUnitEnterTerrain(unitType, getTerrainAt(neighbor), tide)) continue;

      const tentativeG = current.g + 1; // Each step costs 1 in terms of path length

      const existing = openSet.get(neighborKey);
      if (!existing || tentativeG < existing.g) {
        cameFrom.set(neighborKey, currentKey);
        const f = tentativeG + heuristic(neighbor, end);
        openSet.set(neighborKey, { hex: neighbor, f, g: tentativeG });
      }
    }
  }

  // No path found
  return null;
}

/**
 * Get all hexes reachable by a unit within a given AP budget.
 * Uses BFS to explore all valid paths.
 *
 * @param start - Starting hex coordinate
 * @param unitType - Type of unit moving
 * @param maxAP - Maximum action points available
 * @param getTerrainAt - Function to get terrain at a coordinate
 * @param tide - Current tide level
 * @param occupiedHexes - Set of hex keys that are occupied
 * @returns Map of reachable hex keys to their minimum AP cost
 */
export function getReachableHexes(
  start: HexCoord,
  unitType: UnitType,
  maxAP: number,
  getTerrainAt: PathTerrainGetter,
  tide: TideLevel,
  occupiedHexes: Set<string>
): Map<string, number> {
  const moveCost = UNIT_PROPERTIES[unitType].movementCost;
  if (!isFinite(moveCost)) {
    return new Map();
  }

  const maxSteps = Math.floor(maxAP / moveCost);
  if (maxSteps <= 0) {
    return new Map();
  }

  const reachable = new Map<string, number>();
  const startKey = hexKey(start);

  // BFS with cost tracking
  const queue: Array<{ hex: HexCoord; steps: number }> = [{ hex: start, steps: 0 }];
  const visited = new Map<string, number>(); // key -> min steps to reach
  visited.set(startKey, 0);

  while (queue.length > 0) {
    const { hex, steps } = queue.shift()!;
    const key = hexKey(hex);

    // Add to reachable if not the start position
    if (key !== startKey) {
      reachable.set(key, steps * moveCost);
    }

    // Check neighbors if we haven't exceeded max steps
    if (steps < maxSteps) {
      for (const neighbor of hexNeighbors(hex)) {
        const neighborKey = hexKey(neighbor);
        const neighborSteps = steps + 1;

        // Skip if we've found a shorter path already
        if (visited.has(neighborKey) && visited.get(neighborKey)! <= neighborSteps) {
          continue;
        }

        // Skip if occupied
        if (occupiedHexes.has(neighborKey)) continue;

        // Skip if unit can't enter this terrain
        if (!canUnitEnterTerrain(unitType, getTerrainAt(neighbor), tide)) continue;

        visited.set(neighborKey, neighborSteps);
        queue.push({ hex: neighbor, steps: neighborSteps });
      }
    }
  }

  return reachable;
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
 * Get the astronef pode (turret) hexes for a given astronef position and rotation.
 *
 * @param astronefPosition - The anchor position of the astronef
 * @param astronefRotation - The rotation of the astronef
 * @returns Array of hex coordinates for the 3 pode positions
 */
export function getAstronefPodeHexes(
  astronefPosition: HexCoord,
  astronefRotation: number
): HexCoord[] {
  const footprint = getUnitFootprint(UnitType.Astronef, astronefPosition, astronefRotation);
  // Pode positions are at indices 1, 2, 3 (index 0 is the center body)
  return footprint.slice(1);
}

/**
 * Check if a turret (Tower) can be placed at the given position.
 * Turrets must be placed on an astronef's pode hexes.
 *
 * @param position - The position to place the turret
 * @param ownerId - The owner ID of the turret being placed
 * @param units - All game units to find matching astronef
 * @returns True if the turret can be placed at this position
 */
export function isTurretPlacementValid(
  position: HexCoord,
  ownerId: string,
  units: Array<{ type: UnitType; position: HexCoord | null; rotation?: number; owner: string }>
): boolean {
  // Find the player's astronef
  const astronef = units.find(
    (u) => u.type === UnitType.Astronef && u.owner === ownerId && u.position !== null
  );

  if (!astronef || !astronef.position) {
    // No astronef placed yet - turrets cannot be placed
    return false;
  }

  // Get the pode hexes
  const podeHexes = getAstronefPodeHexes(astronef.position, astronef.rotation || 0);
  const posKey = hexKey(position);

  // Check if the target position is one of the pode hexes
  return podeHexes.some((podeHex) => hexKey(podeHex) === posKey);
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
