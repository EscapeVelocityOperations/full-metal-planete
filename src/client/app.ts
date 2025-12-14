/**
 * Main application orchestrator for Full Metal Planète client
 */

import { createRenderer, type IHexRenderer, type RendererType } from '@/client/renderer/renderer-factory';
import { TerrainHex } from '@/client/renderer/terrain-layer';
import { HEX_SIZE } from '@/client/renderer/types';
import { GameClient } from './game-client';
import { HUD, type LobbyPlayer, type PhaseInfo } from './ui/hud';
import { InputHandler } from './ui/input-handler';
import { DeploymentInventory } from './ui/deployment-inventory';
import { UnitType, TideLevel, type GameState, type HexCoord, type Unit, type MoveAction, type LandAstronefAction, type TerrainType, type GamePhase } from '@/shared/game/types';
import { hexKey, hexRotateAround } from '@/shared/game/hex';
import { generateDemoMap } from '@/shared/game/map-generator';
import { canUnitEnterTerrain } from '@/shared/game/terrain';

export interface GameConfig {
  gameId: string;
  playerId: string;
  token: string;
}

export class GameApp {
  private renderer: IHexRenderer | null = null;
  private rendererType: RendererType = 'css'; // Default to CSS renderer
  private client: GameClient;
  private hud: HUD;
  private input: InputHandler | null = null;
  private canvas: HTMLCanvasElement;
  private config: GameConfig;

  private gameState: GameState | null = null;
  private selectedUnit: Unit | null = null;
  private isMyTurn: boolean = false;
  private lobbyPlayers: LobbyPlayer[] = [];
  private isInLobby: boolean = true;

  // Astronef rotation state (0-5 for 6 orientations, each 60 degrees)
  private astronefRotation: number = 0;
  // Landing preview state
  private landingPreviewCenter: HexCoord | null = null;

  // Deployment inventory UI
  private deploymentInventory: DeploymentInventory | null = null;
  private selectedDeploymentUnitId: string | null = null;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.config = config;
    this.client = new GameClient(config.gameId, config.playerId, config.token);
    this.hud = new HUD();

    this.setupEventHandlers();
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    this.hud.showLoading();

    // Initialize renderer using factory (defaults to CSS, falls back from WebGPU if needed)
    this.renderer = await createRenderer(this.canvas, this.rendererType);
    console.log('Renderer initialized:', this.renderer.getBackend());

    this.input = new InputHandler(this.canvas, this.renderer);
    this.setupInputHandlers();
    this.setupZoomControls();

    // Load placeholder terrain immediately so canvas isn't black
    this.loadPlaceholderTerrain();

    // Start render loop early so we can see the terrain
    this.startRenderLoop();

