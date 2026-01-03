/**
 * HUD (Heads-Up Display) component for game interface
 */

import { UnitType, type TideLevel, type GamePhase, type Unit, type Mineral, type HexCoord } from '@/shared/game/types';

export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  isReady: boolean;
  isConnected?: boolean;
}

export interface PhaseInfo {
  phase: GamePhase;
  isMyTurn: boolean;
  currentPlayerName: string;
  currentPlayerColor: string;
}

export interface UnitActionContext {
  unit: Unit;
  minerals: Mineral[];  // Minerals at unit's position
  cargo: (string)[];    // Current cargo (unit IDs or mineral IDs)
  cargoSlots: number;   // Max cargo capacity
  adjacentHexes: HexCoord[];  // Valid hexes for dropping cargo
}

export interface ActionHistoryEntry {
  id: number;                // Sequence number within turn
  type: string;              // Action type (MOVE, LOAD, etc)
  description: string;       // Human-readable description
  apCost: number;           // AP spent
  timestamp: number;        // When action occurred
  playerId: string;         // Who performed it
  playerColor: string;      // For display
  isOpponent: boolean;      // Was this an opponent's action?
}

const PHASE_INSTRUCTIONS: Record<GamePhase, string> = {
  landing: '<strong>Landing Phase (Turn 1):</strong> Position your Astronef on the map. Click on valid land or marsh hexes to place your 4-hex spacecraft. <br><em>Press <kbd>R</kbd> to rotate before placing.</em>',
  deployment: '<strong>Deployment Phase (Turn 2):</strong> Deploy your units from the Astronef. Select a unit from inventory and click adjacent hexes to deploy. <br><em>Press <kbd>R</kbd> to rotate selected unit.</em>',
  playing: '<strong>Playing Phase:</strong> Move units, collect minerals, engage enemies. Use Action Points wisely. You can save up to 10 AP for next turn.',
  liftoff: '<strong>Lift-Off Decision (Turn 21):</strong> Choose whether to lift off now (safe but fewer turns) or stay until turn 25 (risky but more time).',
  finished: '<strong>Game Over:</strong> Final scores are calculated based on minerals and equipment in your Astronef.',
};

export class HUD {
  private apValueEl: HTMLElement;
  private turnValueEl: HTMLElement;
  private tideValueEl: HTMLElement;
  private timerValueEl: HTMLElement;
  private endTurnBtn: HTMLButtonElement;
  private readyBtn: HTMLButtonElement;
  private lobbySectionEl: HTMLElement;
  private gameSectionEl: HTMLElement;
  private playerListEl: HTMLElement;
  private statusMessageEl: HTMLElement;
  private timerInterval: number | null = null;
  private turnEndTime: number = 0;
  private isReady: boolean = false;
  private timerExpiredCallback: (() => void) | null = null;

  // New elements for turn/phase display
  private currentPlayerEl: HTMLElement;
  private phaseEl: HTMLElement;
  private instructionsEl: HTMLElement;
  private instructionsPhaseTitleEl: HTMLElement;
  private instructionsContentEl: HTMLElement;
  private yourTurnIndicatorEl: HTMLElement;

  // Zoom controls
  private zoomInBtn: HTMLButtonElement;
  private zoomOutBtn: HTMLButtonElement;
  private zoomFitBtn: HTMLButtonElement;
  private zoomLevelEl: HTMLElement;

  // Tide forecast
  private tideForecastContainer: HTMLElement;
  private tideForecast1El: HTMLElement;
  private tideForecast2El: HTMLElement;

  // Scoreboard
  private scoreboardPanel: HTMLElement;
  private scoreboardToggle: HTMLButtonElement;
  private scoreboardTbody: HTMLElement;
  private scoreboardExpanded: boolean = true;

