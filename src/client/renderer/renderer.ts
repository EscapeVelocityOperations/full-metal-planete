/**
 * Main hex grid renderer with WebGPU/WebGL2 support
 */

import { initializeRenderer, Renderer as BackendRenderer } from './webgpu';
import { TerrainLayer, TerrainHex } from './terrain-layer';
import { generateHexVertices } from './hex-geometry';
import {
  TideLevel,
  Viewport,
  RendererCapabilities,
  RendererBackend,
  HEX_SIZE,
} from './types';

// Inline terrain shader source
const terrainShaderSource = `
// Vertex attributes
struct VertexInput {
  @location(0) position: vec2f,
}

// Instance attributes
struct InstanceInput {
  @location(1) instancePosition: vec2f,
  @location(2) instanceColor: vec3f,
}

// Uniforms
struct Uniforms {
  viewProjection: mat4x4f,
  zoom: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Vertex shader output
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vertexMain(
  vertex: VertexInput,
  instance: InstanceInput,
) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = vertex.position + instance.instancePosition;
  output.position = uniforms.viewProjection * vec4f(worldPosition, 0.0, 1.0);
  output.color = instance.instanceColor;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}
`;

/**
 * Main hex grid renderer class
 */
export class HexRenderer {
  private backend: BackendRenderer;
  private terrainLayer: TerrainLayer | null = null;
  private viewport: Viewport;
  private pipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;

  private constructor(backend: BackendRenderer) {
    this.backend = backend;
    this.viewport = {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      zoom: 1.0,
    };
  }

  /**
   * Create and initialize renderer
   * @param canvas - Canvas element to render to
   * @returns Initialized renderer instance
   */
  static async create(canvas: HTMLCanvasElement): Promise<HexRenderer> {
    const backend = await initializeRenderer(canvas);
    const renderer = new HexRenderer(backend);

    if (backend.backend === 'webgpu') {
      await renderer.initializeWebGPU();
    }

    return renderer;
  }

  /**
   * Initialize WebGPU pipeline and resources
   */
  private async initializeWebGPU(): Promise<void> {
    if (this.backend.backend !== 'webgpu') {
      return;
    }

    const { device } = this.backend;

    // Create hex vertex buffer (6 vertices)
    const hexVertices = generateHexVertices(HEX_SIZE);
    const vertexData = new Float32Array(hexVertices.flat());

    this.vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });

    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();

    // Create uniform buffer for view-projection matrix
    this.uniformBuffer = device.createBuffer({
      size: 80, // mat4x4 (64 bytes) + float (4 bytes) + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create shader module
    const shaderModule = device.createShaderModule({
      code: terrainShaderSource,
    });

    // Create pipeline
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          // Vertex buffer (hex geometry)
          {
            arrayStride: 8, // 2 floats
            stepMode: 'vertex',
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
          // Instance buffer (position + color)
          {
            arrayStride: 20, // 5 floats (2 position + 3 color)
            stepMode: 'instance',
            attributes: [
              {
                shaderLocation: 1,
                offset: 0,
                format: 'float32x2', // position
              },
              {
                shaderLocation: 2,
                offset: 8,
                format: 'float32x3', // color
              },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: this.backend.format,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    // Create bind group
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer,
          },
        },
      ],
    });
  }

  /**
   * Set terrain data for rendering
   * @param terrainHexes - Array of terrain hex data
   */
  setTerrainData(terrainHexes: TerrainHex[]): void {
    if (this.backend.backend !== 'webgpu') {
      return;
    }

    // Clean up old terrain layer
    if (this.terrainLayer) {
      this.terrainLayer.destroy();
    }

    // Create new terrain layer
    this.terrainLayer = new TerrainLayer(this.backend.device, terrainHexes);
  }

  /**
   * Update tide level
   * @param tide - New tide level
   */
  setTide(tide: TideLevel): void {
    if (this.terrainLayer) {
      this.terrainLayer.updateTide(tide);
    }
  }

  /**
   * Update viewport/camera
   * @param viewport - New viewport settings
   */
  setViewport(viewport: Partial<Viewport>): void {
    this.viewport = { ...this.viewport, ...viewport };
    this.updateUniformBuffer();
  }

  /**
   * Update uniform buffer with current viewport
   */
  private updateUniformBuffer(): void {
    if (this.backend.backend !== 'webgpu' || !this.uniformBuffer) {
      return;
    }

    const { device } = this.backend;

    // Calculate visible world area based on zoom
    // zoom < 1 means we see MORE of the world (zoom out)
    // zoom > 1 means we see LESS of the world (zoom in)
    const visibleWidth = this.viewport.width / this.viewport.zoom;
    const visibleHeight = this.viewport.height / this.viewport.zoom;

    // Orthographic projection centered on camera position
    // Note: Y is flipped (negative scale) to match screen coordinates (Y down)
    const left = this.viewport.x - visibleWidth / 2;
    const right = this.viewport.x + visibleWidth / 2;
    const bottom = this.viewport.y + visibleHeight / 2; // Swapped for Y-flip
    const top = this.viewport.y - visibleHeight / 2;    // Swapped for Y-flip

    // Orthographic projection matrix (maps world coords to NDC)
    const viewProjection = new Float32Array([
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,  // This will be negative, flipping Y
      0, 0, -1, 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), 0, 1,
    ]);

    // Write to uniform buffer
    const uniformData = new Float32Array(20); // 16 + 1 + 3 padding
    uniformData.set(viewProjection, 0);
    uniformData[16] = this.viewport.zoom;

    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  /**
   * Render the current frame
   */
  render(): void {
    if (this.backend.backend !== 'webgpu') {
      return; // WebGL2 rendering not yet implemented
    }

    if (!this.pipeline || !this.terrainLayer || !this.vertexBuffer || !this.bindGroup) {
      return;
    }

    const { device, context } = this.backend;
    const instanceBuffer = this.terrainLayer.getInstanceBuffer();

    if (!instanceBuffer) {
      return;
    }

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setVertexBuffer(1, instanceBuffer);
    renderPass.draw(18, this.terrainLayer.hexCount); // 18 vertices per hex (6 triangles), N instances

    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Get renderer capabilities
   * @returns Renderer capabilities
   */
  getCapabilities(): RendererCapabilities {
    return this.backend.capabilities;
  }

  /**
   * Get current backend type
   * @returns Backend type
   */
  getBackend(): RendererBackend {
    return this.backend.backend;
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    if (this.terrainLayer) {
      this.terrainLayer.destroy();
      this.terrainLayer = null;
    }

    if (this.vertexBuffer) {
      this.vertexBuffer.destroy();
      this.vertexBuffer = null;
    }

    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
      this.uniformBuffer = null;
    }

    if (this.backend.backend === 'webgpu') {
      this.backend.device.destroy();
    }
  }
}
