/**
 * CSS-based hex grid renderer using HTML elements and sprites
 * Alternative to WebGPU/WebGL renderer for broader compatibility
 */

import { axialToPixel } from '../hex-geometry';
import type { TerrainHex } from '../terrain-layer';
import {
  TideLevel,
  Viewport,
  RendererCapabilities,
  RendererBackend,
  HEX_SIZE,
  TerrainType,
  TERRAIN_COLORS,
} from '../types';

// CSS color helpers
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getTerrainColorHex(terrainType: TerrainType, tide: TideLevel): string {
  let color: [number, number, number];

  switch (terrainType) {
    case TerrainType.Land:
      color = TERRAIN_COLORS.land;
      break;
    case TerrainType.Sea:
      color = TERRAIN_COLORS.sea;
      break;
    case TerrainType.Mountain:
      color = TERRAIN_COLORS.mountain;
      break;
    case TerrainType.Marsh:
      // Marsh: land at low/normal, sea at high
      color = tide === TideLevel.High ? TERRAIN_COLORS.sea : TERRAIN_COLORS.land;
      break;
    case TerrainType.Reef:
      // Reef: land at low, sea at normal/high
      color = tide === TideLevel.Low ? TERRAIN_COLORS.land : TERRAIN_COLORS.sea;
      break;
    default:
      color = TERRAIN_COLORS.land;
  }

  return rgbToHex(color[0], color[1], color[2]);
}

/**
 * CSS-based hex renderer using DOM elements
 */
export class CSSHexRenderer {
  private container: HTMLDivElement;
  private gridContainer: HTMLDivElement;
  private terrainHexes: TerrainHex[] = [];
  private hexElements: Map<string, HTMLDivElement> = new Map();
  private currentTide: TideLevel = TideLevel.Normal;
  private viewport: Viewport;
  private useSpriteMode: boolean = false;

