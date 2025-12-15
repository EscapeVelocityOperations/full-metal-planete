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
import type { Unit, PlayerColor, Mineral, HexCoord } from '@/shared/game/types';
import { UnitType, PlayerColor as PlayerColorEnum, UNIT_SHAPES } from '@/shared/game/types';
import { getUnitFootprint } from '@/shared/game/hex';
import { canCollectMineral } from '@/shared/game/terrain';

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

// Unit type to symbol mapping (for non-sprite mode)
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

// Unit type to sprite filename mapping
const UNIT_SPRITE_NAMES: Record<UnitType, string> = {
  [UnitType.Astronef]: 'astronef',
  [UnitType.Tower]: 'tower',
  [UnitType.Tank]: 'tank',
  [UnitType.SuperTank]: 'supertank',
  [UnitType.MotorBoat]: 'motorboat',
  [UnitType.Barge]: 'barge',
  [UnitType.Crab]: 'crab',
  [UnitType.Converter]: 'converter',
  [UnitType.Bridge]: 'bridge',
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
  private mineralsContainer: HTMLDivElement;
  private terrainHexes: TerrainHex[] = [];
  private hexElements: Map<string, HTMLDivElement> = new Map();
  private units: Unit[] = [];
  private unitElements: Map<string, HTMLDivElement> = new Map();
  private minerals: Mineral[] = [];
  private mineralElements: Map<string, HTMLDivElement> = new Map();
  private playerColors: Record<string, string> = {};
  private currentTide: TideLevel = TideLevel.Normal;
  private viewport: Viewport;
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

    // Create minerals container (sits between terrain and units)
    this.mineralsContainer = document.createElement('div');
    this.mineralsContainer.className = 'minerals-layer';
    this.mineralsContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;
    this.gridContainer.appendChild(this.mineralsContainer);

    // Create units container (sits on top of hex grid and minerals)
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
        background-size: 100% 100%;
        background-repeat: no-repeat;
        background-position: center;
        clip-path: none;  /* SVG sprites already have hex shape */
      }

      .hex-cell:hover {
        filter: brightness(1.2);
      }

      /* Marsh indicator - diagonal stripes pattern */
      .hex-cell.terrain-marsh::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: repeating-linear-gradient(
          45deg,
          rgba(100, 180, 100, 0.35),
          rgba(100, 180, 100, 0.35) 3px,
          transparent 3px,
          transparent 8px
        );
        pointer-events: none;
      }

      /* Reef indicator - dotted/rocky pattern */
      .hex-cell.terrain-reef::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background:
          radial-gradient(circle at 20% 30%, rgba(150, 100, 50, 0.5) 2px, transparent 2px),
          radial-gradient(circle at 60% 20%, rgba(150, 100, 50, 0.5) 2px, transparent 2px),
          radial-gradient(circle at 40% 60%, rgba(150, 100, 50, 0.5) 2px, transparent 2px),
          radial-gradient(circle at 80% 50%, rgba(150, 100, 50, 0.5) 2px, transparent 2px),
          radial-gradient(circle at 30% 80%, rgba(150, 100, 50, 0.5) 2px, transparent 2px),
          radial-gradient(circle at 70% 75%, rgba(150, 100, 50, 0.5) 2px, transparent 2px);
        pointer-events: none;
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

      /* Unit sprite mode */
      .unit-marker.sprite-mode {
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }

      .unit-marker.sprite-mode .unit-sprite {
        width: 100%;
        height: 100%;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }

      /* Hex highlight styles for combat/movement */
      .hex-cell.highlight-range {
        box-shadow: inset 0 0 0 3px rgba(74, 144, 226, 0.7);
      }

      .hex-cell.highlight-range::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(74, 144, 226, 0.2);
        pointer-events: none;
      }

      .hex-cell.highlight-target {
        box-shadow: inset 0 0 0 4px rgba(255, 100, 100, 0.9);
        animation: pulse-target 0.8s ease-in-out infinite;
      }

      .hex-cell.highlight-target::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 100, 100, 0.3);
        pointer-events: none;
      }

      .hex-cell.highlight-selected {
        box-shadow: inset 0 0 0 4px rgba(100, 255, 100, 0.9);
      }

      .hex-cell.highlight-selected::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(100, 255, 100, 0.25);
        pointer-events: none;
      }

      .hex-cell.highlight-danger {
        box-shadow: inset 0 0 0 3px rgba(255, 200, 0, 0.8);
      }

      .hex-cell.highlight-danger::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 200, 0, 0.15);
        pointer-events: none;
      }

      /* Crossfire zone - hexes covered by 2+ friendly units (green) */
      .hex-cell.highlight-crossfire {
        box-shadow: inset 0 0 0 4px rgba(100, 200, 100, 0.9);
      }

      .hex-cell.highlight-crossfire::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(100, 200, 100, 0.35);
        pointer-events: none;
      }

      @keyframes pulse-target {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      /* Unit selection highlight */
      .unit-container.selected .unit-marker {
        filter: brightness(1.3) drop-shadow(0 0 8px rgba(100, 255, 100, 0.8));
      }

      /* Mineral indicators */
      .mineral-marker {
        position: absolute;
        width: 16px;
        height: 16px;
        background: radial-gradient(circle at 30% 30%, #ff8c4a, #e55a3c 60%, #b33a1c);
        border-radius: 50%;
        box-shadow:
          0 2px 4px rgba(0, 0, 0, 0.4),
          inset 0 -2px 4px rgba(0, 0, 0, 0.3),
          inset 0 2px 4px rgba(255, 200, 150, 0.4);
        pointer-events: none;
        z-index: 5;
        transition: opacity 0.3s ease, filter 0.3s ease;
      }

      /* Mineral underwater (on flooded terrain) */
      .mineral-marker.underwater {
        opacity: 0.4;
        filter: blur(1px) saturate(0.7);
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
   * Set player ID to color mapping (e.g., { "p1-abc123": "red", "p2-xyz789": "blue" })
   */
  setPlayerColors(playerColors: Record<string, string>): void {
    this.playerColors = playerColors;
    // Rebuild units if we already have units loaded
    if (this.units.length > 0) {
      this.rebuildUnits();
    }
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
   * Set minerals for rendering
   */
  setMinerals(minerals: Mineral[]): void {
    this.minerals = minerals;
    console.log('CSSHexRenderer.setMinerals called with', minerals.length, 'minerals');
    this.rebuildMinerals();
  }

  /**
   * Rebuild the minerals layer
   */
  private rebuildMinerals(): void {
    // Clear existing mineral elements
    this.mineralsContainer.innerHTML = '';
    this.mineralElements.clear();

    // Create mineral elements for minerals on the map (not loaded in cargo)
    // Minerals in cargo have position { q: -999, r: -999 }
    for (const mineral of this.minerals) {
      if (mineral.position.q === -999 || mineral.position.r === -999) {
        // Mineral is loaded in cargo, don't render
        continue;
      }

      const element = this.createMineralElement(mineral);
      this.mineralElements.set(mineral.id, element);
      this.mineralsContainer.appendChild(element);
    }
  }

  /**
   * Create a mineral marker element
   */
  private createMineralElement(mineral: Mineral): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'mineral-marker';
    element.dataset.mineralId = mineral.id;

    // Calculate pixel position
    const pos = axialToPixel(mineral.position.q, mineral.position.r, HEX_SIZE);

    // Center the mineral on the hex
    element.style.left = `${pos.x - 8}px`; // 8 = 16px width / 2
    element.style.top = `${pos.y - 8}px`;  // 8 = 16px height / 2

    // Check if mineral is underwater based on tide and terrain
    const terrain = this.getTerrainAtHex(mineral.position);
    if (terrain && !canCollectMineral(terrain, this.currentTide)) {
      element.classList.add('underwater');
    }

    return element;
  }

  /**
   * Get terrain type at a specific hex
   */
  private getTerrainAtHex(coord: HexCoord): TerrainType | null {
    const hex = this.terrainHexes.find(
      t => t.coord.q === coord.q && t.coord.r === coord.r
    );
    return hex ? hex.type : null;
  }

  /**
   * Update mineral visibility based on current tide
   */
  private updateMineralVisibility(): void {
    for (const mineral of this.minerals) {
      if (mineral.position.q === -999 || mineral.position.r === -999) {
        continue;
      }

      const element = this.mineralElements.get(mineral.id);
      if (!element) continue;

      const terrain = this.getTerrainAtHex(mineral.position);
      if (terrain && !canCollectMineral(terrain, this.currentTide)) {
        element.classList.add('underwater');
      } else {
        element.classList.remove('underwater');
      }
    }
  }

  /**
   * Rebuild the unit layer
   */
  private rebuildUnits(): void {
    // Clear existing unit elements
    this.unitsContainer.innerHTML = '';
    this.unitElements.clear();

    // Create unit elements (only for units with a position on the map)
    for (const unit of this.units) {
      // Skip units without a position (not yet placed / in inventory)
      if (!unit.position) continue;

      const element = this.createUnitElement(unit);
      this.unitElements.set(unit.id, element);
      this.unitsContainer.appendChild(element);
    }
  }

  /**
   * Create unit element(s) for a unit.
   * For multi-hex units (Astronef, Barge), creates a marker on each occupied hex.
   * Returns a container div with all markers for the unit.
   */
  private createUnitElement(unit: Unit): HTMLDivElement {
    // Container for all hex markers of this unit
    const container = document.createElement('div');
    container.className = `unit-container ${unit.type}`;
    container.dataset.unitId = unit.id;
    container.dataset.unitType = unit.type;
    container.dataset.owner = unit.owner;

    // Get player color from mapping, or fallback to extracting from owner string
    // In game mode: playerColors map has { "p1-abc123": "red" }
    // In lab mode: owner is "lab-team1-red", extract "red" from end
    let ownerColor = this.playerColors[unit.owner];
    if (!ownerColor) {
      // Fallback: extract color from owner string (for lab mode compatibility)
      const ownerParts = unit.owner.split('-');
      ownerColor = ownerParts[ownerParts.length - 1];
    }
    const color = PLAYER_COLORS[ownerColor] || '#ffffff';

    // Get all hexes occupied by this unit
    const footprint = getUnitFootprint(unit.type, unit.position!, unit.rotation || 0);

    const hexWidth = HEX_SIZE * 2;
    const hexHeight = HEX_SIZE * Math.sqrt(3);

    // Get sprite filename for this unit type
    const spriteName = UNIT_SPRITE_NAMES[unit.type] || 'tank';

    // Special handling for Astronef - sprite spans 4 hexes in Y shape
    if (unit.type === UnitType.Astronef && footprint.length === 4) {
      const marker = document.createElement('div');
      marker.className = `unit-marker ${unit.type} astronef-span`;

      // Calculate center of the astronef (center of bounding box of all 4 hexes)
      const positions = footprint.map(hex => axialToPixel(hex.q, hex.r, HEX_SIZE));
      const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
      const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;

      // Astronef spans approximately 3 hexes wide and 2.5 hexes tall (Y shape)
      const astronefWidth = hexWidth * 2.5;
      const astronefHeight = hexHeight * 2.5;

      marker.style.position = 'absolute';
      marker.style.left = `${centerX - astronefWidth / 2}px`;
      marker.style.top = `${centerY - astronefHeight / 2}px`;
      marker.style.width = `${astronefWidth}px`;
      marker.style.height = `${astronefHeight}px`;
      marker.classList.add('sprite-mode');
      marker.style.backgroundImage = `url(/sprites/units/${ownerColor}/${spriteName}.svg)`;
      marker.style.backgroundSize = 'contain';
      marker.style.backgroundRepeat = 'no-repeat';
      marker.style.backgroundPosition = 'center';
      marker.style.zIndex = '1'; // Lower z-index so Tower can layer on top

      // Apply rotation (each step is 60 degrees)
      if (unit.rotation && unit.rotation !== 0) {
        marker.style.transform = `rotate(${unit.rotation * 60}deg)`;
      }

      container.appendChild(marker);
    }
    // Special handling for Barge - sprite spans 2 hexes
    else if (unit.type === UnitType.Barge && footprint.length === 2) {
      const marker = document.createElement('div');
      marker.className = `unit-marker ${unit.type} barge-span`;

      // Calculate midpoint between the two hexes
      const pos1 = axialToPixel(footprint[0].q, footprint[0].r, HEX_SIZE);
      const pos2 = axialToPixel(footprint[1].q, footprint[1].r, HEX_SIZE);
      const midX = (pos1.x + pos2.x) / 2;
      const midY = (pos1.y + pos2.y) / 2;

      // Calculate angle between hexes for rotation
      const angle = Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x) * (180 / Math.PI);

      // Barge spans 2 hexes horizontally (wider element)
      const bargeWidth = hexWidth * 1.8;
      marker.style.position = 'absolute';
      marker.style.left = `${midX - bargeWidth / 2}px`;
      marker.style.top = `${midY - hexHeight / 2}px`;
      marker.style.width = `${bargeWidth}px`;
      marker.style.height = `${hexHeight}px`;
      marker.classList.add('sprite-mode');
      marker.style.backgroundImage = `url(/sprites/units/${ownerColor}/${spriteName}.svg)`;
      marker.style.backgroundSize = 'contain';
      marker.style.backgroundRepeat = 'no-repeat';
      marker.style.backgroundPosition = 'center';
      marker.style.zIndex = '1';
      marker.style.transform = `rotate(${angle}deg)`;

      container.appendChild(marker);
    }
    // Special handling for Tower - higher z-index to layer over Astronef
    else if (unit.type === UnitType.Tower) {
      const pos = axialToPixel(footprint[0].q, footprint[0].r, HEX_SIZE);
      const marker = document.createElement('div');
      marker.className = `unit-marker ${unit.type} tower-overlay`;

      marker.style.position = 'absolute';
      marker.style.left = `${pos.x - hexWidth / 2}px`;
      marker.style.top = `${pos.y - hexHeight / 2}px`;
      marker.style.width = `${hexWidth}px`;
      marker.style.height = `${hexHeight}px`;
      marker.classList.add('sprite-mode');
      marker.style.backgroundImage = `url(/sprites/units/${ownerColor}/${spriteName}.svg)`;
      marker.style.backgroundSize = 'contain';
      marker.style.backgroundRepeat = 'no-repeat';
      marker.style.backgroundPosition = 'center';
      marker.style.zIndex = '10'; // Higher z-index to layer over Astronef

      container.appendChild(marker);
    } else {
      // Standard rendering for single-hex and other multi-hex units
      footprint.forEach((hex, index) => {
        const marker = document.createElement('div');
        marker.className = `unit-marker ${unit.type}`;

        // Calculate pixel position for this hex
        const pos = axialToPixel(hex.q, hex.r, HEX_SIZE);
        marker.style.position = 'absolute';
        marker.style.left = `${pos.x - hexWidth / 2}px`;
        marker.style.top = `${pos.y - hexHeight / 2}px`;
        marker.style.width = `${hexWidth}px`;
        marker.style.height = `${hexHeight}px`;

        // Always use sprites for units
        marker.classList.add('sprite-mode');
        // For multi-hex units, show sprite only on anchor hex (index 0)
        // Secondary hexes show a colored dot
        if (index === 0) {
          marker.style.backgroundImage = `url(/sprites/units/${ownerColor}/${spriteName}.svg)`;
          // Apply rotation transform for units that support it
          if (unit.rotation && unit.rotation !== 0) {
            marker.style.transform = `rotate(${unit.rotation * 60}deg)`;
          }
        } else {
          // Secondary hex indicator
          marker.style.backgroundColor = color;
          marker.style.opacity = '0.5';
          marker.style.borderRadius = '50%';
          marker.style.transform = 'scale(0.3)';
        }

        container.appendChild(marker);
      });
    }

    return container;
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

    // Add terrain-specific class for visual indicators (marsh/reef patterns)
    if (hex.type === TerrainType.Marsh) {
      element.classList.add('terrain-marsh');
    } else if (hex.type === TerrainType.Reef) {
      element.classList.add('terrain-reef');
    }

    // Calculate pixel position
    const pos = axialToPixel(hex.coord.q, hex.coord.r, HEX_SIZE);

    // Position the hex (offset by half width/height to center on position)
    const hexWidth = HEX_SIZE * 2;
    const hexHeight = HEX_SIZE * Math.sqrt(3);
    element.style.left = `${pos.x - hexWidth / 2}px`;
    element.style.top = `${pos.y - hexHeight / 2}px`;

    // Set color based on terrain type and tide (always use symbols for terrain)
    element.style.backgroundColor = getTerrainColorHex(hex.type, this.currentTide);

    return element;
  }

  /**
   * Update tide level
   */
  setTide(tide: TideLevel): void {
    if (this.currentTide === tide) return;
    this.currentTide = tide;

    // Update all hex colors (always use colors for terrain)
    for (const hex of this.terrainHexes) {
      const key = `${hex.coord.q},${hex.coord.r}`;
      const element = this.hexElements.get(key);
      if (element) {
        element.style.backgroundColor = getTerrainColorHex(hex.type, this.currentTide);
      }
    }

    // Update mineral visibility based on new tide
    this.updateMineralVisibility();
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
   * Set highlighted hexes with a specific type
   * @param hexes - Array of hex coordinates to highlight
   * @param type - Type of highlight (range, target, selected, danger, crossfire)
   */
  setHighlightedHexes(
    hexes: Array<{ q: number; r: number }>,
    type: 'range' | 'target' | 'selected' | 'danger' | 'crossfire'
  ): void {
    const className = `highlight-${type}`;

    // Add highlight class to each specified hex
    for (const hex of hexes) {
      const element = this.hexElements.get(`${hex.q},${hex.r}`);
      if (element) {
        element.classList.add(className);
      }
    }
  }

  /**
   * Clear all hex highlights
   */
  clearHighlights(): void {
    const highlightClasses = ['highlight-range', 'highlight-target', 'highlight-selected', 'highlight-danger', 'highlight-crossfire'];

    for (const element of this.hexElements.values()) {
      for (const cls of highlightClasses) {
        element.classList.remove(cls);
      }
    }
  }

  /**
   * Set a unit as selected (visual highlight)
   */
  setUnitSelected(unitId: string, selected: boolean): void {
    const unitElement = this.unitElements.get(unitId);
    if (unitElement) {
      if (selected) {
        unitElement.classList.add('selected');
      } else {
        unitElement.classList.remove('selected');
      }
    }
  }

  /**
   * Clear all unit selections
   */
  clearUnitSelections(): void {
    for (const element of this.unitElements.values()) {
      element.classList.remove('selected');
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.container.remove();
    this.hexElements.clear();
    this.unitElements.clear();
    this.mineralElements.clear();
    this.zoomChangeCallbacks.clear();
  }
}
