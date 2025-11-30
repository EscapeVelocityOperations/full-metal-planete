import type { GameRoom, Player, RoomState, GameState } from './types.js';

export class Room {
  public id: string;
  public state: RoomState;
  public hostId: string;
  public players: Player[];
  public createdAt: Date;
  public gameState?: GameState;

  constructor(id: string, hostPlayer: Player) {
    this.id = id;
    this.state = 'waiting';
    this.hostId = hostPlayer.id;
    this.players = [hostPlayer];
    this.createdAt = new Date();
  }

  /**
   * Add a player to the room
   */
  addPlayer(player: Player): void {
    if (this.players.length >= 4) {
      throw new Error('Room is full');
    }

    if (this.players.some(p => p.id === player.id)) {
      throw new Error('Player already in room');
    }

    this.players.push(player);
  }

  /**
   * Remove a player from the room
   */
  removePlayer(playerId: string): void {
    if (playerId === this.hostId) {
      throw new Error('Cannot remove host');
    }

    this.players = this.players.filter(p => p.id !== playerId);
  }

  /**
   * Get a player by ID
   */
  getPlayer(playerId: string): Player | undefined {
    return this.players.find(p => p.id === playerId);
  }

  /**
   * Set player ready status
   */
  setPlayerReady(playerId: string, ready: boolean): void {
    const player = this.getPlayer(playerId);
    if (player) {
      player.isReady = ready;
    }
  }

  /**
   * Set player connection status
   */
  setPlayerConnected(playerId: string, connected: boolean): void {
    const player = this.getPlayer(playerId);
    if (player) {
      player.isConnected = connected;
    }
  }

  /**
   * Update player last seen timestamp
   */
  updatePlayerLastSeen(playerId: string, timestamp: Date): void {
    const player = this.getPlayer(playerId);
    if (player) {
      player.lastSeen = timestamp;
    }
  }

  /**
   * Check if room is ready to start
   * Requires at least 2 players, all players ready
   */
  checkReadyState(): void {
    if (this.state !== 'waiting') {
      return;
    }

    const hasMinPlayers = this.players.length >= 2;
    const allReady = this.players.every(p => p.isReady);

    if (hasMinPlayers && allReady) {
      this.state = 'ready';
    }
  }

  /**
   * Start the game
   */
  startGame(gameState: GameState): void {
    if (this.state !== 'ready') {
      throw new Error('Room is not ready');
    }

    this.state = 'playing';
    this.gameState = gameState;
  }

  /**
   * End the game
   */
  endGame(scores: Record<string, number>): void {
    this.state = 'finished';
    if (this.gameState) {
      this.gameState.scores = scores;
    }
  }

  /**
   * Update game state
   */
  updateGameState(gameState: GameState): void {
    if (this.state !== 'playing') {
      throw new Error('Game is not in progress');
    }

    this.gameState = gameState;
  }

  /**
   * Convert room to JSON (for API responses)
   */
  toJSON(): GameRoom {
    return {
      id: this.id,
      state: this.state,
      hostId: this.hostId,
      players: this.players,
      createdAt: this.createdAt,
      gameState: this.gameState,
    };
  }
}
