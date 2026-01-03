import { describe, it, expect } from 'vitest';
import {
  generateOfficialMap,
  validateOfficialMap,
  getOfficialMapStats,
  OFFICIAL_MAP_DIMENSIONS,
  TOTAL_LANDING_ZONES,
  calculateLandingZone,
  getZoneDistance,
  isLandingZoneValid,
  getZoneHexes,
  getZoneBoundaryHexes,
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

    it('should have significant internal sea area', () => {
      // The official FMP map is an island with land on edges and internal sea/lakes
      const terrain = generateOfficialMap();
      const stats = getOfficialMapStats();

      // Sea should make up a significant portion (internal lakes/seas)
      expect(stats.sea).toBeGreaterThan(200);

      // Verify terrain array length
      expect(terrain).toHaveLength(851);
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

      // Reefs should exist along internal coasts
      expect(stats.reef).toBeGreaterThan(10);
    });
  });

  // =========================================================================
  // Landing Zone Tests
  // =========================================================================

  describe('Landing Zones', () => {
    describe('TOTAL_LANDING_ZONES', () => {
      it('should have 8 landing zones', () => {
        expect(TOTAL_LANDING_ZONES).toBe(8);
      });
    });

    describe('calculateLandingZone', () => {
      it('should return undefined for sea terrain', () => {
        const zone = calculateLandingZone(10, 10, TerrainType.Sea);
        expect(zone).toBeUndefined();
      });

      it('should return undefined for mountain terrain', () => {
        const zone = calculateLandingZone(10, 10, TerrainType.Mountain);
        expect(zone).toBeUndefined();
      });

      it('should return undefined for reef terrain', () => {
        const zone = calculateLandingZone(10, 10, TerrainType.Reef);
        expect(zone).toBeUndefined();
      });

      it('should return zone number for land terrain', () => {
        const zone = calculateLandingZone(5, 5, TerrainType.Land);
        expect(zone).toBeGreaterThanOrEqual(1);
        expect(zone).toBeLessThanOrEqual(8);
      });

      it('should return zone number for marsh terrain', () => {
        const zone = calculateLandingZone(5, 5, TerrainType.Marsh);
        expect(zone).toBeGreaterThanOrEqual(1);
        expect(zone).toBeLessThanOrEqual(8);
      });

      it('should return different zones for different map positions', () => {
        // Test corners - they should be in different zones
        const topLeft = calculateLandingZone(2, 2, TerrainType.Land);
        const topRight = calculateLandingZone(34, 2, TerrainType.Land);
        const bottomRight = calculateLandingZone(34, 20, TerrainType.Land);
        const bottomLeft = calculateLandingZone(2, 20, TerrainType.Land);

        // These distant corners should be in different zones
        expect(topLeft).not.toBe(bottomRight);
        expect(topRight).not.toBe(bottomLeft);
      });
    });

    describe('getZoneDistance', () => {
      it('should return 0 for same zone', () => {
        expect(getZoneDistance(1, 1)).toBe(0);
        expect(getZoneDistance(5, 5)).toBe(0);
      });

      it('should return 1 for adjacent zones', () => {
        expect(getZoneDistance(1, 2)).toBe(1);
        expect(getZoneDistance(2, 3)).toBe(1);
        expect(getZoneDistance(7, 8)).toBe(1);
        // Wrap-around: zone 1 and 8 are adjacent
        expect(getZoneDistance(1, 8)).toBe(1);
      });

      it('should return correct distance for non-adjacent zones', () => {
        expect(getZoneDistance(1, 3)).toBe(2);
        expect(getZoneDistance(1, 4)).toBe(3);
        expect(getZoneDistance(1, 5)).toBe(4); // Maximum distance (opposite)
      });

      it('should handle wrap-around correctly', () => {
        // Zone 2 to zone 7: direct = 5, wrap-around = 3
        expect(getZoneDistance(2, 7)).toBe(3);
        // Zone 1 to zone 6: direct = 5, wrap-around = 3
        expect(getZoneDistance(1, 6)).toBe(3);
      });

      it('should be symmetric', () => {
        for (let z1 = 1; z1 <= 8; z1++) {
          for (let z2 = 1; z2 <= 8; z2++) {
            expect(getZoneDistance(z1, z2)).toBe(getZoneDistance(z2, z1));
          }
        }
      });
    });

    describe('isLandingZoneValid', () => {
      it('should allow any zone when no existing astronefs', () => {
        for (let zone = 1; zone <= 8; zone++) {
          expect(isLandingZoneValid(zone, [])).toBe(true);
        }
      });

      it('should reject landing in same zone', () => {
        expect(isLandingZoneValid(3, [3])).toBe(false);
      });

      it('should reject landing in adjacent zone (distance 1)', () => {
        expect(isLandingZoneValid(2, [1])).toBe(false);
        expect(isLandingZoneValid(2, [3])).toBe(false);
        expect(isLandingZoneValid(1, [8])).toBe(false); // Wrap-around
      });

      it('should allow landing 2 zones away', () => {
        expect(isLandingZoneValid(3, [1])).toBe(true);
        expect(isLandingZoneValid(5, [3])).toBe(true);
      });

      it('should allow landing 3+ zones away', () => {
        expect(isLandingZoneValid(5, [1])).toBe(true);
        expect(isLandingZoneValid(5, [2])).toBe(true);
      });

      it('should check distance from all existing astronefs', () => {
        // Zone 4 is 2 away from zone 2, but only 1 away from zone 3
        expect(isLandingZoneValid(4, [2, 3])).toBe(false);
        // Zone 5 is 2 away from zone 3 and 3 away from zone 2
        expect(isLandingZoneValid(5, [2, 3])).toBe(true);
      });

      it('should work for 4-player scenario', () => {
        // Player 1 lands in zone 1
        expect(isLandingZoneValid(1, [])).toBe(true);
        // Player 2 must be 2+ away from zone 1
        expect(isLandingZoneValid(3, [1])).toBe(true);
        // Player 3 must be 2+ away from zones 1 and 3
        expect(isLandingZoneValid(5, [1, 3])).toBe(true);
        // Player 4 must be 2+ away from zones 1, 3, and 5
        expect(isLandingZoneValid(7, [1, 3, 5])).toBe(true);
      });
    });

    describe('generated map landing zones', () => {
      it('should assign landing zones to land and marsh hexes', () => {
        const terrain = generateOfficialMap();

        const landAndMarsh = terrain.filter(
          h => h.type === TerrainType.Land || h.type === TerrainType.Marsh
        );

        // All land/marsh hexes should have landing zones
        landAndMarsh.forEach(hex => {
          expect(hex.landingZone).toBeDefined();
          expect(hex.landingZone).toBeGreaterThanOrEqual(1);
          expect(hex.landingZone).toBeLessThanOrEqual(8);
        });
      });

      it('should not assign landing zones to sea, mountain, or reef', () => {
        const terrain = generateOfficialMap();

        const otherTerrain = terrain.filter(
          h => h.type === TerrainType.Sea ||
               h.type === TerrainType.Mountain ||
               h.type === TerrainType.Reef
        );

        otherTerrain.forEach(hex => {
          expect(hex.landingZone).toBeUndefined();
        });
      });

      it('should have all 8 zones represented', () => {
        const terrain = generateOfficialMap();
        const zones = new Set<number>();

        terrain.forEach(hex => {
          if (hex.landingZone) {
            zones.add(hex.landingZone);
          }
        });

        expect(zones.size).toBe(8);
        for (let z = 1; z <= 8; z++) {
          expect(zones.has(z)).toBe(true);
        }
      });
    });

    describe('getZoneHexes', () => {
      it('should return hexes for a specific zone', () => {
        const terrain = generateOfficialMap();

        for (let zone = 1; zone <= 8; zone++) {
          const zoneHexes = getZoneHexes(terrain, zone);
          expect(zoneHexes.length).toBeGreaterThan(0);

          // Verify all returned hexes belong to the zone
          zoneHexes.forEach(coord => {
            const hex = terrain.find(
              t => t.coord.q === coord.q && t.coord.r === coord.r
            );
            expect(hex?.landingZone).toBe(zone);
          });
        }
      });
    });

    describe('getZoneBoundaryHexes', () => {
      it('should return boundary hexes with their zones', () => {
        const terrain = generateOfficialMap();
        const boundaries = getZoneBoundaryHexes(terrain);

        // Should have some boundary hexes
        expect(boundaries.length).toBeGreaterThan(0);

        // Each boundary hex should have a valid zone
        boundaries.forEach(b => {
          expect(b.zone).toBeGreaterThanOrEqual(1);
          expect(b.zone).toBeLessThanOrEqual(8);

          // The hex should exist in terrain with matching zone
          const hex = terrain.find(
            t => t.coord.q === b.coord.q && t.coord.r === b.coord.r
          );
          expect(hex?.landingZone).toBe(b.zone);
        });
      });
    });
  });
});
