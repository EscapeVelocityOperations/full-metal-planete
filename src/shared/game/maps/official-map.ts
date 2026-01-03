/**
 * Official Full Metal Planète Map
 *
 * Recreated from the original board game map (docs/offical.jpg)
 * 37x23 hexagonal grid with odd-r offset layout (851 total hexes)
 *
 * Legend from original:
 * - Cases montagne (Mountain) = orange hexes
 * - Cases mer (Sea) = black hexes
 * - Cases marécages (Marsh) = white hexes with small dot
 * - Cases récifs (Reef) = white hexes with filled dot
 * - Cases plaines (Land) = white/empty hexes
 */

import { TerrainType, type HexTerrain } from "../types";

// Compact terrain encoding for readability:
// S = Sea, L = Land, M = Mountain, W = Marsh (Wetland), R = Reef
type TerrainCode = "S" | "L" | "M" | "W" | "R";

const TERRAIN_MAP: Record<TerrainCode, TerrainType> = {
  S: TerrainType.Sea,
  L: TerrainType.Land,
  M: TerrainType.Mountain,
  W: TerrainType.Marsh,
  R: TerrainType.Reef,
};

// Map data encoded row by row (r=0 to r=22), each row has 37 columns (q=0 to q=36)
// Carefully mapped from docs/offical.jpg
// The map shows an island with central landmass surrounded by sea
const OFFICIAL_MAP_DATA: TerrainCode[][] = [
  // Legend:
  // 'S' = Sea (Mer) - Black
  // 'L' = Plains (Plaine) - White
  // 'M' = Mountain (Montagne) - Orange
  // 'W' = Swamp (Marécage) - White with dot
  // 'R' = Reef (Récif) - Black with dot

  [
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 1
  [
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 2
  [
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 3
  [
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 4
  [
    "M",
    "M",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "W",
    "W",
    "S",
    "S",
    "R",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "R",
    "S",
    "S",
    "W",
    "W",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 5
  [
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
  ],
  // Row 6
  [
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "R",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "M",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "R",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "M",
  ],
  // Row 7
  [
    "L",
    "L",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
  ],
  // Row 8
  [
    "L",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 9
  [
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "R",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "R",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 10
  [
    "L",
    "M",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "M",
    "L",
    "L",
  ],
  // Row 11
  [
    "M",
    "M",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "S",
    "S",
    "S",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "M",
    "L",
    "L",
  ],
  // Row 12
  [
    "M",
    "L",
    "S",
    "S",
    "R",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "M",
    "M",
    "M",
    "M",
    "L",
    "S",
    "S",
    "S",
    "L",
    "M",
    "M",
    "M",
    "M",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "R",
    "S",
    "L",
    "M",
    "L",
  ],
  // Row 13
  [
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "S",
    "S",
    "S",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
  ],
  // Row 14
  [
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
  ],
  // Row 15
  [
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "R",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "R",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "R",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 16
  [
    "M",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "M",
    "L",
  ],
  // Row 17
  [
    "M",
    "M",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "L",
    "L",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
  ],
  // Row 18
  [
    "M",
    "M",
    "M",
    "L",
    "L",
    "L",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
  ],
  // Row 19
  [
    "L",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "W",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "R",
    "S",
    "S",
    "S",
    "R",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "W",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 20
  [
    "L",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "L",
    "L",
    "W",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "W",
    "L",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 21
  [
    "L",
    "L",
    "L",
    "M",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "W",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "W",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "M",
    "L",
    "L",
    "L",
    "L",
  ],
  // Row 22
  [
    "L",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "W",
    "W",
    "S",
    "S",
    "S",
    "S",
    "S",
    "W",
    "W",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "M",
    "L",
    "L",
    "L",
    "L",
  ],
];

/**
 * Generate the official Full Metal Planète map
 * @returns Array of HexTerrain for all 851 hexes
 */
export function generateOfficialMap(): HexTerrain[] {
  const terrain: HexTerrain[] = [];

  for (let r = 0; r < OFFICIAL_MAP_DATA.length; r++) {
    const row = OFFICIAL_MAP_DATA[r];
    for (let q = 0; q < row.length; q++) {
      const code = row[q];
      const terrainType = TERRAIN_MAP[code];
      const hex: HexTerrain = {
        coord: { q, r },
        type: terrainType,
      };

      // Calculate and assign landing zone for valid landing terrain
      const zone = calculateLandingZone(q, r, terrainType);
      if (zone !== undefined) {
        hex.landingZone = zone;
      }

      terrain.push(hex);
    }
  }

  return terrain;
}

/**
 * Get map dimensions
 */
export const OFFICIAL_MAP_DIMENSIONS = {
  width: 37,
  height: 23,
  totalHexes: 851,
};

/**
 * Validate official map data integrity
 */
export function validateOfficialMap(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check row count
  if (OFFICIAL_MAP_DATA.length !== 23) {
    errors.push(`Expected 23 rows, got ${OFFICIAL_MAP_DATA.length}`);
  }

  // Check column count for each row
  OFFICIAL_MAP_DATA.forEach((row, r) => {
    if (row.length !== 37) {
      errors.push(`Row ${r}: expected 37 columns, got ${row.length}`);
    }
  });

  // Count terrain types
  const counts: Record<TerrainCode, number> = { S: 0, L: 0, M: 0, W: 0, R: 0 };
  OFFICIAL_MAP_DATA.forEach((row) => {
    row.forEach((code) => {
      counts[code]++;
    });
  });

  // Verify total hexes
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== 851) {
    errors.push(`Expected 851 total hexes, got ${total}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get terrain statistics for the official map
 */
export function getOfficialMapStats(): Record<string, number> {
  const counts: Record<string, number> = {
    sea: 0,
    land: 0,
    mountain: 0,
    marsh: 0,
    reef: 0,
  };

  const codeToName: Record<TerrainCode, string> = {
    S: "sea",
    L: "land",
    M: "mountain",
    W: "marsh",
    R: "reef",
  };

  OFFICIAL_MAP_DATA.forEach((row) => {
    row.forEach((code) => {
      counts[codeToName[code]]++;
    });
  });

  return counts;
}

// ============================================================================
// Landing Zone System
// ============================================================================

/**
 * Total number of landing zones on the map.
 * The board is divided into 8 zones arranged clockwise around the landmass.
 */
export const TOTAL_LANDING_ZONES = 8;

/**
 * Map center point (approximately center of the hex grid).
 * Used for calculating landing zone based on angular position.
 */
const MAP_CENTER = { q: 18, r: 11 };

/**
 * Calculate which landing zone a hex belongs to based on its position.
 * Zones are numbered 1-8, arranged clockwise from the top.
 * Only land and marsh hexes can be landing zones (astronef landing terrain).
 *
 * @param q - Column coordinate
 * @param r - Row coordinate
 * @param terrainType - The terrain type at this hex
 * @returns Zone number (1-8) or undefined if not a valid landing zone
 */
export function calculateLandingZone(
  q: number,
  r: number,
  terrainType: TerrainType
): number | undefined {
  // Only land and marsh can be landing zones (astronef landing terrain)
  if (terrainType !== TerrainType.Land && terrainType !== TerrainType.Marsh) {
    return undefined;
  }

  // Calculate angle from center (in radians)
  // Note: For flat-top hexes, we need to convert axial to pixel-like coordinates
  // Hex to approximate pixel: x = q * 1.5, y = r * sqrt(3) + q * sqrt(3)/2
  const dx = q - MAP_CENTER.q;
  const dy = r - MAP_CENTER.r + dx * 0.5; // Approximate vertical offset

  // Calculate angle (0 = right, going counter-clockwise)
  let angle = Math.atan2(dy, dx);

  // Convert to clockwise from top (0 = top, increasing clockwise)
  // atan2 gives: 0 = right, π/2 = down, π = left, -π/2 = up
  // We want: 0 = up, π/2 = right, π = down, 3π/2 = left
  angle = -angle + Math.PI / 2;

  // Normalize to 0..2π
  if (angle < 0) {
    angle += 2 * Math.PI;
  }

  // Divide into 8 zones (each zone is 45 degrees = π/4 radians)
  const zoneIndex = Math.floor(angle / (Math.PI / 4));

  // Return zone number (1-8)
  return (zoneIndex % TOTAL_LANDING_ZONES) + 1;
}

/**
 * Calculate the distance between two landing zones.
 * Since zones are arranged in a circle, distance is the minimum of
 * clockwise and counter-clockwise paths.
 *
 * @param zone1 - First zone number (1-8)
 * @param zone2 - Second zone number (1-8)
 * @returns Distance between zones (0-4)
 */
export function getZoneDistance(zone1: number, zone2: number): number {
  const diff = Math.abs(zone1 - zone2);
  // Take minimum of direct distance and wrap-around distance
  return Math.min(diff, TOTAL_LANDING_ZONES - diff);
}

/**
 * Check if a landing position is valid considering existing astronef positions.
 * Rules per Section 12:
 * - Player 1 can choose any zone
 * - Subsequent players must land at least 2 zones away from existing astronefs
 *
 * @param targetZone - The zone where the player wants to land
 * @param existingZones - Array of zones where other astronefs have already landed
 * @returns True if landing is allowed
 */
export function isLandingZoneValid(
  targetZone: number,
  existingZones: number[]
): boolean {
  // If no existing astronefs, any zone is valid
  if (existingZones.length === 0) {
    return true;
  }

  // Check distance from all existing astronef zones
  for (const existingZone of existingZones) {
    const distance = getZoneDistance(targetZone, existingZone);
    // Must be at least 2 zones away
    if (distance < 2) {
      return false;
    }
  }

  return true;
}

/**
 * Get all hexes that belong to a specific landing zone.
 * Useful for visualization and validation.
 *
 * @param terrain - The map terrain array
 * @param zone - Zone number (1-8)
 * @returns Array of hex coordinates in the zone
 */
export function getZoneHexes(
  terrain: HexTerrain[],
  zone: number
): { q: number; r: number }[] {
  return terrain
    .filter((t) => t.landingZone === zone)
    .map((t) => t.coord);
}

/**
 * Get landing zone boundaries for visualization.
 * Returns hexes that are on the edge of their zone (adjacent to a different zone).
 *
 * @param terrain - The map terrain array
 * @returns Array of boundary hexes with their zone number
 */
export function getZoneBoundaryHexes(
  terrain: HexTerrain[]
): Array<{ coord: { q: number; r: number }; zone: number }> {
  const terrainMap = new Map<string, HexTerrain>();
  for (const t of terrain) {
    terrainMap.set(`${t.coord.q},${t.coord.r}`, t);
  }

  const boundaries: Array<{ coord: { q: number; r: number }; zone: number }> = [];

  // Direction offsets for flat-top hexes
  const directions = [
    { q: 1, r: 0 },   // E
    { q: 1, r: -1 },  // NE
    { q: 0, r: -1 },  // NW
    { q: -1, r: 0 },  // W
    { q: -1, r: 1 },  // SW
    { q: 0, r: 1 },   // SE
  ];

  for (const hex of terrain) {
    if (!hex.landingZone) continue;

    // Check if any neighbor is in a different zone
    let isBoundary = false;
    for (const dir of directions) {
      const neighborKey = `${hex.coord.q + dir.q},${hex.coord.r + dir.r}`;
      const neighbor = terrainMap.get(neighborKey);

      // Boundary if neighbor is in different zone or not a landing zone
      if (!neighbor?.landingZone || neighbor.landingZone !== hex.landingZone) {
        isBoundary = true;
        break;
      }
    }

    if (isBoundary) {
      boundaries.push({ coord: hex.coord, zone: hex.landingZone });
    }
  }

  return boundaries;
}
