/**
 * Replay Manager - Controls game replay playback
 *
 * Manages the replay state machine:
 * - Play/pause controls
 * - Variable speed playback
 * - Step forward/backward
 * - Turn navigation
 * - State reconstruction from action sequence
 */

import type { GameState, GameAction } from '@/shared/game/types';
import type {
  ReplayData,
  ReplayAction,
  ReplayPlaybackState,
  ReplaySpeed,
  TurnMarker,
} from '@/shared/game/replay';
import {
  REPLAY_SPEEDS,
  DEFAULT_ACTION_INTERVAL,
  getTurnMarkerForSeq,
  getSeqForTurnStart,
} from '@/shared/game/replay';
import {
  applyMoveAction,
  applyLoadAction,
  applyUnloadAction,
  applyFireAction,
  applyCaptureAction,
  applyBuildAction,
  applyEndTurnAction,
  applyLandAstronefAction,
  applyDeployUnitAction,
  applyCaptureAstronefAction,
  applyRebuildTowerAction,
  executeLiftOff,
} from '@/shared/game/state';

/**
 * Events emitted by the ReplayManager
 */
export interface ReplayManagerEvents {
  /** Playback state changed (play/pause/speed) */
  playbackStateChange: (state: ReplayPlaybackState) => void;
  /** Game state updated (after action applied) */
  stateUpdate: (state: GameState) => void;
  /** Action applied during playback */
  actionApplied: (action: ReplayAction) => void;
  /** Turn changed during playback */
  turnChange: (turn: number, playerId: string, marker: TurnMarker) => void;
  /** Playback reached the end */
  replayComplete: () => void;
  /** Error occurred */
  error: (error: Error) => void;
}

export class ReplayManager {
  private replayData: ReplayData;
  private playbackState: ReplayPlaybackState;
  private listeners: Map<keyof ReplayManagerEvents, Set<Function>> = new Map();
  private playbackTimer: number | null = null;
  private stateCache: Map<number, GameState> = new Map();
  private readonly cacheInterval = 10; // Cache state every N actions

  constructor(replayData: ReplayData) {
    this.replayData = replayData;

    // Initialize playback state at the beginning
    this.playbackState = {
      isPlaying: false,
      speed: 1,
      currentSeq: 0,
      totalActions: replayData.actions.length,
      currentTurn: 1,
      totalTurns: this.calculateTotalTurns(),
      currentPlayerId: replayData.players[0]?.id || '',
      gameState: JSON.parse(JSON.stringify(replayData.initialState)),
    };

    // Pre-cache initial state
    this.stateCache.set(0, JSON.parse(JSON.stringify(replayData.initialState)));
  }

  /**
   * Calculate total turns in the replay
   */
  private calculateTotalTurns(): number {
    if (this.replayData.turnMarkers.length === 0) {
      return this.replayData.actions.length > 0
        ? this.replayData.actions[this.replayData.actions.length - 1].turn
        : 1;
    }
    return Math.max(...this.replayData.turnMarkers.map(m => m.turn));
  }

  /**
   * Get current playback state
   */
  getPlaybackState(): ReplayPlaybackState {
    return { ...this.playbackState };
  }

  /**
   * Get replay data
   */
  getReplayData(): ReplayData {
    return this.replayData;
  }

  /**
   * Start or resume playback
   */
  play(): void {
    if (this.playbackState.isPlaying) return;
    if (this.playbackState.currentSeq >= this.playbackState.totalActions) {
      // At the end, restart from beginning
      this.seekToSeq(0);
    }

    this.playbackState.isPlaying = true;
    this.emitPlaybackStateChange();
    this.scheduleNextAction();
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.playbackState.isPlaying) return;

