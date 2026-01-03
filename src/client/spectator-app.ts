/**
 * Spectator application for Full Metal Planète
 * View-only mode - can watch games but not interact
 */

import { createRenderer, type IHexRenderer, type RendererType } from '@/client/renderer/renderer-factory';
import { TerrainHex } from '@/client/renderer/terrain-layer';
import { HEX_SIZE } from '@/client/renderer/types';
import { SpectatorClient } from './spectator-client';
import { HUD, type LobbyPlayer, type PhaseInfo } from './ui/hud';
import { TideLevel, GamePhase, type GameState, type HexCoord, type Unit } from '@/shared/game/types';
import { generateDemoMap } from '@/shared/game/map-generator';
import { getTideForecast, getPlayerConverterCount, calculateScore } from '@/shared/game/state';

export interface SpectatorConfig {
  gameId: string;
  spectatorId: string;
  token: string;
}

export class SpectatorApp {
  private renderer: IHexRenderer | null = null;
  private rendererType: RendererType = 'css';
  private client: SpectatorClient;
  private hud: HUD;
  private canvas: HTMLCanvasElement;
  private config: SpectatorConfig;

  private gameState: GameState | null = null;
  private lobbyPlayers: LobbyPlayer[] = [];
  private isInLobby: boolean = true;

  constructor(canvas: HTMLCanvasElement, config: SpectatorConfig) {
    this.canvas = canvas;
    this.config = config;
    this.client = new SpectatorClient(config.gameId, config.spectatorId, config.token);
    this.hud = new HUD();

    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    this.hud.showLoading();
    this.hud.showSpectatorBanner();

    // Initialize renderer
    this.renderer = await createRenderer(this.canvas, this.rendererType);
    console.log('Spectator renderer initialized:', this.renderer.getBackend());

    this.setupZoomControls();
    this.loadPlaceholderTerrain();
    this.startRenderLoop();

    try {
      await this.client.connect();
      console.log('Spectator connected to game server');

      await this.fetchGameStatus();

      this.hud.hideLoading();
      this.hud.showMessage('Watching game as spectator', 3000);
    } catch (error) {
      console.error('Failed to connect:', error);
      this.hud.hideLoading();
      this.hud.showMessage('Failed to connect - retrying...', 3000);
    }
  }

  private setupEventHandlers(): void {
    this.client.on('connected', () => {
      console.log('Spectator client connected');
    });

    this.client.on('disconnected', () => {
      console.log('Spectator client disconnected');
      this.hud.showMessage('Disconnected - attempting to reconnect...', 5000);
    });

    this.client.on('spectatorSync', (data) => {
      console.log('Spectator sync received', data);
      this.handleSpectatorSync(data);
    });

    this.client.on('playerJoined', (player) => {
      console.log('Player joined:', player);
      this.handlePlayerJoined(player);
    });

    this.client.on('playerLeft', (playerId) => {
      console.log('Player left:', playerId);
      this.handlePlayerLeft(playerId);
    });

    this.client.on('playerReconnected', (data) => {
      console.log('Player reconnected:', data);
      this.handlePlayerReconnected(data);
    });

    this.client.on('playerDisconnected', (playerId) => {
      console.log('Player disconnected:', playerId);
      this.handlePlayerDisconnected(playerId);
    });

    this.client.on('playerReady', (playerId) => {
      console.log('Player ready:', playerId);
      this.handlePlayerReady(playerId);
    });

    this.client.on('gameStart', (gameState) => {
      console.log('Game started', gameState);
      this.handleGameStart(gameState);
    });

    this.client.on('action', (action) => {
      console.log('Action received', action);
      this.handleAction(action);
    });

    this.client.on('turnEnd', (data) => {
      console.log('Turn ended', data);
      this.handleTurnEnd(data);
    });

    this.client.on('stateUpdate', (gameState) => {
      console.log('State update received', gameState);
      this.handleStateUpdate(gameState);
    });

    this.client.on('spectatorJoined', (spectator) => {
      console.log('Spectator joined:', spectator);
      this.hud.showMessage(`${spectator.name} is now watching`, 2000);
    });

    this.client.on('spectatorLeft', (spectatorId) => {
      console.log('Spectator left:', spectatorId);
    });

    this.client.on('error', (error) => {
      console.error('Error:', error);
      this.hud.showMessage(`Error: ${error.message}`, 5000);
    });

    // Disable interactive controls for spectators
    this.hud.disableSpectatorControls();
  }

