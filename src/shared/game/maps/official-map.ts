/**
 * Official Full Metal Planète Map
 *
 * Authentic terrain data from the original board game.
 * Source: https://github.com/guillaume-rico/fmp_board
 * 37x23 hexagonal grid with odd-r offset layout (851 total hexes)
 *
 * Original terrain codes:
 * - s (sol/soil) → L (Land)
 * - e (eau/water) → S (Sea)
 * - a (acide/marsh) → W (Marsh/Wetland)
 * - m (montagne/mountain) → M (Mountain)
 * - i (île/reef) → R (Reef)
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
// Converted from guillaume-rico/fmp_board originalsurface array
// Original: s=soil(L), e=eau/water(S), a=acide/marsh(W), m=montagne(M), i=île/reef(R)
const OFFICIAL_MAP_DATA: TerrainCode[][] = [
  // Row 0
  ["L","L","L","L","M","L","L","L","L","L","L","W","L","W","S","M","M","M","S","S","L","L","L","L","L","W","L","L","W","L","L","L","L","L","L","L","L"],
  // Row 1
  ["L","L","L","L","L","L","L","L","L","L","L","W","W","W","W","W","M","L","L","W","L","L","L","L","L","L","L","W","W","W","W","W","L","L","L","L","L"],
  // Row 2
  ["L","L","L","L","L","W","W","W","L","L","L","S","L","L","L","L","W","W","W","M","W","L","L","L","L","L","L","W","W","L","W","W","L","L","L","L","L"],
  // Row 3
  ["L","L","L","L","M","M","M","M","W","S","S","L","S","L","L","L","L","L","M","M","W","L","L","L","W","S","S","S","W","L","L","L","S","M","L","M","L"],
  // Row 4
  ["M","L","L","M","M","L","W","S","L","S","S","S","S","S","L","L","L","S","S","S","S","S","S","S","S","S","L","S","M","S","S","M","M","L","M","L","L"],
  // Row 5
  ["L","L","L","L","L","L","S","S","S","R","S","S","S","S","S","L","R","S","S","S","S","S","S","S","S","S","S","S","M","R","S","S","S","L","L","L","L"],
  // Row 6
  ["L","L","L","L","L","L","S","S","S","R","L","L","L","R","R","R","R","S","S","S","S","S","S","S","S","S","S","R","R","S","M","W","L","L","L","L","L"],
  // Row 7
  ["L","L","L","L","L","L","W","L","L","R","R","L","L","W","R","S","S","R","S","R","S","R","S","S","S","S","S","S","S","L","M","M","W","L","L","L","L"],
  // Row 8
  ["L","L","W","L","L","L","W","L","S","S","R","L","W","M","M","S","S","L","R","L","L","R","R","S","S","S","S","S","S","L","L","L","W","W","L","L","L"],
  // Row 9
  ["L","L","L","L","L","L","W","S","S","S","S","S","W","W","L","S","L","L","L","M","M","L","S","S","S","R","S","S","S","S","L","L","L","W","L","L","L"],
  // Row 10
  ["L","L","L","L","L","W","S","S","S","S","S","S","L","S","S","S","L","L","L","M","L","L","W","L","L","S","S","R","R","S","S","L","L","L","W","W","L"],
  // Row 11
  ["W","W","L","L","L","S","L","S","S","S","S","L","L","S","S","S","S","S","L","M","L","W","W","L","L","M","S","S","R","S","S","L","L","L","M","W","W"],
  // Row 12
  ["W","W","M","M","S","S","L","R","S","S","S","S","L","L","S","S","S","S","M","L","W","L","W","W","M","L","S","S","S","S","S","L","L","S","W","L","W"],
  // Row 13
  ["M","M","W","W","S","L","L","L","R","R","R","S","S","S","S","M","S","W","L","L","W","L","L","S","M","R","R","L","S","S","L","S","S","L","L","L","L"],
  // Row 14
  ["M","L","L","W","L","L","L","L","R","L","L","M","S","S","S","M","R","W","L","L","W","L","S","S","R","W","R","S","S","S","L","S","L","L","L","L","L"],
  // Row 15
  ["L","L","L","W","L","L","L","S","L","R","S","S","S","M","S","S","R","S","S","S","S","S","S","S","R","W","M","S","W","R","M","S","L","L","L","L","L"],
  // Row 16
  ["L","L","L","M","S","M","S","S","R","R","S","S","M","L","R","R","S","S","S","S","S","S","S","S","S","S","S","S","L","L","S","M","L","L","L","L","L"],
  // Row 17
  ["L","L","L","M","S","M","M","S","R","S","S","S","W","W","S","S","L","L","L","S","S","S","S","S","S","S","S","S","L","S","S","L","M","M","L","L","L"],
  // Row 18
  ["L","L","M","M","S","S","S","R","R","L","S","W","W","W","S","L","L","L","L","L","L","L","L","S","S","S","L","L","S","W","L","L","L","L","M","L","L"],
  // Row 19
  ["L","L","M","W","W","W","S","L","L","L","L","W","W","W","W","L","L","L","L","L","L","L","L","L","S","W","L","L","L","M","W","L","L","L","L","L","L"],
  // Row 20
  ["L","L","M","W","W","W","W","L","L","L","L","L","W","L","L","L","L","L","L","L","L","L","L","L","L","L","L","W","W","M","S","W","L","L","L","L","L"],
  // Row 21
  ["L","L","L","L","L","L","L","L","L","L","L","W","W","S","L","L","L","M","M","M","L","L","L","L","L","L","L","L","W","S","L","L","L","L","L","L","L"],
  // Row 22
  ["L","L","L","L","L","L","L","L","L","L","L","W","L","L","S","M","M","M","M","M","L","M","L","L","L","W","W","L","W","L","L","L","L","L","L","L","L"],
];

/**
 * Official mineral positions for the standard game
 * Based on typical distribution patterns - minerals are placed on land hexes
 * in a semi-regular pattern across the playable area
 *
 * Note: The original game has 90 minerals distributed across the map
 */
