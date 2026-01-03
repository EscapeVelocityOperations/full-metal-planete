/**
 * Replay Controls UI Component
 *
 * Provides a visual interface for game replay:
 * - Play/pause button
 * - Speed controls (0.5x, 1x, 2x, 4x)
 * - Step forward/backward buttons
 * - Turn navigation buttons
 * - Timeline scrubber with action markers
 * - Current action/turn display
 * - Export button
 */

import type { ReplayPlaybackState, TurnMarker, ReplayData, ReplaySpeed } from '@/shared/game/replay';
import { REPLAY_SPEEDS, exportReplayData } from '@/shared/game/replay';

export interface ReplayControlsEvents {
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  previousTurn: () => void;
  nextTurn: () => void;
  seekToPercent: (percent: number) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  export: () => void;
  close: () => void;
}

export class ReplayControls {
  private container: HTMLElement;
  private listeners: Map<keyof ReplayControlsEvents, Function[]> = new Map();
  private currentState: ReplayPlaybackState | null = null;
  private replayData: ReplayData | null = null;

  // DOM elements
  private playPauseBtn: HTMLButtonElement | null = null;
  private stepBackBtn: HTMLButtonElement | null = null;
  private stepForwardBtn: HTMLButtonElement | null = null;
  private prevTurnBtn: HTMLButtonElement | null = null;
  private nextTurnBtn: HTMLButtonElement | null = null;
  private speedBtns: Map<ReplaySpeed, HTMLButtonElement> = new Map();
  private timeline: HTMLInputElement | null = null;
  private timelineProgress: HTMLElement | null = null;
  private currentActionEl: HTMLElement | null = null;
  private currentTurnEl: HTMLElement | null = null;
  private currentPlayerEl: HTMLElement | null = null;
  private exportBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;

  constructor() {
    this.container = this.createContainer();
    document.body.appendChild(this.container);
  }

  /**
   * Create the main container and all UI elements
   */
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'replay-controls';
    container.className = 'replay-controls';
    container.innerHTML = `
      <div class="replay-header">
        <h2>Game Replay</h2>
        <button id="replay-close-btn" class="btn btn-icon" title="Close replay">✕</button>
      </div>

      <div class="replay-info">
        <div class="replay-info-item">
          <span class="label">Turn:</span>
          <span id="replay-turn" class="value">1 / 25</span>
        </div>
        <div class="replay-info-item">
          <span class="label">Player:</span>
          <span id="replay-player" class="value">-</span>
        </div>
        <div class="replay-info-item">
          <span class="label">Action:</span>
          <span id="replay-action" class="value">0 / 0</span>
        </div>
      </div>

      <div class="replay-timeline-container">
        <div class="replay-timeline-track">
          <div id="replay-timeline-progress" class="replay-timeline-progress"></div>
          <div id="replay-timeline-markers" class="replay-timeline-markers"></div>
        </div>
        <input type="range" id="replay-timeline" class="replay-timeline" min="0" max="100" value="0">
      </div>

      <div class="replay-main-controls">
        <div class="replay-nav-group">
          <button id="replay-prev-turn" class="btn btn-nav" title="Previous turn">
            ⏮
          </button>
          <button id="replay-step-back" class="btn btn-nav" title="Step backward">
            ⏪
          </button>
        </div>

        <button id="replay-play-pause" class="btn btn-play" title="Play/Pause">
          ▶
        </button>

        <div class="replay-nav-group">
          <button id="replay-step-forward" class="btn btn-nav" title="Step forward">
            ⏩
          </button>
          <button id="replay-next-turn" class="btn btn-nav" title="Next turn">
            ⏭
          </button>
        </div>
      </div>

      <div class="replay-speed-controls">
        <span class="speed-label">Speed:</span>
        <div class="speed-buttons">
          <button id="replay-speed-0.5" class="btn btn-speed" data-speed="0.5">0.5x</button>
          <button id="replay-speed-1" class="btn btn-speed active" data-speed="1">1x</button>
          <button id="replay-speed-2" class="btn btn-speed" data-speed="2">2x</button>
          <button id="replay-speed-4" class="btn btn-speed" data-speed="4">4x</button>
        </div>
      </div>

      <div class="replay-actions">
        <button id="replay-export" class="btn btn-secondary" title="Export replay file">
          📥 Export Replay
        </button>
      </div>
    `;

