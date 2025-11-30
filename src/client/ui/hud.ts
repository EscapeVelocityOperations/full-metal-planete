/**
 * HUD (Heads-Up Display) component for game interface
 */

import type { TideLevel } from '@/shared/game/types';

export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  isReady: boolean;
}

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
   * Clean up resources
   */
  destroy(): void {
    this.stopTimer();
  }
}
