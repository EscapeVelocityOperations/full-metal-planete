import { describe, it, expect } from 'vitest';
import {
  generateHexVertices,
  axialToPixel,
  pixelToAxial,
  hexDistance,
  hexNeighbor,
  FLAT_TOP_DIRECTIONS,
} from '../hex-geometry';
import { HEX_SIZE } from '../types';

describe('hex-geometry', () => {
  describe('generateHexVertices', () => {
    it('should generate 6 vertices for flat-top hex', () => {
      const vertices = generateHexVertices(HEX_SIZE);
      expect(vertices).toHaveLength(6);
    });

    it('should generate correct vertex positions for flat-top hex', () => {
      const size = 1;
      const vertices = generateHexVertices(size);

      // Flat-top hex vertices (clockwise from right)
      const expected = [
        [size, 0],
        [size / 2, (size * Math.sqrt(3)) / 2],
        [-size / 2, (size * Math.sqrt(3)) / 2],
        [-size, 0],
        [-size / 2, -(size * Math.sqrt(3)) / 2],
        [size / 2, -(size * Math.sqrt(3)) / 2],
      ];

      vertices.forEach((vertex, i) => {
        expect(vertex[0]).toBeCloseTo(expected[i]![0]!, 5);
        expect(vertex[1]).toBeCloseTo(expected[i]![1]!, 5);
      });
    });
  });

  describe('axialToPixel', () => {
    it('should convert origin hex to origin pixel', () => {
      const pixel = axialToPixel(0, 0, HEX_SIZE);
      expect(pixel.x).toBe(0);
      expect(pixel.y).toBe(0);
    });

    it('should convert q=1, r=0 correctly for flat-top', () => {
      const size = 2;
      const pixel = axialToPixel(1, 0, size);

      // x = size * (3/2 * q) = 2 * (3/2 * 1) = 3
      // y = size * (sqrt(3)/2 * q + sqrt(3) * r) = 2 * (sqrt(3)/2 * 1 + 0) = sqrt(3)
      expect(pixel.x).toBeCloseTo(3, 5);
      expect(pixel.y).toBeCloseTo(Math.sqrt(3), 5);
    });

    it('should convert q=0, r=1 correctly for flat-top', () => {
      const size = 2;
      const pixel = axialToPixel(0, 1, size);

      // x = size * (3/2 * q) = 0
      // y = size * (sqrt(3)/2 * q + sqrt(3) * r) = 2 * sqrt(3)
      expect(pixel.x).toBeCloseTo(0, 5);
      expect(pixel.y).toBeCloseTo(2 * Math.sqrt(3), 5);
    });

    it('should convert negative coordinates correctly', () => {
      const size = 1;
      const pixel = axialToPixel(-1, -1, size);

      expect(pixel.x).toBeCloseTo(-1.5, 5);
      expect(pixel.y).toBeCloseTo(-Math.sqrt(3) * 1.5, 5);
    });
  });

  describe('pixelToAxial', () => {
    it('should convert origin pixel to origin hex', () => {
      const hex = pixelToAxial(0, 0, HEX_SIZE);
      expect(hex.q).toBe(0);
      expect(hex.r).toBe(0);
    });

    it('should round to nearest hex correctly', () => {
      const size = 30;

      // Test point slightly offset from origin
      const hex1 = pixelToAxial(5, 5, size);
      expect(hex1.q).toBe(0);
      expect(hex1.r).toBe(0);

      // Test point in neighboring hex at q=1, r=0
      // For flat-top: x = size * (3/2 * q) = 30 * 1.5 = 45
      const hex2 = pixelToAxial(44, 0, size);
      expect(hex2.q).toBe(1);
      expect(hex2.r).toBe(-1);
    });

    it('should be inverse of axialToPixel for hex centers', () => {
      const coords = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
        { q: -1, r: 1 },
        { q: 2, r: -1 },
      ];

      coords.forEach(({ q, r }) => {
        const pixel = axialToPixel(q, r, HEX_SIZE);
        const hex = pixelToAxial(pixel.x, pixel.y, HEX_SIZE);

        expect(hex.q).toBe(q);
        expect(hex.r).toBe(r);
      });
    });
  });

  describe('hexDistance', () => {
    it('should return 0 for same hex', () => {
      expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    });

    it('should return 1 for adjacent hexes', () => {
      expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
      expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
      expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 0 })).toBe(1);
    });

    it('should return correct distance for non-adjacent hexes', () => {
      expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
      expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 1 })).toBe(2);
      expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 })).toBe(3);
    });

    it('should be symmetric', () => {
      const a = { q: 1, r: 2 };
      const b = { q: -3, r: 4 };

      expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    });
  });

  describe('hexNeighbor', () => {
    it('should return correct neighbors for all 6 directions', () => {
      const center = { q: 0, r: 0 };

      const expected = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 },   // Southeast
      ];

      expected.forEach((exp, i) => {
        const neighbor = hexNeighbor(center, i);
        expect(neighbor.q).toBe(exp.q);
        expect(neighbor.r).toBe(exp.r);
      });
    });

    it('should work with non-origin hexes', () => {
      const hex = { q: 5, r: -3 };
      const neighbor = hexNeighbor(hex, 0); // East

      expect(neighbor.q).toBe(6);
      expect(neighbor.r).toBe(-3);
    });

    it('should wrap direction index correctly', () => {
      const hex = { q: 0, r: 0 };

      // Direction 6 should wrap to 0
      const n1 = hexNeighbor(hex, 0);
      const n2 = hexNeighbor(hex, 6);

      expect(n1.q).toBe(n2.q);
      expect(n1.r).toBe(n2.r);
    });
  });

  describe('FLAT_TOP_DIRECTIONS', () => {
    it('should define 6 direction vectors', () => {
      expect(FLAT_TOP_DIRECTIONS).toHaveLength(6);
    });

    it('should define correct flat-top direction vectors', () => {
      const expected = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 },   // Southeast
      ];

      FLAT_TOP_DIRECTIONS.forEach((dir, i) => {
        expect(dir.q).toBe(expected[i]!.q);
        expect(dir.r).toBe(expected[i]!.r);
      });
    });
  });
});