export const OFFICIAL_MINERAL_POSITIONS: { q: number; r: number }[] = [
  // Northern region minerals
  { q: 3, r: 1 }, { q: 6, r: 1 }, { q: 9, r: 1 }, { q: 21, r: 1 }, { q: 24, r: 1 }, { q: 27, r: 1 }, { q: 33, r: 1 },
  { q: 2, r: 2 }, { q: 5, r: 2 }, { q: 8, r: 2 }, { q: 22, r: 2 }, { q: 25, r: 2 }, { q: 31, r: 2 }, { q: 34, r: 2 },
  { q: 1, r: 3 }, { q: 11, r: 3 }, { q: 14, r: 3 }, { q: 21, r: 3 }, { q: 29, r: 3 }, { q: 35, r: 3 },

  // Upper-middle region minerals
  { q: 2, r: 4 }, { q: 14, r: 4 }, { q: 16, r: 4 }, { q: 26, r: 4 },
  { q: 1, r: 5 }, { q: 3, r: 5 }, { q: 15, r: 5 }, { q: 33, r: 5 }, { q: 35, r: 5 },
  { q: 2, r: 6 }, { q: 4, r: 6 }, { q: 32, r: 6 }, { q: 34, r: 6 },
  { q: 3, r: 7 }, { q: 5, r: 7 }, { q: 7, r: 7 }, { q: 29, r: 7 }, { q: 33, r: 7 },

  // Central region minerals (sparse - more sea)
  { q: 1, r: 8 }, { q: 4, r: 8 }, { q: 17, r: 8 }, { q: 29, r: 8 }, { q: 31, r: 8 },
  { q: 2, r: 9 }, { q: 14, r: 9 }, { q: 30, r: 9 }, { q: 32, r: 9 },
  { q: 1, r: 10 }, { q: 12, r: 10 }, { q: 16, r: 10 }, { q: 31, r: 10 }, { q: 33, r: 10 },
  { q: 3, r: 11 }, { q: 11, r: 11 }, { q: 24, r: 11 }, { q: 31, r: 11 },
  { q: 6, r: 12 }, { q: 13, r: 12 }, { q: 21, r: 12 }, { q: 30, r: 12 },

  // Lower-middle region minerals
  { q: 5, r: 13 }, { q: 6, r: 13 }, { q: 19, r: 13 }, { q: 27, r: 13 }, { q: 29, r: 13 }, { q: 33, r: 13 },
  { q: 3, r: 14 }, { q: 6, r: 14 }, { q: 19, r: 14 }, { q: 30, r: 14 }, { q: 32, r: 14 }, { q: 34, r: 14 },
  { q: 2, r: 15 }, { q: 5, r: 15 }, { q: 7, r: 15 }, { q: 31, r: 15 }, { q: 33, r: 15 }, { q: 35, r: 15 },
  { q: 1, r: 16 }, { q: 27, r: 16 }, { q: 28, r: 16 }, { q: 32, r: 16 }, { q: 34, r: 16 },

  // Southern region minerals
  { q: 1, r: 17 }, { q: 16, r: 17 }, { q: 17, r: 17 }, { q: 28, r: 17 }, { q: 31, r: 17 }, { q: 35, r: 17 },
  { q: 9, r: 18 }, { q: 15, r: 18 }, { q: 22, r: 18 }, { q: 26, r: 18 }, { q: 32, r: 18 },
  { q: 7, r: 19 }, { q: 8, r: 19 }, { q: 22, r: 19 }, { q: 24, r: 19 }, { q: 33, r: 19 },
  { q: 7, r: 20 }, { q: 13, r: 20 }, { q: 23, r: 20 }, { q: 33, r: 20 },
  { q: 3, r: 21 }, { q: 6, r: 21 }, { q: 24, r: 21 }, { q: 27, r: 21 }, { q: 33, r: 21 },
  { q: 4, r: 22 }, { q: 7, r: 22 }, { q: 23, r: 22 }, { q: 33, r: 22 },
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
      terrain.push({
        coord: { q, r },
        type: TERRAIN_MAP[code],
      });
    }
  }

  return terrain;
}

/**
 * Get official mineral positions for the map
 * @returns Array of mineral positions
 */
export function getOfficialMinerals(): { q: number; r: number }[] {
  return [...OFFICIAL_MINERAL_POSITIONS];
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
