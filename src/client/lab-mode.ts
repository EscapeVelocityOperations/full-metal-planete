/**
 * Lab Mode - Local testing environment for Full Metal Planète
 * Allows testing unit setup, deployment, and gameplay without server connection
 */

import { createRenderer, type IHexRenderer, type RendererType } from '@/client/renderer/renderer-factory';
import { TerrainHex } from '@/client/renderer/terrain-layer';
import { DeploymentInventory } from './ui/deployment-inventory';
import { UnitType, TideLevel, PlayerColor, GamePhase, TerrainType, GAME_CONSTANTS, UNIT_PROPERTIES, type GameState, type HexCoord, type Unit, type Player } from '@/shared/game/types';
import { hexRotateAround, getUnitFootprint, getOccupiedHexes, isPlacementValidWithTerrain, isTurretPlacementValid, hexKey } from '@/shared/game/hex';
import { generateDemoMap, generateMinerals } from '@/shared/game/map-generator';
import {
  isCombatUnit,
  canUnitFire,
  getFireableHexes,
  getSharedFireableHexes,
  getValidTargets,
  executeShot,
  resetShotsForTurn,
  getActiveCombatUnits,
  type TerrainGetter,
} from '@/shared/game/combat';

interface LabModeConfig {
  team1Color: PlayerColor;
  team2Color: PlayerColor;
}

/**
 * Lab Mode operating mode
 * - setup: Place units on the map with rotation support
 * - play: Simulate gameplay with AP tracking and movement
 */
type LabModeType = 'setup' | 'play';

/**
 * Play sub-mode for different actions
 * - move: Select and move units
 * - combat: Select 2 combat units and fire at targets
 */
type PlaySubMode = 'move' | 'combat';

/**
 * Helper to get movement cost for a unit type from UNIT_PROPERTIES.
 */
function getMovementCost(unitType: UnitType): number {
  return UNIT_PROPERTIES[unitType].movementCost;
}

export class LabMode {
  private renderer: IHexRenderer | null = null;
  private rendererType: RendererType = 'css';
  private canvas: HTMLCanvasElement;
  private config: LabModeConfig;

  private gameState: GameState;
  private currentTeam: 'team1' | 'team2' = 'team1';
  private deploymentInventory: DeploymentInventory | null = null;
  private selectedUnit: Unit | null = null;

  // Lab mode state
  private mode: LabModeType = 'setup';
  private playSubMode: PlaySubMode = 'move';
  private selectedMapUnit: Unit | null = null; // Unit selected on map (for play mode)
  private movementPreview: HexCoord[] = []; // Path preview for movement
  private highlightedHexes: Set<string> = new Set(); // Valid move destinations

  // Combat state
  private selectedCombatUnits: Unit[] = []; // Up to 2 combat units for crossfire
  private validTargets: Unit[] = []; // Enemy units that can be targeted