    // Try to connect to server (non-blocking for demo mode)
    try {
      await this.client.connect();
      console.log('Connected to game server');

      // Fetch initial game status to get player list
      await this.fetchGameStatus();

      this.hud.hideLoading();
      this.hud.showMessage('Connected! Waiting for players...', 2000);
    } catch (error) {
      console.error('Failed to connect:', error);
      this.hud.hideLoading();
      this.hud.showMessage('Demo mode - server not connected', 3000);
    }
  }

  /**
   * Set up game client event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connected', () => {
      console.log('Game client connected');
    });

    this.client.on('disconnected', () => {
      console.log('Game client disconnected');
      this.hud.showMessage('Disconnected from server', 5000);
    });

    this.client.on('playerJoined', (player: any) => {
      console.log('Player joined:', player);
      this.handlePlayerJoined(player);
    });

    this.client.on('playerLeft', (playerId: string) => {
      console.log('Player left:', playerId);
      this.handlePlayerLeft(playerId);
    });

    this.client.on('playerReady', (playerId: string) => {
      console.log('Player ready:', playerId);
      this.handlePlayerReady(playerId);
    });

    this.client.on('gameStart', (gameState: GameState) => {
      console.log('Game started', gameState);
      this.handleGameStart(gameState);
    });

    this.client.on('action', (action: any) => {
      console.log('Action received', action);
      this.handleAction(action);
    });

    this.client.on('turnEnd', (data: { playerId: string; savedAP: number }) => {
      console.log('Turn ended', data);
      this.handleTurnEnd(data);
    });

    this.client.on('stateUpdate', (gameState: GameState) => {
      console.log('State update received', gameState);
      this.handleStateUpdate(gameState);
    });

    this.client.on('error', (error: { code: string; message: string }) => {
      console.error('Game error', error);
      this.hud.showMessage(`Error: ${error.message}`, 5000);
    });

    this.hud.onEndTurn(() => {
      this.handleEndTurn();
    });

    this.hud.onReady(() => {
      this.handleReady();
    });
  }

  /**
   * Set up input handlers
   */
  private setupInputHandlers(): void {
    // Use renderer's hex click handlers if available (CSS renderer)
    // This is necessary because CSS renderer hides the canvas and uses DOM elements
    if (this.renderer?.onHexClick) {
      console.log('Using renderer onHexClick handler');
      this.renderer.onHexClick((coord: HexCoord) => {
        this.handleHexClick(coord);
      });
    }

    if (this.renderer?.onHexRightClick) {
      console.log('Using renderer onHexRightClick handler');
      this.renderer.onHexRightClick((coord: HexCoord) => {
        this.handleHexRightClick(coord);
      });
    }

    // Fallback to InputHandler for canvas-based renderers (WebGPU)
    // and for keyboard events which are always needed
    if (this.input) {
      // Only use InputHandler hex events if renderer doesn't provide them
      if (!this.renderer?.onHexClick) {
        this.input.on('hexClick', (coord: HexCoord) => {
          this.handleHexClick(coord);
        });
      }

      if (!this.renderer?.onHexRightClick) {
        this.input.on('hexRightClick', (coord: HexCoord) => {
          this.handleHexRightClick(coord);
        });
      }

      // Keyboard events are always handled by InputHandler
      this.input.on('escape', () => {
        this.deselectUnit();
      });

      this.input.on('enter', () => {
        this.handleEndTurn();
      });

      // R key to rotate astronef during landing phase
      this.input.on('keydown', (event: KeyboardEvent) => {
        if ((event.key === 'r' || event.key === 'R') && this.gameState?.phase === 'landing') {
          this.rotateAstronef();
        }
      });
    }
  }

  /**
   * Rotate astronef by 60 degrees clockwise
   */
  private rotateAstronef(): void {
    this.astronefRotation = (this.astronefRotation + 1) % 6;
    this.hud.showMessage(`Astronef rotation: ${this.astronefRotation * 60}°`, 1500);

    // Update landing preview if we have one
    if (this.landingPreviewCenter) {
      this.updateLandingPreview(this.landingPreviewCenter);
    }
  }

  /**
   * Set up zoom control handlers
   */
  private setupZoomControls(): void {
    if (!this.renderer) return;

    // Register zoom change callback to update HUD
    if (this.renderer.onZoomChange) {
      this.renderer.onZoomChange((zoom) => {
        this.hud.updateZoomLevel(zoom);
      });
    }

    // Initialize zoom level display
    if (this.renderer.getZoom) {
      this.hud.updateZoomLevel(this.renderer.getZoom());
    }

    // Hook up HUD buttons
    this.hud.onZoomIn(() => {
      if (this.renderer?.zoomIn) {
        this.renderer.zoomIn();
      }
    });

    this.hud.onZoomOut(() => {
      if (this.renderer?.zoomOut) {
        this.renderer.zoomOut();
      }
    });

    this.hud.onZoomFit(() => {
      if (this.renderer?.zoomToFit) {
        this.renderer.zoomToFit();
      }
    });
  }

  /**
   * Fetch initial game status from server
   */
  private async fetchGameStatus(): Promise<void> {
    try {
      // In development, fetch from backend directly
      const isDev = import.meta.env.DEV;
      const baseUrl = isDev ? 'http://localhost:3000' : '';

      const response = await fetch(`${baseUrl}/api/games/${this.config.gameId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch game status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Game status:', data);

      // Update lobby players from API response
      if (data.players) {
        this.lobbyPlayers = data.players.map((p: any) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          isReady: p.isReady || false,
        }));
        this.hud.updatePlayerList(this.lobbyPlayers);
      }

      // If game is already in progress, enter game mode
      if (data.state === 'playing' && data.gameState) {
        this.handleGameStart(data.gameState);
      }
    } catch (error) {
      console.error('Error fetching game status:', error);
    }
  }

  /**
   * Load placeholder terrain for lobby display
   */
  private loadPlaceholderTerrain(): void {
    if (!this.renderer) return;

    // Use renderer's viewport size (handles both WebGPU canvas and CSS container)
    const rect = this.renderer.getViewportSize();

    // Map dimensions: 27 columns (q) x 11 rows (r) - better fit for widescreen (16:9, 16:10)
    const mapWidth = 27;
    const mapHeight = 11;

    // For flat-top hexes with axial coordinates:
    // x = size * (3/2) * q
    // y = size * (sqrt(3)/2 * q + sqrt(3) * r)
    const maxQ = mapWidth - 1;
    const maxR = mapHeight - 1;

    const minX = 0;
    const maxX = HEX_SIZE * 1.5 * maxQ;
    const minY = 0;
    const maxY = HEX_SIZE * (Math.sqrt(3) / 2 * maxQ + Math.sqrt(3) * maxR);

    // Add padding for hex size (hexes extend beyond their center points)
    const padding = HEX_SIZE * 1.2;
    const mapPixelWidth = maxX - minX + padding * 2;
    const mapPixelHeight = maxY - minY + padding * 2;

    // Calculate zoom to fit entire map in viewport (use smaller of width/height fits)
    // Use 95% of viewport to leave a small margin
    const zoomX = (rect.width * 0.95) / mapPixelWidth;
    const zoomY = (rect.height * 0.95) / mapPixelHeight;
    const zoom = Math.min(zoomX, zoomY);

    // Map center in world coordinates
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Set viewport: x,y is the world coordinate at screen center
    // Camera at map center with zoom to fit entirely
    this.renderer.setViewport({
      width: rect.width,
      height: rect.height,
      x: centerX,
      y: centerY,
      zoom,
    });

    const demoTerrain = generateDemoMap();
    // Map to TerrainHex format expected by terrain-layer (coord: { q, r })
    const terrainHexes: TerrainHex[] = demoTerrain.map((hex) => ({
      coord: { q: hex.coord.q, r: hex.coord.r },
      type: hex.type,
    }));

    this.renderer.setTerrainData(terrainHexes);
    this.renderer.setTide('normal');
    this.render();
  }

  /**
   * Handle ready button click
   */
  private handleReady(): void {
    this.client.sendReady();
    this.hud.showMessage('Ready! Waiting for other players...', 2000);
  }

  /**
   * Handle player joined event
   */
  private handlePlayerJoined(player: any): void {
    const lobbyPlayer: LobbyPlayer = {
      id: player.id,
      name: player.name,
      color: player.color,
      isReady: player.isReady || false,
    };

    // Check if player already exists (reconnect)
    const existingIndex = this.lobbyPlayers.findIndex(p => p.id === player.id);
    if (existingIndex >= 0) {
      this.lobbyPlayers[existingIndex] = lobbyPlayer;
    } else {
      this.lobbyPlayers.push(lobbyPlayer);
    }

    this.hud.updatePlayerList(this.lobbyPlayers);
    this.hud.showMessage(`${player.name} joined!`, 2000);
  }

  /**
   * Handle player left event
   */
  private handlePlayerLeft(playerId: string): void {
    const player = this.lobbyPlayers.find(p => p.id === playerId);
    this.lobbyPlayers = this.lobbyPlayers.filter(p => p.id !== playerId);
    this.hud.updatePlayerList(this.lobbyPlayers);

    if (player) {
      this.hud.showMessage(`${player.name} left`, 2000);
    }
  }

  /**
   * Handle player ready event
   */
  private handlePlayerReady(playerId: string): void {
    const player = this.lobbyPlayers.find(p => p.id === playerId);
    if (player) {
      player.isReady = true;
      this.hud.updatePlayerList(this.lobbyPlayers);
      this.hud.showMessage(`${player.name} is ready!`, 2000);
    }
  }

  /**
   * Handle game start
   */
  private handleGameStart(gameState: GameState): void {
    this.isInLobby = false;
    this.gameState = gameState;
    this.hud.enterGameMode();

    // Set up player colors mapping for the renderer
    this.initializePlayerColors();

    // Initialize deployment inventory
    this.initializeDeploymentInventory();

    this.updateGameState(gameState);
    this.hud.showMessage('Game started!', 3000);
  }

  /**
   * Initialize player color mapping for the renderer
   * Maps player IDs (e.g., "p1-abc123") to colors (e.g., "red")
   */
  private initializePlayerColors(): void {
    if (!this.renderer?.setPlayerColors) return;

    const playerColors: Record<string, string> = {};
    for (const player of this.lobbyPlayers) {
      playerColors[player.id] = player.color;
    }
    console.log('Setting player colors:', playerColors);
    this.renderer.setPlayerColors(playerColors);
  }

  /**
   * Initialize deployment inventory UI
   */
  private initializeDeploymentInventory(): void {
    if (this.deploymentInventory) {
      this.deploymentInventory.destroy();
    }

    // Get player info from lobby players
    const myPlayer = this.lobbyPlayers.find(p => p.id === this.client['playerId']);
    const playerId = this.client['playerId'];
    const playerColor = myPlayer?.color || 'red';

    this.deploymentInventory = new DeploymentInventory({
      playerId,
      playerColor,
      onUnitSelect: (unitType: UnitType, unitId: string) => {
        this.selectedDeploymentUnitId = unitId;
        console.log('Selected deployment unit:', unitType, unitId);
      },
      onRotate: () => {
        // Handled by R key
      },
    });
  }

  /**
   * Update game state and UI
   */
  private updateGameState(gameState: Partial<GameState>): void {
    if (!this.gameState) return;

    this.gameState = { ...this.gameState, ...gameState };

    if (gameState.terrain && this.renderer) {
      const terrainHexes: TerrainHex[] = gameState.terrain.map((hex) => ({
        coord: { q: hex.coord.q, r: hex.coord.r },
        type: hex.type,
      }));
      this.renderer.setTerrainData(terrainHexes);
    }

    if (gameState.currentTide && this.renderer) {
      this.renderer.setTide(gameState.currentTide);
      this.hud.updateTide(gameState.currentTide);
    }

    // Update units rendering
    if (this.renderer?.setUnits && this.gameState.units) {
      console.log('Updating units in renderer:', this.gameState.units.length, 'units');
      this.renderer.setUnits(this.gameState.units);
    }

    if (gameState.turn !== undefined) {
      this.hud.updateTurn(gameState.turn);
    }

    if (gameState.actionPoints !== undefined && gameState.turn !== undefined) {
      const maxAP = this.calculateMaxAP();
      this.hud.updateActionPoints(gameState.actionPoints, maxAP);
    }

    if (gameState.turnStartTime && gameState.turnTimeLimit) {
      const remaining = gameState.turnTimeLimit - (Date.now() - gameState.turnStartTime);
      this.hud.startTimer(Math.max(0, remaining));
    }

    this.checkMyTurn();
    this.render();
  }

  /**
   * Calculate maximum action points for current turn
   */
  private calculateMaxAP(): number {
    if (!this.gameState) return 15;

    const baseAP = this.gameState.turn === 3 ? 5 : this.gameState.turn === 4 ? 10 : 15;
    return baseAP;
  }

  /**
   * Check if it's the current player's turn and update phase info
   */
  private checkMyTurn(): void {
    if (!this.gameState) return;

    this.isMyTurn = this.gameState.currentPlayer === this.client['playerId'];
    this.hud.setEndTurnEnabled(this.isMyTurn);

    // Update phase and current player display
    const currentPlayerData = this.getPlayerData(this.gameState.currentPlayer);
    const phaseInfo: PhaseInfo = {
      phase: this.gameState.phase,
      isMyTurn: this.isMyTurn,
      currentPlayerName: currentPlayerData?.name || 'Unknown',
      currentPlayerColor: currentPlayerData?.color || 'red',
    };
    this.hud.updatePhaseInfo(phaseInfo);
    this.hud.showInstructions();

    // Handle deployment inventory visibility
    this.updateDeploymentInventory();
  }

  /**
   * Update deployment inventory based on game phase
   */
  private updateDeploymentInventory(): void {
    if (!this.deploymentInventory || !this.gameState) return;

    if (this.gameState.phase === 'deployment' && this.isMyTurn) {
      // Set units from game state
      this.deploymentInventory.setUnits(this.gameState.units);

      // Find already deployed units (units not in astronef, i.e. have non-astronef position)
      const deployedUnitIds = this.gameState.units
        .filter(u => {
          // A unit is deployed if it's on the map and not an astronef/tower
          if (u.type === UnitType.Astronef || u.type === UnitType.Tower) return false;
          // Check if unit has a position (deployed) or is still in astronef (not deployed)
          return u.position !== null;
        })
        .map(u => u.id);

      this.deploymentInventory.setDeployedUnits(deployedUnitIds);
      this.deploymentInventory.show();
    } else {
      this.deploymentInventory.hide();
      this.selectedDeploymentUnitId = null;
    }
  }

  /**
   * Get player data by ID
   */
  private getPlayerData(playerId: string): LobbyPlayer | undefined {
    return this.lobbyPlayers.find(p => p.id === playerId);
  }

  /**
   * Handle hex click
   */
  private handleHexClick(coord: HexCoord): void {
    if (!this.isMyTurn || !this.gameState) return;

    // Handle different phases
    if (this.gameState.phase === 'landing') {
      this.handleLandingPhaseClick(coord);
      return;
    }

    if (this.gameState.phase === 'deployment') {
      this.handleDeploymentPhaseClick(coord);
      return;
    }

    // Normal gameplay (playing phase)
    const unit = this.getUnitAtHex(coord);

    if (this.selectedUnit) {
      if (unit && unit.owner === this.client['playerId']) {
        this.selectUnit(unit);
      } else {
        this.moveSelectedUnit(coord);
      }
    } else if (unit && unit.owner === this.client['playerId']) {
      this.selectUnit(unit);
    }
  }

  /**
   * Handle hex click during deployment phase
   * Players deploy units from the astronef to adjacent hexes
   */
  private handleDeploymentPhaseClick(coord: HexCoord): void {
    if (!this.gameState || !this.deploymentInventory) return;

    // Get selected unit from inventory
    const selectedUnit = this.deploymentInventory.getSelectedUnit();
    if (!selectedUnit) {
      this.hud.showMessage('Select a unit from the inventory first', 2000);
      return;
    }

    // Check if hex is valid for deployment (adjacent to astronef)
    const player = this.gameState.players.find(p => p.id === this.client['playerId']);
    if (!player?.astronefPosition || player.astronefPosition.length === 0) {
      this.hud.showMessage('Astronef not landed yet', 2000);
      return;
    }

    // Check if clicked hex is adjacent to any astronef hex
    const astronefHexes = player.astronefPosition;
    const isAdjacent = astronefHexes.some(astronefHex =>
      this.getNeighbors(astronefHex).some(neighbor =>
        neighbor.q === coord.q && neighbor.r === coord.r
      )
    );

    if (!isAdjacent) {
      this.hud.showMessage('Must deploy adjacent to astronef', 2000);
      return;
    }

    // Check terrain validity for the unit type
    const terrain = this.getTerrainAtHex(coord);
    if (!terrain) {
      this.hud.showMessage('Invalid hex', 2000);
      return;
    }

    // Validate terrain compatibility for the unit type
    const terrainType = terrain as TerrainType;
    const currentTide = this.gameState.currentTide || TideLevel.Normal;

    if (!canUnitEnterTerrain(selectedUnit.type, terrainType, currentTide)) {
      const unitTypeName = selectedUnit.type.charAt(0).toUpperCase() + selectedUnit.type.slice(1);
      this.hud.showMessage(`${unitTypeName} cannot deploy on ${terrain} terrain`, 2000);
      return;
    }

    // Check if hex is occupied
    const existingUnit = this.getUnitAtHex(coord);
    if (existingUnit) {
      this.hud.showMessage('Hex already occupied', 2000);
      return;
    }

    // Deploy the unit (local optimistic update)
    selectedUnit.position = coord;
    this.deploymentInventory.setDeployedUnits([
      ...this.gameState.units
        .filter(u => u.type !== UnitType.Astronef && u.type !== UnitType.Tower && u.position !== null)
        .map(u => u.id),
      selectedUnit.id,
    ]);
    this.deploymentInventory.clearSelection();
    this.selectedDeploymentUnitId = null;

    // Update renderer
    if (this.renderer?.setUnits) {
      this.renderer.setUnits(this.gameState.units);
    }

    this.hud.showMessage(`Deployed ${selectedUnit.type}`, 1500);
    this.render();
  }

  /**
   * Get neighboring hex coordinates
   */
  private getNeighbors(hex: HexCoord): HexCoord[] {
    const directions = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    return directions.map(d => ({ q: hex.q + d.q, r: hex.r + d.r }));
  }

  /**
   * Handle hex click during Landing phase
   * The astronef occupies 4 hexes (center + 3 podes for towers)
   */
  private handleLandingPhaseClick(coord: HexCoord): void {
    if (!this.gameState) return;

    // Check if the clicked hex is valid terrain for landing (Land or Marsh)
    const terrain = this.getTerrainAtHex(coord);
    if (!terrain || (terrain !== 'land' && terrain !== 'marsh')) {
      this.hud.showMessage('Astronef must land on Land or Marsh terrain', 3000);
      return;
    }

    // Calculate all 4 astronef hex positions (center + 3 podes)
    const astronefPositions = this.calculateAstronefHexes(coord);

    // Check all hexes are on valid terrain
    for (const hex of astronefPositions) {
      const hexTerrain = this.getTerrainAtHex(hex);
      if (!hexTerrain || (hexTerrain !== 'land' && hexTerrain !== 'marsh')) {
        this.hud.showMessage('All astronef hexes must be on Land or Marsh terrain', 3000);
        return;
      }
    }

    // Send the landing action with all 4 positions
    const action: LandAstronefAction = {
      type: 'LAND_ASTRONEF',
      playerId: this.client['playerId'],
      position: astronefPositions,
      timestamp: Date.now(),
    };

    this.client.sendAction(action);
    this.hud.showMessage('Landing astronef...', 2000);
    // Server will send STATE_UPDATE with authoritative state
  }

  /**
   * Calculate all 4 astronef hex positions (center + 3 podes)
   * Uses current rotation state to determine orientation
   */
  private calculateAstronefHexes(center: HexCoord): HexCoord[] {
    // Base astronef shape (rotation 0):
    // Center hex plus 3 podes in a triangular formation
    const basePodes: HexCoord[] = [
      { q: 1, r: 0 },   // East
      { q: 0, r: 1 },   // Southeast
      { q: 1, r: -1 },  // Northeast
    ];

    // Apply rotation to each pode relative to center
    const rotatedPodes = basePodes.map(pode =>
      hexRotateAround(
        { q: center.q + pode.q, r: center.r + pode.r },
        center,
        this.astronefRotation
      )
    );

    return [center, ...rotatedPodes];
  }

  /**
   * Update landing preview display (shows astronef outline on hover)
   */
  private updateLandingPreview(center: HexCoord): void {
    this.landingPreviewCenter = center;
    // Could add visual preview highlighting here in future
    // For now, preview is implicit in click behavior
  }

  /**
   * Get terrain type at a specific hex
   */
  private getTerrainAtHex(coord: HexCoord): string | null {
    if (!this.gameState) return null;

    const hex = this.gameState.terrain.find(
      t => t.coord.q === coord.q && t.coord.r === coord.r
    );
    return hex ? hex.type : null;
  }

  /**
   * Handle hex right click
   */
  private handleHexRightClick(coord: HexCoord): void {
    console.log('Right clicked hex:', coord);
  }

  /**
   * Select a unit
   */
  private selectUnit(unit: Unit): void {
    this.selectedUnit = unit;
    this.hud.showMessage(`Selected ${unit.type}`, 2000);
    console.log('Selected unit:', unit);
  }

  /**
   * Deselect current unit
   */
  private deselectUnit(): void {
    if (this.selectedUnit) {
      this.selectedUnit = null;
      this.hud.showMessage('Unit deselected', 1000);
    }
  }

  /**
   * Move selected unit to destination
   */
  private moveSelectedUnit(destination: HexCoord): void {
    if (!this.selectedUnit || !this.gameState) return;

    // Validate terrain compatibility for the unit type
    const terrain = this.getTerrainAtHex(destination);
    if (!terrain) {
      this.hud.showMessage('Invalid destination', 2000);
      return;
    }

    const terrainType = terrain as TerrainType;
    const currentTide = this.gameState.currentTide || TideLevel.Normal;

    if (!canUnitEnterTerrain(this.selectedUnit.type, terrainType, currentTide)) {
      const unitTypeName = this.selectedUnit.type.charAt(0).toUpperCase() + this.selectedUnit.type.slice(1);
      this.hud.showMessage(`${unitTypeName} cannot enter ${terrain} terrain`, 2000);
      return;
    }

    const path = this.calculatePath(this.selectedUnit.position!, destination);
    const apCost = path.length - 1;

    if (apCost > this.gameState.actionPoints) {
      this.hud.showMessage('Not enough action points', 2000);
      return;
    }

    const action: MoveAction = {
      type: 'MOVE',
      playerId: this.client['playerId'],
      unitId: this.selectedUnit.id,
      path,
      apCost,
      timestamp: Date.now(),
    };

    this.client.sendAction(action);

    this.gameState.actionPoints -= apCost;
    this.selectedUnit.position = destination;
    this.updateGameState({ actionPoints: this.gameState.actionPoints });

    this.deselectUnit();
  }

  /**
   * Calculate simple path between two hexes (straight line for MVP)
   */
  private calculatePath(from: HexCoord, to: HexCoord): HexCoord[] {
    return [from, to];
  }

  /**
   * Get unit at specific hex
   */
  private getUnitAtHex(coord: HexCoord): Unit | null {
    if (!this.gameState) return null;

    return (
      this.gameState.units.find(
        (unit) => unit.position.q === coord.q && unit.position.r === coord.r
      ) || null
    );
  }

  /**
   * Handle action from server
   */
  private handleAction(action: any): void {
    if (!this.gameState) return;

    switch (action.type) {
      case 'MOVE': {
        const unit = this.gameState.units.find((u) => u.id === action.unitId);
        if (unit) {
          unit.position = action.path[action.path.length - 1];
          this.render();
        }
        break;
      }

      case 'LAND_ASTRONEF': {
        // Update astronef position
        const astronef = this.gameState.units.find(
          (u) => u.type === UnitType.Astronef && u.owner === action.playerId
        );
        if (astronef && action.position?.length >= 1) {
          astronef.position = action.position[0];
        }

        // Update tower positions (positions 1, 2, 3 correspond to podes)
        const towers = this.gameState.units.filter(
          (u) => u.type === UnitType.Tower && u.owner === action.playerId
        );
        towers.forEach((tower, index) => {
          if (action.position?.[index + 1]) {
            tower.position = action.position[index + 1];
          }
        });

        // Update player's astronef position
        const player = this.gameState.players.find((p) => p.id === action.playerId);
        if (player) {
          player.astronefPosition = action.position;
        }

        this.hud.showMessage(`${player?.name || 'Player'} landed their astronef!`, 3000);
        this.render();
        break;
      }
    }
  }

  /**
   * Handle turn end
   */
  private handleTurnEnd(data?: { playerId: string; savedAP: number }): void {
    if (!this.gameState) return;

    if (data) {
      const nextPlayerIndex =
        (this.gameState.turnOrder.indexOf(data.playerId) + 1) %
        this.gameState.turnOrder.length;

      const nextPlayer = this.gameState.turnOrder[nextPlayerIndex];
      const isNewTurn = nextPlayerIndex === 0;

      this.gameState.currentPlayer = nextPlayer;

      if (isNewTurn) {
        this.gameState.turn++;
      }

      this.updateGameState(this.gameState);
    }
  }

  /**
   * Handle end turn button click
   */
  private handleEndTurn(): void {
    if (!this.isMyTurn || !this.gameState) return;

    const savedAP = Math.min(this.gameState.actionPoints, 10);
    this.client.endTurn(savedAP);

    this.hud.showMessage('Turn ended', 2000);
    this.deselectUnit();
  }

  /**
   * Handle authoritative state update from server
   */
  private handleStateUpdate(gameState: GameState): void {
    // Replace local state with server's authoritative state
    this.gameState = gameState;
    this.updateGameState(gameState);

    // Show appropriate message based on phase
    if (gameState.phase === 'deployment') {
      this.hud.showMessage('All astronefs landed! Deployment phase begins.', 4000);
    } else {
      // Find the current player name for messaging
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer) {
        const isMe = gameState.currentPlayer === this.client['playerId'];
        if (isMe) {
          this.hud.showMessage('Your turn to land!', 3000);
        } else {
          this.hud.showMessage(`${currentPlayer.name}'s turn to land`, 2000);
        }
      }
    }

    this.render();
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
    this.hud.destroy();
    this.client.disconnect();

    if (this.input) {
      this.input.destroy();
    }

    if (this.renderer) {
      this.renderer.destroy();
    }

    if (this.deploymentInventory) {
      this.deploymentInventory.destroy();
    }
  }
}
