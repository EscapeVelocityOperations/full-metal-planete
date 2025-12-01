import { describe, it, expect } from 'vitest';
import { generateMinerals, generateMap, generateDemoMap } from '../map-generator';
import { TerrainType, type HexTerrain } from '../types';

describe('Map Generator', () => {
  describe('generateMinerals', () => {
    const createTestTerrain = (): HexTerrain[] => [
      { coord: { q: 0, r: 0 }, type: TerrainType.Sea },
      { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      { coord: { q: 2, r: 0 }, type: TerrainType.Marsh },
      { coord: { q: 3, r: 0 }, type: TerrainType.Reef },
      { coord: { q: 4, r: 0 }, type: TerrainType.Mountain },
      { coord: { q: 0, r: 1 }, type: TerrainType.Land },
      { coord: { q: 1, r: 1 }, type: TerrainType.Land },
      { coord: { q: 2, r: 1 }, type: TerrainType.Marsh },
      { coord: { q: 3, r: 1 }, type: TerrainType.Reef },
      { coord: { q: 4, r: 1 }, type: TerrainType.Sea },
    ];

    it('should generate the requested number of minerals', () => {
      const terrain = createTestTerrain();
      const minerals = generateMinerals(terrain, 5, 12345);

      expect(minerals).toHaveLength(5);
    });

    it('should only place minerals on valid terrain (Land, Marsh, Reef)', () => {
      const terrain = createTestTerrain();
      const minerals = generateMinerals(terrain, 10, 12345);

      // Get the terrain types at mineral positions
      for (const mineral of minerals) {
        const hex = terrain.find(
          (t) => t.coord.q === mineral.position.q && t.coord.r === mineral.position.r
        );
        expect(hex).toBeDefined();
        expect([TerrainType.Land, TerrainType.Marsh, TerrainType.Reef]).toContain(hex!.type);
      }
    });

    it('should NOT place minerals on Sea terrain', () => {
      const terrain = createTestTerrain();
      const minerals = generateMinerals(terrain, 10, 12345);

      for (const mineral of minerals) {
        const hex = terrain.find(
          (t) => t.coord.q === mineral.position.q && t.coord.r === mineral.position.r
        );
        expect(hex!.type).not.toBe(TerrainType.Sea);
      }
    });

    it('should NOT place minerals on Mountain terrain', () => {
      const terrain = createTestTerrain();
      const minerals = generateMinerals(terrain, 10, 12345);

      for (const mineral of minerals) {
        const hex = terrain.find(
          (t) => t.coord.q === mineral.position.q && t.coord.r === mineral.position.r
        );
        expect(hex!.type).not.toBe(TerrainType.Mountain);
      }
    });

    it('should limit minerals to available valid hexes', () => {
      const terrain = createTestTerrain();
      // There are 6 valid hexes (3 Land, 2 Marsh, 2 Reef = 7, but one less due to test data)
      const validCount = terrain.filter((t) =>
        [TerrainType.Land, TerrainType.Marsh, TerrainType.Reef].includes(t.type)
      ).length;

      // Request more minerals than available
      const minerals = generateMinerals(terrain, 100, 12345);

      expect(minerals.length).toBe(validCount);
    });

    it('should return empty array for terrain with no valid hexes', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Sea },
        { coord: { q: 1, r: 0 }, type: TerrainType.Mountain },
      ];

      const minerals = generateMinerals(terrain, 10);

      expect(minerals).toHaveLength(0);
    });

    it('should generate unique mineral IDs', () => {
      const terrain = createTestTerrain();
      const minerals = generateMinerals(terrain, 5, 12345);

      const ids = minerals.map((m) => m.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(minerals.length);
    });

    it('should generate reproducible results with same seed', () => {
      const terrain = createTestTerrain();
      const minerals1 = generateMinerals(terrain, 5, 42);
      const minerals2 = generateMinerals(terrain, 5, 42);

      expect(minerals1).toEqual(minerals2);
    });

    it('should generate different results with different seeds', () => {
      const terrain = createTestTerrain();
      const minerals1 = generateMinerals(terrain, 5, 42);
      const minerals2 = generateMinerals(terrain, 5, 43);

      // At least some positions should be different
      const sameCount = minerals1.filter((m1) =>
        minerals2.some(
          (m2) => m2.position.q === m1.position.q && m2.position.r === m1.position.r
        )
      ).length;

      // With different seeds, likely different placements (may overlap by chance)
      expect(sameCount).toBeLessThan(minerals1.length);
    });

    it('should place minerals at unique positions (no duplicates)', () => {
      const terrain = createTestTerrain();
      const minerals = generateMinerals(terrain, 5, 12345);

      const positions = minerals.map((m) => `${m.position.q},${m.position.r}`);
      const uniquePositions = new Set(positions);

      expect(uniquePositions.size).toBe(minerals.length);
    });
  });

  describe('generateMap', () => {
    it('should generate a map with the specified dimensions', () => {
      const map = generateMap({ width: 10, height: 10 });

      expect(map).toHaveLength(100);
    });

    it('should generate terrain at correct coordinates', () => {
      const map = generateMap({ width: 5, height: 5 });

      // Check first few coordinates exist
      const coords = map.map((t) => `${t.coord.q},${t.coord.r}`);
      expect(coords).toContain('0,0');
      expect(coords).toContain('4,4');
    });

    it('should generate reproducible results with same seed', () => {
      const map1 = generateMap({ width: 10, height: 10 }, 42);
      const map2 = generateMap({ width: 10, height: 10 }, 42);

      expect(map1).toEqual(map2);
    });
  });

  describe('generateDemoMap', () => {
    it('should return the official map', () => {
      const map = generateDemoMap();

      // Official map is 37x23 = 851 hexes (or the actual count from official map)
      expect(map.length).toBeGreaterThan(0);
    });
  });

  describe('Mineral placement with official map', () => {
    it('should generate 90 minerals by default on official map', () => {
      const terrain = generateDemoMap();
      const minerals = generateMinerals(terrain);

      expect(minerals).toHaveLength(90);
    });

    it('should place all minerals on valid terrain in official map', () => {
      const terrain = generateDemoMap();
      const minerals = generateMinerals(terrain, 90, 12345);

      for (const mineral of minerals) {
        const hex = terrain.find(
          (t) => t.coord.q === mineral.position.q && t.coord.r === mineral.position.r
        );
        expect(hex).toBeDefined();
        expect([TerrainType.Land, TerrainType.Marsh, TerrainType.Reef]).toContain(hex!.type);
      }
    });
  });
});
