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
import type { Unit, PlayerColor } from '@/shared/game/types';
import { UnitType, PlayerColor as PlayerColorEnum } from '@/shared/game/types';

// Zoom configuration
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

// Safari/WebKit GestureEvent interface (not in standard DOM types)
interface GestureEvent extends UIEvent {
  scale: number;
  rotation: number;
}

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

// Unit type to symbol mapping
const UNIT_SYMBOLS: Record<UnitType, string> = {
  [UnitType.Astronef]: '\u25C6', // Diamond
  [UnitType.Tower]: '\u25B2', // Triangle up
  [UnitType.Tank]: '\u25A0', // Square
  [UnitType.SuperTank]: '\u25A0\u25A0', // Double square
  [UnitType.MotorBoat]: '\u25BA', // Triangle right
  [UnitType.Barge]: '\u25AC', // Rectangle
  [UnitType.Crab]: '\u2739', // Star
  [UnitType.Converter]: '\u25CE', // Bullseye
  [UnitType.Bridge]: '\u2550', // Double horizontal
};

// Player color to CSS color mapping
const PLAYER_COLORS: Record<string, string> = {
  red: '#ff4444',
  blue: '#4444ff',
  green: '#44ff44',
  yellow: '#ffff44',
};

/**
 * CSS-based hex renderer using DOM elements
 */
export class CSSHexRenderer {
  private container: HTMLDivElement;
  private gridContainer: HTMLDivElement;
  private unitsContainer: HTMLDivElement;
  private terrainHexes: TerrainHex[] = [];
  private hexElements: Map<string, HTMLDivElement> = new Map();
  private units: Unit[] = [];
  private unitElements: Map<string, HTMLDivElement> = new Map();
  private currentTide: TideLevel = TideLevel.Normal;
  private viewport: Viewport;
  private useSpriteMode: boolean = false;
  private mapBounds: { minX: number; minY: number; maxX: number; maxY: number } = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private zoomChangeCallbacks: Set<(zoom: number) => void> = new Set();