  constructor() {
    this.apValueEl = document.getElementById('ap-value')!;
    this.turnValueEl = document.getElementById('turn-value')!;
    this.tideValueEl = document.getElementById('tide-value')!;
    this.timerValueEl = document.getElementById('timer-value')!;
    this.endTurnBtn = document.getElementById('end-turn-btn') as HTMLButtonElement;
    this.readyBtn = document.getElementById('ready-btn') as HTMLButtonElement;
    this.lobbySectionEl = document.getElementById('lobby-section')!;
    this.gameSectionEl = document.getElementById('game-section')!;
    this.playerListEl = document.getElementById('player-list')!;
    this.statusMessageEl = document.getElementById('status-message')!;

    // New elements
    this.currentPlayerEl = document.getElementById('current-player-value')!;
    this.phaseEl = document.getElementById('phase-value')!;
    this.instructionsEl = document.getElementById('phase-instructions')!;
    this.instructionsPhaseTitleEl = document.getElementById('instructions-phase-title')!;
    this.instructionsContentEl = document.getElementById('instructions-content')!;
    this.yourTurnIndicatorEl = document.getElementById('your-turn-indicator')!;

    // Zoom controls
    this.zoomInBtn = document.getElementById('zoom-in-btn') as HTMLButtonElement;
    this.zoomOutBtn = document.getElementById('zoom-out-btn') as HTMLButtonElement;
    this.zoomFitBtn = document.getElementById('zoom-fit-btn') as HTMLButtonElement;
    this.zoomLevelEl = document.getElementById('zoom-level')!;

    // Tide forecast
    this.tideForecastContainer = document.getElementById('tide-forecast-container')!;
    this.tideForecast1El = document.getElementById('tide-forecast-1')!;
    this.tideForecast2El = document.getElementById('tide-forecast-2')!;

    // Scoreboard
    this.scoreboardPanel = document.getElementById('scoreboard-panel')!;
    this.scoreboardToggle = document.getElementById('scoreboard-toggle') as HTMLButtonElement;
    this.scoreboardTbody = document.getElementById('scoreboard-body')!;

    // Setup scoreboard toggle
    this.scoreboardToggle?.addEventListener('click', () => {
      this.toggleScoreboard();
    });
  }

  /**
   * Update action points display
   */
  updateActionPoints(current: number, max: number): void {
    this.apValueEl.textContent = `${current} / ${max}`;

    this.apValueEl.classList.remove('low', 'medium', 'high');

    const percentage = current / max;
    if (percentage <= 0.3) {
      this.apValueEl.classList.add('low');
    } else if (percentage <= 0.6) {
      this.apValueEl.classList.add('medium');
    } else {
      this.apValueEl.classList.add('high');
    }
  }

  /**
   * Update turn display
   */
  updateTurn(current: number, max: number = 25): void {
    this.turnValueEl.textContent = `${current} / ${max}`;
  }

  /**
   * Update tide display
   */
  updateTide(tide: TideLevel): void {
    const tideText = tide.toUpperCase();
    this.tideValueEl.textContent = tideText;

    this.tideValueEl.classList.remove('low', 'medium', 'high');

    switch (tide) {
      case 'low':
        this.tideValueEl.classList.add('low');
        break;
      case 'normal':
        this.tideValueEl.classList.add('medium');
        break;
      case 'high':
        this.tideValueEl.classList.add('high');
        break;
    }
  }

  /**
   * Update tide forecast display based on converter count.
   * @param forecast Array of future tide levels (0-2 items based on converter count)
   * @param converterCount Number of converters the player owns
   */
  updateTideForecast(forecast: TideLevel[], converterCount: number): void {
    // Reset visibility
    this.tideForecast1El.classList.add('hidden');
    this.tideForecast2El.classList.add('hidden');
    this.tideForecastContainer.classList.remove('no-converter');

    if (converterCount === 0) {
      // No converter - show blurred placeholder
      this.tideForecastContainer.classList.add('no-converter');
      this.tideForecast1El.textContent = '?';
      this.tideForecast1El.className = 'tide-forecast-item unknown';
      return;
    }

    // Show forecast based on converter count
    if (forecast.length >= 1) {
      this.updateForecastItem(this.tideForecast1El, forecast[0], 1);
    }

    if (forecast.length >= 2 && converterCount >= 2) {
      this.updateForecastItem(this.tideForecast2El, forecast[1], 2);
    }
  }

  /**
   * Update a single forecast item element
   */
  private updateForecastItem(el: HTMLElement, tide: TideLevel, turnOffset: number): void {
    el.textContent = `+${turnOffset}: ${tide.toUpperCase()}`;
    el.classList.remove('hidden', 'low', 'normal', 'high', 'unknown');
    el.classList.add(tide);
  }

  /**
   * Start turn timer
   */
  startTimer(durationMs: number): void {
    this.stopTimer();
    this.turnEndTime = Date.now() + durationMs;
    this.updateTimer();

    this.timerInterval = window.setInterval(() => {
      this.updateTimer();
    }, 100);
  }

  /**
   * Update timer display
   */
  private updateTimer(): void {
    const remaining = Math.max(0, this.turnEndTime - Date.now());
    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    this.timerValueEl.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;

    this.timerValueEl.classList.remove('low', 'medium', 'high');

    if (seconds <= 30) {
      this.timerValueEl.classList.add('low');
    } else if (seconds <= 90) {
      this.timerValueEl.classList.add('medium');
    } else {
      this.timerValueEl.classList.add('high');
    }

    if (remaining === 0) {
      this.stopTimer();
      if (this.timerExpiredCallback) {
        this.timerExpiredCallback();
      }
    }
  }

