/**
 * WebGPU device initialization with WebGL2 fallback
 */

import type { RendererCapabilities, RendererBackend } from './types';

export interface WebGPURenderer {
  backend: 'webgpu';
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  capabilities: RendererCapabilities;
}

export interface WebGL2Renderer {
  backend: 'webgl2';
  context: WebGL2RenderingContext;
  capabilities: RendererCapabilities;
}

export type Renderer = WebGPURenderer | WebGL2Renderer;

/**
 * Detect available renderer capabilities
 * @returns Renderer capabilities
 */
export async function detectRendererCapabilities(): Promise<RendererCapabilities> {
  // Try WebGPU first
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        return {
          backend: 'webgpu',
          maxTextureSize: 8192, // WebGPU guaranteed minimum
          supportsInstancing: true,
          supportsCompute: true,
        };
      }
    } catch (error) {
      console.warn('WebGPU detection failed:', error);
    }
  }

  // Fallback to WebGL2
  return {
    backend: 'webgl2',
    maxTextureSize: 4096, // WebGL2 guaranteed minimum
    supportsInstancing: true,
    supportsCompute: false,
  };
}

/**
 * Initialize renderer with WebGPU or WebGL2 fallback
 * @param canvas - Canvas element to render to
 * @returns Initialized renderer
 */
export async function initializeRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  // Try WebGPU
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        const context = canvas.getContext('webgpu');

        if (context && device) {
          const format = navigator.gpu.getPreferredCanvasFormat();

          context.configure({
            device,
            format,
            alphaMode: 'opaque',
          });

          return {
            backend: 'webgpu',
            device,
            context,
            format,
            capabilities: {
              backend: 'webgpu',
              maxTextureSize: 8192,
              supportsInstancing: true,
              supportsCompute: true,
            },
          };
        }
      }
    } catch (error) {
      console.warn('WebGPU initialization failed, falling back to WebGL2:', error);
    }
  }

  // Fallback to WebGL2
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: true,
  });

  if (!gl) {
    throw new Error('Failed to initialize renderer: No WebGPU or WebGL2 support');
  }

  return {
    backend: 'webgl2',
    context: gl,
    capabilities: {
      backend: 'webgl2',
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      supportsInstancing: true,
      supportsCompute: false,
    },
  };
}

/**
 * Check if WebGPU is supported
 * @returns True if WebGPU is available
 */
export function isWebGPUSupported(): boolean {
  return !!navigator.gpu;
}

/**
 * Check if WebGL2 is supported
 * @returns True if WebGL2 is available
 */
export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return !!gl;
  } catch {
    return false;
  }
}
