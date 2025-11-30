import { describe, it, expect } from 'vitest';
import {
  axialToCube,
  cubeToAxial,
  hexDistance,
  hexNeighbors,
  hexesInRange,
  hexesInRing,
  hexEqual,
  hexKey,
  hexFromKey,
  FLAT_TOP_DIRECTIONS,
} from '../hex';
import type { HexCoord, CubeCoord } from '../types';

describe('Hex Coordinate System', () => {
  describe('axialToCube', () => {
    it('should convert origin correctly', () => {
      const axial: HexCoord = { q: 0, r: 0 };
      const cube = axialToCube(axial);
      expect(cube.x).toBe(0);
      expect(cube.y).toBe(0);
      expect(cube.z).toBe(0);
      expect(cube.x + cube.y + cube.z).toBe(0);
    });

    it('should convert positive q correctly', () => {
      const axial: HexCoord = { q: 3, r: 0 };
      const cube = axialToCube(axial);
      expect(cube).toEqual({ x: 3, y: -3, z: 0 });
      // Constraint check: x + y + z = 0
      expect(cube.x + cube.y + cube.z).toBe(0);
    });

    it('should convert positive r correctly', () => {
      const axial: HexCoord = { q: 0, r: 3 };
      const cube = axialToCube(axial);
      expect(cube).toEqual({ x: 0, y: -3, z: 3 });
      expect(cube.x + cube.y + cube.z).toBe(0);
    });

    it('should convert mixed coordinates correctly', () => {
      const axial: HexCoord = { q: 2, r: -3 };
      const cube = axialToCube(axial);
      expect(cube).toEqual({ x: 2, y: 1, z: -3 });
      expect(cube.x + cube.y + cube.z).toBe(0);
    });

    it('should convert negative coordinates correctly', () => {
      const axial: HexCoord = { q: -4, r: -2 };
      const cube = axialToCube(axial);
      expect(cube).toEqual({ x: -4, y: 6, z: -2 });
      expect(cube.x + cube.y + cube.z).toBe(0);
    });
  });

  describe('cubeToAxial', () => {
    it('should convert origin correctly', () => {
      const cube: CubeCoord = { x: 0, y: 0, z: 0 };
      const axial = cubeToAxial(cube);
      expect(axial).toEqual({ q: 0, r: 0 });
    });

    it('should convert positive x correctly', () => {
      const cube: CubeCoord = { x: 3, y: -3, z: 0 };
      const axial = cubeToAxial(cube);
      expect(axial).toEqual({ q: 3, r: 0 });
    });

    it('should convert positive z correctly', () => {
      const cube: CubeCoord = { x: 0, y: -3, z: 3 };
      const axial = cubeToAxial(cube);
      expect(axial).toEqual({ q: 0, r: 3 });
    });

    it('should convert mixed coordinates correctly', () => {
      const cube: CubeCoord = { x: 2, y: 1, z: -3 };
      const axial = cubeToAxial(cube);
      expect(axial).toEqual({ q: 2, r: -3 });
    });

    it('should be inverse of axialToCube', () => {
      const original: HexCoord = { q: 5, r: -7 };
      const cube = axialToCube(original);
      const result = cubeToAxial(cube);
      expect(result).toEqual(original);
    });
  });

  describe('hexDistance', () => {
    it('should return 0 for same hex', () => {
      const hex: HexCoord = { q: 3, r: 5 };
      expect(hexDistance(hex, hex)).toBe(0);
    });

    it('should return 1 for adjacent hexes', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 1, r: 0 };
      expect(hexDistance(a, b)).toBe(1);
    });

    it('should calculate distance along q axis', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 5, r: 0 };
      expect(hexDistance(a, b)).toBe(5);
    });

    it('should calculate distance along r axis', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 0, r: 5 };
      expect(hexDistance(a, b)).toBe(5);
    });

    it('should calculate diagonal distance correctly', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 3, r: -3 };
      expect(hexDistance(a, b)).toBe(3);
    });

    it('should calculate distance for negative coordinates', () => {
      const a: HexCoord = { q: -2, r: -3 };
      const b: HexCoord = { q: 2, r: 1 };
      // Distance calculation using cube coords
      // a_cube = { x: -2, y: 5, z: -3 }
      // b_cube = { x: 2, y: -3, z: 1 }
      // diff = { x: 4, y: -8, z: 4 }
      // max(4, 8, 4) = 8
      expect(hexDistance(a, b)).toBe(8);
    });

    it('should be symmetric', () => {
      const a: HexCoord = { q: 3, r: -2 };
      const b: HexCoord = { q: -1, r: 4 };
      expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    });

    it('should calculate combat ranges correctly', () => {
      // Tank range 2
      const origin: HexCoord = { q: 0, r: 0 };
      const inRange: HexCoord = { q: 2, r: 0 };
      const outOfRange: HexCoord = { q: 3, r: 0 };
      expect(hexDistance(origin, inRange)).toBe(2);
      expect(hexDistance(origin, outOfRange)).toBe(3);
    });
  });

  describe('hexNeighbors', () => {
    it('should return 6 neighbors', () => {
      const hex: HexCoord = { q: 0, r: 0 };
      const neighbors = hexNeighbors(hex);
      expect(neighbors).toHaveLength(6);
    });

    it('should return correct neighbors for origin (flat-top)', () => {
      const hex: HexCoord = { q: 0, r: 0 };
      const neighbors = hexNeighbors(hex);

      // Flat-top hex neighbor directions:
      // (+1, 0), (+1, -1), (0, -1), (-1, 0), (-1, +1), (0, +1)
      const expected: HexCoord[] = [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
      ];

      expect(neighbors).toEqual(expect.arrayContaining(expected));
      expect(expected).toEqual(expect.arrayContaining(neighbors));
    });

    it('should return all neighbors at distance 1', () => {
      const hex: HexCoord = { q: 5, r: -3 };
      const neighbors = hexNeighbors(hex);
      neighbors.forEach((neighbor) => {
        expect(hexDistance(hex, neighbor)).toBe(1);
      });
    });

    it('should work for any hex position', () => {
      const hex: HexCoord = { q: -10, r: 7 };
      const neighbors = hexNeighbors(hex);
      expect(neighbors).toHaveLength(6);
      neighbors.forEach((neighbor) => {
        expect(hexDistance(hex, neighbor)).toBe(1);
      });
    });
  });

  describe('hexesInRange', () => {
    it('should return only origin for range 0', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRange(origin, 0);
      expect(hexes).toHaveLength(1);
      expect(hexes[0]).toEqual(origin);
    });

    it('should return 7 hexes for range 1 (center + 6 neighbors)', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRange(origin, 1);
      expect(hexes).toHaveLength(7);
    });

    it('should return 19 hexes for range 2', () => {
      // Formula: 3*n*(n+1) + 1 where n is range
      // For range 2: 3*2*3 + 1 = 19
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRange(origin, 2);
      expect(hexes).toHaveLength(19);
    });

    it('should return 37 hexes for range 3', () => {
      // For range 3: 3*3*4 + 1 = 37
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRange(origin, 3);
      expect(hexes).toHaveLength(37);
    });

    it('should include all hexes within range', () => {
      const origin: HexCoord = { q: 5, r: -3 };
      const range = 2;
      const hexes = hexesInRange(origin, range);

      hexes.forEach((hex) => {
        expect(hexDistance(origin, hex)).toBeLessThanOrEqual(range);
      });
    });

    it('should not include hexes outside range', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const range = 2;
      const hexes = hexesInRange(origin, range);
      const hexSet = new Set(hexes.map((h) => hexKey(h)));

      const outOfRange: HexCoord = { q: 3, r: 0 };
      expect(hexSet.has(hexKey(outOfRange))).toBe(false);
    });

    it('should handle tank combat range (2)', () => {
      const tankPosition: HexCoord = { q: 10, r: 5 };
      const hexes = hexesInRange(tankPosition, 2);
      expect(hexes).toHaveLength(19);
    });

    it('should handle mountain tank combat range (3)', () => {
      const tankPosition: HexCoord = { q: 10, r: 5 };
      const hexes = hexesInRange(tankPosition, 3);
      expect(hexes).toHaveLength(37);
    });
  });

  describe('hexesInRing', () => {
    it('should return only origin for ring 0', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRing(origin, 0);
      expect(hexes).toHaveLength(1);
      expect(hexes[0]).toEqual(origin);
    });

    it('should return 6 hexes for ring 1', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRing(origin, 1);
      expect(hexes).toHaveLength(6);
    });

    it('should return 12 hexes for ring 2', () => {
      // Ring n has 6*n hexes (for n > 0)
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRing(origin, 2);
      expect(hexes).toHaveLength(12);
    });

    it('should return 18 hexes for ring 3', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const hexes = hexesInRing(origin, 3);
      expect(hexes).toHaveLength(18);
    });

    it('should return hexes at exact distance', () => {
      const origin: HexCoord = { q: 5, r: -3 };
      const radius = 2;
      const hexes = hexesInRing(origin, radius);

      hexes.forEach((hex) => {
        expect(hexDistance(origin, hex)).toBe(radius);
      });
    });
  });

  describe('hexEqual', () => {
    it('should return true for equal hexes', () => {
      const a: HexCoord = { q: 3, r: -2 };
      const b: HexCoord = { q: 3, r: -2 };
      expect(hexEqual(a, b)).toBe(true);
    });

    it('should return false for different q', () => {
      const a: HexCoord = { q: 3, r: -2 };
      const b: HexCoord = { q: 4, r: -2 };
      expect(hexEqual(a, b)).toBe(false);
    });

    it('should return false for different r', () => {
      const a: HexCoord = { q: 3, r: -2 };
      const b: HexCoord = { q: 3, r: -3 };
      expect(hexEqual(a, b)).toBe(false);
    });

    it('should return true for origin', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 0, r: 0 };
      expect(hexEqual(a, b)).toBe(true);
    });
  });

  describe('hexKey and hexFromKey', () => {
    it('should create consistent key for hex', () => {
      const hex: HexCoord = { q: 3, r: -5 };
      const key = hexKey(hex);
      expect(typeof key).toBe('string');
    });

    it('should create different keys for different hexes', () => {
      const a: HexCoord = { q: 3, r: -5 };
      const b: HexCoord = { q: 3, r: -4 };
      expect(hexKey(a)).not.toBe(hexKey(b));
    });

    it('should round-trip through key conversion', () => {
      const original: HexCoord = { q: 7, r: -12 };
      const key = hexKey(original);
      const result = hexFromKey(key);
      expect(result).toEqual(original);
    });

    it('should round-trip negative coordinates', () => {
      const original: HexCoord = { q: -15, r: -8 };
      const key = hexKey(original);
      const result = hexFromKey(key);
      expect(result).toEqual(original);
    });

    it('should handle origin', () => {
      const original: HexCoord = { q: 0, r: 0 };
      const key = hexKey(original);
      const result = hexFromKey(key);
      expect(result).toEqual(original);
    });
  });

  describe('FLAT_TOP_DIRECTIONS', () => {
    it('should have 6 directions', () => {
      expect(FLAT_TOP_DIRECTIONS).toHaveLength(6);
    });

    it('should be at distance 1 from origin', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      FLAT_TOP_DIRECTIONS.forEach((dir) => {
        const neighbor: HexCoord = { q: dir.q, r: dir.r };
        expect(hexDistance(origin, neighbor)).toBe(1);
      });
    });

    it('should have no duplicate directions', () => {
      const keys = FLAT_TOP_DIRECTIONS.map((d) => hexKey(d));
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(6);
    });
  });

  describe('Edge Cases', () => {
    it('should handle large coordinates', () => {
      const a: HexCoord = { q: 1000, r: -500 };
      const b: HexCoord = { q: -1000, r: 500 };
      expect(() => hexDistance(a, b)).not.toThrow();
      expect(hexDistance(a, b)).toBeGreaterThan(0);
    });

    it('should handle neighbors at boundary', () => {
      const hex: HexCoord = { q: 0, r: 0 };
      const neighbors = hexNeighbors(hex);
      expect(neighbors.every((n) => Number.isInteger(n.q) && Number.isInteger(n.r))).toBe(true);
    });
  });
});