    // Store element references
    this.playPauseBtn = container.querySelector('#replay-play-pause');
    this.stepBackBtn = container.querySelector('#replay-step-back');
    this.stepForwardBtn = container.querySelector('#replay-step-forward');
    this.prevTurnBtn = container.querySelector('#replay-prev-turn');
    this.nextTurnBtn = container.querySelector('#replay-next-turn');
    this.timeline = container.querySelector('#replay-timeline');
    this.timelineProgress = container.querySelector('#replay-timeline-progress');
    this.currentActionEl = container.querySelector('#replay-action');
    this.currentTurnEl = container.querySelector('#replay-turn');
    this.currentPlayerEl = container.querySelector('#replay-player');
    this.exportBtn = container.querySelector('#replay-export');
    this.closeBtn = container.querySelector('#replay-close-btn');

    // Store speed buttons
    for (const speed of REPLAY_SPEEDS) {
      const btn = container.querySelector(`#replay-speed-${speed}`) as HTMLButtonElement;
      if (btn) {
        this.speedBtns.set(speed, btn);
      }
    }

    // Set up event listeners
    this.setupEventListeners();

    return container;
  }

  /**
   * Set up event listeners for all controls
   */
  private setupEventListeners(): void {
    // Play/Pause
    this.playPauseBtn?.addEventListener('click', () => {
      if (this.currentState?.isPlaying) {
        this.emit('pause');
      } else {
        this.emit('play');
      }
    });

    // Step controls
    this.stepBackBtn?.addEventListener('click', () => this.emit('stepBackward'));
    this.stepForwardBtn?.addEventListener('click', () => this.emit('stepForward'));
    this.prevTurnBtn?.addEventListener('click', () => this.emit('previousTurn'));
    this.nextTurnBtn?.addEventListener('click', () => this.emit('nextTurn'));

    // Timeline scrubber
    this.timeline?.addEventListener('input', (e) => {
      const percent = parseFloat((e.target as HTMLInputElement).value);
      this.emit('seekToPercent', percent);
    });

    // Speed buttons
    this.speedBtns.forEach((btn, speed) => {
      btn.addEventListener('click', () => {
        this.emit('setSpeed', speed);
      });
    });

    // Export
    this.exportBtn?.addEventListener('click', () => this.emit('export'));

    // Close
    this.closeBtn?.addEventListener('click', () => this.emit('close'));

    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyboard.bind(this));
  }

  /**
   * Handle keyboard shortcuts for replay
   */
  private handleKeyboard(e: KeyboardEvent): void {
    // Only handle if replay controls are visible
    if (this.container.style.display === 'none') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (this.currentState?.isPlaying) {
          this.emit('pause');
        } else {
          this.emit('play');
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) {
          this.emit('previousTurn');
        } else {
          this.emit('stepBackward');
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) {
          this.emit('nextTurn');
        } else {
          this.emit('stepForward');
        }
        break;
      case '1':
        this.emit('setSpeed', 0.5);
        break;
      case '2':
        this.emit('setSpeed', 1);
        break;
      case '3':
        this.emit('setSpeed', 2);
        break;
      case '4':
        this.emit('setSpeed', 4);
        break;
      case 'Escape':
        this.emit('close');
        break;
    }
  }

  /**
   * Update UI with new playback state
   */
  updatePlaybackState(state: ReplayPlaybackState): void {
    this.currentState = state;

    // Update play/pause button
    if (this.playPauseBtn) {
      this.playPauseBtn.textContent = state.isPlaying ? '⏸' : '▶';
      this.playPauseBtn.title = state.isPlaying ? 'Pause' : 'Play';
      this.playPauseBtn.classList.toggle('playing', state.isPlaying);
    }

    // Update timeline
    if (this.timeline && state.totalActions > 0) {
      const percent = (state.currentSeq / state.totalActions) * 100;
      this.timeline.value = String(percent);
    }

    // Update timeline progress bar
    if (this.timelineProgress && state.totalActions > 0) {
      const percent = (state.currentSeq / state.totalActions) * 100;
      this.timelineProgress.style.width = `${percent}%`;
    }

    // Update action counter
    if (this.currentActionEl) {
      this.currentActionEl.textContent = `${state.currentSeq} / ${state.totalActions}`;
    }

    // Update turn counter
    if (this.currentTurnEl) {
      this.currentTurnEl.textContent = `${state.currentTurn} / ${state.totalTurns}`;
    }

    // Update speed buttons
    this.speedBtns.forEach((btn, speed) => {
      btn.classList.toggle('active', state.speed === speed);
    });

    // Update navigation button states
    const atStart = state.currentSeq === 0;
    const atEnd = state.currentSeq >= state.totalActions;

    if (this.stepBackBtn) this.stepBackBtn.disabled = atStart;
    if (this.prevTurnBtn) this.prevTurnBtn.disabled = atStart;
    if (this.stepForwardBtn) this.stepForwardBtn.disabled = atEnd;
    if (this.nextTurnBtn) this.nextTurnBtn.disabled = atEnd;
  }

  /**
   * Update turn marker with player info
   */
  updateTurnMarker(marker: TurnMarker): void {
    if (this.currentPlayerEl) {
      this.currentPlayerEl.textContent = marker.playerName;
      this.currentPlayerEl.style.color = this.getPlayerColorHex(marker.playerColor);
    }
  }

  /**
   * Set replay data for export and marker display
   */
  setReplayData(data: ReplayData): void {
    this.replayData = data;
    this.renderTimelineMarkers(data.turnMarkers);
  }

  /**
   * Render turn markers on the timeline
   */
  private renderTimelineMarkers(markers: TurnMarker[]): void {
    const container = this.container.querySelector('#replay-timeline-markers');
    if (!container || !this.replayData) return;

    container.innerHTML = '';

    const totalActions = this.replayData.actions.length;
    if (totalActions === 0) return;

    // Add a marker for each turn boundary
    const seenTurns = new Set<number>();
    for (const marker of markers) {
      if (seenTurns.has(marker.turn)) continue;
      seenTurns.add(marker.turn);

      const percent = (marker.startSeq / totalActions) * 100;
      const markerEl = document.createElement('div');
      markerEl.className = 'timeline-marker';
      markerEl.style.left = `${percent}%`;
      markerEl.style.backgroundColor = this.getPlayerColorHex(marker.playerColor);
      markerEl.title = `Turn ${marker.turn} - ${marker.playerName}`;
      container.appendChild(markerEl);
    }
  }

  /**
   * Export current replay data
   */
  exportReplay(): void {
    if (!this.replayData) {
      console.error('No replay data available for export');
      return;
    }

    const json = exportReplayData(this.replayData);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `fmp-replay-${this.replayData.gameId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Convert player color name to hex
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
   * Show the replay controls
   */
  show(): void {
    this.container.style.display = 'flex';
  }

  /**
   * Hide the replay controls
   */
  hide(): void {
    this.container.style.display = 'none';
  }

  /**
   * Add event listener
   */
  on<K extends keyof ReplayControlsEvents>(
    event: K,
    callback: (...args: Parameters<ReplayControlsEvents[K]>) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Emit event
   */
  private emit<K extends keyof ReplayControlsEvents>(
    event: K,
    ...args: Parameters<ReplayControlsEvents[K]>
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          (callback as (...args: unknown[]) => void)(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyboard.bind(this));
    this.container.remove();
    this.listeners.clear();
  }
}
