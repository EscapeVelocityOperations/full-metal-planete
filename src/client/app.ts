/**
 * Main application orchestrator for Full Metal Planète client
 */

import { HexRenderer } from '@/client/renderer/renderer';
import { TerrainHex } from '@/client/renderer/terrain-layer';
import { GameClient } from './game-client';
import { HUD } from './ui/hud';
import { InputHandler } from './ui/input-handler';
import type { GameState, HexCoord, Unit, MoveAction, TideLevel } from '@/shared/game/types';
import { hexKey } from '@/shared/game/hex';

export interface GameConfig {
  gameId: string;
  playerId: string;
  token: string;
}

export class GameApp {
  private renderer: HexRenderer | null = null;
  private client: GameClient;
  private hud: HUD;
  private input: InputHandler | null = null;
  private canvas: HTMLCanvasElement;

  private gameState: GameState | null = null;
  private selectedUnit: Unit | null = null;
  private isMyTurn: boolean = false;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.client = new GameClient(config.gameId, config.playerId, config.token);
    this.hud = new HUD();

    this.setupEventHandlers();
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    this.hud.showLoading();

    try {
      this.renderer = await HexRenderer.create(this.canvas);
      console.log('Renderer initialized:', this.renderer.getBackend());

      this.input = new InputHandler(this.canvas, this.renderer);
      this.setupInputHandlers();

      await this.client.connect();
      console.log('Connected to game server');

      this.hud.hideLoading();
      this.hud.showMessage('Connected to game', 2000);
    } catch (error) {
      console.error('Failed to initialize:', error);
      this.hud.hideLoading();
      this.hud.showMessage('Failed to connect to game', 5000);
      throw error;
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

    this.client.on('error', (error: { code: string; message: string }) => {
      console.error('Game error', error);
      this.hud.showMessage(`Error: ${error.message}`, 5000);
    });

    this.hud.onEndTurn(() => {
      this.handleEndTurn();
    });
  }

  /**
   * Set up input handlers
   */
  private setupInputHandlers(): void {
    if (!this.input) return;

    this.input.on('hexClick', (coord: HexCoord) => {
      this.handleHexClick(coord);
    });

    this.input.on('hexRightClick', (coord: HexCoord) => {
      this.handleHexRightClick(coord);
    });

    this.input.on('escape', () => {
      this.deselectUnit();
    });

    this.input.on('enter', () => {
      this.handleEndTurn();
    });
  }

  /**
   * Handle game start
   */
  private handleGameStart(gameState: GameState): void {
    this.gameState = gameState;
    this.updateGameState(gameState);
    this.hud.showMessage('Game started!', 3000);
  }

  /**
   * Update game state and UI
   */
  private updateGameState(gameState: Partial<GameState>): void {
    if (!this.gameState) return;

    this.gameState = { ...this.gameState, ...gameState };

    if (gameState.terrain && this.renderer) {
      const terrainHexes: TerrainHex[] = gameState.terrain.map((hex) => ({
        q: hex.coord.q,
        r: hex.coord.r,
        type: hex.type,
      }));
      this.renderer.setTerrainData(terrainHexes);
    }

    if (gameState.currentTide && this.renderer) {
      this.renderer.setTide(gameState.currentTide);
      this.hud.updateTide(gameState.currentTide);
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
   * Check if it's the current player's turn
   */
  private checkMyTurn(): void {
    if (!this.gameState) return;

    this.isMyTurn = this.gameState.currentPlayer === this.client['playerId'];
    this.hud.setEndTurnEnabled(this.isMyTurn);
  }

  /**
   * Handle hex click
   */
  private handleHexClick(coord: HexCoord): void {
    if (!this.isMyTurn || !this.gameState) return;

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

    const path = this.calculatePath(this.selectedUnit.position, destination);
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

    if (action.type === 'MOVE') {
      const unit = this.gameState.units.find((u) => u.id === action.unitId);
      if (unit) {
        unit.position = action.path[action.path.length - 1];
        this.render();
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
  }
}
