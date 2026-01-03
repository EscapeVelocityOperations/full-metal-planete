/**
 * WebSocket spectator client for Full Metal Planète
 * Spectators can only receive game updates, not send actions
 */

import type { GameState } from '@/shared/game/types';

export interface WSMessage {
  type: string;
  payload: any;
  timestamp: number;
  playerId?: string;
}

export interface Spectator {
  id: string;
  name: string;
  isConnected: boolean;
  joinedAt: Date;
}

export interface SpectatorClientEvents {
  connected: () => void;
  disconnected: () => void;
  spectatorSync: (data: { gameState: GameState; players: any[]; spectators: Spectator[]; roomState: string }) => void;
  playerJoined: (player: any) => void;
  playerLeft: (playerId: string) => void;
  playerReconnected: (data: { playerId: string; player: any }) => void;
  playerDisconnected: (playerId: string) => void;
  playerReady: (playerId: string) => void;
  gameStart: (gameState: GameState) => void;
  action: (action: any) => void;
  turnEnd: (data: { playerId: string; savedAP: number }) => void;
  gameEnd: (scores: Record<string, number>) => void;
  stateUpdate: (gameState: Partial<GameState>) => void;
  spectatorJoined: (spectator: Spectator) => void;
  spectatorLeft: (spectatorId: string) => void;
  error: (error: { code: string; message: string }) => void;
}

export class SpectatorClient {
  private ws: WebSocket | null = null;
  private listeners: Map<keyof SpectatorClientEvents, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: number | null = null;

  constructor(
    private gameId: string,
    private spectatorId: string,
    private token: string
  ) {}

  /**
   * Connect to the game server as a spectator
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Spectator WebSocket connected');
        this.reconnectAttempts = 0;
        this.startPingInterval();
        this.emit('connected');
        resolve();
      };

      this.ws.onclose = () => {
        console.log('Spectator WebSocket disconnected');
        this.stopPingInterval();
        this.emit('disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('Spectator WebSocket error:', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Get WebSocket URL for connection
   */
  private getWebSocketUrl(): string {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      return `ws://localhost:3000/api/games/${this.gameId}/connect?token=${this.token}`;
    }
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
        case 'SPECTATOR_SYNC':
          this.emit('spectatorSync', message.payload);
          break;

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

        case 'SPECTATOR_JOINED':
          this.emit('spectatorJoined', message.payload.spectator);
          break;

        case 'SPECTATOR_LEFT':
          this.emit('spectatorLeft', message.payload.spectatorId);
          break;

        case 'ERROR':
          this.emit('error', message.payload);
          break;

        case 'PING':
          this.sendPong();
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Send pong response (only message spectators can send)
   */
  private sendPong(): void {
    this.send({
      type: 'PONG',
      payload: {},
      timestamp: Date.now(),
    });
  }

  /**
   * Request full state sync from server
   */
  requestStateSync(): void {
    this.send({
      type: 'SYNC_REQUEST',
      payload: {},
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
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnect failed:', error);
      });
    }, delay);
  }

  /**
   * Add event listener
   */
  on<K extends keyof SpectatorClientEvents>(
    event: K,
    callback: SpectatorClientEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof SpectatorClientEvents>(
    event: K,
    callback: SpectatorClientEvents[K]
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Emit event
   */
  private emit<K extends keyof SpectatorClientEvents>(
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
   * Disconnect from server
   */
  disconnect(): void {
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
   * Get spectator ID
   */
  getSpectatorId(): string {
    return this.spectatorId;
  }
}
