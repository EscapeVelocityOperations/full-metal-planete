/**
 * Home page component for creating/joining games
 */

const STORAGE_KEY = 'fmp_username';
const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

export interface GameInfo {
  gameId: string;
  playerId: string;
  playerToken: string;
}

export interface SpectatorInfo {
  gameId: string;
  spectatorId: string;
  spectatorToken: string;
}

export class HomePage {
  private container: HTMLElement;
  private usernameInput: HTMLInputElement | null = null;
  private gameIdInput: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;

  constructor() {
    this.container = document.getElementById('home-page')!;
    this.setupUI();
    this.loadUsername();
  }

  private setupUI(): void {
    // Username input handler
    this.usernameInput = document.getElementById('username-input') as HTMLInputElement;
    this.gameIdInput = document.getElementById('game-id-input') as HTMLInputElement;
    this.errorEl = document.getElementById('home-error');

    // Create game button
    const createBtn = document.getElementById('create-game-btn');
    createBtn?.addEventListener('click', () => this.createGame());

    // Join game button
    const joinBtn = document.getElementById('join-game-btn');
    joinBtn?.addEventListener('click', () => this.joinGame());

    // Spectate game button
    const spectateBtn = document.getElementById('spectate-game-btn');
    spectateBtn?.addEventListener('click', () => this.spectateGame());

    // Save username on change
    this.usernameInput?.addEventListener('change', () => this.saveUsername());

    // Allow enter to submit
    this.gameIdInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.joinGame();
      }
    });
  }

  private loadUsername(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && this.usernameInput) {
      this.usernameInput.value = saved;
    } else if (this.usernameInput) {
      // Generate random name
      this.usernameInput.value = `Player${Math.floor(Math.random() * 9000) + 1000}`;
    }
  }

  private saveUsername(): void {
    if (this.usernameInput) {
      localStorage.setItem(STORAGE_KEY, this.usernameInput.value);
    }
  }

  private getUsername(): string {
    return this.usernameInput?.value.trim() || 'Anonymous';
  }

  private showError(message: string): void {
    if (this.errorEl) {
      this.errorEl.textContent = message;
      this.errorEl.classList.add('visible');
      setTimeout(() => {
        this.errorEl?.classList.remove('visible');
      }, 5000);
    }
  }

  private async createGame(): Promise<void> {
    const playerName = this.getUsername();
    this.saveUsername();

    try {
      const response = await fetch(`${API_BASE}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create game');
      }

      const data: GameInfo & { joinUrl: string } = await response.json();

      // Navigate to game
      this.navigateToGame(data);
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to create game');
    }
  }

  private async joinGame(): Promise<void> {
    const gameId = this.gameIdInput?.value.trim();
    const playerName = this.getUsername();
    this.saveUsername();

    if (!gameId) {
      this.showError('Please enter a Game ID');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join game');
      }

      const data: GameInfo = await response.json();

      // Navigate to game
      this.navigateToGame(data);
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to join game');
    }
  }

  private async spectateGame(): Promise<void> {
    const gameId = this.gameIdInput?.value.trim();
    const spectatorName = this.getUsername();

    if (!gameId) {
      this.showError('Please enter a Game ID');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/spectate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spectatorName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to spectate game');
      }

      const data: SpectatorInfo = await response.json();

      // Navigate to spectator view
      this.navigateToSpectator(data);
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to spectate game');
    }
  }

  private navigateToGame(gameInfo: GameInfo): void {
    const url = new URL(window.location.href);
    url.pathname = '/game';
    url.searchParams.set('gameId', gameInfo.gameId);
    url.searchParams.set('playerId', gameInfo.playerId);
    url.searchParams.set('token', gameInfo.playerToken);
    window.location.href = url.toString();
  }

  private navigateToSpectator(spectatorInfo: SpectatorInfo): void {
    const url = new URL(window.location.href);
    url.pathname = '/game';
    url.searchParams.set('gameId', spectatorInfo.gameId);
    url.searchParams.set('spectatorId', spectatorInfo.spectatorId);
    url.searchParams.set('token', spectatorInfo.spectatorToken);
    url.searchParams.set('spectator', 'true');
    window.location.href = url.toString();
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  destroy(): void {
    // Cleanup if needed
  }
}
