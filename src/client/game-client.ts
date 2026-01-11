/**
 * WebSocket game client for Full Metal Planète
 */

import type { GameState, GameAction, TideLevel, PlayerId } from '@/shared/game/types';

export interface WSMessage {
  type: string;
  payload: any;
  timestamp: number;
  playerId?: string;
}

export interface LiftOffDecisionAck {
  decision: boolean;
  pendingPlayers: number;
}

export interface LiftOffDecisionsRevealed {
  decisions: Record<string, { decision: boolean; liftedOff: boolean; playerName: string }>;
  gameState: GameState;
}

export interface GameClientEvents {
  connected: () => void;
  disconnected: () => void;
  reconnected: (data: { gameState: GameState; players: any[]; roomState: string }) => void;
  playerJoined: (player: any) => void;
  playerLeft: (playerId: string) => void;
  playerReconnected: (data: { playerId: string; player: any }) => void;
  playerDisconnected: (playerId: string) => void;
  playerReady: (playerId: string) => void;
  gameStart: (gameState: GameState) => void;
  action: (action: GameAction) => void;
  turnEnd: (data: { playerId: string; savedAP: number }) => void;
  gameEnd: (scores: Record<string, number>) => void;
  error: (error: { code: string; message: string }) => void;
  stateUpdate: (gameState: Partial<GameState>) => void;
  liftOffDecisionAck: (data: LiftOffDecisionAck) => void;
  liftOffDecisionsRevealed: (data: LiftOffDecisionsRevealed) => void;
}

export class GameClient {
  private ws: WebSocket | null = null;
  private listeners: Map<keyof GameClientEvents, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private isReconnecting = false;
  private intentionallyDisconnected = false;
  private pingInterval: number | null = null;

  constructor(
    private gameId: string,
    private playerId: string,
    private token: string
  ) {}

  /**
   * Connect to the game server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        // Reset reconnection state on successful connection
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.intentionallyDisconnected = false;
        this.startPingInterval();
        this.emit('connected');
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        this.stopPingInterval();

        // Only attempt reconnect if this wasn't an intentional disconnect
        if (!this.intentionallyDisconnected) {
          this.emit('disconnected');
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Get WebSocket URL for connection
   * In development, connect directly to backend server to avoid Vite proxy WebSocket issues
   */
  private getWebSocketUrl(): string {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      // Connect directly to backend in development
      return `ws://localhost:3000/api/games/${this.gameId}/connect?token=${this.token}`;
    }
    // In production, use same host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/games/${this.gameId}/connect?token=${this.token}`;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);

      switch (message.type) {
        case 'PLAYER_JOINED':
          this.emit('playerJoined', message.payload.player);
          break;

        case 'PLAYER_LEFT':
          this.emit('playerLeft', message.payload.playerId);
          break;

        case 'PLAYER_RECONNECTED':
          this.emit('playerReconnected', message.payload);
          break;

        case 'PLAYER_DISCONNECTED':
          this.emit('playerDisconnected', message.payload.playerId);
          break;

        case 'RECONNECT':
          // We've reconnected - receive full game state
          this.emit('reconnected', message.payload);
          break;

        case 'PLAYER_READY':
          this.emit('playerReady', message.payload.playerId);
          break;

        case 'GAME_START':
          this.emit('gameStart', message.payload.gameState);
          break;

        case 'ACTION':
          this.emit('action', message.payload);
          break;

        case 'STATE_UPDATE':
          this.emit('stateUpdate', message.payload.gameState);
          break;

        case 'TURN_END':
          this.emit('turnEnd', message.payload);
          break;

        case 'GAME_END':
          this.emit('gameEnd', message.payload.scores);
          break;

        case 'ERROR':
          this.emit('error', message.payload);
          break;

        case 'PING':
          this.sendPong();
          break;

        case 'LIFTOFF_DECISION_ACK':
          this.emit('liftOffDecisionAck', message.payload);
          break;

        case 'LIFTOFF_DECISIONS_REVEALED':
          this.emit('liftOffDecisionsRevealed', message.payload);
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Send action to server
   */
  sendAction(action: GameAction): void {
    this.send({
      type: 'ACTION',
      payload: action,
      timestamp: Date.now(),
    });
  }

  /**
   * Send end turn message
   */
  endTurn(savedAP: number = 0): void {
    this.send({
      type: 'END_TURN',
      payload: { savedAP },
      timestamp: Date.now(),
    });
  }

  /**
   * Send ready message
   */
  sendReady(): void {
    this.send({
      type: 'READY',
      payload: {},
      timestamp: Date.now(),
    });
  }

  /**
   * Send pong response
   */
  private sendPong(): void {
    this.send({
      type: 'PONG',
      payload: {},
      timestamp: Date.now(),
    });
  }

  /**
   * Request full state sync from server (useful after reconnection)
   */
  requestStateSync(): void {
    this.send({
      type: 'SYNC_REQUEST',
      payload: {},
      timestamp: Date.now(),
    });
  }

  /**
   * Send lift-off decision (Turn 21 secret decision)
   * @param decision true = lift off now, false = stay until turn 25
   */
  sendLiftOffDecision(decision: boolean): void {
    this.send({
      type: 'LIFTOFF_DECISION',
      payload: { decision },
      timestamp: Date.now(),
    });
  }

  /**
   * Send message to server
   */
  private send(message: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  /**
   * Start ping interval
   */
  private startPingInterval(): void {
    this.pingInterval = window.setInterval(() => {
      this.sendPong();
    }, 25000);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff and jitter
   */
  private attemptReconnect(): void {
    if (this.isReconnecting) {
      // Already attempting to reconnect
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.emit('error', { code: 'RECONNECT_FAILED', message: 'Unable to reconnect to server' });
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // Exponential backoff with jitter: delay = base_delay * 2^(attempt-1) + random_jitter
    const exponentialDelay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1 second of random jitter
    const delay = exponentialDelay + jitter;

    console.log(`Reconnecting in ${Math.round(delay)}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnect failed:', error);
        this.isReconnecting = false;
        // If connect fails, attemptReconnect will be called again by onclose
      });
    }, delay);
  }

  /**
   * Add event listener
   */
  on<K extends keyof GameClientEvents>(
    event: K,
    callback: GameClientEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof GameClientEvents>(
    event: K,
    callback: GameClientEvents[K]
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Emit event
   */
  private emit<K extends keyof GameClientEvents>(
    event: K,
    ...args: any[]
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Disconnect from server (intentional - won't trigger reconnection)
   */
  disconnect(): void {
    this.intentionallyDisconnected = true;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Check if currently reconnecting
   */
  isReconnectingState(): boolean {
    return this.isReconnecting;
  }

  /**
   * Get current reconnection attempt count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}
