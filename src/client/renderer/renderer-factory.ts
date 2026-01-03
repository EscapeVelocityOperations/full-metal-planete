/**
 * Renderer factory for creating the appropriate renderer based on capability/preference
 */

import { HexRenderer } from './renderer';
import { CSSHexRenderer } from './css/css-renderer';
import type { TerrainHex } from './terrain-layer';
import type { TideLevel, Viewport, RendererCapabilities, RendererBackend } from './types';
import type { Unit } from '@/shared/game/types';

/**
 * Unified renderer interface
 */
export interface IHexRenderer {
  setTerrainData(terrainHexes: TerrainHex[]): void;
  setUnits?(units: Unit[]): void;
  setPlayerColors?(playerColors: Record<string, string>): void;
  setMinerals?(minerals: Array<{ id: string; position: { q: number; r: number } }>): void;
  setTide(tide: TideLevel): void;
  setViewport(viewport: Partial<Viewport>): void;
  render(): void;
  getCapabilities(): RendererCapabilities;
  getBackend(): RendererBackend;
  getViewportSize(): { width: number; height: number };
  destroy(): void;

  // Zoom control methods (optional - may not be implemented by all renderers)
  zoomIn?(): void;
  zoomOut?(): void;
  zoomToFit?(): void;
  centerMap?(): void;
  getZoom?(): number;
  onZoomChange?(callback: (zoom: number) => void): void;
  offZoomChange?(callback: (zoom: number) => void): void;

  // Input handling (optional - CSS renderer uses DOM events)
  onHexClick?(callback: (coord: { q: number; r: number }) => void): void;
  onHexRightClick?(callback: (coord: { q: number; r: number }) => void): void;

  // Hex highlighting for combat/movement visualization
  setHighlightedHexes?(
    hexes: Array<{ q: number; r: number }>,
    type: 'range' | 'target' | 'selected' | 'danger' | 'crossfire' | 'underfire-1' | 'underfire-2'
  ): void;
  clearHighlights?(): void;

  // Under-fire zone visualization
  setUnderFireZones?(coverageMap: Map<string, { count: number; sourceUnits: string[] }>): void;
  clearUnderFireZones?(): void;

  // Unit selection highlighting
  setUnitSelected?(unitId: string, selected: boolean): void;
  clearUnitSelections?(): void;
}

export type RendererType = 'auto' | 'webgpu' | 'css';

/**
 * Check if WebGPU is available
 */
async function isWebGPUAvailable(): Promise<boolean> {
  if (!navigator.gpu) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Create a renderer based on the specified type or auto-detect best available
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  type: RendererType = 'auto'
): Promise<IHexRenderer> {
  // Force CSS renderer if explicitly requested
  if (type === 'css') {
    console.log('Using CSS renderer (forced)');
    return CSSHexRenderer.create(canvas);
  }

  // Force WebGPU if explicitly requested
  if (type === 'webgpu') {
    console.log('Using WebGPU renderer (forced)');
    return HexRenderer.create(canvas);
  }

  // Auto-detect: try WebGPU first, fall back to CSS
  if (await isWebGPUAvailable()) {
    try {
      console.log('WebGPU available, attempting to initialize...');
      const renderer = await HexRenderer.create(canvas);
      console.log('WebGPU renderer initialized successfully');
      return renderer;
    } catch (error) {
      console.warn('WebGPU initialization failed, falling back to CSS renderer:', error);
    }
  } else {
    console.log('WebGPU not available, using CSS renderer');
  }

  return CSSHexRenderer.create(canvas);
}

/**
 * Adapter class that wraps either renderer type
 * This is useful if you want to swap renderers at runtime
 */
export class RendererAdapter implements IHexRenderer {
  private renderer: IHexRenderer;

  constructor(renderer: IHexRenderer) {
    this.renderer = renderer;
  }

  setTerrainData(terrainHexes: TerrainHex[]): void {
    this.renderer.setTerrainData(terrainHexes);
  }

  setTide(tide: TideLevel): void {
    this.renderer.setTide(tide);
  }

  setViewport(viewport: Partial<Viewport>): void {
    this.renderer.setViewport(viewport);
  }

  render(): void {
    this.renderer.render();
  }

  getCapabilities(): RendererCapabilities {
    return this.renderer.getCapabilities();
  }

  getBackend(): RendererBackend {
    return this.renderer.getBackend();
  }

  getViewportSize(): { width: number; height: number } {
    return this.renderer.getViewportSize();
  }

  destroy(): void {
    this.renderer.destroy();
  }

  /**
   * Get the underlying renderer instance
   */
  getRenderer(): IHexRenderer {
    return this.renderer;
  }
}