  // UI elements
  private controlPanel: HTMLDivElement | null = null;
  private modeToggle: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement, config: LabModeConfig = { team1Color: PlayerColor.Red, team2Color: PlayerColor.Blue }) {
    this.canvas = canvas;
    this.config = config;
    this.gameState = this.createInitialState();
  }

  /**
   * Create initial game state for lab mode
   */
  private createInitialState(): GameState {
    const team1Id = 'lab-team1';
    const team2Id = 'lab-team2';

    const players: Player[] = [
      {
        id: team1Id,
        name: 'Team 1',
        color: this.config.team1Color,
        isConnected: true,
        isReady: true,
        astronefPosition: [],
        hasLiftedOff: false,
        capturedAstronefs: [],
      },
      {
        id: team2Id,
        name: 'Team 2',
        color: this.config.team2Color,
        isConnected: true,
        isReady: true,
        astronefPosition: [],
        hasLiftedOff: false,
        capturedAstronefs: [],
      },
    ];

    // Create units for both teams
    const units: Unit[] = [
      // Team 1 units
      ...this.createTeamUnits(team1Id, this.config.team1Color),
      // Team 2 units
      ...this.createTeamUnits(team2Id, this.config.team2Color),
    ];

    return {
      gameId: 'lab-mode',
      players,
      units,
      terrain: [],
      minerals: [],
      bridges: [],
      currentPlayer: team1Id,
      phase: GamePhase.Playing,
      turn: 3,
      turnOrder: [team1Id, team2Id],
      currentTide: TideLevel.Normal,
      tideDeck: [],
      tideDiscard: [],
      actionPoints: 15,
      savedActionPoints: { [team1Id]: 0, [team2Id]: 0 },
      turnStartTime: Date.now(),
      turnTimeLimit: 300000,
      liftOffDecisions: {},
    };
  }

  /**
   * Create a full set of units for a team
   * Note: owner must include the color string for filtering in DeploymentInventory
   */
  private createTeamUnits(ownerId: string, color: PlayerColor): Unit[] {
    let unitId = 1;
    // Owner includes both the team id and color to match filtering in DeploymentInventory
    const ownerWithColor = `${ownerId}-${color}`;
    const createUnit = (type: UnitType): Unit => ({
      id: `${ownerId}-${unitId++}`,
      type,
      owner: ownerWithColor,
      position: null,
      rotation: 0,
      shotsRemaining: 2,
      isStuck: false,
      isNeutralized: false,
      cargo: [],
    });

    return [
      createUnit(UnitType.Astronef),
      createUnit(UnitType.Tower),
      createUnit(UnitType.Tower),
      createUnit(UnitType.Tower),
      createUnit(UnitType.Tank),
      createUnit(UnitType.Tank),
      createUnit(UnitType.Tank),
      createUnit(UnitType.Tank),
      createUnit(UnitType.SuperTank),
      createUnit(UnitType.MotorBoat),
      createUnit(UnitType.MotorBoat),
      createUnit(UnitType.Barge),
      createUnit(UnitType.Barge),
      createUnit(UnitType.Crab),
      createUnit(UnitType.Crab),
      createUnit(UnitType.Converter),
      createUnit(UnitType.Converter),
      createUnit(UnitType.Bridge),
    ];
  }

  /**
   * Initialize the lab mode
   */
  async initialize(): Promise<void> {
    // Initialize renderer
    this.renderer = await createRenderer(this.canvas, this.rendererType);
    console.log('Lab Mode renderer initialized:', this.renderer.getBackend());

    // Load terrain
    this.loadTerrain();

    // Set up input handlers
    this.setupInputHandlers();

    // Create control panel
    this.createControlPanel();

    // Create deployment inventory
    this.createDeploymentInventory();

    // Start render loop
    this.startRenderLoop();
  }

  /**
   * Load terrain for the map
   */
  private loadTerrain(): void {
    const demoTerrain = generateDemoMap();
    this.gameState.terrain = demoTerrain;

    // Generate minerals on valid terrain
    const minerals = generateMinerals(demoTerrain);
    this.gameState.minerals = minerals;
    console.log('Lab mode: Generated', minerals.length, 'minerals');

    if (this.renderer) {
      const terrainHexes: TerrainHex[] = demoTerrain.map(hex => ({
        coord: { q: hex.coord.q, r: hex.coord.r },
        type: hex.type,
      }));
      this.renderer.setTerrainData(terrainHexes);
      this.renderer.setTide(this.gameState.currentTide);

      // Render minerals on the map
      if (this.renderer.setMinerals) {
        this.renderer.setMinerals(minerals);
      }
    }
  }

  /**
   * Set up input handlers
   */
  private setupInputHandlers(): void {
    if (this.renderer?.onHexClick) {
      this.renderer.onHexClick((coord: HexCoord) => {
        this.handleHexClick(coord);
      });
    }

    if (this.renderer?.onHexRightClick) {
      this.renderer.onHexRightClick((coord: HexCoord) => {
        this.handleHexRightClick(coord);
      });
    }

    // Keyboard events
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.deselectUnit();
        this.deselectMapUnit();
      } else if (event.key === 'r' || event.key === 'R') {
        this.rotateSelectedUnit();
      }
    });

    // Set up zoom controls (reuse the existing HTML elements)
    this.setupZoomControls();
  }

  /**
   * Rotate the currently selected unit (for placement)
   */
  private rotateSelectedUnit(): void {
    if (this.mode !== 'setup') return;

    if (this.selectedUnit) {
      // Rotate unit in inventory selection
      this.selectedUnit.rotation = ((this.selectedUnit.rotation || 0) + 1) % 6;
      console.log('Rotated selected unit to rotation:', this.selectedUnit.rotation);

      // Update renderer to show rotation preview if unit is placed
      if (this.selectedUnit.position && this.renderer?.setUnits) {
        this.renderer.setUnits(this.gameState.units);
        this.render();
      }
    }
  }

  /**
   * Deselect the map unit (for play mode)
   */
  private deselectMapUnit(): void {
    this.selectedMapUnit = null;
    this.movementPreview = [];
    this.clearCombatSelection();
    this.clearHighlights();
  }

  /**
   * Clear combat selection and highlights
   * If still in combat mode, restore the tactical overview
   */
  private clearCombatSelection(): void {
    this.selectedCombatUnits = [];
    this.validTargets = [];

    // Clear unit selection visual
    const cssRenderer = this.renderer as { clearUnitSelections?: () => void };
    cssRenderer.clearUnitSelections?.();

    // If still in combat mode, show the tactical overview again
    if (this.playSubMode === 'combat') {
      this.showAllCombatRanges();
    } else {
      this.renderer?.clearHighlights?.();
    }
  }

  /**
   * Select a combat unit for crossfire
   */
  private selectCombatUnit(unit: Unit): void {
    const currentColor = this.currentTeam === 'team1' ? this.config.team1Color : this.config.team2Color;

    // Only allow selecting friendly combat units that can fire
    if (!unit.owner.includes(currentColor)) {
      console.log('Cannot select enemy unit for combat');
      return;
    }

    if (!isCombatUnit(unit)) {
      console.log('Unit is not a combat unit');
      return;
    }

    if (!canUnitFire(unit)) {
      console.log('Unit cannot fire (stuck, neutralized, or no shots remaining)');
      return;
    }

    // Check if unit is already selected
    const alreadySelected = this.selectedCombatUnits.some((u) => u.id === unit.id);
    if (alreadySelected) {
      // Deselect the unit
      this.selectedCombatUnits = this.selectedCombatUnits.filter((u) => u.id !== unit.id);
      console.log('Deselected combat unit:', unit.type);
    } else if (this.selectedCombatUnits.length < 2) {
      // Select the unit
      this.selectedCombatUnits.push(unit);
      console.log('Selected combat unit:', unit.type, `(${this.selectedCombatUnits.length}/2)`);
    } else {
      console.log('Already have 2 combat units selected');
      return;
    }

    // Update visual selection
    this.updateCombatSelection();
  }

  /**
   * Update combat selection visuals (highlights and targets)
   * Maintains the tactical overview (all ranges) while adding selection indicators
   */
  private updateCombatSelection(): void {
    const cssRenderer = this.renderer as { clearUnitSelections?: () => void; setUnitSelected?: (id: string, selected: boolean) => void };
    cssRenderer.clearUnitSelections?.();

    // Always show the full tactical overview first
    this.showAllCombatRanges();

    const terrainGetter = this.getTerrainGetter();

    // Highlight selected units (visual indicator on the unit sprite)
    for (const unit of this.selectedCombatUnits) {
      cssRenderer.setUnitSelected?.(unit.id, true);
      // Also highlight the hex where the selected unit sits
      if (unit.position) {
        this.renderer?.setHighlightedHexes?.([unit.position], 'selected');
      }
    }

    if (this.selectedCombatUnits.length === 2) {
      // Get valid targets in the shared range of the two selected units
      const [unit1, unit2] = this.selectedCombatUnits;
      this.validTargets = getValidTargets(unit1, unit2, this.gameState.units, terrainGetter);

      // Highlight target hexes (enemy units that can be destroyed)
      const targetHexes = this.validTargets
        .filter((u) => u.position)
        .map((u) => u.position!);
      if (targetHexes.length > 0) {
        this.renderer?.setHighlightedHexes?.(targetHexes, 'target');
      }

      console.log(`Combat ready: ${this.validTargets.length} valid targets`);
    } else {
      this.validTargets = [];
    }

    this.updateControlPanel();
    this.render();
  }

  /**
   * Show all friendly combat units' ranges and crossfire zones.
   * Called when entering combat mode to provide tactical overview.
   * - Blue (range): Hexes reachable by at least one combat unit
   * - Green (crossfire): Hexes reachable by 2+ combat units (valid destruction zones)
   */
  private showAllCombatRanges(): void {
    this.renderer?.clearHighlights?.();

    const currentColor = this.currentTeam === 'team1' ? this.config.team1Color : this.config.team2Color;
    const currentOwnerId = this.currentTeam === 'team1' ? 'lab-team1' : 'lab-team2';
    const ownerWithColor = `${currentOwnerId}-${currentColor}`;

    const terrainGetter = this.getTerrainGetter();

    // Get all active combat units for current team
    const combatUnits = this.gameState.units.filter(
      (u) => u.owner === ownerWithColor && u.position && canUnitFire(u)
    );

    if (combatUnits.length === 0) {
      console.log('No active combat units to show ranges for');
      return;
    }

    // Count how many units can reach each hex
    const hexCoverage = new Map<string, number>();
    const hexCoords = new Map<string, HexCoord>();

    for (const unit of combatUnits) {
      const fireableHexes = getFireableHexes(unit, terrainGetter);
      for (const hex of fireableHexes) {
        const key = hexKey(hex);
        hexCoverage.set(key, (hexCoverage.get(key) || 0) + 1);
        hexCoords.set(key, hex);
      }
    }

    // Separate hexes into single-coverage (range) and multi-coverage (crossfire)
    const rangeHexes: HexCoord[] = [];
    const crossfireHexes: HexCoord[] = [];

    for (const [key, count] of hexCoverage) {
      const hex = hexCoords.get(key)!;
      if (count >= 2) {
        crossfireHexes.push(hex);
      } else {
        rangeHexes.push(hex);
      }
    }

    // Apply highlights - range first (blue), then crossfire (green) on top
    if (rangeHexes.length > 0) {
      this.renderer?.setHighlightedHexes?.(rangeHexes, 'range');
    }
    if (crossfireHexes.length > 0) {
      this.renderer?.setHighlightedHexes?.(crossfireHexes, 'crossfire');
    }

    console.log(`Combat ranges: ${rangeHexes.length} single-coverage, ${crossfireHexes.length} crossfire zones`);
    this.render();
  }

  /**
   * Execute a shot at a target unit
   */
  private executeFireAction(target: Unit): void {
    if (this.selectedCombatUnits.length !== 2) {
      console.log('Need 2 combat units selected to fire');
      return;
    }

    // Check AP cost
    const apCost = GAME_CONSTANTS.AP_COST_FIRE;
    if (this.gameState.actionPoints < apCost) {
      console.log(`Not enough AP. Need ${apCost}, have ${this.gameState.actionPoints}`);
      return;
    }

    const terrainGetter = this.getTerrainGetter();
    const result = executeShot(
      [this.selectedCombatUnits[0], this.selectedCombatUnits[1]],
      target,
      this.gameState.units,
      terrainGetter
    );

    if (result.success) {
      console.log(`Shot successful! Destroyed ${target.type}`);

      // Update game state
      this.gameState.units = result.updatedUnits;
      this.gameState.actionPoints -= result.apCost;

      // Update renderer
      if (this.renderer?.setUnits) {
        this.renderer.setUnits(this.gameState.units);
      }

      // Show feedback
      this.showShotFeedback(target.position!);

      // Clear combat selection
      this.clearCombatSelection();
      this.updateAPDisplay();
      this.updateControlPanel();
      this.render();
    } else {
      console.log('Shot failed:', result.error);
    }
  }

  /**
   * Show visual feedback for a successful shot
   */
  private showShotFeedback(position: HexCoord): void {
    // Flash the hex red briefly
    this.renderer?.setHighlightedHexes?.([position], 'danger');

    // Clear after animation
    setTimeout(() => {
      this.renderer?.clearHighlights?.();
    }, 500);
  }

  /**
   * Reset shots for all units (call at start of turn)
   */
  private resetTurnShots(): void {
    this.gameState.units = resetShotsForTurn(this.gameState.units);
    if (this.renderer?.setUnits) {
      this.renderer.setUnits(this.gameState.units);
    }
    console.log('Reset shots for all units');
  }

  /**
   * Clear hex highlights
   */
  private clearHighlights(): void {
    this.highlightedHexes.clear();
    // TODO: Update renderer to remove highlights
  }

  /**
   * Set up zoom control handlers
   */
  private setupZoomControls(): void {
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomFitBtn = document.getElementById('zoom-fit-btn');
    const zoomLevelEl = document.getElementById('zoom-level');

    // Register zoom change callback to update display
    if (this.renderer?.onZoomChange && zoomLevelEl) {
      this.renderer.onZoomChange((zoom) => {
        const percentage = Math.round(zoom * 100);
        zoomLevelEl.textContent = `${percentage}%`;
      });
    }

    // Initialize zoom level display
    if (this.renderer?.getZoom && zoomLevelEl) {
      const zoom = this.renderer.getZoom();
      const percentage = Math.round(zoom * 100);
      zoomLevelEl.textContent = `${percentage}%`;
    }

    // Wire up zoom buttons
    zoomInBtn?.addEventListener('click', () => {
      if (this.renderer?.zoomIn) {
        this.renderer.zoomIn();
      }
    });

    zoomOutBtn?.addEventListener('click', () => {
      if (this.renderer?.zoomOut) {
        this.renderer.zoomOut();
      }
    });

    zoomFitBtn?.addEventListener('click', () => {
      if (this.renderer?.zoomToFit) {
        this.renderer.zoomToFit();
      }
    });
  }

  /**
   * Create the control panel UI
   */
  private createControlPanel(): void {
    this.controlPanel = document.createElement('div');
    this.controlPanel.id = 'lab-control-panel';
    this.controlPanel.innerHTML = `
      <style>
        #lab-control-panel {
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(20, 20, 30, 0.95);
          border: 2px solid #4a90e2;
          border-radius: 12px;
          padding: 20px;
          min-width: 280px;
          z-index: 100;
          color: #fff;
        }

        .lab-title {
          font-size: 18px;
          font-weight: bold;
          color: #4a90e2;
          margin-bottom: 15px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .lab-section {
          margin-bottom: 15px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .lab-section:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .lab-section-title {
          font-size: 12px;
          color: #888;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .lab-team-selector {
          display: flex;
          gap: 10px;
        }

        .lab-team-btn {
          flex: 1;
          padding: 10px;
          border: 2px solid transparent;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.2s;
        }

        .lab-team-btn.active {
          border-color: #4a90e2;
          background: rgba(74, 144, 226, 0.3);
        }

        .lab-team-btn.red { color: #ff6666; }
        .lab-team-btn.blue { color: #6699ff; }

        .lab-ap-control {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .lab-ap-value {
          font-size: 24px;
          font-weight: bold;
          width: 60px;
          text-align: center;
        }

        .lab-ap-btn {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 8px;
          background: #4a90e2;
          color: #fff;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .lab-ap-btn:hover {
          background: #357abd;
        }

        .lab-tide-selector {
          display: flex;
          gap: 8px;
        }

        .lab-tide-btn {
          flex: 1;
          padding: 8px;
          border: 2px solid transparent;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .lab-tide-btn.active {
          border-color: currentColor;
        }

        .lab-tide-btn.low { color: #44ff44; }
        .lab-tide-btn.normal { color: #ffaa00; }
        .lab-tide-btn.high { color: #ff4444; }

        .lab-action-btn {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          margin-top: 8px;
          transition: all 0.2s;
        }

        .lab-reset-btn {
          background: #e94560;
          color: #fff;
        }

        .lab-reset-btn:hover {
          background: #c73a54;
        }

        .lab-back-btn {
          background: rgba(255, 255, 255, 0.1);
          color: #888;
          border: 1px solid #888;
        }

        .lab-back-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .lab-info {
          font-size: 12px;
          color: #666;
          margin-top: 10px;
          text-align: center;
        }

        .lab-mode-selector {
          display: flex;
          gap: 10px;
        }

        .lab-mode-btn {
          flex: 1;
          padding: 12px;
          border: 2px solid transparent;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
          transition: all 0.2s;
        }

        .lab-mode-btn:hover {
          background: rgba(74, 144, 226, 0.2);
        }

        .lab-mode-btn.active {
          border-color: #4a90e2;
          background: rgba(74, 144, 226, 0.3);
          color: #4a90e2;
        }

        .lab-rotate-btn {
          width: 100%;
          padding: 10px;
          border: 2px solid #4a90e2;
          border-radius: 8px;
          background: rgba(74, 144, 226, 0.2);
          color: #4a90e2;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
          transition: all 0.2s;
          margin-top: 8px;
          min-height: 44px;
        }

        .lab-rotate-btn:hover {
          background: rgba(74, 144, 226, 0.4);
        }

        .lab-rotate-btn:active {
          background: rgba(74, 144, 226, 0.6);
        }

        .lab-selected-unit {
          background: rgba(74, 144, 226, 0.2);
          border-radius: 8px;
          padding: 10px;
          margin-top: 10px;
        }

        .lab-selected-unit-title {
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .lab-selected-unit-name {
          font-size: 16px;
          font-weight: bold;
          color: #4a90e2;
        }

        .lab-selected-unit-rotation {
          font-size: 12px;
          color: #888;
          margin-top: 4px;
        }

        /* Play sub-mode selector (move vs combat) */
        .lab-submode-selector {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }

        .lab-submode-btn {
          flex: 1;
          padding: 10px;
          border: 2px solid transparent;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          cursor: pointer;
          font-weight: bold;
          font-size: 13px;
          transition: all 0.2s;
          min-height: 44px;
        }

        .lab-submode-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .lab-submode-btn.active {
          border-color: currentColor;
        }

        .lab-submode-btn.move {
          color: #4a90e2;
        }

        .lab-submode-btn.move.active {
          background: rgba(74, 144, 226, 0.3);
        }

        .lab-submode-btn.combat {
          color: #ff6666;
        }

        .lab-submode-btn.combat.active {
          background: rgba(255, 100, 100, 0.3);
        }

        /* Combat selection display */
        .lab-combat-selection {
          background: rgba(255, 100, 100, 0.15);
          border: 1px solid rgba(255, 100, 100, 0.3);
          border-radius: 8px;
          padding: 10px;
          margin-top: 10px;
        }

        .lab-combat-title {
          font-size: 11px;
          color: #ff6666;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .lab-combat-unit {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .lab-combat-unit:last-child {
          border-bottom: none;
        }

        .lab-combat-unit-name {
          font-weight: bold;
          color: #fff;
        }

        .lab-combat-unit-shots {
          font-size: 12px;
          color: #888;
        }

        .lab-fire-btn {
          width: 100%;
          padding: 12px;
          border: 2px solid #ff6666;
          border-radius: 8px;
          background: rgba(255, 100, 100, 0.3);
          color: #ff6666;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
          margin-top: 10px;
          min-height: 44px;
          transition: all 0.2s;
        }

        .lab-fire-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .lab-fire-btn:not(:disabled):hover {
          background: rgba(255, 100, 100, 0.5);
        }

        .lab-target-count {
          font-size: 12px;
          color: #ff6666;
          margin-top: 8px;
          text-align: center;
        }
      </style>

      <div class="lab-title">Lab Mode</div>

      <div class="lab-section">
        <div class="lab-section-title">Mode</div>
        <div class="lab-mode-selector">
          <button class="lab-mode-btn ${this.mode === 'setup' ? 'active' : ''}" data-mode="setup">Setup</button>
          <button class="lab-mode-btn ${this.mode === 'play' ? 'active' : ''}" data-mode="play">Play</button>
        </div>
        ${this.mode === 'play' ? `
        <div class="lab-submode-selector">
          <button class="lab-submode-btn move ${this.playSubMode === 'move' ? 'active' : ''}" data-submode="move">🚗 Move</button>
          <button class="lab-submode-btn combat ${this.playSubMode === 'combat' ? 'active' : ''}" data-submode="combat">🎯 Combat</button>
        </div>
        ` : ''}
      </div>

      <div class="lab-section">
        <div class="lab-section-title">Active Team</div>
        <div class="lab-team-selector">
          <button class="lab-team-btn ${this.config.team1Color} active" data-team="team1">Team 1</button>
          <button class="lab-team-btn ${this.config.team2Color}" data-team="team2">Team 2</button>
        </div>
      </div>

      <div class="lab-section">
        <div class="lab-section-title">Action Points</div>
        <div class="lab-ap-control">
          <button class="lab-ap-btn" data-ap-action="decrease">-</button>
          <div class="lab-ap-value">${this.gameState.actionPoints}</div>
          <button class="lab-ap-btn" data-ap-action="increase">+</button>
          <button class="lab-ap-btn" data-ap-action="reset" style="width: auto; padding: 0 12px; font-size: 12px;">MAX</button>
        </div>
      </div>

      <div class="lab-section">
        <div class="lab-section-title">Tide Level</div>
        <div class="lab-tide-selector">
          <button class="lab-tide-btn low ${this.gameState.currentTide === 'low' ? 'active' : ''}" data-tide="low">Low</button>
          <button class="lab-tide-btn normal ${this.gameState.currentTide === 'normal' ? 'active' : ''}" data-tide="normal">Normal</button>
          <button class="lab-tide-btn high ${this.gameState.currentTide === 'high' ? 'active' : ''}" data-tide="high">High</button>
        </div>
      </div>

      <div class="lab-section">
        <button class="lab-action-btn lab-reset-btn" id="lab-reset-btn">Reset All Units</button>
        <button class="lab-action-btn lab-back-btn" id="lab-back-btn">Back to Home</button>
      </div>

      <div class="lab-info" id="lab-mode-info">
        ${this.mode === 'setup'
          ? `Tap map to place unit<br>Tap again or press R to rotate<br>Long-press to remove`
          : this.playSubMode === 'combat'
            ? `Select 2 combat units<br>Tap red target to fire<br>Cost: 2 AP (max 2 shots/unit)`
            : `Tap unit to select<br>Tap destination to move<br>AP cost shown on path`}
      </div>

      ${this.selectedUnit ? `
      <div class="lab-selected-unit">
        <div class="lab-selected-unit-title">Selected for Placement</div>
        <div class="lab-selected-unit-name">${this.selectedUnit.type}</div>
        <div class="lab-selected-unit-rotation">Rotation: ${(this.selectedUnit.rotation || 0) * 60} degrees</div>
        <button class="lab-rotate-btn" id="lab-rotate-btn">Rotate (R)</button>
      </div>
      ` : ''}

      ${this.selectedMapUnit ? `
      <div class="lab-selected-unit">
        <div class="lab-selected-unit-title">Selected Unit</div>
        <div class="lab-selected-unit-name">${this.selectedMapUnit.type}</div>
        <div class="lab-selected-unit-rotation">Move cost: ${getMovementCost(this.selectedMapUnit.type)} AP/hex</div>
      </div>
      ` : ''}

      ${this.mode === 'play' && this.playSubMode === 'combat' && this.selectedCombatUnits.length > 0 ? `
      <div class="lab-combat-selection">
        <div class="lab-combat-title">Combat Units (${this.selectedCombatUnits.length}/2)</div>
        ${this.selectedCombatUnits.map((unit) => `
        <div class="lab-combat-unit">
          <span class="lab-combat-unit-name">${unit.type}</span>
          <span class="lab-combat-unit-shots">${unit.shotsRemaining} shots left</span>
        </div>
        `).join('')}
        ${this.selectedCombatUnits.length === 2 ? `
        <div class="lab-target-count">
          ${this.validTargets.length > 0
            ? `${this.validTargets.length} target${this.validTargets.length > 1 ? 's' : ''} in range`
            : 'No targets in range'}
        </div>
        ` : ''}
      </div>
      ` : ''}
    `;

    document.body.appendChild(this.controlPanel);

    // Set up event handlers
    this.setupControlPanelEvents();
  }

  /**
   * Set up control panel event handlers
   */
  private setupControlPanelEvents(): void {
    if (!this.controlPanel) return;

    // Mode selection
    this.controlPanel.querySelectorAll('.lab-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = (e.target as HTMLElement).dataset.mode as LabModeType;
        this.switchMode(mode);
      });
    });

    // Play sub-mode selection (move vs combat)
    this.controlPanel.querySelectorAll('.lab-submode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const subMode = (e.target as HTMLElement).dataset.submode as PlaySubMode;
        this.switchPlaySubMode(subMode);
      });
    });

    // Rotate button
    const rotateBtn = document.getElementById('lab-rotate-btn');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', () => {
        this.rotateSelectedUnit();
        this.updateControlPanel();
      });
    }

    // Team selection
    this.controlPanel.querySelectorAll('.lab-team-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const team = (e.target as HTMLElement).dataset.team as 'team1' | 'team2';
        this.switchTeam(team);
      });
    });

    // AP controls
    this.controlPanel.querySelectorAll('[data-ap-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).dataset.apAction;
        if (action === 'increase') this.adjustAP(1);
        else if (action === 'decrease') this.adjustAP(-1);
        else if (action === 'reset') this.resetAP();
      });
    });

    // Tide controls
    this.controlPanel.querySelectorAll('[data-tide]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tide = (e.target as HTMLElement).dataset.tide as TideLevel;
        this.setTide(tide);
      });
    });

    // Reset button
    document.getElementById('lab-reset-btn')?.addEventListener('click', () => {
      this.resetAllUnits();
    });

    // Back button
    document.getElementById('lab-back-btn')?.addEventListener('click', () => {
      window.location.href = '/';
    });
  }

  /**
   * Create deployment inventory for current team
   */
  private createDeploymentInventory(): void {
    if (this.deploymentInventory) {
      this.deploymentInventory.destroy();
    }

    const currentColor = this.currentTeam === 'team1' ? this.config.team1Color : this.config.team2Color;
    const currentOwnerId = this.currentTeam === 'team1' ? 'lab-team1' : 'lab-team2';
    const ownerWithColor = `${currentOwnerId}-${currentColor}`;

    this.deploymentInventory = new DeploymentInventory({
      playerId: ownerWithColor,
      playerColor: currentColor,
      onUnitSelect: (unitType: UnitType, unitId: string) => {
        const unit = this.gameState.units.find(u => u.id === unitId);
        if (unit) {
          this.selectedUnit = unit;
          console.log('Selected unit for placement:', unit.type);
        }
      },
      onRotate: () => {},
    });

    // Set units and show - filter by owner which includes color
    const teamUnits = this.gameState.units.filter(u => u.owner === ownerWithColor);
    this.deploymentInventory.setUnits(teamUnits);

    // Mark deployed units
    const deployedIds = teamUnits.filter(u => u.position !== null).map(u => u.id);
    this.deploymentInventory.setDeployedUnits(deployedIds);

    this.deploymentInventory.show();
  }

  /**
   * Switch between setup and play modes
   */
  private switchMode(mode: LabModeType): void {
    if (this.mode === mode) return;

    this.mode = mode;
    this.playSubMode = 'move'; // Reset to move sub-mode
    this.selectedUnit = null;
    this.selectedMapUnit = null;
    this.movementPreview = [];
    this.clearCombatSelection();
    this.clearHighlights();

    // Update UI buttons
    this.controlPanel?.querySelectorAll('.lab-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    // Show/hide deployment inventory based on mode
    if (mode === 'setup') {
      this.createDeploymentInventory();
    } else {
      this.deploymentInventory?.hide();
    }

    // Update control panel to reflect mode change
    this.updateControlPanel();

    console.log('Switched to mode:', mode);
  }

  /**
   * Update the control panel UI (refresh dynamic content)
   */
  private updateControlPanel(): void {
    // Update info text
    const infoEl = document.getElementById('lab-mode-info');
    if (infoEl) {
      infoEl.innerHTML = this.mode === 'setup'
        ? `Tap map to place unit<br>Tap again or press R to rotate<br>Long-press to remove`
        : `Tap unit to select<br>Tap destination to move<br>AP cost shown on path`;
    }

    // Recreate the control panel to update selected unit display
    if (this.controlPanel) {
      this.controlPanel.remove();
      this.createControlPanel();
    }
  }

  /**
   * Switch active team
   */
  private switchTeam(team: 'team1' | 'team2'): void {
    this.currentTeam = team;
    this.selectedUnit = null;
    this.selectedMapUnit = null;

    // Update UI
    this.controlPanel?.querySelectorAll('.lab-team-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-team') === team);
    });

    // Recreate deployment inventory for new team (only in setup mode)
    if (this.mode === 'setup') {
      this.createDeploymentInventory();
    }
  }

  /**
   * Adjust action points
   */
  private adjustAP(delta: number): void {
    this.gameState.actionPoints = Math.max(0, Math.min(25, this.gameState.actionPoints + delta));
    this.updateAPDisplay();
  }

  /**
   * Reset action points to max
   */
  private resetAP(): void {
    this.gameState.actionPoints = 15;
    this.updateAPDisplay();
  }

  /**
   * Update AP display
   */
  private updateAPDisplay(): void {
    const apValue = this.controlPanel?.querySelector('.lab-ap-value');
    if (apValue) {
      apValue.textContent = String(this.gameState.actionPoints);
    }
  }

  /**
   * Set tide level
   */
  private setTide(tide: TideLevel): void {
    this.gameState.currentTide = tide;
    if (this.renderer) {
      this.renderer.setTide(tide);
    }

    // Update UI
    this.controlPanel?.querySelectorAll('.lab-tide-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tide') === tide);
    });

    this.render();
  }

  /**
   * Reset all units to unplaced state
   */
  private resetAllUnits(): void {
    this.gameState.units.forEach(unit => {
      unit.position = null;
    });

    if (this.renderer?.setUnits) {
      this.renderer.setUnits(this.gameState.units);
    }

    this.createDeploymentInventory();
    this.render();
  }

  /**
   * Handle hex click - routes to setup or play mode handler
   */
  private handleHexClick(coord: HexCoord): void {
    if (this.mode === 'setup') {
      this.handleSetupHexClick(coord);
    } else {
      this.handlePlayHexClick(coord);
    }
  }

  /**
   * Handle hex click in setup mode - place or rotate units
   */
  private handleSetupHexClick(coord: HexCoord): void {
    // Check if clicking on an already placed unit to rotate it
    const clickedUnit = this.findUnitAtHex(coord);
    if (clickedUnit && clickedUnit.owner.includes(this.currentTeam === 'team1' ? this.config.team1Color : this.config.team2Color)) {
      // Select the clicked unit for rotation
      this.selectedUnit = clickedUnit;
      this.rotateSelectedUnit();
      this.updateControlPanel();
      return;
    }

    if (!this.selectedUnit) return;

    // Get all currently occupied hexes (excluding the unit being placed)
    const otherUnits = this.gameState.units.filter(u =>
      u.id !== this.selectedUnit!.id && u.position !== null
    );
    const occupiedHexes = getOccupiedHexes(otherUnits);

    // Check if placement is valid for multi-hex units (overlap + terrain)
    const rotation = this.selectedUnit.rotation || 0;
    const terrainGetter = this.getTerrainGetter();
    if (!isPlacementValidWithTerrain(
      this.selectedUnit.type,
      coord,
      rotation,
      occupiedHexes,
      terrainGetter,
      this.gameState.currentTide
    )) {
      console.log('Invalid placement - overlap with units or incompatible terrain');
      return;
    }

    // Special validation for turrets - must be placed on astronef pode hexes
    if (this.selectedUnit.type === UnitType.Tower) {
      if (!isTurretPlacementValid(coord, this.selectedUnit.owner, this.gameState.units)) {
        console.log('Invalid turret placement - must be on astronef pode hex');
        return;
      }
    }

    // Place the unit
    this.selectedUnit.position = coord;
    console.log('Placed unit at', coord, 'rotation:', rotation);

    // Log footprint for multi-hex units
    const footprint = getUnitFootprint(this.selectedUnit.type, coord, rotation);
    if (footprint.length > 1) {
      console.log('Unit footprint:', footprint.map(h => `(${h.q},${h.r})`).join(', '));
    }

    // Update renderer
    if (this.renderer?.setUnits) {
      this.renderer.setUnits(this.gameState.units);
    }

    // Update deployment inventory
    this.createDeploymentInventory();
    this.selectedUnit = null;
    this.updateControlPanel();
    this.render();
  }

  /**
   * Handle hex click in play mode - select units or move them
   */
  private handlePlayHexClick(coord: HexCoord): void {
    if (this.playSubMode === 'combat') {
      this.handleCombatHexClick(coord);
    } else {
      this.handleMoveHexClick(coord);
    }
  }

  /**
   * Handle hex click in move sub-mode
   */
  private handleMoveHexClick(coord: HexCoord): void {
    const currentColor = this.currentTeam === 'team1' ? this.config.team1Color : this.config.team2Color;

    // If no unit selected, try to select one
    if (!this.selectedMapUnit) {
      const clickedUnit = this.findUnitAtHex(coord);
      if (clickedUnit && clickedUnit.owner.includes(currentColor)) {
        // Check if unit can move
        const moveCost = getMovementCost(clickedUnit.type);
        if (moveCost === Infinity) {
          console.log('This unit cannot move');
          return;
        }

        this.selectedMapUnit = clickedUnit;
        console.log('Selected unit for movement:', clickedUnit.type);
        this.updateControlPanel();
      }
      return;
    }

    // Unit is selected, try to move it
    const moveCost = getMovementCost(this.selectedMapUnit.type);

    // Check if clicking on the same unit to deselect
    const clickedUnit = this.findUnitAtHex(coord);
    if (clickedUnit && clickedUnit.id === this.selectedMapUnit.id) {
      this.deselectMapUnit();
      this.updateControlPanel();
      return;
    }

    // Calculate distance and AP cost
    const startPos = this.selectedMapUnit.position;
    if (!startPos) return;

    const distance = this.hexDistance(startPos, coord);
    const totalAPCost = distance * moveCost;

    // Check if we have enough AP
    if (totalAPCost > this.gameState.actionPoints) {
      console.log(`Not enough AP. Need ${totalAPCost}, have ${this.gameState.actionPoints}`);
      return;
    }

    // Check if destination is occupied
    const occupiedHexes = getOccupiedHexes(
      this.gameState.units.filter(u => u.id !== this.selectedMapUnit!.id && u.position !== null)
    );
    if (occupiedHexes.has(hexKey(coord))) {
      console.log('Destination hex is occupied');
      return;
    }

    // Move the unit
    console.log(`Moving ${this.selectedMapUnit.type} from (${startPos.q},${startPos.r}) to (${coord.q},${coord.r}), cost: ${totalAPCost} AP`);
    this.selectedMapUnit.position = coord;
    this.gameState.actionPoints -= totalAPCost;

    // Update renderer and UI
    if (this.renderer?.setUnits) {
      this.renderer.setUnits(this.gameState.units);
    }
    this.updateAPDisplay();
    this.deselectMapUnit();
    this.updateControlPanel();
    this.render();
  }

  /**
   * Handle hex click in combat sub-mode
   */
  private handleCombatHexClick(coord: HexCoord): void {
    const currentColor = this.currentTeam === 'team1' ? this.config.team1Color : this.config.team2Color;
    const clickedUnit = this.findUnitAtHex(coord);

    if (!clickedUnit) {
      // Clicked on empty hex - clear selection
      if (this.selectedCombatUnits.length > 0) {
        this.clearCombatSelection();
        this.updateControlPanel();
      }
      return;
    }

    // Check if clicking on a valid target (enemy in range of both selected units)
    if (this.selectedCombatUnits.length === 2) {
      const isTarget = this.validTargets.some((t) => t.id === clickedUnit.id);
      if (isTarget) {
        this.executeFireAction(clickedUnit);
        return;
      }
    }

    // Check if clicking on own unit to select/deselect for combat
    if (clickedUnit.owner.includes(currentColor)) {
      this.selectCombatUnit(clickedUnit);
    } else {
      // Clicked on enemy but not a valid target
      console.log('Enemy unit is not in range of both selected units');
    }
  }

  /**
   * Switch play sub-mode (move vs combat)
   */
  private switchPlaySubMode(subMode: PlaySubMode): void {
    if (this.playSubMode === subMode) return;

    this.playSubMode = subMode;
    this.selectedMapUnit = null;
    this.clearCombatSelection();

    // Update UI
    this.controlPanel?.querySelectorAll('.lab-submode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-submode') === subMode);
    });

    // Show combat ranges when entering combat mode
    if (subMode === 'combat') {
      this.showAllCombatRanges();
    } else {
      this.renderer?.clearHighlights?.();
    }

    this.updateControlPanel();
    console.log('Switched to play sub-mode:', subMode);
  }

  /**
   * Find a unit occupying the given hex
   */
  private findUnitAtHex(coord: HexCoord): Unit | null {
    for (const unit of this.gameState.units) {
      if (!unit.position) continue;
      const footprint = getUnitFootprint(unit.type, unit.position, unit.rotation || 0);
      if (footprint.some(h => h.q === coord.q && h.r === coord.r)) {
        return unit;
      }
    }
    return null;
  }

  /**
   * Calculate hex distance (simple Manhattan-style for hex grid)
   */
  private hexDistance(a: HexCoord, b: HexCoord): number {
    // Using axial distance formula
    return Math.max(
      Math.abs(a.q - b.q),
      Math.abs(a.r - b.r),
      Math.abs((a.q + a.r) - (b.q + b.r))
    );
  }

  /**
   * Get terrain getter function for combat calculations
   */
  private getTerrainGetter(): TerrainGetter {
    return (coord: HexCoord): TerrainType => {
      const terrain = this.gameState.terrain.find(
        (t) => t.coord.q === coord.q && t.coord.r === coord.r
      );
      return terrain?.type ?? TerrainType.Land;
    };
  }

  /**
   * Handle hex right click - remove unit
   * For multi-hex units, right-clicking any occupied hex removes the unit
   */
  private handleHexRightClick(coord: HexCoord): void {
    // Find unit that occupies this hex (check all footprint hexes)
    const unit = this.gameState.units.find(u => {
      if (!u.position) return false;
      const footprint = getUnitFootprint(u.type, u.position, u.rotation || 0);
      return footprint.some(h => h.q === coord.q && h.r === coord.r);
    });

    if (unit) {
      unit.position = null;
      console.log('Removed unit from', coord);

      if (this.renderer?.setUnits) {
        this.renderer.setUnits(this.gameState.units);
      }

      this.createDeploymentInventory();
      this.render();
    }
  }

  /**
   * Deselect current unit
   */
  private deselectUnit(): void {
    this.selectedUnit = null;
    if (this.deploymentInventory) {
      this.deploymentInventory.clearSelection();
    }
  }

  /**
   * Render the current frame
   */
  private render(): void {
    if (this.renderer) {
      this.renderer.render();
    }
  }

  /**
   * Start the render loop
   */
  startRenderLoop(): void {
    const renderFrame = () => {
      this.render();
      requestAnimationFrame(renderFrame);
    };
    requestAnimationFrame(renderFrame);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.controlPanel) {
      this.controlPanel.remove();
    }

    if (this.deploymentInventory) {
      this.deploymentInventory.destroy();
    }

    if (this.renderer) {
      this.renderer.destroy();
    }
  }
}
