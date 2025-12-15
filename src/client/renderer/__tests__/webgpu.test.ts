import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeRenderer, detectRendererCapabilities } from '../webgpu';
import { createMockGPUAdapter, createMockCanvas, createMockWebGL2Context } from '@/test/setup';

describe('webgpu', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
  });

  describe('detectRendererCapabilities', () => {
    it('should detect WebGPU when available', async () => {
      const mockAdapter = createMockGPUAdapter();

      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        },
      } as unknown as Navigator;

      const caps = await detectRendererCapabilities();

      expect(caps.backend).toBe('webgpu');
      expect(caps.supportsInstancing).toBe(true);
      expect(caps.supportsCompute).toBe(true);
    });

    it('should fallback to WebGL2 when WebGPU unavailable', async () => {
      globalThis.navigator = {
        gpu: undefined,
      } as unknown as Navigator;

      const caps = await detectRendererCapabilities();

      expect(caps.backend).toBe('webgl2');
      expect(caps.supportsInstancing).toBe(true);
      expect(caps.supportsCompute).toBe(false);
    });

    it('should fallback to WebGL2 when adapter request fails', async () => {
      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(null),
        },
      } as unknown as Navigator;

      const caps = await detectRendererCapabilities();

      expect(caps.backend).toBe('webgl2');
    });

    it('should fallback to WebGL2 when adapter request throws', async () => {
      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockRejectedValue(new Error('GPU not available')),
        },
      } as unknown as Navigator;

      const caps = await detectRendererCapabilities();

      expect(caps.backend).toBe('webgl2');
    });
  });

  describe('initializeRenderer', () => {
    it('should initialize WebGPU renderer successfully', async () => {
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

      const renderer = await initializeRenderer(mockCanvas);

      expect(renderer).toBeDefined();
      expect(renderer.backend).toBe('webgpu');
      if (renderer.backend === 'webgpu') {
        expect(renderer.device).toBeDefined();
      }
      expect(renderer.context).toBeDefined();
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgpu');
    });

    it('should initialize WebGL2 renderer when WebGPU fails', async () => {
      const mockCanvas = createMockCanvas();
      const mockGL2Context = createMockWebGL2Context();

      mockCanvas.getContext = vi.fn().mockImplementation((type) => {
        if (type === 'webgpu') return null;
        if (type === 'webgl2') return mockGL2Context;
        return null;
      });

      globalThis.navigator = {
        gpu: undefined,
      } as unknown as Navigator;

      const renderer = await initializeRenderer(mockCanvas);

      expect(renderer).toBeDefined();
      expect(renderer.backend).toBe('webgl2');
      expect(renderer.context).toBeDefined();
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2', expect.any(Object));
    });

    it('should throw error when no rendering context available', async () => {
      const mockCanvas = createMockCanvas();
      mockCanvas.getContext = vi.fn().mockReturnValue(null);

      globalThis.navigator = {
        gpu: undefined,
      } as unknown as Navigator;

      await expect(initializeRenderer(mockCanvas)).rejects.toThrow(
        'Failed to initialize renderer: No WebGPU or WebGL2 support'
      );
    });

    it('should configure WebGPU context with correct format', async () => {
      const mockCanvas = createMockCanvas();
      const mockAdapter = createMockGPUAdapter();
      const mockContext = {
        configure: vi.fn(),
        getCurrentTexture: vi.fn(),
      };

      mockCanvas.getContext = vi.fn().mockReturnValue(mockContext);

      const preferredFormat = 'bgra8unorm';
      globalThis.navigator = {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue(preferredFormat),
        },
      } as unknown as Navigator;

      await initializeRenderer(mockCanvas);

      expect(mockContext.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          format: preferredFormat,
          alphaMode: 'opaque',
        })
      );
    });
  });
});
