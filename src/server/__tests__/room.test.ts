import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../room.js';
import type { Player } from '../types.js';
import { GamePhase, TideLevel, PlayerColor, type Player as SharedPlayer, type GameState } from '../../shared/game/types.js';

describe('Room', () => {
  let room: Room;
  const hostPlayer: Player = {
    id: 'p1-xyz',
    name: 'Alice',
    color: 'red',
    isReady: false,
    isConnected: true,
    lastSeen: new Date(),
  };

  beforeEach(() => {
    room = new Room('abc123', hostPlayer);
  });

  describe('Room Creation', () => {
    it('should create room with host player', () => {
      expect(room.id).toBe('abc123');
      expect(room.state).toBe('waiting');
      expect(room.hostId).toBe('p1-xyz');
      expect(room.players).toHaveLength(1);
      expect(room.players[0].id).toBe('p1-xyz');
    });

    it('should set host as ready by default', () => {
      expect(room.players[0].isReady).toBe(false);
    });
  });

  describe('Player Management', () => {
    it('should add player to room', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      expect(room.players).toHaveLength(2);
      expect(room.players[1].id).toBe('p2-abc');
    });

    it('should not add more than 4 players', () => {
      const players = [
        { id: 'p2', name: 'Bob', color: 'blue' as const, isReady: false, isConnected: true, lastSeen: new Date() },
        { id: 'p3', name: 'Carol', color: 'green' as const, isReady: false, isConnected: true, lastSeen: new Date() },
        { id: 'p4', name: 'Dave', color: 'yellow' as const, isReady: false, isConnected: true, lastSeen: new Date() },
      ];

      players.forEach(p => room.addPlayer(p));
      expect(room.players).toHaveLength(4);

      expect(() => {
        room.addPlayer({
          id: 'p5',
          name: 'Eve',
          color: 'red',
          isReady: false,
          isConnected: true,
          lastSeen: new Date(),
        });
      }).toThrow('Room is full');
    });

    it('should not add player with duplicate ID', () => {
      expect(() => {
        room.addPlayer(hostPlayer);
      }).toThrow('Player already in room');
    });

    it('should remove player from room', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      room.removePlayer('p2-abc');
      expect(room.players).toHaveLength(1);
    });

    it('should not remove host player', () => {
      expect(() => {
        room.removePlayer('p1-xyz');
      }).toThrow('Cannot remove host');
    });

    it('should mark player as ready', () => {
      room.setPlayerReady('p1-xyz', true);
      expect(room.players[0].isReady).toBe(true);
    });

    it('should mark player as not ready', () => {
      room.setPlayerReady('p1-xyz', true);
      room.setPlayerReady('p1-xyz', false);
      expect(room.players[0].isReady).toBe(false);
    });

    it('should update player connection status', () => {
      room.setPlayerConnected('p1-xyz', false);
      expect(room.players[0].isConnected).toBe(false);
    });

    it('should update last seen timestamp', () => {
      const before = room.players[0].lastSeen;
      const newTime = new Date(Date.now() + 1000);
      room.updatePlayerLastSeen('p1-xyz', newTime);
      expect(room.players[0].lastSeen.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('Room State Machine', () => {
    it('should transition from waiting to ready when min players ready', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      expect(room.state).toBe('waiting');

      room.setPlayerReady('p1-xyz', true);
      room.setPlayerReady('p2-abc', true);

      room.checkReadyState();
      expect(room.state).toBe('ready');
    });

    it('should not be ready with only 1 player', () => {
      room.setPlayerReady('p1-xyz', true);
      room.checkReadyState();
      expect(room.state).toBe('waiting');
    });

    it('should not be ready if not all players ready', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      room.setPlayerReady('p1-xyz', true);
      room.checkReadyState();
      expect(room.state).toBe('waiting');
    });

    it('should transition to playing when game starts', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      room.setPlayerReady('p1-xyz', true);
      room.setPlayerReady('p2-abc', true);
      room.checkReadyState();

      const sharedPlayers: SharedPlayer[] = room.players.map(p => ({
        ...p,
        color: p.color as unknown as PlayerColor,
        astronefPosition: [],
        hasLiftedOff: false,
        capturedAstronefs: [],
      }));
      const gameState: GameState = {
        gameId: 'abc123',
        turn: 1,
        phase: GamePhase.Landing,
        currentPlayer: 'p1-xyz',
        turnOrder: ['p1-xyz', 'p2-abc'],
        turnStartTime: Date.now(),
        turnTimeLimit: 180000,
        actionPoints: 0,
        savedActionPoints: {},
        currentTide: TideLevel.Normal,
        tideDeck: [],
        tideDiscard: [],
        terrain: [],
        units: [],
        minerals: [],
        bridges: [],
        players: sharedPlayers,
        buildsThisTurn: [],
        liftOffDecisions: {},
      };

      room.startGame(gameState);
      expect(room.state).toBe('playing');
      expect(room.gameState).toBeDefined();
    });

    it('should not start game if not ready', () => {
      expect(() => {
        room.startGame({} as GameState);
      }).toThrow('Room is not ready');
    });

    it('should transition to finished when game ends', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      room.setPlayerReady('p1-xyz', true);
      room.setPlayerReady('p2-abc', true);
      room.checkReadyState();

      const sharedPlayers2: SharedPlayer[] = room.players.map(p => ({
        ...p,
        color: p.color as unknown as PlayerColor,
        astronefPosition: [],
        hasLiftedOff: false,
        capturedAstronefs: [],
      }));
      const gameState: GameState = {
        gameId: 'abc123',
        turn: 1,
        phase: GamePhase.Landing,
        currentPlayer: 'p1-xyz',
        turnOrder: ['p1-xyz', 'p2-abc'],
        turnStartTime: Date.now(),
        turnTimeLimit: 180000,
        actionPoints: 0,
        savedActionPoints: {},
        currentTide: TideLevel.Normal,
        tideDeck: [],
        tideDiscard: [],
        terrain: [],
        units: [],
        minerals: [],
        bridges: [],
        players: sharedPlayers2,
        buildsThisTurn: [],
        liftOffDecisions: {},
      };

      room.startGame(gameState);
      room.endGame({ 'p1-xyz': 10, 'p2-abc': 5 });
      expect(room.state).toBe('finished');
    });
  });

  describe('Game State Management', () => {
    it('should update game state', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      room.setPlayerReady('p1-xyz', true);
      room.setPlayerReady('p2-abc', true);
      room.checkReadyState();

      const sharedPlayers3: SharedPlayer[] = room.players.map(p => ({
        ...p,
        color: p.color as unknown as PlayerColor,
        astronefPosition: [],
        hasLiftedOff: false,
        capturedAstronefs: [],
      }));
      const gameState: GameState = {
        gameId: 'abc123',
        turn: 1,
        phase: GamePhase.Landing,
        currentPlayer: 'p1-xyz',
        turnOrder: ['p1-xyz', 'p2-abc'],
        turnStartTime: Date.now(),
        turnTimeLimit: 180000,
        actionPoints: 0,
        savedActionPoints: {},
        currentTide: TideLevel.Normal,
        tideDeck: [],
        tideDiscard: [],
        terrain: [],
        units: [],
        minerals: [],
        bridges: [],
        players: sharedPlayers3,
        buildsThisTurn: [],
        liftOffDecisions: {},
      };

      room.startGame(gameState);
      expect(room.gameState?.turn).toBe(1);

      room.updateGameState({ ...gameState, turn: 5 });
      expect(room.gameState?.turn).toBe(5);
    });

    it('should not update game state if not playing', () => {
      expect(() => {
        room.updateGameState({} as GameState);
      }).toThrow('Game is not in progress');
    });
  });

  describe('Room Info', () => {
    it('should return room info', () => {
      const info = room.toJSON();
      expect(info.id).toBe('abc123');
      expect(info.state).toBe('waiting');
      expect(info.hostId).toBe('p1-xyz');
      expect(info.players).toHaveLength(1);
    });

    it('should include game state when playing', () => {
      const player: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: true,
        lastSeen: new Date(),
      };

      room.addPlayer(player);
      room.setPlayerReady('p1-xyz', true);
      room.setPlayerReady('p2-abc', true);
      room.checkReadyState();

      const sharedPlayers4: SharedPlayer[] = room.players.map(p => ({
        ...p,
        color: p.color as unknown as PlayerColor,
        astronefPosition: [],
        hasLiftedOff: false,
        capturedAstronefs: [],
      }));
      const gameState: GameState = {
        gameId: 'abc123',
        turn: 1,
        phase: GamePhase.Landing,
        currentPlayer: 'p1-xyz',
        turnOrder: ['p1-xyz', 'p2-abc'],
        turnStartTime: Date.now(),
        turnTimeLimit: 180000,
        actionPoints: 0,
        savedActionPoints: {},
        currentTide: TideLevel.Normal,
        tideDeck: [],
        tideDiscard: [],
        terrain: [],
        units: [],
        minerals: [],
        bridges: [],
        players: sharedPlayers4,
        buildsThisTurn: [],
        liftOffDecisions: {},
      };

      room.startGame(gameState);

      const info = room.toJSON();
      expect(info.gameState).toBeDefined();
      expect(info.gameState?.turn).toBe(1);
    });
  });
});