  private setupZoomControls(): void {
    if (!this.renderer) return;

    if (this.renderer.onZoomChange) {
      this.renderer.onZoomChange((zoom) => {
        this.hud.updateZoomLevel(zoom);
      });
    }

    if (this.renderer.getZoom) {
      this.hud.updateZoomLevel(this.renderer.getZoom());
    }

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

  private async fetchGameStatus(): Promise<void> {
    try {
      const isDev = import.meta.env.DEV;
      const baseUrl = isDev ? 'http://localhost:3000' : '';

      const response = await fetch(`${baseUrl}/api/games/${this.config.gameId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch game status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Game status:', data);

      if (data.players) {
        this.lobbyPlayers = data.players.map((p: any) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          isReady: p.isReady || false,
        }));
        this.hud.updatePlayerList(this.lobbyPlayers);
      }

      if (data.state === 'playing' && data.gameState) {
        this.handleGameStart(data.gameState);
      }
    } catch (error) {
      console.error('Error fetching game status:', error);
    }
  }

  private loadPlaceholderTerrain(): void {
    if (!this.renderer) return;

    const rect = this.renderer.getViewportSize();
    const mapWidth = 27;
    const mapHeight = 11;
    const maxQ = mapWidth - 1;
    const maxR = mapHeight - 1;

    const minX = 0;
    const maxX = HEX_SIZE * 1.5 * maxQ;
    const minY = 0;
    const maxY = HEX_SIZE * (Math.sqrt(3) / 2 * maxQ + Math.sqrt(3) * maxR);

    const padding = HEX_SIZE * 1.2;
    const mapPixelWidth = maxX - minX + padding * 2;
    const mapPixelHeight = maxY - minY + padding * 2;

    const zoomX = (rect.width * 0.95) / mapPixelWidth;
    const zoomY = (rect.height * 0.95) / mapPixelHeight;
    const zoom = Math.min(zoomX, zoomY);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.renderer.setViewport({
      width: rect.width,
      height: rect.height,
      x: centerX,
      y: centerY,
      zoom,
    });

    const demoTerrain = generateDemoMap();
    const terrainHexes: TerrainHex[] = demoTerrain.map((hex) => ({
      coord: { q: hex.coord.q, r: hex.coord.r },
      type: hex.type,
    }));

    this.renderer.setTerrainData(terrainHexes);
    this.renderer.setTide(TideLevel.Normal);
    this.render();
  }

  private handleSpectatorSync(data: { gameState: GameState; players: any[]; spectators: any[]; roomState: string }): void {
    this.lobbyPlayers = data.players.map((p: any) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isReady: p.isReady || false,
      isConnected: p.isConnected ?? true,
    }));

    if (data.roomState === 'playing' && data.gameState) {
      this.isInLobby = false;
      this.gameState = data.gameState;

      if (this.hud.isLobbyMode()) {
        this.hud.enterGameMode();
        this.initializePlayerColors();
        this.hud.showScoreboard();
      }

      this.updateGameState(data.gameState);
    } else {
      this.hud.updatePlayerList(this.lobbyPlayers);
    }
  }

  private handlePlayerJoined(player: any): void {
    const lobbyPlayer: LobbyPlayer = {
      id: player.id,
      name: player.name,
      color: player.color,
      isReady: player.isReady || false,
    };

    const existingIndex = this.lobbyPlayers.findIndex(p => p.id === player.id);
    if (existingIndex >= 0) {
      this.lobbyPlayers[existingIndex] = lobbyPlayer;
    } else {
      this.lobbyPlayers.push(lobbyPlayer);
    }

    this.hud.updatePlayerList(this.lobbyPlayers);
    this.hud.showMessage(`${player.name} joined!`, 2000);
  }

  private handlePlayerLeft(playerId: string): void {
    const player = this.lobbyPlayers.find(p => p.id === playerId);
    this.lobbyPlayers = this.lobbyPlayers.filter(p => p.id !== playerId);
    this.hud.updatePlayerList(this.lobbyPlayers);

    if (player) {
      this.hud.showMessage(`${player.name} left`, 2000);
    }
  }

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

    if (this.gameState) {
      const player = this.gameState.players.find(p => p.id === data.playerId);
      if (player) {
        player.isConnected = true;
      }
      this.updateScoreboard();
    }

    this.hud.showMessage(`${data.player.name} reconnected!`, 2000);
  }

  private handlePlayerDisconnected(playerId: string): void {
    if (this.gameState) {
      const player = this.gameState.players.find(p => p.id === playerId);
      if (player) {
        player.isConnected = false;
        const lobbyPlayer = this.lobbyPlayers.find(p => p.id === playerId);
        this.hud.showMessage(`${lobbyPlayer?.name || 'A player'} disconnected`, 3000);
        this.updateScoreboard();
      }
    }
  }

  private handlePlayerReady(playerId: string): void {
    const player = this.lobbyPlayers.find(p => p.id === playerId);
    if (player) {
      player.isReady = true;
      this.hud.updatePlayerList(this.lobbyPlayers);
      this.hud.showMessage(`${player.name} is ready!`, 2000);
    }
  }

  private handleGameStart(gameState: GameState): void {
    this.isInLobby = false;
    this.gameState = gameState;
    this.hud.enterGameMode();
    this.initializePlayerColors();
    this.updateGameState(gameState);
    this.hud.showScoreboard();
    this.hud.showMessage('Game started!', 3000);
  }

  private initializePlayerColors(): void {
    if (!this.renderer?.setPlayerColors) return;

    const playerColors: Record<string, string> = {};
    for (const player of this.lobbyPlayers) {
      playerColors[player.id] = player.color;
    }
    console.log('Setting player colors:', playerColors);
    this.renderer.setPlayerColors(playerColors);
  }

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

    if (this.renderer?.setUnits && this.gameState.units) {
      this.renderer.setUnits(this.gameState.units);
    }

    if (this.renderer?.setMinerals && this.gameState.minerals) {
      this.renderer.setMinerals(this.gameState.minerals);
    }

    if (gameState.turn !== undefined) {
      this.hud.updateTurn(gameState.turn);
    }

    this.updatePhaseInfo();
    this.updateScoreboard();
    this.render();
  }

  private updatePhaseInfo(): void {
    if (!this.gameState) return;

    const currentPlayerData = this.getPlayerData(this.gameState.currentPlayer);
    const phaseInfo: PhaseInfo = {
      phase: this.gameState.phase,
      isMyTurn: false, // Spectators never have a turn
      currentPlayerName: currentPlayerData?.name || 'Unknown',
      currentPlayerColor: currentPlayerData?.color || 'red',
    };
    this.hud.updatePhaseInfo(phaseInfo);
  }

  private getPlayerData(playerId: string): LobbyPlayer | undefined {
    return this.lobbyPlayers.find(p => p.id === playerId);
  }

  private handleAction(action: any): void {
    if (!this.gameState) return;

    // Just display what happened - no need to track for undo
    const player = this.getPlayerData(action.playerId);
    let message = '';

    switch (action.type) {
      case 'MOVE':
        message = `${player?.name || 'Player'} moved a unit`;
        break;
      case 'LAND_ASTRONEF':
        message = `${player?.name || 'Player'} landed their astronef!`;
        break;
      case 'LOAD':
        message = `${player?.name || 'Player'} loaded cargo`;
        break;
      case 'UNLOAD':
        message = `${player?.name || 'Player'} unloaded cargo`;
        break;
      case 'FIRE':
        message = `${player?.name || 'Player'} fired!`;
        break;
      case 'LIFT_OFF':
        message = `${player?.name || 'Player'} lifted off!`;
        break;
    }

    if (message) {
      this.hud.showMessage(message, 2000);
    }
  }

  private handleTurnEnd(data?: { playerId: string; savedAP: number }): void {
    if (!this.gameState || !data) return;

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

    const endingPlayer = this.getPlayerData(data.playerId);
    const nextPlayerData = this.getPlayerData(nextPlayer);
    this.hud.showMessage(`${endingPlayer?.name}'s turn ended. ${nextPlayerData?.name}'s turn`, 3000);
  }

  private handleStateUpdate(gameState: GameState): void {
    this.gameState = gameState;
    this.updateGameState(gameState);
    this.render();
  }

  private updateScoreboard(): void {
    if (!this.gameState) return;

    const currentPlayerId = this.gameState.currentPlayer || '';

    const playerStats = this.gameState.players.map(player => {
      const unitCount = this.gameState!.units.filter(
        u => u.owner === player.id && u.type !== 'astronef'
      ).length;

      const cargoCount = this.gameState!.units
        .filter(u => u.owner === player.id && u.cargo)
        .reduce((sum, u) => sum + (u.cargo?.length || 0), 0);

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
  }

  private render(): void {
    if (this.renderer) {
      this.renderer.render();
    }
  }

  startRenderLoop(): void {
    const renderFrame = () => {
      this.render();
      requestAnimationFrame(renderFrame);
    };
    requestAnimationFrame(renderFrame);
  }

  destroy(): void {
    this.hud.destroy();
    this.client.disconnect();

    if (this.renderer) {
      this.renderer.destroy();
    }
  }
}
