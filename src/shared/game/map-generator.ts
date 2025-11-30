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
  width: 23,
  height: 37,
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
 * Generate a map with terrain types
 */
export function generateMap(config: Partial<MapConfig> = {}, seed?: number): HexTerrain[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = new SeededRandom(seed);
  const terrain: HexTerrain[] = [];

  // Calculate center of the map
  const centerQ = Math.floor(cfg.width / 2);
  const centerR = Math.floor(cfg.height / 2);

  // Maximum distance from center (for island shape)
  const maxRadius = Math.min(cfg.width, cfg.height) / 2;

  for (let r = 0; r < cfg.height; r++) {
    for (let q = 0; q < cfg.width; q++) {
      const coord: HexCoord = { q, r };

      // Calculate distance from center (using axial distance approximation)
      const dq = q - centerQ;
      const dr = r - centerR;
      const distance = Math.sqrt(dq * dq + dr * dr + dq * dr);

      // Normalize distance
      const normalizedDistance = distance / maxRadius;

      // Determine terrain type
      let type: TerrainType;

      // Outer ring is always sea
      if (normalizedDistance > 0.85) {
        type = TerrainType.Sea;
      }
      // Transition zone - mostly sea with some reef
      else if (normalizedDistance > 0.70) {
        const rand = rng.next();
        if (rand < 0.3) {
          type = TerrainType.Reef;
        } else {
          type = TerrainType.Sea;
        }
      }
      // Coastal zone - mix of terrain
      else if (normalizedDistance > 0.50) {
        const rand = rng.next();
        if (rand < 0.15) {
          type = TerrainType.Sea;
        } else if (rand < 0.30) {
          type = TerrainType.Reef;
        } else if (rand < 0.50) {
          type = TerrainType.Marsh;
        } else {
          type = TerrainType.Land;
        }
      }
      // Interior - mostly land with some variation
      else {
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
 */
export function generateDemoMap(): HexTerrain[] {
  return generateMap({ width: 23, height: 37 }, 12345);
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