  constructor(parentElement: HTMLElement) {
    // Create main container with scrollbars
    this.container = document.createElement('div');
    this.container.className = 'css-hex-renderer';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
      background: #0a0a0a;
      z-index: 0;
    `;

    // Create grid container (this will be scaled for zoom)
    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'hex-grid';
    this.gridContainer.style.cssText = `
      position: relative;
      transform-origin: 0 0;
      will-change: transform;
    `;

    // Create units container (sits on top of hex grid)
    this.unitsContainer = document.createElement('div');
    this.unitsContainer.className = 'units-layer';
    this.unitsContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;
    this.gridContainer.appendChild(this.unitsContainer);

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

    // Set up gesture-based zoom (pinch for trackpad/touch, scrollbars for panning)
    this.setupGestureZoom();
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

      .unit-marker {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        font-weight: bold;
        text-shadow:
          1px 1px 2px rgba(0,0,0,0.8),
          -1px -1px 2px rgba(0,0,0,0.8),
          1px -1px 2px rgba(0,0,0,0.8),
          -1px 1px 2px rgba(0,0,0,0.8);
        pointer-events: none;
        z-index: 10;
      }

      .unit-marker.astronef {
        font-size: 32px;
      }

      .unit-marker.tower {
        font-size: 20px;
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
   * Set up gesture-based zoom (pinch-to-zoom for trackpad/touch)
   * Two-finger scrolling is handled natively by overflow:auto
   */
  private setupGestureZoom(): void {
    // Track touch points for pinch-to-zoom
    let initialPinchDistance = 0;
    let initialZoom = 1;

    // Safari/macOS trackpad gesture events (gesturestart, gesturechange, gestureend)
    this.container.addEventListener('gesturestart', ((event: GestureEvent) => {
      event.preventDefault();
      initialZoom = this.viewport.zoom;
    }) as EventListener);

    this.container.addEventListener('gesturechange', ((event: GestureEvent) => {
      event.preventDefault();
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialZoom * event.scale));

      if (newZoom !== this.viewport.zoom) {
        this.viewport.zoom = newZoom;
        this.updateViewport();
        this.zoomChangeCallbacks.forEach(cb => cb(newZoom));
      }
    }) as EventListener);

    this.container.addEventListener('gestureend', ((event: GestureEvent) => {
      event.preventDefault();
    }) as EventListener);

    // Touch events for mobile pinch-to-zoom
    this.container.addEventListener('touchstart', (event: TouchEvent) => {
      if (event.touches.length === 2) {
        // Calculate initial distance between two fingers
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        initialZoom = this.viewport.zoom;
      }
    }, { passive: true });

    this.container.addEventListener('touchmove', (event: TouchEvent) => {
      if (event.touches.length === 2 && initialPinchDistance > 0) {
        // Calculate current distance between two fingers
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        // Calculate zoom scale based on pinch ratio
        const scale = currentDistance / initialPinchDistance;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialZoom * scale));

        if (newZoom !== this.viewport.zoom) {
          this.viewport.zoom = newZoom;
          this.updateViewport();
          this.zoomChangeCallbacks.forEach(cb => cb(newZoom));
        }
      }
    }, { passive: true });

    this.container.addEventListener('touchend', () => {
      initialPinchDistance = 0;
    }, { passive: true });
  }

  /**
   * Set terrain data for rendering
   */
  setTerrainData(terrainHexes: TerrainHex[]): void {
    this.terrainHexes = terrainHexes;
    this.calculateMapBounds();
    this.rebuildGrid();
  }

  /**
   * Set units for rendering
   */
  setUnits(units: Unit[]): void {
    this.units = units;
    console.log('CSSHexRenderer.setUnits called with', units.length, 'units');
    this.rebuildUnits();
  }

  /**
   * Rebuild the unit layer
   */
  private rebuildUnits(): void {
    // Clear existing unit elements
    this.unitsContainer.innerHTML = '';
    this.unitElements.clear();

    // Create unit elements
    for (const unit of this.units) {
      const element = this.createUnitElement(unit);
      this.unitElements.set(unit.id, element);
      this.unitsContainer.appendChild(element);
    }
  }

  /**
   * Create a single unit element
   */
  private createUnitElement(unit: Unit): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `unit-marker ${unit.type}`;
    element.dataset.unitId = unit.id;
    element.dataset.unitType = unit.type;
    element.dataset.owner = unit.owner;

    // Get symbol and color
    const symbol = UNIT_SYMBOLS[unit.type] || '?';
    // Extract player color from owner (e.g., "player-red" -> "red")
    const ownerColor = unit.owner.replace('player-', '');
    const color = PLAYER_COLORS[ownerColor] || '#ffffff';

    element.textContent = symbol;
    element.style.color = color;

    // Calculate pixel position
    const pos = axialToPixel(unit.position.q, unit.position.r, HEX_SIZE);

    // Position the unit at hex center
    const hexWidth = HEX_SIZE * 2;
    const hexHeight = HEX_SIZE * Math.sqrt(3);
    element.style.left = `${pos.x - hexWidth / 2}px`;
    element.style.top = `${pos.y - hexHeight / 2}px`;
    element.style.width = `${hexWidth}px`;
    element.style.height = `${hexHeight}px`;

    return element;
  }

  /**
   * Calculate the bounding box of the map in pixel coordinates
   */
  private calculateMapBounds(): void {
    if (this.terrainHexes.length === 0) {
      this.mapBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const hexWidth = HEX_SIZE * 2;
    const hexHeight = HEX_SIZE * Math.sqrt(3);

    for (const hex of this.terrainHexes) {
      const pos = axialToPixel(hex.coord.q, hex.coord.r, HEX_SIZE);
      minX = Math.min(minX, pos.x - hexWidth / 2);
      minY = Math.min(minY, pos.y - hexHeight / 2);
      maxX = Math.max(maxX, pos.x + hexWidth / 2);
      maxY = Math.max(maxY, pos.y + hexHeight / 2);
    }

    // Add padding
    const padding = HEX_SIZE;
    this.mapBounds = {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
    };
  }

  /**
   * Rebuild the entire hex grid
   */
  private rebuildGrid(): void {
    // Clear existing hex elements (but preserve unitsContainer)
    this.hexElements.forEach((el) => el.remove());
    this.hexElements.clear();

    // Create hex elements
    for (const hex of this.terrainHexes) {
      const element = this.createHexElement(hex);
      const key = `${hex.coord.q},${hex.coord.r}`;
      this.hexElements.set(key, element);
      // Insert before unitsContainer so units render on top
      this.gridContainer.insertBefore(element, this.unitsContainer);
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
      element.style.backgroundImage = `url(/sprites/terrain/${hex.type}.svg)`;
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
    const { zoom } = this.viewport;

    // Calculate map dimensions
    const mapWidth = this.mapBounds.maxX - this.mapBounds.minX;
    const mapHeight = this.mapBounds.maxY - this.mapBounds.minY;

    // Set grid container size based on zoom (this enables scrollbars)
    const scaledWidth = mapWidth * zoom;
    const scaledHeight = mapHeight * zoom;

    this.gridContainer.style.width = `${scaledWidth}px`;
    this.gridContainer.style.height = `${scaledHeight}px`;
    this.gridContainer.style.transform = `scale(${zoom})`;
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
      const hexCell = target.closest('.hex-cell') as HTMLElement | null;
      if (hexCell) {
        const q = parseInt(hexCell.dataset.q || '0', 10);
        const r = parseInt(hexCell.dataset.r || '0', 10);
        console.log('CSS Renderer hex click:', { q, r });
        callback({ q, r });
      }
    });
  }

  /**
   * Add right-click handler to all hex elements
   */
  onHexRightClick(callback: (coord: { q: number; r: number }) => void): void {
    this.gridContainer.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const target = event.target as HTMLElement;
      const hexCell = target.closest('.hex-cell') as HTMLElement | null;
      if (hexCell) {
        const q = parseInt(hexCell.dataset.q || '0', 10);
        const r = parseInt(hexCell.dataset.r || '0', 10);
        console.log('CSS Renderer hex right-click:', { q, r });
        callback({ q, r });
      }
    });
  }

  /**
   * Zoom in by one step
   */
  zoomIn(): void {
    const newZoom = Math.min(MAX_ZOOM, this.viewport.zoom + ZOOM_STEP);
    if (newZoom !== this.viewport.zoom) {
      this.viewport.zoom = newZoom;
      this.updateViewport();
      this.zoomChangeCallbacks.forEach(cb => cb(newZoom));
    }
  }

  /**
   * Zoom out by one step
   */
  zoomOut(): void {
    const newZoom = Math.max(MIN_ZOOM, this.viewport.zoom - ZOOM_STEP);
    if (newZoom !== this.viewport.zoom) {
      this.viewport.zoom = newZoom;
      this.updateViewport();
      this.zoomChangeCallbacks.forEach(cb => cb(newZoom));
    }
  }

  /**
   * Reset zoom to fit the map in the viewport
   */
  zoomToFit(): void {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const mapWidth = this.mapBounds.maxX - this.mapBounds.minX;
    const mapHeight = this.mapBounds.maxY - this.mapBounds.minY;

    if (mapWidth > 0 && mapHeight > 0) {
      const zoomX = (containerWidth * 0.95) / mapWidth;
      const zoomY = (containerHeight * 0.95) / mapHeight;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomX, zoomY)));

      this.viewport.zoom = newZoom;
      this.updateViewport();
      this.zoomChangeCallbacks.forEach(cb => cb(newZoom));

      // Center the map
      this.centerMap();
    }
  }

  /**
   * Center the map in the viewport
   */
  centerMap(): void {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const mapWidth = (this.mapBounds.maxX - this.mapBounds.minX) * this.viewport.zoom;
    const mapHeight = (this.mapBounds.maxY - this.mapBounds.minY) * this.viewport.zoom;

    // Calculate scroll position to center the map
    const scrollX = Math.max(0, (mapWidth - containerWidth) / 2);
    const scrollY = Math.max(0, (mapHeight - containerHeight) / 2);

    this.container.scrollLeft = scrollX;
    this.container.scrollTop = scrollY;
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.viewport.zoom;
  }

  /**
   * Register a callback for zoom changes
   */
  onZoomChange(callback: (zoom: number) => void): void {
    this.zoomChangeCallbacks.add(callback);
  }

  /**
   * Unregister a zoom change callback
   */
  offZoomChange(callback: (zoom: number) => void): void {
    this.zoomChangeCallbacks.delete(callback);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.container.remove();
    this.hexElements.clear();
    this.unitElements.clear();
    this.zoomChangeCallbacks.clear();
  }
}