// Import additional hex functions for extended tests
import {
  hexLine,
  hexRotateClockwise,
  hexRotateCounterClockwise,
  hexRotateAround,
} from '../hex';

describe('Hex Line Drawing', () => {
  describe('hexLine', () => {
    it('should return single hex for same start and end', () => {
      const hex: HexCoord = { q: 3, r: -2 };
      const line = hexLine(hex, hex);
      expect(line).toHaveLength(1);
      expect(line[0]).toEqual(hex);
    });

    it('should return 2 hexes for adjacent points', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 1, r: 0 };
      const line = hexLine(a, b);
      expect(line).toHaveLength(2);
      expect(line[0]).toEqual(a);
      expect(line[1]).toEqual(b);
    });

    it('should return correct hexes along q axis', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 3, r: 0 };
      const line = hexLine(a, b);
      expect(line).toHaveLength(4);
      expect(line[0]).toEqual({ q: 0, r: 0 });
      expect(line[1]).toEqual({ q: 1, r: 0 });
      expect(line[2]).toEqual({ q: 2, r: 0 });
      expect(line[3]).toEqual({ q: 3, r: 0 });
    });

    it('should return correct hexes along r axis', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 0, r: 3 };
      const line = hexLine(a, b);
      expect(line).toHaveLength(4);
      expect(line[0]).toEqual({ q: 0, r: 0 });
      expect(line[3]).toEqual({ q: 0, r: 3 });
    });

    it('should return correct hexes along diagonal', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 2, r: -2 };
      const line = hexLine(a, b);
      expect(line).toHaveLength(3);
      expect(line[0]).toEqual(a);
      expect(line[2]).toEqual(b);
    });

    it('should work in reverse direction', () => {
      const a: HexCoord = { q: 3, r: 0 };
      const b: HexCoord = { q: 0, r: 0 };
      const line = hexLine(a, b);
      expect(line).toHaveLength(4);
      expect(line[0]).toEqual(a);
      expect(line[3]).toEqual(b);
    });

    it('should have each consecutive hex at distance 1', () => {
      const a: HexCoord = { q: 0, r: 0 };
      const b: HexCoord = { q: 5, r: -3 };
      const line = hexLine(a, b);
      for (let i = 1; i < line.length; i++) {
        expect(hexDistance(line[i - 1], line[i])).toBe(1);
      }
    });
  });
});

