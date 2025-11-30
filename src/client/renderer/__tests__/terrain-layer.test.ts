import { describe, it, expect, vi } from 'vitest';
import { TerrainLayer, createTerrainBufferData } from '../terrain-layer';
import { TerrainType, TideLevel, TERRAIN_COLORS } from '../types';
import { createMockGPUDevice } from '@/test/setup';

describe('terrain-layer', () => {
  describe('createTerrainBufferData', () => {
    it('should create buffer data for terrain hexes', () => {
      const terrainHexes = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Sea },
        { coord: { q: 0, r: 1 }, type: TerrainType.Mountain },
      ];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Normal);

      // Each hex: 2 floats (position) + 3 floats (color) = 5 floats
      expect(data.length).toBe(terrainHexes.length * 5);
    });

    it('should use land color for land terrain', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Land }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Normal);

      // Color starts at index 2 (after position x, y)
      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.land[0], 5);
      expect(data[3]).toBeCloseTo(TERRAIN_COLORS.land[1], 5);
      expect(data[4]).toBeCloseTo(TERRAIN_COLORS.land[2], 5);
    });

    it('should use sea color for sea terrain', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Sea }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Normal);

      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.sea[0], 5);
      expect(data[3]).toBeCloseTo(TERRAIN_COLORS.sea[1], 5);
      expect(data[4]).toBeCloseTo(TERRAIN_COLORS.sea[2], 5);
    });

    it('should use land color for marsh at low tide', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Marsh }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Low);

      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.land[0], 5);
      expect(data[3]).toBeCloseTo(TERRAIN_COLORS.land[1], 5);
      expect(data[4]).toBeCloseTo(TERRAIN_COLORS.land[2], 5);
    });

    it('should use land color for marsh at normal tide', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Marsh }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Normal);

      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.land[0], 5);
    });

    it('should use sea color for marsh at high tide', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Marsh }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.High);

      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.sea[0], 5);
      expect(data[3]).toBeCloseTo(TERRAIN_COLORS.sea[1], 5);
      expect(data[4]).toBeCloseTo(TERRAIN_COLORS.sea[2], 5);
    });

    it('should use land color for reef at low tide', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Reef }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Low);

      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.land[0], 5);
    });

    it('should use sea color for reef at normal tide', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Reef }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Normal);

      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.sea[0], 5);
    });

    it('should use sea color for reef at high tide', () => {
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Reef }];

      const data = createTerrainBufferData(terrainHexes, TideLevel.High);

      expect(data[2]).toBeCloseTo(TERRAIN_COLORS.sea[0], 5);
    });

    it('should convert hex coordinates to pixel positions', () => {
      const terrainHexes = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const data = createTerrainBufferData(terrainHexes, TideLevel.Normal);

      // First hex at origin
      expect(data[0]).toBeCloseTo(0, 5);
      expect(data[1]).toBeCloseTo(0, 5);

      // Second hex offset (q=1, r=0)
      // x = size * (3/2 * 1) = 30 * 1.5 = 45
      // y = size * (sqrt(3)/2 * 1 + sqrt(3) * 0) = 30 * sqrt(3)/2
      expect(data[5]).toBeCloseTo(45, 5);
      expect(data[6]).toBeCloseTo(30 * (Math.sqrt(3) / 2), 5);
    });
  });

  describe('TerrainLayer', () => {
    it('should initialize with terrain data', () => {
      const mockDevice = createMockGPUDevice();
      const terrainHexes = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
      ];

      const layer = new TerrainLayer(mockDevice, terrainHexes);

      expect(layer).toBeDefined();
      expect(layer.hexCount).toBe(1);
    });

    it('should update tide and recreate buffers', () => {
      const mockDevice = createMockGPUDevice();
      const terrainHexes = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];

      const layer = new TerrainLayer(mockDevice, terrainHexes);

      // Create buffer should be called initially
      const initialCalls = (mockDevice.createBuffer as ReturnType<typeof vi.fn>).mock.calls.length;

      layer.updateTide(TideLevel.High);

      // Buffer should be recreated on tide change
      const finalCalls = (mockDevice.createBuffer as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(finalCalls).toBeGreaterThan(initialCalls);
    });

    it('should get hex count correctly', () => {
      const mockDevice = createMockGPUDevice();
      const terrainHexes = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Sea },
        { coord: { q: 0, r: 1 }, type: TerrainType.Mountain },
      ];

      const layer = new TerrainLayer(mockDevice, terrainHexes);

      expect(layer.hexCount).toBe(3);
    });
  });
});