    this.playbackState.isPlaying = false;
    if (this.playbackTimer !== null) {
      window.clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.emitPlaybackStateChange();
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void {
    if (this.playbackState.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: ReplaySpeed): void {
    if (!REPLAY_SPEEDS.includes(speed)) return;

    this.playbackState.speed = speed;
    this.emitPlaybackStateChange();

    // Reschedule if currently playing
    if (this.playbackState.isPlaying && this.playbackTimer !== null) {
      window.clearTimeout(this.playbackTimer);
      this.scheduleNextAction();
    }
  }

  /**
   * Step forward one action
   */
  stepForward(): void {
    this.pause();
    if (this.playbackState.currentSeq < this.playbackState.totalActions) {
      this.applyNextAction();
    }
  }

  /**
   * Step backward one action
   */
  stepBackward(): void {
    this.pause();
    if (this.playbackState.currentSeq > 0) {
      this.seekToSeq(this.playbackState.currentSeq - 1);
    }
  }

  /**
   * Jump to start of previous turn
   */
  previousTurn(): void {
    this.pause();
    const currentMarker = getTurnMarkerForSeq(
      this.replayData.turnMarkers,
      this.playbackState.currentSeq
    );

    if (!currentMarker) {
      this.seekToSeq(0);
      return;
    }

    // Find the previous turn marker
    const currentIndex = this.replayData.turnMarkers.indexOf(currentMarker);
    if (currentIndex > 0) {
      const prevMarker = this.replayData.turnMarkers[currentIndex - 1];
      this.seekToSeq(prevMarker.startSeq);
    } else if (this.playbackState.currentSeq > currentMarker.startSeq) {
      // Go to start of current turn if we're in the middle of it
      this.seekToSeq(currentMarker.startSeq);
    } else {
      // Already at start of first turn, go to initial state
      this.seekToSeq(0);
    }
  }

  /**
   * Jump to start of next turn
   */
  nextTurn(): void {
    this.pause();
    const currentMarker = getTurnMarkerForSeq(
      this.replayData.turnMarkers,
      this.playbackState.currentSeq
    );

    if (!currentMarker) {
      // No markers, try to find next action with different turn
      const currentAction = this.replayData.actions[this.playbackState.currentSeq];
      if (currentAction) {
        const nextAction = this.replayData.actions.find(
          a => a.seq > currentAction.seq && a.turn > currentAction.turn
        );
        if (nextAction) {
          this.seekToSeq(nextAction.seq);
        }
      }
      return;
    }

    // Find the next turn marker
    const currentIndex = this.replayData.turnMarkers.indexOf(currentMarker);
    if (currentIndex < this.replayData.turnMarkers.length - 1) {
      const nextMarker = this.replayData.turnMarkers[currentIndex + 1];
      this.seekToSeq(nextMarker.startSeq);
    } else {
      // Already at last turn, go to end
      this.seekToSeq(this.playbackState.totalActions);
    }
  }

  /**
   * Seek to a specific action sequence number
   */
  seekToSeq(targetSeq: number): void {
    const wasPlaying = this.playbackState.isPlaying;
    if (wasPlaying) this.pause();

    targetSeq = Math.max(0, Math.min(targetSeq, this.playbackState.totalActions));

    // Find nearest cached state
    let nearestCacheSeq = 0;
    for (const [seq] of this.stateCache) {
      if (seq <= targetSeq && seq > nearestCacheSeq) {
        nearestCacheSeq = seq;
      }
    }

    // Restore from cache or initial state
    let state: GameState;
    if (nearestCacheSeq > 0) {
      state = JSON.parse(JSON.stringify(this.stateCache.get(nearestCacheSeq)));
    } else {
      state = JSON.parse(JSON.stringify(this.replayData.initialState));
    }

    // Apply actions from cache point to target
    for (let i = nearestCacheSeq; i < targetSeq; i++) {
      const action = this.replayData.actions[i];
      if (action) {
        state = this.applyAction(state, action);

        // Cache intermediate states
        if ((i + 1) % this.cacheInterval === 0) {
          this.stateCache.set(i + 1, JSON.parse(JSON.stringify(state)));
        }
      }
    }

    // Update playback state
    this.playbackState.currentSeq = targetSeq;
    this.playbackState.gameState = state;

    // Update turn info
    const marker = getTurnMarkerForSeq(this.replayData.turnMarkers, targetSeq);
    if (marker) {
      this.playbackState.currentTurn = marker.turn;
      this.playbackState.currentPlayerId = marker.playerId;
      this.emit('turnChange', marker.turn, marker.playerId, marker);
    } else if (targetSeq === 0) {
      this.playbackState.currentTurn = 1;
      this.playbackState.currentPlayerId = this.replayData.players[0]?.id || '';
    }

    this.emit('stateUpdate', state);
    this.emitPlaybackStateChange();

    // Resume if was playing
    if (wasPlaying) this.play();
  }

  /**
   * Seek to a specific percentage (0-100)
   */
  seekToPercent(percent: number): void {
    percent = Math.max(0, Math.min(100, percent));
    const targetSeq = Math.round((percent / 100) * this.playbackState.totalActions);
    this.seekToSeq(targetSeq);
  }

  /**
   * Jump to a specific turn
   */
  goToTurn(turn: number, playerId?: string): void {
    const seq = getSeqForTurnStart(this.replayData.turnMarkers, turn, playerId);
    this.seekToSeq(seq);
  }

  /**
   * Jump to end of replay
   */
  goToEnd(): void {
    this.pause();
    this.seekToSeq(this.playbackState.totalActions);
  }

  /**
   * Jump to start of replay
   */
  goToStart(): void {
    this.pause();
    this.seekToSeq(0);
  }

  /**
   * Schedule the next action for playback
   */
  private scheduleNextAction(): void {
    if (!this.playbackState.isPlaying) return;

    const interval = DEFAULT_ACTION_INTERVAL / this.playbackState.speed;

    this.playbackTimer = window.setTimeout(() => {
      this.applyNextAction();
      if (this.playbackState.isPlaying) {
        this.scheduleNextAction();
      }
    }, interval);
  }

  /**
   * Apply the next action in sequence
   */
  private applyNextAction(): void {
    if (this.playbackState.currentSeq >= this.playbackState.totalActions) {
      // Reached the end
      this.pause();
      this.emit('replayComplete');
      return;
    }

    const action = this.replayData.actions[this.playbackState.currentSeq];
    if (!action) {
      this.playbackState.currentSeq++;
      return;
    }

    // Check for turn change
    const prevMarker = getTurnMarkerForSeq(
      this.replayData.turnMarkers,
      this.playbackState.currentSeq - 1
    );
    const newMarker = getTurnMarkerForSeq(
      this.replayData.turnMarkers,
      this.playbackState.currentSeq
    );

    if (newMarker && (!prevMarker || newMarker !== prevMarker)) {
      this.playbackState.currentTurn = newMarker.turn;
      this.playbackState.currentPlayerId = newMarker.playerId;
      this.emit('turnChange', newMarker.turn, newMarker.playerId, newMarker);
    }

    // Apply the action
    if (this.playbackState.gameState) {
      const newState = this.applyAction(this.playbackState.gameState, action);
      this.playbackState.gameState = newState;
      this.emit('stateUpdate', newState);
    }

    this.playbackState.currentSeq++;

    // Cache state periodically
    if (this.playbackState.currentSeq % this.cacheInterval === 0 && this.playbackState.gameState) {
      this.stateCache.set(
        this.playbackState.currentSeq,
        JSON.parse(JSON.stringify(this.playbackState.gameState))
      );
    }

    this.emit('actionApplied', action);
    this.emitPlaybackStateChange();
  }

  /**
   * Apply a single action to a game state
   */
  private applyAction(state: GameState, action: ReplayAction): GameState {
    try {
      const actionData = action.data;

      switch (actionData.type) {
        case 'MOVE':
          return applyMoveAction(state, actionData as any);
        case 'LOAD':
          return applyLoadAction(state, actionData as any);
        case 'UNLOAD':
          return applyUnloadAction(state, actionData as any);
        case 'FIRE':
          return applyFireAction(state, actionData as any);
        case 'CAPTURE':
          return applyCaptureAction(state, actionData as any);
        case 'CAPTURE_ASTRONEF':
          return applyCaptureAstronefAction(state, actionData as any);
        case 'BUILD':
          return applyBuildAction(state, actionData as any);
        case 'LAND_ASTRONEF':
          return applyLandAstronefAction(state, actionData as any);
        case 'DEPLOY_UNIT':
          return applyDeployUnitAction(state, actionData as any);
        case 'REBUILD_TOWER':
          return applyRebuildTowerAction(state, actionData as any);
        case 'LIFT_OFF': {
          const liftOffAction = actionData as GameAction & { playerId: string };
          return executeLiftOff(state, liftOffAction.playerId);
        }
        case 'END_TURN':
          return applyEndTurnAction(state, actionData as any);
        default:
          console.warn(`Unknown action type for replay: ${actionData.type}`);
          return state;
      }
    } catch (error) {
      console.error(`Error applying action ${action.seq}:`, error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return state;
    }
  }

  /**
   * Emit playback state change event
   */
  private emitPlaybackStateChange(): void {
    this.emit('playbackStateChange', this.getPlaybackState());
  }

  /**
   * Add event listener
   */
  on<K extends keyof ReplayManagerEvents>(event: K, callback: ReplayManagerEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof ReplayManagerEvents>(event: K, callback: ReplayManagerEvents[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Emit event
   */
  private emit<K extends keyof ReplayManagerEvents>(
    event: K,
    ...args: Parameters<ReplayManagerEvents[K]>
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
    this.pause();
    this.listeners.clear();
    this.stateCache.clear();
  }
}
