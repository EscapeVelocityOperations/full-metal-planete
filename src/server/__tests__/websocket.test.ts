import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketHandler } from '../websocket.js';
import { Room } from '../room.js';
import type { Player } from '../types.js';

// Mock WebSocket
class MockWebSocket {
  public readyState = 1; // OPEN
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = 3; // CLOSED
    this.trigger('close');
  }

  trigger(event: string, data?: any) {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach(listener => listener(data));
  }
}

describe('WebSocketHandler', () => {
  let wsHandler: WebSocketHandler;
  let room: Room;
  let hostPlayer: Player;

  beforeEach(() => {
    wsHandler = new WebSocketHandler();
    hostPlayer = {
      id: 'p1-xyz',
      name: 'Alice',
      color: 'red',
      isReady: false,
      isConnected: false,
      lastSeen: new Date(),
    };
    room = new Room('abc123', hostPlayer);
  });

  afterEach(() => {
    wsHandler.stopPingInterval();
  });

  describe('Connection Handling', () => {
    it('should handle new connection', () => {
      const ws = new MockWebSocket() as any;
      wsHandler.handleConnection(ws, room, 'p1-xyz');

      expect(wsHandler.getConnectionCount('abc123')).toBe(1);
      expect(room.getPlayer('p1-xyz')?.isConnected).toBe(true);
    });

    it('should handle multiple connections', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      expect(wsHandler.getConnectionCount('abc123')).toBe(2);
    });

    it('should handle disconnect', () => {
      const ws = new MockWebSocket() as any;
      wsHandler.handleConnection(ws, room, 'p1-xyz');
      expect(wsHandler.getConnectionCount('abc123')).toBe(1);

      ws.close();

      expect(wsHandler.getConnectionCount('abc123')).toBe(0);
      expect(room.getPlayer('p1-xyz')?.isConnected).toBe(false);
    });
  });

  describe('Message Handling', () => {
    it('should handle READY message', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      const spy = vi.spyOn(ws2, 'send');

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      ws1.trigger('message', Buffer.from(JSON.stringify({ type: 'READY' })));

      expect(room.getPlayer('p1-xyz')?.isReady).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('should handle ACTION message', async () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      const spy = vi.spyOn(ws2, 'send');

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      const action = {
        type: 'MOVE',
        unitId: 'tank-1',
        params: { to: { q: 5, r: 3 } },
        playerId: 'p1-xyz',
        timestamp: Date.now(),
      };

      ws1.trigger('message', Buffer.from(JSON.stringify({
        type: 'ACTION',
        payload: action,
      })));

      // Wait for async message handler to complete
      await new Promise(resolve => setImmediate(resolve));

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('ACTION'));
    });

    it('should handle END_TURN message', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      const spy = vi.spyOn(ws2, 'send');

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      ws1.trigger('message', Buffer.from(JSON.stringify({
        type: 'END_TURN',
        payload: { savedAP: 5 },
      })));

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('TURN_END'));
    });

    it('should handle PONG message', () => {
      const ws = new MockWebSocket() as any;
      wsHandler.handleConnection(ws, room, 'p1-xyz');

      const beforeLastSeen = room.getPlayer('p1-xyz')!.lastSeen.getTime();

      ws.trigger('message', Buffer.from(JSON.stringify({ type: 'PONG' })));

      const afterLastSeen = room.getPlayer('p1-xyz')!.lastSeen.getTime();
      expect(afterLastSeen).toBeGreaterThanOrEqual(beforeLastSeen);
    });

    it('should handle invalid message', () => {
      const ws = new MockWebSocket() as any;
      const spy = vi.spyOn(ws, 'send');

      wsHandler.handleConnection(ws, room, 'p1-xyz');

      ws.trigger('message', Buffer.from('invalid json'));

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast to all players', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      const spy1 = vi.spyOn(ws1, 'send');
      const spy2 = vi.spyOn(ws2, 'send');

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      wsHandler.broadcast('abc123', {
        type: 'GAME_START',
        payload: {},
        timestamp: Date.now(),
      });

      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
    });

    it('should exclude specified players from broadcast', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      const spy1 = vi.spyOn(ws1, 'send');
      const spy2 = vi.spyOn(ws2, 'send');

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      // Clear previous calls from connection
      spy1.mockClear();
      spy2.mockClear();

      wsHandler.broadcast('abc123', {
        type: 'GAME_START',
        payload: {},
        timestamp: Date.now(),
      }, ['p1-xyz']);

      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
    });
  });

  describe('Direct Messaging', () => {
    it('should send message to specific player', () => {
      const ws = new MockWebSocket() as any;
      const spy = vi.spyOn(ws, 'send');

      wsHandler.handleConnection(ws, room, 'p1-xyz');

      wsHandler.sendToPlayer('abc123', 'p1-xyz', {
        type: 'GAME_START',
        payload: {},
        timestamp: Date.now(),
      });

      expect(spy).toHaveBeenCalled();
    });

    it('should send error to player', () => {
      const ws = new MockWebSocket() as any;
      const spy = vi.spyOn(ws, 'send');

      wsHandler.handleConnection(ws, room, 'p1-xyz');

      wsHandler.sendError('abc123', 'p1-xyz', 'INVALID_ACTION', 'Action is invalid');

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('INVALID_ACTION'));
    });
  });

  describe('Room Management', () => {
    it('should close all connections in room', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      const spy1 = vi.spyOn(ws1, 'close');
      const spy2 = vi.spyOn(ws2, 'close');

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      wsHandler.closeRoom('abc123');

      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
      expect(wsHandler.getConnectionCount('abc123')).toBe(0);
    });

    it('should get connection count', () => {
      const ws = new MockWebSocket() as any;
      wsHandler.handleConnection(ws, room, 'p1-xyz');

      expect(wsHandler.getConnectionCount('abc123')).toBe(1);
      expect(wsHandler.getConnectionCount('nonexistent')).toBe(0);
    });
  });

  describe('Ping Interval', () => {
    it('should not crash when stopped', () => {
      expect(() => {
        wsHandler.stopPingInterval();
      }).not.toThrow();
    });
  });

  describe('Reconnection Handling', () => {
    it('should send RECONNECT message when player reconnects to active game', () => {
      // Setup: create 2 players, start game, disconnect one
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);
      room.setPlayerReady('p1-xyz', true);
      room.setPlayerReady('p2-abc', true);
      room.checkReadyState();

      // Manually set room state to playing (simulating game start)
      room.state = 'playing';
      room.gameState = { currentPlayer: 'p1-xyz', turn: 1 } as any;

      // Connect player 1
      const ws1 = new MockWebSocket() as any;
      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      expect(room.getPlayer('p1-xyz')?.isConnected).toBe(true);

      // Disconnect player 1
      ws1.close();
      expect(room.getPlayer('p1-xyz')?.isConnected).toBe(false);

      // Reconnect player 1
      const ws1New = new MockWebSocket() as any;
      const spy = vi.spyOn(ws1New, 'send');

      wsHandler.handleConnection(ws1New, room, 'p1-xyz');

      // Should receive RECONNECT message
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('RECONNECT'));
      expect(room.getPlayer('p1-xyz')?.isConnected).toBe(true);
    });

    it('should broadcast PLAYER_RECONNECTED to other players', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };

      room.addPlayer(player2);

      // Manually set room state to playing
      room.state = 'playing';
      room.gameState = { currentPlayer: 'p1-xyz', turn: 1 } as any;

      // Connect both players
      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      // Disconnect player 1
      ws1.close();

      // Reconnect player 1
      const ws1New = new MockWebSocket() as any;
      const spy2 = vi.spyOn(ws2, 'send');
      spy2.mockClear();

      wsHandler.handleConnection(ws1New, room, 'p1-xyz');

      // Player 2 should receive PLAYER_RECONNECTED
      expect(spy2).toHaveBeenCalledWith(expect.stringContaining('PLAYER_RECONNECTED'));
    });

    it('should replace stale connection on reconnect', () => {
      const ws1 = new MockWebSocket() as any;
      const closeSpy = vi.spyOn(ws1, 'close');

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      expect(wsHandler.getConnectionCount('abc123')).toBe(1);

      // Connect again with new socket (simulating reconnection without proper disconnect)
      const ws1New = new MockWebSocket() as any;
      wsHandler.handleConnection(ws1New, room, 'p1-xyz');

      // Old connection should be closed
      expect(closeSpy).toHaveBeenCalled();
      // Should still have 1 connection
      expect(wsHandler.getConnectionCount('abc123')).toBe(1);
    });

    it('should provide connection status helpers', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };
      room.addPlayer(player2);

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;

      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      // Check connected players list
      const connected = wsHandler.getConnectedPlayers('abc123');
      expect(connected).toContain('p1-xyz');
      expect(connected).toContain('p2-abc');
      expect(connected.length).toBe(2);

      // Check individual player connection status
      expect(wsHandler.isPlayerConnected('abc123', 'p1-xyz')).toBe(true);
      expect(wsHandler.isPlayerConnected('abc123', 'p2-abc')).toBe(true);
      expect(wsHandler.isPlayerConnected('abc123', 'p3-unknown')).toBe(false);
      expect(wsHandler.isPlayerConnected('nonexistent', 'p1-xyz')).toBe(false);
    });

    it('should include disconnect context in PLAYER_LEFT message', () => {
      const player2: Player = {
        id: 'p2-abc',
        name: 'Bob',
        color: 'blue',
        isReady: false,
        isConnected: false,
        lastSeen: new Date(),
      };
      room.addPlayer(player2);

      // Set up playing state
      room.state = 'playing';
      room.gameState = { currentPlayer: 'p1-xyz', turn: 1 } as any;

      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      wsHandler.handleConnection(ws1, room, 'p1-xyz');
      wsHandler.handleConnection(ws2, room, 'p2-abc');

      const spy2 = vi.spyOn(ws2, 'send');
      spy2.mockClear();

      // Disconnect player 1 (whose turn it is)
      ws1.close();

      // Player 2 should receive PLAYER_LEFT with context
      expect(spy2).toHaveBeenCalled();
      const sentData = spy2.mock.calls[0][0] as string;
      const message = JSON.parse(sentData);
      expect(message.type).toBe('PLAYER_LEFT');
      expect(message.payload.isActiveGame).toBe(true);
      expect(message.payload.isCurrentPlayersTurn).toBe(true);
      expect(message.payload.canReconnect).toBe(true);
    });
  });
});
