/**
 * Main application orchestrator for Full Metal Planète client
 */

import { createRenderer, type IHexRenderer, type RendererType } from '@/client/renderer/renderer-factory';
import { TerrainHex } from '@/client/renderer/terrain-layer';
import { HEX_SIZE } from '@/client/renderer/types';
import { GameClient } from './game-client';
import { HUD, type LobbyPlayer, type PhaseInfo, type UnitActionContext, type ActionHistoryEntry } from './ui/hud';
import { InputHandler } from './ui/input-handler';
import { DeploymentInventory } from './ui/deployment-inventory';
import { HelpPanel } from './ui/help-panel';
import { getAudioManager, type AudioManager } from './audio';
import { UnitType, TideLevel, GamePhase, UNIT_PROPERTIES, type GameState, type HexCoord, type Unit, type MoveAction, type LandAstronefAction, type LoadAction, type UnloadAction, type TerrainType, type HexTerrain } from '@/shared/game/types';
import { hexKey, hexRotateAround, findPath, getReachableHexes, type PathTerrainGetter, getOccupiedHexes } from '@/shared/game/hex';
import { generateDemoMap } from '@/shared/game/map-generator';
import { canUnitEnterTerrain } from '@/shared/game/terrain';
import { getFireableHexes, getSharedFireableHexes, isCombatUnit, canUnitFire, getHexCoverageInfo, type TerrainGetter, type HexCoverageInfo } from '@/shared/game/combat';
import { getTideForecast, getPlayerConverterCount, calculateTakeOffCost, canLiftOff, executeLiftOff, calculateAllScores, calculateScore, getWinners, setLiftOffDecision, getMineralStats } from '@/shared/game/state';
import type { LiftOffDecisionAck, LiftOffDecisionsRevealed } from './game-client';
import type { ReplayAction, ReplayData } from '@/shared/game/replay';
import { createReplayData, describeAction } from '@/shared/game/replay';
import { ReplayManager, ReplayControls } from './replay/index';

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
  private audio: AudioManager;

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

  // Help panel
  private helpPanel: HelpPanel | null = null;

  // Movement preview state
  private movementPreviewDestination: HexCoord | null = null;
  private movementPreviewPath: HexCoord[] = [];
  private movementPreviewAPCost: number = 0;

  // Action history and undo state
  private turnActionHistory: ActionHistoryEntry[] = [];
  private turnStateSnapshots: GameState[] = [];
  private actionSequence: number = 0;

  // Audio state tracking
  private previousTide: TideLevel | null = null;

  // Replay system state
  private gameActionLog: ReplayAction[] = [];
  private globalActionSequence: number = 0;
  private initialGameState: GameState | null = null;
  private replayManager: ReplayManager | null = null;
  private replayControls: ReplayControls | null = null;
  private isReplayMode: boolean = false;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.config = config;
    this.client = new GameClient(config.gameId, config.playerId, config.token);
    this.hud = new HUD();
    this.audio = getAudioManager();

    this.setupEventHandlers();
    this.setupAudioControls();
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    this.hud.showLoading();

    // Initialize audio (will be fully activated on first user interaction)
    await this.audio.initialize();

    // Initialize renderer using factory (defaults to CSS, falls back from WebGPU if needed)
    this.renderer = await createRenderer(this.canvas, this.rendererType);
    console.log('Renderer initialized:', this.renderer.getBackend());

    this.input = new InputHandler(this.canvas, this.renderer);
    this.setupInputHandlers();
    this.setupZoomControls();

    // Initialize help panel
    this.helpPanel = new HelpPanel();
    this.helpPanel.initialize();

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
      this.hud.showMessage('Disconnected - attempting to reconnect...', 5000);
    });

    this.client.on('reconnected', (data: { gameState: GameState; players: any[]; roomState: string }) => {
      console.log('Reconnected to game', data);
      this.handleReconnected(data);
    });

    this.client.on('playerReconnected', (data: { playerId: string; player: any }) => {
      console.log('Player reconnected:', data);
      this.handlePlayerReconnected(data);
    });

    this.client.on('playerDisconnected', (playerId: string) => {
      console.log('Player disconnected:', playerId);
      this.handlePlayerDisconnected(playerId);
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

    this.client.on('liftOffDecisionAck', (data: LiftOffDecisionAck) => {
      console.log('Lift-off decision acknowledged', data);
      this.handleLiftOffDecisionAck(data);
    });

    this.client.on('liftOffDecisionsRevealed', (data: LiftOffDecisionsRevealed) => {
      console.log('Lift-off decisions revealed', data);
      this.handleLiftOffDecisionsRevealed(data);
    });

    this.hud.onEndTurn(() => {
      this.handleEndTurn();
    });

    this.hud.onTimerExpired(() => {
      // Auto-end turn on timeout (only if it's my turn)
      if (this.isMyTurn) {
        this.hud.showMessage('Time expired! Turn ended automatically.', 3000);
        this.handleEndTurn(true); // Pass timeout flag
      }
    });

    this.hud.onReady(() => {
      this.handleReady();
    });

    this.hud.onLiftOff(() => {
      this.handleLiftOff();
    });

    this.hud.onLoad((mineralId: string) => {
      this.handleLoadMineral(mineralId);
    });

    this.hud.onUnload((cargoId: string, destination: HexCoord) => {
      this.handleUnloadCargo(cargoId, destination);
    });

    this.hud.onUndo(() => {
      this.handleUndo();
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
   * Set up audio control handlers
   */
  private setupAudioControls(): void {
    // Connect HUD audio controls to AudioManager
    this.hud.onAudioMuteToggle(() => {
      const muted = this.audio.toggleMute();
      this.hud.updateAudioMuteState(muted);
      this.audio.play('click');
    });

    this.hud.onAudioVolumeChange((volume: number) => {
      this.audio.setMasterVolume(volume);
    });

    // Initialize HUD with current audio state
    this.hud.updateAudioMuteState(this.audio.isMuted());
    this.hud.updateAudioVolume(this.audio.getSettings().masterVolume);
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
    this.renderer.setTide(TideLevel.Normal);
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
   * Handle reconnection to game (this client reconnected)
   */
  private handleReconnected(data: { gameState: GameState; players: any[]; roomState: string }): void {
    // Update lobby players with connection status
    this.lobbyPlayers = data.players.map((p: any) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isReady: p.isReady || false,
      isConnected: p.isConnected ?? true,
    }));

    if (data.roomState === 'playing' && data.gameState) {
      // Restore game state
      this.isInLobby = false;
      this.gameState = data.gameState;

      // Make sure we're in game mode
      if (this.hud.isLobbyMode()) {
        this.hud.enterGameMode();
        this.initializePlayerColors();
        this.initializeDeploymentInventory();
        this.hud.showScoreboard();
        this.hud.showMineralStats();
      }

      this.updateGameState(data.gameState);
      this.hud.showMessage('Reconnected to game!', 3000);
    } else {
      // Still in lobby
      this.hud.updatePlayerList(this.lobbyPlayers);
      this.hud.showMessage('Reconnected to lobby!', 2000);
    }
  }

  /**
   * Handle another player reconnecting
   */
  private handlePlayerReconnected(data: { playerId: string; player: any }): void {
    const existingIndex = this.lobbyPlayers.findIndex(p => p.id === data.playerId);
    const lobbyPlayer: LobbyPlayer = {
      id: data.player.id,
      name: data.player.name,
      color: data.player.color,
      isReady: data.player.isReady || false,
    };

    if (existingIndex >= 0) {
      this.lobbyPlayers[existingIndex] = lobbyPlayer;
    } else {
      this.lobbyPlayers.push(lobbyPlayer);
    }

    this.hud.updatePlayerList(this.lobbyPlayers);

    // Update connection status in scoreboard if in game
    if (this.gameState) {
      const player = this.gameState.players.find(p => p.id === data.playerId);
      if (player) {
        player.isConnected = true;
      }
      this.updateScoreboard();
      this.updateMineralStatsDisplay();
    }

    this.hud.showMessage(`${data.player.name} reconnected!`, 2000);
  }

  /**
   * Handle another player disconnecting (during game)
   */
  private handlePlayerDisconnected(playerId: string): void {
    // Update connection status in game state
    if (this.gameState) {
      const player = this.gameState.players.find(p => p.id === playerId);
      if (player) {
        player.isConnected = false;
        const lobbyPlayer = this.lobbyPlayers.find(p => p.id === playerId);
        this.hud.showMessage(`${lobbyPlayer?.name || 'A player'} disconnected`, 3000);
        this.updateScoreboard();
        this.updateMineralStatsDisplay();
      }
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

    // Capture initial state for replay
    this.initialGameState = JSON.parse(JSON.stringify(gameState));
    this.gameActionLog = [];
    this.globalActionSequence = 0;

    // Set up player colors mapping for the renderer
    this.initializePlayerColors();

    // Initialize deployment inventory
    this.initializeDeploymentInventory();

    // Initialize action history panel
    this.hud.showActionHistory();
    this.clearTurnActionHistory();

    // Set up replay callback
    this.hud.onWatchReplay(() => this.enterReplayMode());

    this.updateGameState(gameState);
    this.hud.showScoreboard();
    this.hud.showMineralStats();
    this.hud.showTurnOrder();
    this.hud.showMessage('Game started!', 3000);

    // Play game start sound
    this.audio.play('success');
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

      // Play tide change sound if tide actually changed
      if (this.previousTide !== null && this.previousTide !== gameState.currentTide) {
        this.audio.play('tideChange');
      }
      this.previousTide = gameState.currentTide;
    }

    // Update tide forecast based on converter ownership
    if (this.gameState) {
      const playerId = this.client['playerId'];
      const converterCount = getPlayerConverterCount(this.gameState, playerId);
      const forecast = getTideForecast(this.gameState, playerId);
      this.hud.updateTideForecast(forecast, converterCount);
    }

    // Update units rendering
    if (this.renderer?.setUnits && this.gameState.units) {
      console.log('Updating units in renderer:', this.gameState.units.length, 'units');
      this.renderer.setUnits(this.gameState.units);
    }

    // Update minerals rendering
    if (this.renderer?.setMinerals && this.gameState.minerals) {
      console.log('Updating minerals in renderer:', this.gameState.minerals.length, 'minerals');
      this.renderer.setMinerals(this.gameState.minerals);
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
    this.updateLiftOffUI();
    this.updateScoreboard();
    this.updateMineralStatsDisplay();
    this.updateUnderFireZones();
    this.render();
  }

  /**
   * Update lift-off UI elements based on current turn
   */
  private updateLiftOffUI(): void {
    if (!this.gameState || !this.isMyTurn) {
      this.hud.hideLiftOffButton();
      this.hud.hideLiftOffDecision();
      return;
    }

    const playerId = this.client['playerId'];
    const player = this.gameState.players.find(p => p.id === playerId);

    // Player already lifted off - no UI needed
    if (player?.hasLiftedOff) {
      this.hud.hideLiftOffButton();
      this.hud.hideLiftOffDecision();
      return;
    }

    const turn = this.gameState.turn;
    const cost = calculateTakeOffCost(this.gameState, playerId);

    // Turn 21: Show secret lift-off decision modal (once per player)
    if (turn === 21 && !this.gameState.liftOffDecisions?.[playerId]) {
      this.hud.showLiftOffDecision(cost, (decision) => {
        this.handleLiftOffDecision(decision);
      });
    }

    // Turns 21-25: Show lift-off button
    if (turn >= 21 && turn <= 25) {
      this.hud.showLiftOffButton(cost, this.gameState.actionPoints);
    } else {
      this.hud.hideLiftOffButton();
    }

    // Check for game over
    this.checkGameOver();
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
          // Check if unit has been deployed (position not at origin 0,0)
          // Server initializes undeployed units at {q:0, r:0}
          return u.position !== null && (u.position.q !== 0 || u.position.r !== 0);
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
        // Clicked on own unit - select it instead
        this.clearMovementPreview();
        this.selectUnit(unit);
      } else if (this.movementPreviewDestination &&
                 this.movementPreviewDestination.q === coord.q &&
                 this.movementPreviewDestination.r === coord.r) {
        // Clicked on the previewed destination - confirm movement
        this.confirmMovement();
      } else {
        // Clicked on a new hex - show movement preview
        this.showMovementPreview(coord);
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
        .filter(u => u.type !== UnitType.Astronef && u.type !== UnitType.Tower && u.position !== null && (u.position.q !== 0 || u.position.r !== 0))
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
    // Play landing sound
    this.audio.play('landing');
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
   * Create a terrain getter function from game state
   */
  private createTerrainGetter(): TerrainGetter {
    if (!this.gameState) {
      return () => 'land' as TerrainType;
    }
    const terrainMap = new Map<string, TerrainType>();
    for (const t of this.gameState.terrain) {
      terrainMap.set(hexKey(t.coord), t.type);
    }
    return (coord: HexCoord) => terrainMap.get(hexKey(coord)) ?? ('sea' as TerrainType);
  }

  /**
   * Create a path terrain getter (returns TerrainType directly)
   */
  private createPathTerrainGetter(): PathTerrainGetter {
    if (!this.gameState) {
      return () => 'land' as TerrainType;
    }
    const terrainMap = new Map<string, TerrainType>();
    for (const t of this.gameState.terrain) {
      terrainMap.set(hexKey(t.coord), t.type);
    }
    return (coord: HexCoord) => terrainMap.get(hexKey(coord)) ?? ('sea' as TerrainType);
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

    // Play unit selection sound
    this.audio.play('unitSelect');

    // Show unit context panel for transporter units
    this.showUnitContextPanel(unit);

    // Visual highlight on the unit
    if (this.renderer?.setUnitSelected) {
      this.renderer.clearUnitSelections?.();
      this.renderer.setUnitSelected(unit.id, true);
    }

    // Show combat range visualization for combat units
    this.showCombatRangeVisualization(unit);

    // Show reachable hexes for mobile units
    this.showReachableHexes(unit);
  }

  /**
   * Show combat range visualization for a selected combat unit
   */
  private showCombatRangeVisualization(unit: Unit): void {
    if (!this.gameState || !unit.position || !this.renderer?.setHighlightedHexes) return;

    // Only show for combat units that can fire
    if (!isCombatUnit(unit) || !canUnitFire(unit)) return;

    const getTerrainAt = this.createTerrainGetter();
    const fireableHexes = getFireableHexes(unit, getTerrainAt);

    if (fireableHexes.length > 0) {
      // Show firing range
      this.renderer.setHighlightedHexes(fireableHexes, 'range');

      // Highlight enemy units within range as potential targets
      const enemyTargets = this.gameState.units.filter(u => {
        if (!u.position) return false;
        if (u.owner === unit.owner) return false;
        return fireableHexes.some(h => h.q === u.position!.q && h.r === u.position!.r);
      });

      if (enemyTargets.length > 0) {
        const targetHexes = enemyTargets.map(u => u.position!);
        this.renderer.setHighlightedHexes(targetHexes, 'target');
      }
    }
  }

  /**
   * Show reachable hexes for a mobile unit based on current AP
   */
  private showReachableHexes(unit: Unit): void {
    if (!this.gameState || !unit.position || !this.renderer?.setHighlightedHexes) return;

    // Skip immobile units
    const movementCost = UNIT_PROPERTIES[unit.type].movementCost;
    if (!isFinite(movementCost) || unit.isStuck || unit.isNeutralized) return;

    const getTerrainAt = this.createPathTerrainGetter();
    const occupiedHexes = getOccupiedHexes(this.gameState.units);
    // Remove the current unit's position from occupied set
    occupiedHexes.delete(hexKey(unit.position));

    const reachable = getReachableHexes(
      unit.position,
      unit.type,
      this.gameState.actionPoints,
      getTerrainAt,
      this.gameState.currentTide || TideLevel.Normal,
      occupiedHexes
    );

    // Convert to array of coordinates
    const reachableCoords: HexCoord[] = [];
    for (const [key] of reachable) {
      const [q, r] = key.split(',').map(Number);
      reachableCoords.push({ q, r });
    }

    // Only highlight if not a combat unit (to avoid visual clutter with combat range)
    if (reachableCoords.length > 0 && !isCombatUnit(unit)) {
      // Green highlight for reachable hexes
      this.renderer.setHighlightedHexes(reachableCoords, 'selected');
    }
  }

  /**
   * Deselect current unit
   */
  private deselectUnit(): void {
    if (this.selectedUnit) {
      this.clearMovementPreview();
      this.selectedUnit = null;
      this.hud.hideUnitActions();
      this.hud.showMessage('Unit deselected', 1000);
      // Play deselection sound
      this.audio.play('unitDeselect');
      // Clear visual highlights
      this.renderer?.clearHighlights?.();
      this.renderer?.clearUnitSelections?.();
    }
  }

  /**
   * Show unit context action panel for a unit
   */
  private showUnitContextPanel(unit: Unit): void {
    if (!this.gameState || !unit.position) return;

    // Get minerals at unit's position
    const mineralsAtPosition = this.gameState.minerals.filter(
      m => m.position.q === unit.position!.q && m.position.r === unit.position!.r
    );

    // Get unit's cargo
    const cargo = unit.cargo || [];
    const cargoSlots = UNIT_PROPERTIES[unit.type].cargoSlots;

    // Get adjacent hexes for dropping cargo
    const adjacentHexes = this.getNeighbors(unit.position).filter(hex => {
      const terrain = this.getTerrainAtHex(hex);
      return terrain && terrain !== 'reef' && terrain !== 'swamp';
    });

    const context: UnitActionContext = {
      unit,
      minerals: mineralsAtPosition,
      cargo,
      cargoSlots,
      adjacentHexes,
    };

    this.hud.showUnitActions(context);
  }

  /**
   * Handle mineral load action
   */
  private handleLoadMineral(mineralId: string): void {
    if (!this.selectedUnit || !this.gameState || !this.isMyTurn) return;

    // Validate we have enough AP (1 AP for load)
    if (this.gameState.actionPoints < 1) {
      this.hud.showMessage('Not enough AP (need 1)', 2000);
      return;
    }

    // Record action for undo BEFORE applying optimistic update
    const unitTypeName = this.selectedUnit.type.charAt(0).toUpperCase() + this.selectedUnit.type.slice(1);

    // Send load action to server
    const action: LoadAction = {
      type: 'LOAD',
      playerId: this.client['playerId'],
      transporterId: this.selectedUnit.id,
      cargoId: mineralId,
      apCost: 1,
      timestamp: Date.now(),
    };

    this.recordAction('LOAD', `${unitTypeName} loaded mineral`, 1, action);
    this.client.sendAction(action);

    // Optimistic update
    const mineral = this.gameState.minerals.find(m => m.id === mineralId);
    if (mineral && this.selectedUnit.cargo) {
      this.selectedUnit.cargo.push(mineralId);
      // Remove mineral from map
      this.gameState.minerals = this.gameState.minerals.filter(m => m.id !== mineralId);
    } else if (mineral) {
      this.selectedUnit.cargo = [mineralId];
      this.gameState.minerals = this.gameState.minerals.filter(m => m.id !== mineralId);
    }

    this.gameState.actionPoints -= 1;
    this.updateGameState({ actionPoints: this.gameState.actionPoints });

    // Play load sound
    this.audio.play('load');

    // Refresh unit context panel
    this.showUnitContextPanel(this.selectedUnit);
    this.hud.showMessage('Mineral loaded!', 1500);
  }

  /**
   * Handle cargo unload action
   */
  private handleUnloadCargo(cargoId: string, destination: HexCoord): void {
    if (!this.selectedUnit || !this.gameState || !this.isMyTurn) return;

    // Validate we have enough AP (1 AP for unload)
    if (this.gameState.actionPoints < 1) {
      this.hud.showMessage('Not enough AP (need 1)', 2000);
      return;
    }

    // Record action for undo BEFORE applying optimistic update
    const unitTypeName = this.selectedUnit.type.charAt(0).toUpperCase() + this.selectedUnit.type.slice(1);

    // Send unload action to server
    const action: UnloadAction = {
      type: 'UNLOAD',
      playerId: this.client['playerId'],
      transporterId: this.selectedUnit.id,
      cargoId,
      destination,
      apCost: 1,
      timestamp: Date.now(),
    };

    this.recordAction('UNLOAD', `${unitTypeName} dropped cargo at (${destination.q},${destination.r})`, 1, action);
    this.client.sendAction(action);

    // Optimistic update - check if cargo is a mineral
    if (cargoId.startsWith('mineral-') || cargoId.includes('mineral')) {
      // Add mineral back to map
      this.gameState.minerals.push({
        id: cargoId,
        position: destination,
      });
    }

    // Remove from cargo
    if (this.selectedUnit.cargo) {
      this.selectedUnit.cargo = this.selectedUnit.cargo.filter(c => c !== cargoId);
    }

    this.gameState.actionPoints -= 1;
    this.updateGameState({ actionPoints: this.gameState.actionPoints });

    // Play unload sound
    this.audio.play('unload');

    // Refresh unit context panel
    this.showUnitContextPanel(this.selectedUnit);
    this.hud.showMessage('Cargo dropped!', 1500);
  }

  /**
   * Show movement preview for a destination hex
   * Highlights the path and shows AP cost with proper A* pathfinding
   */
  private showMovementPreview(destination: HexCoord): void {
    if (!this.selectedUnit || !this.gameState) return;

    // Validate terrain compatibility
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

    // Check if destination is occupied
    const existingUnit = this.getUnitAtHex(destination);
    if (existingUnit && existingUnit.id !== this.selectedUnit.id) {
      this.hud.showMessage('Hex is occupied', 2000);
      return;
    }

    // Calculate path using A* pathfinding
    const path = this.calculatePath(this.selectedUnit.position!, destination);

    // Check if path is valid (more than just start and end fallback)
    if (path.length === 2 && path[0] !== path[1]) {
      // Try to verify if a real path exists
      const getTerrainAt = this.createPathTerrainGetter();
      const occupiedHexes = getOccupiedHexes(this.gameState.units);
      occupiedHexes.delete(hexKey(this.selectedUnit.position!));

      const realPath = findPath(
        this.selectedUnit.position!,
        destination,
        this.selectedUnit.type,
        getTerrainAt,
        currentTide,
        occupiedHexes
      );

      if (!realPath) {
        this.hud.showMessage('No valid path to destination', 2000);
        return;
      }
    }

    // Calculate AP cost: (path length - 1) * movement cost per hex
    const movementCost = UNIT_PROPERTIES[this.selectedUnit.type].movementCost;
    const stepsCount = path.length - 1;
    const apCost = stepsCount * movementCost;

    // Store preview state
    this.movementPreviewDestination = destination;
    this.movementPreviewPath = path;
    this.movementPreviewAPCost = apCost;

    // Clear previous highlights and show new path
    if (this.renderer?.clearHighlights) {
      this.renderer.clearHighlights();
    }

    // Check if destination is under enemy fire
    const destCoverage = this.getEnemyCoverageAtHex(destination);
    const isDestUnderFire = destCoverage !== null;
    const isDestKillzone = destCoverage && destCoverage.count >= 2;

    // Highlight the path hexes
    if (this.renderer?.setHighlightedHexes) {
      // Highlight intermediate hexes as 'range' (blue) or 'danger' if under fire
      const intermediateHexes = path.slice(1, -1);
      if (intermediateHexes.length > 0) {
        this.renderer.setHighlightedHexes(intermediateHexes, 'range');
      }

      // Highlight destination based on AP and danger status
      if (apCost > this.gameState.actionPoints) {
        this.renderer.setHighlightedHexes([destination], 'danger');
      } else if (isDestKillzone) {
        // Use 'target' for killzone (will pulse red)
        this.renderer.setHighlightedHexes([destination], 'target');
      } else if (isDestUnderFire) {
        // Use 'danger' for single-unit coverage (yellow)
        this.renderer.setHighlightedHexes([destination], 'danger');
      } else {
        this.renderer.setHighlightedHexes([destination], 'selected');
      }
    }

    // Show AP cost message with path length info and danger warning
    const pathInfo = stepsCount > 1 ? ` (${stepsCount} hexes)` : '';
    if (apCost > this.gameState.actionPoints) {
      this.hud.showMessage(`Need ${apCost} AP${pathInfo} (have ${this.gameState.actionPoints}) - Click again to cancel`, 3000);
      this.audio.play('error');
    } else if (isDestKillzone) {
      this.hud.showMessage(`⚠️ KILLZONE! ${apCost} AP${pathInfo} - ${destCoverage!.count} enemies in range - Click to confirm`, 4000);
      this.audio.play('click');
    } else if (isDestUnderFire) {
      this.hud.showMessage(`⚠️ Under fire! ${apCost} AP${pathInfo} - Enemy in range - Click to confirm`, 3500);
      this.audio.play('click');
    } else {
      this.hud.showMessage(`Move for ${apCost} AP${pathInfo} - Click again to confirm`, 3000);
      this.audio.play('click');
    }
  }

  /**
   * Clear the movement preview
   */
  private clearMovementPreview(): void {
    this.movementPreviewDestination = null;
    this.movementPreviewPath = [];
    this.movementPreviewAPCost = 0;

    if (this.renderer?.clearHighlights) {
      this.renderer.clearHighlights();
    }
  }

  /**
   * Confirm the previewed movement
   */
  private confirmMovement(): void {
    if (!this.selectedUnit || !this.gameState || !this.movementPreviewDestination) return;

    const apCost = this.movementPreviewAPCost;

    // Check if we have enough AP
    if (apCost > this.gameState.actionPoints) {
      this.hud.showMessage('Not enough action points', 2000);
      this.clearMovementPreview();
      return;
    }

    // Send the move action
    const action: MoveAction = {
      type: 'MOVE',
      playerId: this.client['playerId'],
      unitId: this.selectedUnit.id,
      path: this.movementPreviewPath,
      apCost,
      timestamp: Date.now(),
    };

    // Record action for undo BEFORE applying optimistic update
    const unitTypeName = this.selectedUnit.type.charAt(0).toUpperCase() + this.selectedUnit.type.slice(1);
    const dest = this.movementPreviewDestination;
    this.recordAction('MOVE', `Moved ${unitTypeName} to (${dest.q},${dest.r})`, apCost, action);

    this.client.sendAction(action);

    // Optimistic update
    this.gameState.actionPoints -= apCost;
    this.selectedUnit.position = this.movementPreviewDestination;
    this.updateGameState({ actionPoints: this.gameState.actionPoints });

    // Update renderer
    if (this.renderer?.setUnits) {
      this.renderer.setUnits(this.gameState.units);
    }

    // Play movement sound
    this.audio.play('moveComplete');

    this.hud.showMessage(`Moved for ${apCost} AP`, 1500);
    this.clearMovementPreview();
    this.deselectUnit();
  }

  /**
   * Move selected unit to destination (legacy direct move - now uses preview)
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
   * Calculate path between two hexes using A* pathfinding
   */
  private calculatePath(from: HexCoord, to: HexCoord): HexCoord[] {
    if (!this.selectedUnit || !this.gameState) {
      return [from, to]; // Fallback to simple path
    }

    const getTerrainAt = this.createPathTerrainGetter();
    const occupiedHexes = getOccupiedHexes(this.gameState.units);
    // Remove our unit's position from occupied set
    occupiedHexes.delete(hexKey(from));

    const path = findPath(
      from,
      to,
      this.selectedUnit.type,
      getTerrainAt,
      this.gameState.currentTide || TideLevel.Normal,
      occupiedHexes
    );

    return path || [from, to]; // Return simple path if no valid A* path found
  }

  /**
   * Get unit at specific hex
   */
  private getUnitAtHex(coord: HexCoord): Unit | null {
    if (!this.gameState) return null;

    return (
      this.gameState.units.find(
        (unit) => unit.position !== null && unit.position.q === coord.q && unit.position.r === coord.r
      ) || null
    );
  }

  /**
   * Record an action in the turn history and take a state snapshot for undo
   * Must be called BEFORE applying the action to game state
   */
  private recordAction(type: string, description: string, apCost: number, actionData?: any): void {
    if (!this.gameState) return;

    // Take a deep copy of current state for undo
    const stateSnapshot = JSON.parse(JSON.stringify(this.gameState)) as GameState;
    this.turnStateSnapshots.push(stateSnapshot);

    // Get player info
    const playerId = this.client['playerId'];
    const playerData = this.getPlayerData(playerId);

    // Create action history entry
    const entry: ActionHistoryEntry = {
      id: ++this.actionSequence,
      type,
      description,
      apCost,
      timestamp: Date.now(),
      playerId,
      playerColor: playerData?.color || 'red',
      isOpponent: false,
    };

    this.turnActionHistory.push(entry);

    // Update HUD
    this.hud.addActionToHistory(entry);
    this.hud.setUndoEnabled(true);

    // Log for replay if action data provided
    if (actionData) {
      this.logActionForReplay({ ...actionData, playerId }, description, apCost);
    }
  }

  /**
   * Handle undo button click - revert to previous state
   */
  private handleUndo(): void {
    if (!this.isMyTurn || this.turnStateSnapshots.length === 0) {
      this.hud.showMessage('Nothing to undo', 1500);
      return;
    }

    // Pop the last state snapshot
    const previousState = this.turnStateSnapshots.pop()!;

    // Also remove the corresponding action from history
    const undoneAction = this.turnActionHistory.pop();

    // Restore game state
    this.gameState = previousState;

    // Update all game state displays
    this.updateGameState(previousState);

    // Update renderer with restored state
    if (this.renderer?.setUnits) {
      this.renderer.setUnits(previousState.units);
    }
    if (this.renderer?.setMinerals) {
      this.renderer.setMinerals(previousState.minerals);
    }

    // Update HUD action history
    this.hud.updateActionHistory(this.turnActionHistory, this.turnStateSnapshots.length > 0);
    this.hud.setUndoEnabled(this.turnStateSnapshots.length > 0);

    // Deselect any selected unit
    this.deselectUnit();

    // Show message
    if (undoneAction) {
      this.hud.showMessage(`Undid: ${undoneAction.description}`, 2000);
    } else {
      this.hud.showMessage('Action undone', 1500);
    }

    this.render();
  }

  /**
   * Clear turn action history (called at turn start/end)
   */
  private clearTurnActionHistory(): void {
    this.turnActionHistory = [];
    this.turnStateSnapshots = [];
    this.actionSequence = 0;
    this.hud.clearActionHistory();
    this.hud.setUndoEnabled(false);
  }

  /**
   * Log action to the global game action log for replay
   */
  private logActionForReplay(action: any, description: string, apCost: number): void {
    if (!this.gameState) return;

    const replayAction: ReplayAction = {
      seq: ++this.globalActionSequence,
      type: action.type,
      playerId: action.playerId || this.client['playerId'],
      turn: this.gameState.turn,
      timestamp: Date.now(),
      data: JSON.parse(JSON.stringify(action)),
      apCost,
      description,
    };

    this.gameActionLog.push(replayAction);
  }

  /**
   * Record opponent action for display (no state snapshot needed)
   */
  private recordOpponentAction(action: any): void {
    const playerId = action.playerId;
    const playerData = this.getPlayerData(playerId);
    const isOpponent = playerId !== this.client['playerId'];

    if (!isOpponent) return; // Only record opponent actions here

    let description = '';
    let apCost = action.apCost || 0;

    switch (action.type) {
      case 'MOVE':
        const unit = this.gameState?.units.find(u => u.id === action.unitId);
        const unitType = unit?.type || 'unit';
        description = `Moved ${unitType}`;
        break;
      case 'LOAD':
        description = 'Loaded cargo';
        break;
      case 'UNLOAD':
        description = 'Unloaded cargo';
        break;
      case 'FIRE':
        description = 'Fired weapon';
        break;
      case 'LAND_ASTRONEF':
        description = 'Landed astronef';
        apCost = 0;
        break;
      case 'LIFT_OFF':
        description = 'Lifted off';
        break;
      default:
        description = action.type;
    }

    const entry: ActionHistoryEntry = {
      id: ++this.actionSequence,
      type: action.type,
      description,
      apCost,
      timestamp: Date.now(),
      playerId,
      playerColor: playerData?.color || 'gray',
      isOpponent: true,
    };

    this.turnActionHistory.push(entry);
    this.hud.addActionToHistory(entry);

    // Also log for replay
    this.logActionForReplay(action, description, apCost);
  }

  /**
   * Handle action from server
   */
  private handleAction(action: any): void {
    if (!this.gameState) return;

    // Record opponent actions for live viewing
    this.recordOpponentAction(action);

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

    // Clear action history when turn changes
    this.clearTurnActionHistory();

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

      // Play turn sound if it's now our turn
      if (nextPlayer === this.client['playerId']) {
        this.audio.play('turnStart');
      } else {
        this.audio.play('turnEnd');
      }
    }
  }

  /**
   * Handle end turn button click
   */
  private handleEndTurn(isTimeout = false): void {
    if (!this.isMyTurn || !this.gameState) return;

    // On timeout, no AP is saved - end immediately
    if (isTimeout) {
      this.client.endTurn(0);
      this.deselectUnit();
      return;
    }

    const availableAP = this.gameState.actionPoints;

    // If no AP remaining, end turn immediately without dialog
    if (availableAP === 0) {
      this.client.endTurn(0);
      this.hud.showMessage('Turn ended', 2000);
      this.deselectUnit();
      return;
    }

    // Show AP save dialog
    this.hud.showAPSaveDialog(availableAP, (savedAP: number) => {
      this.client.endTurn(savedAP);
      if (savedAP > 0) {
        this.hud.showMessage(`Turn ended - Saved ${savedAP} AP`, 2000);
      } else {
        this.hud.showMessage('Turn ended', 2000);
      }
      this.deselectUnit();
    });
  }

  /**
   * Handle lift-off button click (during turns 21-25)
   */
  private handleLiftOff(): void {
    if (!this.isMyTurn || !this.gameState) return;

    const playerId = this.client['playerId'];

    if (!canLiftOff(this.gameState, playerId)) {
      const cost = calculateTakeOffCost(this.gameState, playerId);
      this.hud.showMessage(`Cannot lift off (need ${cost} AP)`, 2000);
      this.audio.play('error');
      return;
    }

    // Execute lift-off
    this.gameState = executeLiftOff(this.gameState, playerId);

    // Send lift-off action to server
    this.client.sendAction({
      type: 'LIFT_OFF',
      playerId,
      decision: 'now',
      timestamp: Date.now(),
    });

    // Play lift-off sound
    this.audio.play('liftOff');

    this.hud.hideLiftOffButton();
    this.hud.showMessage('Astronef lifted off!', 3000);
    this.updateGameState(this.gameState);

    // Check if game is over (all players lifted off or Turn 25 ended)
    this.checkGameOver();
  }

  /**
   * Handle Turn 21 lift-off decision (secret decision)
   * Sends decision to server - actual lift-off happens when all players have decided
   */
  private handleLiftOffDecision(decision: boolean): void {
    if (!this.gameState) return;

    // Send decision to server (server handles the secret collection and reveal)
    this.client.sendLiftOffDecision(decision);

    // Hide the decision modal - waiting state will be shown when ACK received
    this.hud.hideLiftOffDecision();
  }

  /**
   * Handle acknowledgment that our lift-off decision was recorded
   */
  private handleLiftOffDecisionAck(data: LiftOffDecisionAck): void {
    const decisionText = data.decision ? 'Lift off now' : 'Stay until turn 25';

    if (data.pendingPlayers > 0) {
      // Show waiting state
      this.hud.showLiftOffWaiting(data.pendingPlayers);
      this.hud.showMessage(`Decision recorded: ${decisionText}. Waiting for ${data.pendingPlayers} player(s)...`, 5000);
    } else {
      // All decisions in - reveal will come shortly
      this.hud.showMessage(`Decision recorded: ${decisionText}. Revealing all decisions...`, 2000);
    }
  }

  /**
   * Handle reveal of all players' lift-off decisions
   */
  private handleLiftOffDecisionsRevealed(data: LiftOffDecisionsRevealed): void {
    // Hide waiting UI
    this.hud.hideLiftOffWaiting();
    this.hud.hideLiftOffButton();

    // Update game state with the processed state from server
    this.gameState = data.gameState;
    this.updateGameState(data.gameState);

    // Build reveal message
    const liftedOff: string[] = [];
    const stayed: string[] = [];

    for (const [, info] of Object.entries(data.decisions)) {
      if (info.decision) {
        liftedOff.push(info.playerName);
      } else {
        stayed.push(info.playerName);
      }
    }

    // Show reveal modal with all decisions
    this.hud.showLiftOffReveal(data.decisions);

    // Check game over
    this.checkGameOver();
  }

  /**
   * Update the scoreboard with current player statistics
   */
  private updateScoreboard(): void {
    if (!this.gameState) return;

    const currentPlayerId = this.gameState.currentPlayer || '';

    const playerStats = this.gameState.players.map(player => {
      // Count units owned by this player (excluding astronef itself)
      const unitCount = this.gameState!.units.filter(
        u => u.owner === player.id && u.type !== UnitType.Astronef
      ).length;

      // Count total cargo across all player's transporters
      const cargoCount = this.gameState!.units
        .filter(u => u.owner === player.id && u.cargo)
        .reduce((sum, u) => sum + (u.cargo?.length || 0), 0);

      // Calculate current score (only for lifted-off players, otherwise estimate)
      const score = calculateScore(this.gameState!, player.id);

      return {
        id: player.id,
        name: player.name,
        color: player.color,
        unitCount,
        cargoCount,
        score,
        hasLiftedOff: player.hasLiftedOff || false,
        isConnected: player.isConnected ?? true,
      };
    });

    this.hud.updateScoreboard(playerStats, currentPlayerId);

    // Also update turn order display
    this.updateTurnOrder();
  }

  /**
   * Update the turn order display with current player sequence
   */
  private updateTurnOrder(): void {
    if (!this.gameState) return;

    const turnOrder = this.gameState.turnOrder;
    const currentPlayerId = this.gameState.currentPlayer || '';

    // Build player info with names from lobby
    const players = this.gameState.players.map(player => {
      const lobbyPlayer = this.lobbyPlayers.find(p => p.id === player.id);
      return {
        id: player.id,
        name: lobbyPlayer?.name || player.name || player.id,
        color: player.color,
        hasLiftedOff: player.hasLiftedOff || false,
        isConnected: player.isConnected ?? true,
      };
    });

    this.hud.updateTurnOrder(turnOrder, currentPlayerId, players);
  }

  /**
   * Check if a hex is under enemy fire and get coverage info
   */
  private getEnemyCoverageAtHex(coord: HexCoord): HexCoverageInfo | null {
    if (!this.gameState) return null;

    const playerId = this.client['playerId'];
    const getTerrainAt = this.createTerrainGetter();

    // Check coverage from all enemy players
    for (const player of this.gameState.players) {
      if (player.id === playerId) continue;

      const coverage = getHexCoverageInfo(
        this.gameState.units,
        player.id,
        getTerrainAt
      );

      const info = coverage.get(hexKey(coord));
      if (info) {
        return info;
      }
    }

    return null;
  }

  /**
   * Get unit info for display (name and color)
   */
  private getUnitDisplayInfo(unitId: string): { name: string; owner: string; color: string } | null {
    if (!this.gameState) return null;

    const unit = this.gameState.units.find(u => u.id === unitId);
    if (!unit) return null;

    const player = this.gameState.players.find(p => p.id === unit.owner);
    const unitTypeName = unit.type.charAt(0).toUpperCase() + unit.type.slice(1);

    return {
      name: unitTypeName,
      owner: player?.name || unit.owner,
      color: player?.color || 'unknown'
    };
  }

  /**
   * Update under-fire zone visualization for all enemy players
   * Shows hexes that are within firing range of enemy combat units
   */
  private updateUnderFireZones(): void {
    if (!this.gameState || !this.renderer?.setUnderFireZones) return;

    // Only show during main game phase (not landing/deployment)
    if (this.gameState.phase !== GamePhase.Playing) {
      this.renderer.clearUnderFireZones?.();
      return;
    }

    const playerId = this.client['playerId'];
    const getTerrainAt = this.createTerrainGetter();

    // Aggregate coverage from all enemy players
    const aggregatedCoverage = new Map<string, HexCoverageInfo>();

    for (const player of this.gameState.players) {
      // Skip own units - we don't show friendly fire zones
      if (player.id === playerId) continue;

      // Get coverage from this enemy player
      const playerCoverage = getHexCoverageInfo(
        this.gameState.units,
        player.id,
        getTerrainAt
      );

      // Merge into aggregated coverage
      for (const [hexKey, info] of playerCoverage) {
        const existing = aggregatedCoverage.get(hexKey);
        if (existing) {
          // Combine coverage from multiple enemies
          existing.count += info.count;
          existing.sourceUnits.push(...info.sourceUnits);
        } else {
          aggregatedCoverage.set(hexKey, {
            count: info.count,
            sourceUnits: [...info.sourceUnits]
          });
        }
      }
    }

    // Apply the visualization
    this.renderer.setUnderFireZones(aggregatedCoverage);
  }

  private checkGameOver(): void {
    if (!this.gameState) return;

    // Game ends when all players have lifted off or Turn 25 ends
    const allLiftedOff = this.gameState.players.every(p => p.hasLiftedOff);
    const turn25Over = this.gameState.turn >= 25;

    if (allLiftedOff || turn25Over) {
      const scores = calculateAllScores(this.gameState);
      const winners = getWinners(this.gameState);

      // Build player names map
      const playerNames: Record<string, string> = {};
      for (const player of this.gameState.players) {
        const lobbyPlayer = this.lobbyPlayers.find(p => p.id === player.id);
        playerNames[player.id] = lobbyPlayer?.name || player.id;
      }

      this.hud.showGameOver(scores, playerNames, winners);
    }
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

  // ============================================================================
  // Replay Mode
  // ============================================================================

  /**
   * Create replay data from the current game
   */
  private createGameReplayData(): ReplayData | null {
    if (!this.initialGameState || !this.gameState) return null;

    const finalScores = calculateAllScores(this.gameState);
    const winners = getWinners(this.gameState);

    const players = this.lobbyPlayers.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
    }));

    return createReplayData(
      this.config.gameId,
      this.initialGameState,
      this.gameActionLog,
      finalScores,
      winners,
      players
    );
  }

  /**
   * Enter replay mode
   */
  private enterReplayMode(): void {
    if (this.isReplayMode) return;

    const replayData = this.createGameReplayData();
    if (!replayData) {
      this.hud.showMessage('No replay data available', 2000);
      return;
    }

    this.isReplayMode = true;

    // Create replay manager
    this.replayManager = new ReplayManager(replayData);

    // Create replay controls
    this.replayControls = new ReplayControls();
    this.replayControls.setReplayData(replayData);
    this.replayControls.show();

    // Wire up controls
    this.replayControls.on('play', () => this.replayManager?.play());
    this.replayControls.on('pause', () => this.replayManager?.pause());
    this.replayControls.on('stepForward', () => this.replayManager?.stepForward());
    this.replayControls.on('stepBackward', () => this.replayManager?.stepBackward());
    this.replayControls.on('previousTurn', () => this.replayManager?.previousTurn());
    this.replayControls.on('nextTurn', () => this.replayManager?.nextTurn());
    this.replayControls.on('seekToPercent', (percent) => this.replayManager?.seekToPercent(percent));
    this.replayControls.on('setSpeed', (speed) => this.replayManager?.setSpeed(speed));
    this.replayControls.on('export', () => this.replayControls?.exportReplay());
    this.replayControls.on('close', () => this.exitReplayMode());

    // Listen for replay manager events
    this.replayManager.on('playbackStateChange', (state) => {
      this.replayControls?.updatePlaybackState(state);
    });

    this.replayManager.on('stateUpdate', (state) => {
      this.updateRendererFromReplayState(state);
    });

    this.replayManager.on('turnChange', (_turn, _playerId, marker) => {
      this.replayControls?.updateTurnMarker(marker);
    });

    this.replayManager.on('replayComplete', () => {
      this.hud.showMessage('Replay complete', 2000);
    });

    // Show initial state
    const initialState = this.replayManager.getPlaybackState();
    this.replayControls.updatePlaybackState(initialState);
    if (initialState.gameState) {
      this.updateRendererFromReplayState(initialState.gameState);
    }

    // Hide game controls during replay
    this.hud.hideActionHistory();

    // Add replay mode banner
    this.showReplayBanner();

    this.hud.showMessage('Replay mode - use controls to navigate', 3000);
  }

  /**
   * Exit replay mode
   */
  private exitReplayMode(): void {
    if (!this.isReplayMode) return;

    this.isReplayMode = false;

    // Clean up replay components
    if (this.replayManager) {
      this.replayManager.destroy();
      this.replayManager = null;
    }

    if (this.replayControls) {
      this.replayControls.destroy();
      this.replayControls = null;
    }

    // Restore current game state
    if (this.gameState) {
      if (this.renderer?.setUnits) {
        this.renderer.setUnits(this.gameState.units);
      }
      if (this.renderer?.setMinerals) {
        this.renderer.setMinerals(this.gameState.minerals);
      }
    }

    // Restore game controls
    this.hud.showActionHistory();

    // Remove replay mode banner
    this.hideReplayBanner();

    this.hud.showMessage('Exited replay mode', 2000);
  }

  /**
   * Update renderer from replay state
   */
  private updateRendererFromReplayState(state: GameState): void {
    if (this.renderer?.setUnits) {
      this.renderer.setUnits(state.units);
    }
    if (this.renderer?.setMinerals) {
      this.renderer.setMinerals(state.minerals);
    }
    // Update HUD elements
    this.updateGameState(state);
  }

  /**
   * Show replay mode banner
   */
  private showReplayBanner(): void {
    let banner = document.getElementById('replay-mode-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'replay-mode-banner';
      banner.className = 'replay-mode-banner';
      banner.textContent = '📺 REPLAY MODE - Press ESC to exit';
      document.body.appendChild(banner);
    }
    banner.classList.add('visible');
  }

  /**
   * Hide replay mode banner
   */
  private hideReplayBanner(): void {
    const banner = document.getElementById('replay-mode-banner');
    if (banner) {
      banner.classList.remove('visible');
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.hud.destroy();
    this.client.disconnect();
    this.audio.destroy();

    if (this.input) {
      this.input.destroy();
    }

    if (this.renderer) {
      this.renderer.destroy();
    }

    if (this.deploymentInventory) {
      this.deploymentInventory.destroy();
    }

    if (this.helpPanel) {
      this.helpPanel.destroy();
    }

    if (this.replayManager) {
      this.replayManager.destroy();
    }

    if (this.replayControls) {
      this.replayControls.destroy();
    }
  }
}
