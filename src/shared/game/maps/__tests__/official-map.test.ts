import { describe, it, expect } from 'vitest';
import {
  generateOfficialMap,
  validateOfficialMap,
  getOfficialMapStats,
  OFFICIAL_MAP_DIMENSIONS,
} from '../official-map';
import { TerrainType } from '../../types';

describe('Official Map', () => {
  describe('OFFICIAL_MAP_DIMENSIONS', () => {
    it('should have correct dimensions', () => {
      expect(OFFICIAL_MAP_DIMENSIONS.width).toBe(37);
      expect(OFFICIAL_MAP_DIMENSIONS.height).toBe(23);
      expect(OFFICIAL_MAP_DIMENSIONS.totalHexes).toBe(851);
    });
  });

  describe('generateOfficialMap', () => {
    it('should generate correct number of hexes', () => {
      const terrain = generateOfficialMap();
      expect(terrain).toHaveLength(851);
    });

    it('should have valid terrain types for all hexes', () => {
      const terrain = generateOfficialMap();
      const validTypes = Object.values(TerrainType);

      terrain.forEach(hex => {
        expect(validTypes).toContain(hex.type);
      });
    });

    it('should have correct coordinate ranges', () => {
      const terrain = generateOfficialMap();

      terrain.forEach(hex => {
        expect(hex.coord.q).toBeGreaterThanOrEqual(0);
        expect(hex.coord.q).toBeLessThan(37);
        expect(hex.coord.r).toBeGreaterThanOrEqual(0);
        expect(hex.coord.r).toBeLessThan(23);
      });
    });

    it('should have sea on all edges', () => {
      const terrain = generateOfficialMap();
      const terrainMap = new Map<string, TerrainType>();

      terrain.forEach(hex => {
        terrainMap.set(`${hex.coord.q},${hex.coord.r}`, hex.type);
      });

      // Top row (r=0) should be all sea
      for (let q = 0; q < 37; q++) {
        expect(terrainMap.get(`${q},0`)).toBe(TerrainType.Sea);
      }

      // Bottom row (r=22) should be all sea
      for (let q = 0; q < 37; q++) {
        expect(terrainMap.get(`${q},22`)).toBe(TerrainType.Sea);
      }

      // Left column (q=0) should be all sea
      for (let r = 0; r < 23; r++) {
        expect(terrainMap.get(`0,${r}`)).toBe(TerrainType.Sea);
      }

      // Right column (q=36) should be all sea
      for (let r = 0; r < 23; r++) {
        expect(terrainMap.get(`36,${r}`)).toBe(TerrainType.Sea);
      }
    });
  });

  describe('validateOfficialMap', () => {
    it('should validate successfully', () => {
      const result = validateOfficialMap();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getOfficialMapStats', () => {
    it('should return terrain counts', () => {
      const stats = getOfficialMapStats();

      expect(stats.sea).toBeGreaterThan(0);
      expect(stats.land).toBeGreaterThan(0);
      expect(stats.mountain).toBeGreaterThan(0);
      expect(stats.marsh).toBeGreaterThan(0);
      expect(stats.reef).toBeGreaterThan(0);
    });

    it('should sum to total hexes', () => {
      const stats = getOfficialMapStats();
      const total = stats.sea + stats.land + stats.mountain + stats.marsh + stats.reef;
      expect(total).toBe(851);
    });

    it('should have reasonable terrain distribution', () => {
      const stats = getOfficialMapStats();

      // Sea should be significant (border and internal)
      expect(stats.sea).toBeGreaterThan(200);

      // Land should be the most common land terrain
      expect(stats.land).toBeGreaterThan(stats.mountain);
      expect(stats.land).toBeGreaterThan(stats.marsh);

      // Mountains and marshes should be moderate
      expect(stats.mountain).toBeGreaterThan(5);
      expect(stats.marsh).toBeGreaterThan(10);

      // Reefs should exist along coasts
      expect(stats.reef).toBeGreaterThan(20);
    });
  });
});
