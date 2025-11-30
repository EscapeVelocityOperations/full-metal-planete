/**
 * Map Generator for Full Metal Planete
 *
 * Generates a hexagonal island map with terrain types.
 */

import { TerrainType, type HexTerrain, type HexCoord, TideLevel } from './types';

export interface MapConfig {
  width: number;
  height: number;
  seaRatio?: number;
  mountainRatio?: number;
  marshRatio?: number;
  reefRatio?: number;
}

const DEFAULT_CONFIG: MapConfig = {
  width: 27,   // Columns (q direction) - wider for 16:9/16:10 screens
  height: 11,  // Rows (r direction) - fewer rows for rectangular fit
  seaRatio: 0.30,
  mountainRatio: 0.08,
  marshRatio: 0.10,
  reefRatio: 0.08,
};

/**
 * Simple seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

/**
 * Generate a rectangular map with terrain types
 * Creates a full rectangular grid that fills the screen properly
 */
export function generateMap(config: Partial<MapConfig> = {}, seed?: number): HexTerrain[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = new SeededRandom(seed);
  const terrain: HexTerrain[] = [];

  // Calculate center of the map
  const centerQ = Math.floor(cfg.width / 2);
  const centerR = Math.floor(cfg.height / 2);

  // For rectangular maps, use elliptical distance based on map dimensions
  const maxRadiusQ = cfg.width / 2;
  const maxRadiusR = cfg.height / 2;

  for (let r = 0; r < cfg.height; r++) {
    for (let q = 0; q < cfg.width; q++) {
      const coord: HexCoord = { q, r };

      // Calculate normalized distance using elliptical formula
      const dq = (q - centerQ) / maxRadiusQ;
      const dr = (r - centerR) / maxRadiusR;
      // Adjust for hex grid offset (odd/even row offset in axial)
      const normalizedDistance = Math.sqrt(dq * dq + dr * dr);

      // Determine terrain type
      let type: TerrainType;

      // Border hexes are sea (within 1 hex of edge)
      const isEdge = q === 0 || q === cfg.width - 1 || r === 0 || r === cfg.height - 1;
      const isNearEdge = q === 1 || q === cfg.width - 2 || r === 1 || r === cfg.height - 2;

      if (isEdge) {
        type = TerrainType.Sea;
      } else if (isNearEdge) {
        // Near edge - mostly sea with some reef
        const rand = rng.next();
        if (rand < 0.4) {
          type = TerrainType.Reef;
        } else {
          type = TerrainType.Sea;
        }
      } else if (normalizedDistance > 0.75) {
        // Coastal zone - mix of terrain
        const rand = rng.next();
        if (rand < 0.20) {
          type = TerrainType.Sea;
        } else if (rand < 0.35) {
          type = TerrainType.Reef;
        } else if (rand < 0.55) {
          type = TerrainType.Marsh;
        } else {
          type = TerrainType.Land;
        }
      } else {
        // Interior - mostly land with some variation
        const rand = rng.next();
        if (rand < cfg.mountainRatio!) {
          type = TerrainType.Mountain;
        } else if (rand < cfg.mountainRatio! + cfg.marshRatio!) {
          type = TerrainType.Marsh;
        } else {
          type = TerrainType.Land;
        }
      }

      terrain.push({ coord, type });
    }
  }

  return terrain;
}

/**
 * Generate a simple demo map for testing
 * Uses 27x11 grid for better fit on widescreen displays (16:9, 16:10)
 */
export function generateDemoMap(): HexTerrain[] {
  return generateMap({ width: 27, height: 11 }, 12345);
}

/**
 * Create initial tide deck (5 of each tide level)
 */
export function createTideDeck(): TideLevel[] {
  const deck: TideLevel[] = [];

  for (let i = 0; i < 5; i++) {
    deck.push(TideLevel.Low);
    deck.push(TideLevel.Normal);
    deck.push(TideLevel.High);
  }

  // Shuffle the deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}
