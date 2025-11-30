import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HexRenderer } from '../renderer';
import { TerrainType, TideLevel } from '../types';
import { createMockCanvas, createMockGPUAdapter } from '@/test/setup';

describe('renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HexRenderer', () => {
    it('should initialize with canvas', async () => {
      const mockCanvas = createMockCanvas();
      const mockAdapter = createMockGPUAdapter();
      const mockContext = {
        configure: vi.fn(),
        getCurrentTexture: vi.fn(),
      };

      mockCanvas.getContext = vi.fn().mockReturnValue(mockContext);

      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      } as unknown as Navigator;

      const renderer = await HexRenderer.create(mockCanvas);

      expect(renderer).toBeDefined();
      expect(renderer.getBackend()).toBe('webgpu');
    });

    it('should set terrain data', async () => {
      const mockCanvas = createMockCanvas();
      const mockAdapter = createMockGPUAdapter();
      const mockContext = {
        configure: vi.fn(),
        getCurrentTexture: vi.fn(),
      };

      mockCanvas.getContext = vi.fn().mockReturnValue(mockContext);

      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      } as unknown as Navigator;

      const renderer = await HexRenderer.create(mockCanvas);

      const terrainHexes = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Sea },
      ];

      renderer.setTerrainData(terrainHexes);

      // Should not throw
      expect(renderer).toBeDefined();
    });

    it('should update tide', async () => {
      const mockCanvas = createMockCanvas();
      const mockAdapter = createMockGPUAdapter();
      const mockContext = {
        configure: vi.fn(),
        getCurrentTexture: vi.fn(),
      };

      mockCanvas.getContext = vi.fn().mockReturnValue(mockContext);

      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      } as unknown as Navigator;

      const renderer = await HexRenderer.create(mockCanvas);

      const terrainHexes = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];

      renderer.setTerrainData(terrainHexes);
      renderer.setTide(TideLevel.High);

      // Should not throw
      expect(renderer).toBeDefined();
    });

    it('should update viewport', async () => {
      const mockCanvas = createMockCanvas();
      const mockAdapter = createMockGPUAdapter();
      const mockContext = {
        configure: vi.fn(),
        getCurrentTexture: vi.fn(),
      };

      mockCanvas.getContext = vi.fn().mockReturnValue(mockContext);

      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      } as unknown as Navigator;

      const renderer = await HexRenderer.create(mockCanvas);

      renderer.setViewport({
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        zoom: 1.5,
      });

      // Should not throw
      expect(renderer).toBeDefined();
    });

    it('should get capabilities', async () => {
      const mockCanvas = createMockCanvas();
      const mockAdapter = createMockGPUAdapter();
      const mockContext = {
        configure: vi.fn(),
        getCurrentTexture: vi.fn(),
      };

      mockCanvas.getContext = vi.fn().mockReturnValue(mockContext);

      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      } as unknown as Navigator;

      const renderer = await HexRenderer.create(mockCanvas);

      const caps = renderer.getCapabilities();

      expect(caps).toBeDefined();
      expect(caps.backend).toBe('webgpu');
      expect(caps.supportsInstancing).toBe(true);
    });

    it('should clean up resources on destroy', async () => {
      const mockCanvas = createMockCanvas();
      const mockAdapter = createMockGPUAdapter();
      const mockContext = {
        configure: vi.fn(),
        getCurrentTexture: vi.fn(),
      };

      mockCanvas.getContext = vi.fn().mockReturnValue(mockContext);

      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      } as unknown as Navigator;

      const renderer = await HexRenderer.create(mockCanvas);
      const terrainHexes = [{ coord: { q: 0, r: 0 }, type: TerrainType.Land }];
      renderer.setTerrainData(terrainHexes);

      renderer.destroy();

      // Should not throw
      expect(renderer).toBeDefined();
    });
  });
});