  /**
   * Stop turn timer
   */
  stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Enable or disable end turn button
   */
  setEndTurnEnabled(enabled: boolean): void {
    this.endTurnBtn.disabled = !enabled;
  }

  /**
   * Set end turn button click handler
   */
  onEndTurn(callback: () => void): void {
    this.endTurnBtn.addEventListener('click', callback);
  }

  /**
   * Set timer expired callback (auto-end turn)
   */
  onTimerExpired(callback: () => void): void {
    this.timerExpiredCallback = callback;
  }

  /**
   * Set ready button click handler
   */
  onReady(callback: () => void): void {
    this.readyBtn.addEventListener('click', () => {
      if (!this.isReady) {
        this.isReady = true;
        this.readyBtn.textContent = 'Ready!';
        this.readyBtn.classList.add('ready');
        this.readyBtn.disabled = true;
        callback();
      }
    });
  }

  /**
   * Update the player list in lobby
   */
  updatePlayerList(players: LobbyPlayer[]): void {
    this.playerListEl.innerHTML = '';
    players.forEach(player => {
      const badge = document.createElement('span');
      badge.className = `player-badge ${player.color}`;
      if (player.isReady) {
        badge.classList.add('ready');
      }
      if (player.isConnected === false) {
        badge.classList.add('disconnected');
      }
      badge.textContent = player.name;
      this.playerListEl.appendChild(badge);
    });
  }

  /**
   * Switch from lobby mode to game mode
   */
  enterGameMode(): void {
    this.lobbySectionEl.style.display = 'none';
    this.gameSectionEl.style.display = 'flex';
  }

  /**
   * Check if in lobby mode
   */
  isLobbyMode(): boolean {
    return this.lobbySectionEl.style.display !== 'none';
  }

  /**
   * Show status message
   */
  showMessage(message: string, duration: number = 3000): void {
    this.statusMessageEl.textContent = message;
    this.statusMessageEl.classList.add('visible');

    setTimeout(() => {
      this.hideMessage();
    }, duration);
  }

  /**
   * Hide status message
   */
  hideMessage(): void {
    this.statusMessageEl.classList.remove('visible');
  }

