/**
 * Lab Mode - Local testing environment for Full Metal Planète
 * Allows testing unit setup, deployment, and gameplay without server connection
 */

import { createRenderer, type IHexRenderer, type RendererType } from '@/client/renderer/renderer-factory';
import { TerrainHex } from '@/client/renderer/terrain-layer';
import { DeploymentInventory } from './ui/deployment-inventory';
import { UnitType, type GameState, type HexCoord, type Unit, type TideLevel, type PlayerColor, type Player } from '@/shared/game/types';
import { hexRotateAround, getUnitFootprint, getOccupiedHexes, isPlacementValid, hexKey } from '@/shared/game/hex';
import { generateDemoMap } from '@/shared/game/map-generator';

interface LabModeConfig {
  team1Color: PlayerColor;
  team2Color: PlayerColor;
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

  // UI elements
  private controlPanel: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement, config: LabModeConfig = { team1Color: 'red', team2Color: 'blue' }) {
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
        astronefPosition: null,
        hasLiftedOff: false,
        savedActionPoints: 0,
      },
      {
        id: team2Id,
        name: 'Team 2',
        color: this.config.team2Color,
        astronefPosition: null,
        hasLiftedOff: false,
        savedActionPoints: 0,
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
      currentPlayer: team1Id,
      phase: 'playing',
      turn: 3,
      turnOrder: [team1Id, team2Id],
      currentTide: 'normal',
      tideSchedule: [],
      actionPoints: 15,
      turnStartTime: Date.now(),
      turnTimeLimit: 300000,
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
      cargo: [],
      minerals: 0,
      actionPointsUsed: 0,
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

    if (this.renderer) {
      const terrainHexes: TerrainHex[] = demoTerrain.map(hex => ({
        coord: { q: hex.coord.q, r: hex.coord.r },
        type: hex.type,
      }));
      this.renderer.setTerrainData(terrainHexes);
      this.renderer.setTide(this.gameState.currentTide);
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
      }
    });

    // Set up zoom controls (reuse the existing HTML elements)
    this.setupZoomControls();
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
      </style>

      <div class="lab-title">Lab Mode</div>

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

      <div class="lab-info">
        Click on map to place selected unit<br>
        Right-click to remove unit
      </div>
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
   * Switch active team
   */
  private switchTeam(team: 'team1' | 'team2'): void {
    this.currentTeam = team;
    this.selectedUnit = null;

    // Update UI
    this.controlPanel?.querySelectorAll('.lab-team-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-team') === team);
    });

    // Recreate deployment inventory for new team
    this.createDeploymentInventory();
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
   * Handle hex click
   */
  private handleHexClick(coord: HexCoord): void {
    if (!this.selectedUnit) return;

    // Get all currently occupied hexes (excluding the unit being placed)
    const otherUnits = this.gameState.units.filter(u =>
      u.id !== this.selectedUnit!.id && u.position !== null
    );
    const occupiedHexes = getOccupiedHexes(otherUnits);

    // Check if placement is valid for multi-hex units
    const rotation = this.selectedUnit.rotation || 0;
    if (!isPlacementValid(this.selectedUnit.type, coord, rotation, occupiedHexes)) {
      console.log('Invalid placement - would overlap with existing units');
      return;
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
    this.render();
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