describe('Hex Rotation', () => {
  describe('hexRotateClockwise', () => {
    it('should rotate origin to itself', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const rotated = hexRotateClockwise(origin);
      expect(rotated).toEqual({ q: 0, r: 0 });
    });

    it('should rotate east neighbor to southeast', () => {
      // E (1, 0) -> SE (0, 1) after 60 degree clockwise rotation
      const east: HexCoord = { q: 1, r: 0 };
      const rotated = hexRotateClockwise(east);
      expect(rotated).toEqual({ q: 0, r: 1 });
    });

    it('should rotate through all 6 directions back to start', () => {
      const start: HexCoord = { q: 1, r: 0 };
      let current = start;
      for (let i = 0; i < 6; i++) {
        current = hexRotateClockwise(current);
      }
      expect(current).toEqual(start);
    });

    it('should rotate a hex at distance 2', () => {
      const hex: HexCoord = { q: 2, r: 0 };
      const rotated = hexRotateClockwise(hex);
      // After rotation, should still be at distance 2 from origin
      expect(hexDistance({ q: 0, r: 0 }, rotated)).toBe(2);
    });
  });

  describe('hexRotateCounterClockwise', () => {
    it('should rotate origin to itself', () => {
      const origin: HexCoord = { q: 0, r: 0 };
      const rotated = hexRotateCounterClockwise(origin);
      expect(rotated).toEqual({ q: 0, r: 0 });
    });

    it('should rotate east neighbor to northeast', () => {
      // E (1, 0) -> NE (1, -1) after 60 degree counter-clockwise rotation
      const east: HexCoord = { q: 1, r: 0 };
      const rotated = hexRotateCounterClockwise(east);
      expect(rotated).toEqual({ q: 1, r: -1 });
    });

    it('should be inverse of clockwise rotation', () => {
      const hex: HexCoord = { q: 3, r: -2 };
      const cw = hexRotateClockwise(hex);
      const back = hexRotateCounterClockwise(cw);
      expect(back).toEqual(hex);
    });

    it('should rotate through all 6 directions back to start', () => {
      const start: HexCoord = { q: 2, r: -1 };
      let current = start;
      for (let i = 0; i < 6; i++) {
        current = hexRotateCounterClockwise(current);
      }
      expect(current).toEqual(start);
    });
  });

  describe('hexRotateAround', () => {
    it('should rotate around center point', () => {
      const center: HexCoord = { q: 5, r: 5 };
      const hex: HexCoord = { q: 6, r: 5 }; // East of center
      const rotated = hexRotateAround(hex, center, 1);
      // Should now be southeast of center
      expect(rotated).toEqual({ q: 5, r: 6 });
    });

    it('should return same hex for 0 steps', () => {
      const center: HexCoord = { q: 3, r: 3 };
      const hex: HexCoord = { q: 4, r: 3 };
      const rotated = hexRotateAround(hex, center, 0);
      expect(rotated).toEqual(hex);
    });

    it('should return same hex for 6 steps (full rotation)', () => {
      const center: HexCoord = { q: 0, r: 0 };
      const hex: HexCoord = { q: 2, r: -1 };
      const rotated = hexRotateAround(hex, center, 6);
      expect(rotated).toEqual(hex);
    });

    it('should handle negative steps (counter-clockwise)', () => {
      const center: HexCoord = { q: 0, r: 0 };
      const hex: HexCoord = { q: 1, r: 0 };
      const rotatedCW = hexRotateAround(hex, center, 1);
      const rotatedCCW = hexRotateAround(hex, center, -1);
      // 1 step CW should be different from 1 step CCW
      expect(rotatedCW).not.toEqual(rotatedCCW);
      // 5 steps CW should equal 1 step CCW
      const rotated5CW = hexRotateAround(hex, center, 5);
      expect(rotated5CW).toEqual(rotatedCCW);
    });

    it('should preserve distance from center', () => {
      const center: HexCoord = { q: 10, r: 5 };
      const hex: HexCoord = { q: 13, r: 3 };
      const originalDistance = hexDistance(center, hex);
      for (let steps = 1; steps <= 5; steps++) {
        const rotated = hexRotateAround(hex, center, steps);
        expect(hexDistance(center, rotated)).toBe(originalDistance);
      }
    });

    it('should handle rotation of center itself', () => {
      const center: HexCoord = { q: 5, r: 5 };
      const rotated = hexRotateAround(center, center, 3);
      expect(rotated).toEqual(center);
    });
  });
});