  /**
   * Show loading state
   */
  showLoading(): void {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
    }
  }

  /**
   * Hide loading state
   */
  hideLoading(): void {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.classList.add('hidden');
    }
  }

  /**
   * Set zoom in button click handler
   */
  onZoomIn(callback: () => void): void {
    this.zoomInBtn?.addEventListener('click', callback);
  }

  /**
   * Set zoom out button click handler
   */
  onZoomOut(callback: () => void): void {
    this.zoomOutBtn?.addEventListener('click', callback);
  }

  /**
   * Set zoom fit button click handler
   */
  onZoomFit(callback: () => void): void {
    this.zoomFitBtn?.addEventListener('click', callback);
  }

  /**
   * Update the zoom level display
   */
  updateZoomLevel(zoom: number): void {
    if (this.zoomLevelEl) {
      const percentage = Math.round(zoom * 100);
      this.zoomLevelEl.textContent = `${percentage}%`;
    }
  }

  /**
   * Update current player display
   */
  updateCurrentPlayer(name: string, color: string, isMyTurn: boolean): void {
    this.currentPlayerEl.textContent = name;
    this.currentPlayerEl.className = `hud-value player-indicator ${color}`;

    // Update your turn indicator
    if (isMyTurn) {
      this.yourTurnIndicatorEl.style.display = 'inline-block';
      this.instructionsEl.classList.add('my-turn');
    } else {
      this.yourTurnIndicatorEl.style.display = 'none';
      this.instructionsEl.classList.remove('my-turn');
    }
  }

  /**
   * Update phase display
   */
  updatePhase(phase: GamePhase): void {
    const phaseText = phase.toUpperCase();
    this.phaseEl.textContent = phaseText;
    this.phaseEl.className = `hud-value phase-indicator phase-${phase}`;

    // Update instructions phase title
    this.instructionsPhaseTitleEl.textContent = `${phaseText} PHASE`;

    // Update instructions content
    this.instructionsContentEl.innerHTML = PHASE_INSTRUCTIONS[phase];
  }

  /**
   * Update all phase info at once
   */
  updatePhaseInfo(info: PhaseInfo): void {
    this.updateCurrentPlayer(info.currentPlayerName, info.currentPlayerColor, info.isMyTurn);
    this.updatePhase(info.phase);
  }

  /**
   * Show the instructions panel
   */
  showInstructions(): void {
    this.instructionsEl.style.display = 'block';
  }

  /**
   * Hide the instructions panel
   */
  hideInstructions(): void {
    this.instructionsEl.style.display = 'none';
  }

  // ============================================================================
  // Lift-Off Decision UI
  // ============================================================================

  private liftOffDecisionCallback: ((decision: boolean) => void) | null = null;
  private liftOffActionCallback: (() => void) | null = null;
  private liftOffModal: HTMLElement | null = null;
  private liftOffBtn: HTMLButtonElement | null = null;

  /**
   * Show the lift-off decision modal (Turn 21)
   * Player chooses to lift off now or stay until turn 25
   */
  showLiftOffDecision(takeOffCost: number, callback: (decision: boolean) => void): void {
    this.liftOffDecisionCallback = callback;

    // Create modal if it doesn't exist
    if (!this.liftOffModal) {
      this.liftOffModal = document.createElement('div');
      this.liftOffModal.id = 'lift-off-modal';
      this.liftOffModal.className = 'modal';
      document.body.appendChild(this.liftOffModal);
    }

    this.liftOffModal.innerHTML = `
      <div class="modal-content lift-off-decision">
        <h2>Lift-Off Decision (Turn 21)</h2>
        <p>It's time to decide your strategy:</p>
        <div class="decision-options">
          <div class="decision-option">
            <h3>Lift Off Now</h3>
            <p>Take off immediately and secure your current cargo.</p>
            <p class="cost">Take-off cost: <strong>${takeOffCost} AP</strong></p>
            <button id="lift-off-now-btn" class="btn btn-primary">Lift Off Now</button>
          </div>
          <div class="decision-option">
            <h3>Stay Until Turn 25</h3>
            <p>Continue playing for 4 more turns. Risk vs reward!</p>
            <p class="warning">⚠️ Must lift off by turn 25 or be stranded.</p>
            <button id="stay-btn" class="btn btn-secondary">Stay</button>
          </div>
        </div>
      </div>
    `;

    this.liftOffModal.style.display = 'flex';

    // Add event listeners
    const liftOffNowBtn = document.getElementById('lift-off-now-btn');
    const stayBtn = document.getElementById('stay-btn');

    liftOffNowBtn?.addEventListener('click', () => {
      this.hideLiftOffDecision();
      if (this.liftOffDecisionCallback) {
        this.liftOffDecisionCallback(true);
      }
    });

    stayBtn?.addEventListener('click', () => {
      this.hideLiftOffDecision();
      if (this.liftOffDecisionCallback) {
        this.liftOffDecisionCallback(false);
      }
    });
  }

  /**
   * Hide the lift-off decision modal
   */
  hideLiftOffDecision(): void {
    if (this.liftOffModal) {
      this.liftOffModal.style.display = 'none';
    }
  }

  /**
   * Show lift-off button (during turns 21-25 when player can lift off)
   */
  showLiftOffButton(takeOffCost: number, currentAP: number): void {
    if (!this.liftOffBtn) {
      this.liftOffBtn = document.createElement('button');
      this.liftOffBtn.id = 'lift-off-btn';
      this.liftOffBtn.className = 'btn btn-liftoff';

      // Add next to end turn button
      this.endTurnBtn.parentElement?.appendChild(this.liftOffBtn);

      this.liftOffBtn.addEventListener('click', () => {
        if (this.liftOffActionCallback) {
          this.liftOffActionCallback();
        }
      });
    }

    const canAfford = currentAP >= takeOffCost;
    this.liftOffBtn.textContent = `🚀 Lift Off (${takeOffCost} AP)`;
    this.liftOffBtn.disabled = !canAfford;
    this.liftOffBtn.style.display = 'inline-block';

    if (!canAfford) {
      this.liftOffBtn.title = `Need ${takeOffCost} AP to lift off (you have ${currentAP})`;
    } else {
      this.liftOffBtn.title = 'Lift off and end the game for yourself';
    }
  }

  /**
   * Hide lift-off button
   */
  hideLiftOffButton(): void {
    if (this.liftOffBtn) {
      this.liftOffBtn.style.display = 'none';
    }
  }

  /**
   * Set lift-off action callback (manual lift-off during turns 21-25)
   */
  onLiftOff(callback: () => void): void {
    this.liftOffActionCallback = callback;
  }

  // ============================================================================
  // Unit Context Actions (Mineral Pickup/Drop)
  // ============================================================================

  private unitContextPanel: HTMLElement | null = null;
  private loadCallback: ((mineralId: string) => void) | null = null;
  private unloadCallback: ((cargoId: string, destination: HexCoord) => void) | null = null;
  private selectedDropHex: HexCoord | null = null;
  private currentContext: UnitActionContext | null = null;

  /**
   * Show unit context action panel when a transporter is selected
   */
  showUnitActions(context: UnitActionContext): void {
    this.currentContext = context;

    // Only show for transporter units
    const transporterTypes = [UnitType.Crab, UnitType.Converter, UnitType.Barge];
    if (!transporterTypes.includes(context.unit.type)) {
      this.hideUnitActions();
      return;
    }

    // Create panel if it doesn't exist
    if (!this.unitContextPanel) {
      this.unitContextPanel = document.createElement('div');
      this.unitContextPanel.id = 'unit-context-panel';
      this.unitContextPanel.className = 'unit-context-panel';
      document.body.appendChild(this.unitContextPanel);
    }

    const unitName = context.unit.type.charAt(0).toUpperCase() + context.unit.type.slice(1);
    const cargoCount = context.cargo.length;
    const freeSlots = context.cargoSlots - cargoCount;

    let actionsHtml = `
      <div class="unit-context-header">
        <span class="unit-name">${unitName}</span>
        <span class="cargo-info">Cargo: ${cargoCount}/${context.cargoSlots}</span>
      </div>
      <div class="unit-actions">
    `;

    // Pickup mineral button (if mineral at position and has free slots)
    if (context.minerals.length > 0 && freeSlots > 0) {
      for (const mineral of context.minerals) {
        actionsHtml += `
          <button class="action-btn pickup-btn" data-mineral-id="${mineral.id}">
            ⛏️ Pick up Mineral
            <span class="action-cost">1 AP</span>
          </button>
        `;
      }
    }

    // Drop cargo buttons (if has cargo)
    if (cargoCount > 0) {
      actionsHtml += `
        <div class="drop-section">
          <label>Drop cargo:</label>
          <select id="cargo-select" class="cargo-select">
            ${context.cargo.map((cargoId, idx) => `
              <option value="${cargoId}">Cargo ${idx + 1}</option>
            `).join('')}
          </select>
          <div class="drop-hexes">
            ${context.adjacentHexes.map((hex, idx) => `
              <button class="action-btn drop-hex-btn" data-hex-q="${hex.q}" data-hex-r="${hex.r}">
                Drop at (${hex.q},${hex.r})
                <span class="action-cost">1 AP</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Close button
    actionsHtml += `
      </div>
      <button class="action-btn close-btn" id="close-unit-panel">✕ Close</button>
    `;

    this.unitContextPanel.innerHTML = actionsHtml;
    this.unitContextPanel.style.display = 'block';

    // Add event listeners
    this.setupUnitActionListeners();
  }

  /**
   * Set up event listeners for unit action buttons
   */
  private setupUnitActionListeners(): void {
    if (!this.unitContextPanel) return;

    // Pickup buttons
    const pickupBtns = this.unitContextPanel.querySelectorAll('.pickup-btn');
    pickupBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mineralId = (btn as HTMLElement).dataset.mineralId;
        if (mineralId && this.loadCallback) {
          this.loadCallback(mineralId);
        }
      });
    });

    // Drop buttons
    const dropBtns = this.unitContextPanel.querySelectorAll('.drop-hex-btn');
    dropBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const q = parseInt((btn as HTMLElement).dataset.hexQ || '0', 10);
        const r = parseInt((btn as HTMLElement).dataset.hexR || '0', 10);
        const cargoSelect = document.getElementById('cargo-select') as HTMLSelectElement;
        const cargoId = cargoSelect?.value;
        if (cargoId && this.unloadCallback) {
          this.unloadCallback(cargoId, { q, r });
        }
      });
    });

    // Close button
    const closeBtn = document.getElementById('close-unit-panel');
    closeBtn?.addEventListener('click', () => {
      this.hideUnitActions();
    });
  }

  /**
   * Hide unit context action panel
   */
  hideUnitActions(): void {
    if (this.unitContextPanel) {
      this.unitContextPanel.style.display = 'none';
    }
    this.currentContext = null;
    this.selectedDropHex = null;
  }

  /**
   * Set callback for mineral load action
   */
  onLoad(callback: (mineralId: string) => void): void {
    this.loadCallback = callback;
  }

  /**
   * Set callback for cargo unload action
   */
  onUnload(callback: (cargoId: string, destination: HexCoord) => void): void {
    this.unloadCallback = callback;
  }

  /**
   * Update the unit actions panel (e.g., after AP change)
   */
  updateUnitActions(context: UnitActionContext): void {
    if (this.unitContextPanel?.style.display === 'block') {
      this.showUnitActions(context);
    }
  }

  /**
   * Show game over modal with final scores
   */
  showGameOver(scores: Record<string, number>, playerNames: Record<string, string>, winners: string[]): void {
    // Create modal if it doesn't exist
    if (!this.liftOffModal) {
      this.liftOffModal = document.createElement('div');
      this.liftOffModal.id = 'lift-off-modal';
      this.liftOffModal.className = 'modal';
      document.body.appendChild(this.liftOffModal);
    }

    const sortedPlayers = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const winnerText = winners.length > 1
      ? `Winners: ${winners.map(id => playerNames[id] || id).join(', ')}`
      : `Winner: ${playerNames[winners[0]] || winners[0]}`;

    const scoreRows = sortedPlayers.map(([playerId, score], index) => {
      const isWinner = winners.includes(playerId);
      const name = playerNames[playerId] || playerId;
      return `
        <tr class="${isWinner ? 'winner' : ''}">
          <td>${index + 1}</td>
          <td>${name}${isWinner ? ' 🏆' : ''}</td>
          <td>${score}</td>
        </tr>
      `;
    }).join('');

    this.liftOffModal.innerHTML = `
      <div class="modal-content game-over">
        <h2>🎉 Game Over!</h2>
        <h3>${winnerText}</h3>
        <table class="scores-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            ${scoreRows}
          </tbody>
        </table>
        <p class="scoring-info">
          Scoring: 2 pts/mineral, 1 pt/equipment, 1 pt/intact turret<br>
          (Only counts if Astronef lifted off successfully)
        </p>
        <button id="game-over-close-btn" class="btn btn-primary">Close</button>
      </div>
    `;

    this.liftOffModal.style.display = 'flex';

    document.getElementById('game-over-close-btn')?.addEventListener('click', () => {
      this.liftOffModal!.style.display = 'none';
    });
  }

  // ============================================================================
  // Scoreboard
  // ============================================================================

  /**
   * Update the scoreboard with player statistics
   */
  updateScoreboard(
    players: Array<{
      id: string;
      name: string;
      color: string;
      unitCount: number;
      cargoCount: number;
      score: number;
      hasLiftedOff: boolean;
      isConnected?: boolean;
    }>,
    currentPlayerId: string
  ): void {
    if (!this.scoreboardTbody) return;

    this.scoreboardTbody.innerHTML = '';

    for (const player of players) {
      const row = document.createElement('tr');
      row.className = 'player-row';
      if (player.id === currentPlayerId) {
        row.classList.add('current-player');
      }
      if (player.hasLiftedOff) {
        row.classList.add('lifted-off');
      }
      if (player.isConnected === false) {
        row.classList.add('disconnected');
      }

      const disconnectedIcon = player.isConnected === false ? '<span class="disconnected-icon" title="Disconnected">⚠️</span>' : '';
      const liftoffIcon = player.hasLiftedOff ? '<span class="liftoff-icon">🚀</span>' : '';

      row.innerHTML = `
        <td>
          <span class="player-color-dot" style="background-color: ${this.getPlayerColorHex(player.color)}"></span>
          ${disconnectedIcon}
          ${player.name}
          ${liftoffIcon}
        </td>
        <td>${player.unitCount}</td>
        <td>${player.cargoCount}</td>
        <td class="score-cell">${player.score}</td>
      `;

      this.scoreboardTbody.appendChild(row);
    }
  }

  /**
   * Convert player color name to hex value
   */
  private getPlayerColorHex(color: string): string {
    const colorMap: Record<string, string> = {
      red: '#e74c3c',
      blue: '#3498db',
      green: '#2ecc71',
      yellow: '#f1c40f',
      orange: '#e67e22',
      purple: '#9b59b6',
    };
    return colorMap[color] || '#666';
  }

  /**
   * Show the scoreboard panel
   */
  showScoreboard(): void {
    if (this.scoreboardPanel) {
      this.scoreboardPanel.classList.remove('hidden');
    }
  }

  /**
   * Hide the scoreboard panel
   */
  hideScoreboard(): void {
    if (this.scoreboardPanel) {
      this.scoreboardPanel.classList.add('hidden');
    }
  }

  /**
   * Toggle scoreboard expand/collapse
   */
  toggleScoreboard(): void {
    this.scoreboardExpanded = !this.scoreboardExpanded;
    const content = document.getElementById('scoreboard-content');
    if (content) {
      content.classList.toggle('collapsed', !this.scoreboardExpanded);
    }
    if (this.scoreboardToggle) {
      this.scoreboardToggle.textContent = this.scoreboardExpanded ? '▼' : '▲';
    }
  }

  // ============================================================================
  // AP Save Dialog
  // ============================================================================

  private apSaveModal: HTMLElement | null = null;
  private apSaveCallback: ((savedAP: number) => void) | null = null;

  /**
   * Show the AP save dialog at end of turn.
   * Allows player to choose how much AP to save (0 to min(available, 10)).
   */
  showAPSaveDialog(availableAP: number, callback: (savedAP: number) => void): void {
    this.apSaveCallback = callback;

    const maxSave = Math.min(availableAP, 10);

    // Create modal if it doesn't exist
    if (!this.apSaveModal) {
      this.apSaveModal = document.createElement('div');
      this.apSaveModal.id = 'ap-save-modal';
      this.apSaveModal.className = 'modal';
      document.body.appendChild(this.apSaveModal);
    }

    // Generate AP save options
    const options = [];
    for (let i = 0; i <= maxSave; i++) {
      options.push(`
        <button class="ap-save-option" data-ap="${i}">
          ${i === 0 ? 'Save Nothing' : `Save ${i} AP`}
        </button>
      `);
    }

    this.apSaveModal.innerHTML = `
      <div class="modal-content ap-save-dialog">
        <h2>End Turn - Save AP?</h2>
        <p>You have <strong>${availableAP} AP</strong> remaining.</p>
        <p>Choose how much to save for next turn (max 10):</p>
        <div class="ap-save-options">
          ${options.join('')}
        </div>
        <div class="ap-save-quick-actions">
          <button class="btn btn-secondary" id="ap-save-none">Save Nothing (0 AP)</button>
          <button class="btn btn-primary" id="ap-save-max">Save Maximum (${maxSave} AP)</button>
        </div>
      </div>
    `;

    this.apSaveModal.style.display = 'flex';

    // Add event listeners
    const optionBtns = this.apSaveModal.querySelectorAll('.ap-save-option');
    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const ap = parseInt((btn as HTMLElement).dataset.ap || '0', 10);
        this.hideAPSaveDialog();
        if (this.apSaveCallback) {
          this.apSaveCallback(ap);
        }
      });
    });

    document.getElementById('ap-save-none')?.addEventListener('click', () => {
      this.hideAPSaveDialog();
      if (this.apSaveCallback) {
        this.apSaveCallback(0);
      }
    });

    document.getElementById('ap-save-max')?.addEventListener('click', () => {
      this.hideAPSaveDialog();
      if (this.apSaveCallback) {
        this.apSaveCallback(maxSave);
      }
    });
  }

  /**
   * Hide the AP save dialog
   */
  hideAPSaveDialog(): void {
    if (this.apSaveModal) {
      this.apSaveModal.style.display = 'none';
    }
  }

  // ============================================================================
  // Action History & Undo
  // ============================================================================

  private actionHistoryPanel: HTMLElement | null = null;
  private actionHistoryList: HTMLElement | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private undoCallback: (() => void) | null = null;
  private actionHistoryExpanded: boolean = true;

  /**
   * Show action history panel
   */
  showActionHistory(): void {
    if (!this.actionHistoryPanel) {
      this.createActionHistoryPanel();
    }
    this.actionHistoryPanel!.classList.remove('hidden');
  }

  /**
   * Hide action history panel
   */
  hideActionHistory(): void {
    if (this.actionHistoryPanel) {
      this.actionHistoryPanel.classList.add('hidden');
    }
  }

  /**
   * Create the action history panel DOM structure
   */
  private createActionHistoryPanel(): void {
    this.actionHistoryPanel = document.createElement('div');
    this.actionHistoryPanel.id = 'action-history-panel';
    this.actionHistoryPanel.className = 'action-history-panel';
    this.actionHistoryPanel.innerHTML = `
      <div class="action-history-header">
        <h3>Turn Actions</h3>
        <div class="action-history-controls">
          <button id="undo-btn" class="btn btn-undo" disabled title="Undo last action">
            ↩ Undo
          </button>
          <button id="action-history-toggle" class="btn btn-toggle">▼</button>
        </div>
      </div>
      <div id="action-history-content" class="action-history-content">
        <ul id="action-history-list" class="action-history-list">
          <li class="action-history-empty">No actions this turn</li>
        </ul>
      </div>
    `;

    document.body.appendChild(this.actionHistoryPanel);

    this.actionHistoryList = document.getElementById('action-history-list');
    this.undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;

    // Toggle expand/collapse
    const toggleBtn = document.getElementById('action-history-toggle');
    toggleBtn?.addEventListener('click', () => {
      this.toggleActionHistory();
    });

    // Undo button
    this.undoBtn?.addEventListener('click', () => {
      if (this.undoCallback) {
        this.undoCallback();
      }
    });
  }

  /**
   * Toggle action history expand/collapse
   */
  private toggleActionHistory(): void {
    this.actionHistoryExpanded = !this.actionHistoryExpanded;
    const content = document.getElementById('action-history-content');
    const toggleBtn = document.getElementById('action-history-toggle');

    if (content) {
      content.classList.toggle('collapsed', !this.actionHistoryExpanded);
    }
    if (toggleBtn) {
      toggleBtn.textContent = this.actionHistoryExpanded ? '▼' : '▲';
    }
  }

  /**
   * Update the action history list
   */
  updateActionHistory(actions: ActionHistoryEntry[], canUndo: boolean): void {
    if (!this.actionHistoryList) {
      this.createActionHistoryPanel();
    }

    if (!this.actionHistoryList) return;

    if (actions.length === 0) {
      this.actionHistoryList.innerHTML = '<li class="action-history-empty">No actions this turn</li>';
    } else {
      this.actionHistoryList.innerHTML = actions.map(action => `
        <li class="action-history-item ${action.isOpponent ? 'opponent' : 'self'}">
          <span class="action-icon">${this.getActionIcon(action.type)}</span>
          <span class="action-details">
            <span class="action-desc">${action.description}</span>
            <span class="action-meta">
              <span class="action-player" style="color: ${this.getPlayerColorHex(action.playerColor)}">${action.isOpponent ? '👁' : ''}</span>
              <span class="action-ap">${action.apCost > 0 ? `-${action.apCost} AP` : ''}</span>
            </span>
          </span>
        </li>
      `).join('');
    }

    // Update undo button state
    if (this.undoBtn) {
      this.undoBtn.disabled = !canUndo;
      this.undoBtn.title = canUndo ? 'Undo last action' : 'Nothing to undo';
    }
  }

  /**
   * Get an icon for an action type
   */
  private getActionIcon(type: string): string {
    const icons: Record<string, string> = {
      'MOVE': '🚗',
      'LOAD': '📦',
      'UNLOAD': '📤',
      'FIRE': '💥',
      'CAPTURE': '🎯',
      'BUILD': '🔧',
      'ENTER_ASTRONEF': '🚀',
      'EXIT_ASTRONEF': '🚪',
      'LAND_ASTRONEF': '🛬',
      'DEPLOY_UNIT': '📍',
      'LIFT_OFF': '🚀',
      'RETREAT': '🏃',
      'END_TURN': '⏭️',
    };
    return icons[type] || '•';
  }

  /**
   * Set undo button click handler
   */
  onUndo(callback: () => void): void {
    this.undoCallback = callback;
  }

  /**
   * Enable or disable the undo button
   */
  setUndoEnabled(enabled: boolean): void {
    if (this.undoBtn) {
      this.undoBtn.disabled = !enabled;
    }
  }

  /**
   * Add a new action to the history (with animation)
   */
  addActionToHistory(action: ActionHistoryEntry): void {
    if (!this.actionHistoryList) return;

    // Remove "no actions" message if present
    const emptyMsg = this.actionHistoryList.querySelector('.action-history-empty');
    if (emptyMsg) {
      emptyMsg.remove();
    }

    const li = document.createElement('li');
    li.className = `action-history-item ${action.isOpponent ? 'opponent' : 'self'} new`;
    li.innerHTML = `
      <span class="action-icon">${this.getActionIcon(action.type)}</span>
      <span class="action-details">
        <span class="action-desc">${action.description}</span>
        <span class="action-meta">
          <span class="action-player" style="color: ${this.getPlayerColorHex(action.playerColor)}">${action.isOpponent ? '👁' : ''}</span>
          <span class="action-ap">${action.apCost > 0 ? `-${action.apCost} AP` : ''}</span>
        </span>
      </span>
    `;

    // Prepend (newest at top) or append (newest at bottom)
    this.actionHistoryList.prepend(li);

    // Remove "new" class after animation
    setTimeout(() => {
      li.classList.remove('new');
    }, 500);
  }

  /**
   * Clear action history (e.g., on new turn)
   */
  clearActionHistory(): void {
    if (this.actionHistoryList) {
      this.actionHistoryList.innerHTML = '<li class="action-history-empty">No actions this turn</li>';
    }
    if (this.undoBtn) {
      this.undoBtn.disabled = true;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopTimer();
    if (this.liftOffModal) {
      this.liftOffModal.remove();
      this.liftOffModal = null;
    }
    if (this.liftOffBtn) {
      this.liftOffBtn.remove();
      this.liftOffBtn = null;
    }
    if (this.unitContextPanel) {
      this.unitContextPanel.remove();
      this.unitContextPanel = null;
    }
    if (this.apSaveModal) {
      this.apSaveModal.remove();
      this.apSaveModal = null;
    }
    if (this.actionHistoryPanel) {
      this.actionHistoryPanel.remove();
      this.actionHistoryPanel = null;
    }
  }
}