  constructor(parentElement: HTMLElement) {
    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'css-hex-renderer';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0a0a0a;
    `;

    // Create grid container (this will be transformed for pan/zoom)
    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'hex-grid';
    this.gridContainer.style.cssText = `
      position: absolute;
      transform-origin: center center;
      will-change: transform;
    `;

    this.container.appendChild(this.gridContainer);
    parentElement.appendChild(this.container);

    // Initialize viewport
    this.viewport = {
      x: 0,
      y: 0,
      width: parentElement.clientWidth || 800,
      height: parentElement.clientHeight || 600,
      zoom: 1.0,
    };

    // Inject CSS styles for hexagons
    this.injectStyles();
  }

  /**
   * Inject CSS styles for hex elements
   */
  private injectStyles(): void {
    const styleId = 'css-hex-renderer-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .hex-cell {
        position: absolute;
        width: ${HEX_SIZE * 2}px;
        height: ${HEX_SIZE * Math.sqrt(3)}px;
        clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
        transition: background-color 0.3s ease;
        will-change: transform;
      }

      .hex-cell.sprite-mode {
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }

      .hex-cell:hover {
        filter: brightness(1.2);
      }

      .hex-cell .hex-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Create renderer from canvas element (compatibility with HexRenderer API)
   */
  static async create(canvas: HTMLCanvasElement): Promise<CSSHexRenderer> {
    // Hide the canvas and use its parent for our DOM-based renderer
    canvas.style.display = 'none';
    const parent = canvas.parentElement || document.body;
    return new CSSHexRenderer(parent);
  }

  /**
   * Set terrain data for rendering
   */
  setTerrainData(terrainHexes: TerrainHex[]): void {
    this.terrainHexes = terrainHexes;
    this.rebuildGrid();
  }

  /**
   * Rebuild the entire hex grid
   */
  private rebuildGrid(): void {
    // Clear existing elements
    this.gridContainer.innerHTML = '';
    this.hexElements.clear();

    // Create hex elements
    for (const hex of this.terrainHexes) {
      const element = this.createHexElement(hex);
      const key = `${hex.coord.q},${hex.coord.r}`;
      this.hexElements.set(key, element);
      this.gridContainer.appendChild(element);
    }

    this.updateViewport();
  }

  /**
   * Create a single hex element
   */
  private createHexElement(hex: TerrainHex): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'hex-cell';
    element.dataset.q = String(hex.coord.q);
    element.dataset.r = String(hex.coord.r);
    element.dataset.terrain = hex.type;

    // Calculate pixel position
    const pos = axialToPixel(hex.coord.q, hex.coord.r, HEX_SIZE);

    // Position the hex (offset by half width/height to center on position)
    const hexWidth = HEX_SIZE * 2;
    const hexHeight = HEX_SIZE * Math.sqrt(3);
    element.style.left = `${pos.x - hexWidth / 2}px`;
    element.style.top = `${pos.y - hexHeight / 2}px`;

    // Set color based on terrain type and tide
    if (this.useSpriteMode) {
      element.classList.add('sprite-mode');
      element.style.backgroundImage = `url(/sprites/terrain/${hex.type}.png)`;
    } else {
      element.style.backgroundColor = getTerrainColorHex(hex.type, this.currentTide);
    }

    return element;
  }

  /**
   * Update tide level
   */
  setTide(tide: TideLevel): void {
    if (this.currentTide === tide) return;
    this.currentTide = tide;

    // Update all hex colors
    for (const hex of this.terrainHexes) {
      const key = `${hex.coord.q},${hex.coord.r}`;
      const element = this.hexElements.get(key);
      if (element && !this.useSpriteMode) {
        element.style.backgroundColor = getTerrainColorHex(hex.type, this.currentTide);
      }
    }
  }

  /**
   * Update viewport/camera
   */
  setViewport(viewport: Partial<Viewport>): void {
    this.viewport = { ...this.viewport, ...viewport };
    this.updateViewport();
  }

  /**
   * Apply viewport transform to grid container
   */
  private updateViewport(): void {
    const { x, y, width, height, zoom } = this.viewport;

    // Calculate the transform to center the camera position in the viewport
    // The camera position (x, y) should be at the center of the screen
    const translateX = width / 2 - x * zoom;
    const translateY = height / 2 - y * zoom;

    this.gridContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoom})`;
  }

  /**
   * Enable or disable sprite mode
   */
  setSpriteMode(enabled: boolean): void {
    this.useSpriteMode = enabled;
    // Rebuild grid to apply sprite mode
    if (this.terrainHexes.length > 0) {
      this.rebuildGrid();
    }
  }

  /**
   * Render frame (no-op for CSS renderer - browser handles rendering)
   */
  render(): void {
    // CSS rendering is handled by the browser's paint cycle
    // This method exists for API compatibility with HexRenderer
  }

  /**
   * Get renderer capabilities
   */
  getCapabilities(): RendererCapabilities {
    return {
      backend: 'webgl2' as RendererBackend, // Report as fallback renderer
      maxTextureSize: 4096,
      supportsInstancing: false,
      supportsCompute: false,
    };
  }

  /**
   * Get current backend type
   */
  getBackend(): RendererBackend {
    return 'webgl2'; // Report as fallback (CSS is an alternative to WebGL2)
  }

  /**
   * Get the actual viewport size from the container
   */
  getViewportSize(): { width: number; height: number } {
    return {
      width: this.container.clientWidth || 800,
      height: this.container.clientHeight || 600,
    };
  }

  /**
   * Get hex element at coordinates
   */
  getHexElement(q: number, r: number): HTMLDivElement | undefined {
    return this.hexElements.get(`${q},${r}`);
  }

  /**
   * Add click handler to all hex elements
   */
  onHexClick(callback: (coord: { q: number; r: number }) => void): void {
    this.gridContainer.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('hex-cell')) {
        const q = parseInt(target.dataset.q || '0', 10);
        const r = parseInt(target.dataset.r || '0', 10);
        callback({ q, r });
      }
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.container.remove();
    this.hexElements.clear();
  }
}
