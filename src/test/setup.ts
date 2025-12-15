// Vitest global setup
import { expect, vi } from 'vitest';

// Mock WebGPU API for testing
globalThis.navigator = globalThis.navigator || ({} as Navigator);
Object.defineProperty(globalThis.navigator, 'gpu', { value: undefined, writable: true });

// Mock WebGPU globals
(globalThis as unknown as { GPUBufferUsage: Record<string, number> }).GPUBufferUsage = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
};

// Helper to create mock WebGPU adapter
export function createMockGPUAdapter(): GPUAdapter {
  return {
    features: new Set(),
    limits: {} as GPUSupportedLimits,
    isFallbackAdapter: false,
    requestDevice: vi.fn().mockResolvedValue(createMockGPUDevice()),
  } as unknown as GPUAdapter;
}

// Helper to create mock WebGPU device
export function createMockGPUDevice(): GPUDevice {
  const mockBuffer = {
    destroy: vi.fn(),
    getMappedRange: vi.fn().mockReturnValue(new ArrayBuffer(1024)),
    unmap: vi.fn(),
  };

  const mockBindGroupLayout = {
    label: 'mock bind group layout',
  };

  const mockPipeline = {
    getBindGroupLayout: vi.fn().mockReturnValue(mockBindGroupLayout),
  };

  return {
    features: new Set(),
    limits: {} as GPUSupportedLimits,
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn(),
    },
    createBuffer: vi.fn().mockReturnValue(mockBuffer),
    createShaderModule: vi.fn(),
    createRenderPipeline: vi.fn().mockReturnValue(mockPipeline),
    createBindGroup: vi.fn(),
    createCommandEncoder: vi.fn(),
    destroy: vi.fn(),
  } as unknown as GPUDevice;
}

// Helper to create mock WebGL2 context
export function createMockWebGL2Context(): WebGL2RenderingContext {
  const context = {
    MAX_TEXTURE_SIZE: 0x0D33,
    createBuffer: vi.fn(),
    createProgram: vi.fn(),
    createShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn(),
    getAttribLocation: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bufferData: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
    drawArraysInstanced: vi.fn(),
    viewport: vi.fn(),
    getParameter: vi.fn((param: number) => {
      if (param === 0x0D33) return 4096; // MAX_TEXTURE_SIZE
      return 0;
    }),
  } as unknown as WebGL2RenderingContext;

  return context;
}

// Helper to create mock canvas
export function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    getContext: vi.fn(),
  } as unknown as HTMLCanvasElement;
}
