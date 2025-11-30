# Full Metal Planète - Backend API Documentation

## Overview

This document describes the backend API for the Full Metal Planète multiplayer game server. The backend provides REST endpoints for game management and WebSocket connections for real-time gameplay synchronization.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify 4.28+
- **WebSocket**: @fastify/websocket
- **State Management**: In-memory (with Redis support via RedisManager)
- **Testing**: Vitest with 82%+ coverage

## Base URL

```
Development: http://localhost:3000
Production: https://your-domain.com
```

## Authentication

Simple token-based authentication using base64-encoded tokens:
- Token format: `base64(gameId:playerId)`
- Passed as query parameter: `?token=<token>`

## REST API Endpoints

### Create Game

Create a new game room and join as host.

```http
POST /api/games
Content-Type: application/json

{
  "playerName": "Alice"
}
```

**Response (200 OK)**:
```json
{
  "gameId": "abc123",
  "playerId": "p1-xyz789",
  "playerToken": "YWJjMTIzOnAxLXh5ejc4OQ==",
  "joinUrl": "https://your-domain.com/game/abc123"
}
```

**Error Responses**:
- `400 Bad Request`: Player name is required or invalid

---

### Join Game

Join an existing game room as a player.

```http
POST /api/games/:id/join
Content-Type: application/json

{
  "playerName": "Bob"
}
```

**Response (200 OK)**:
```json
{
  "gameId": "abc123",
  "playerId": "p2-abc456",
  "playerToken": "YWJjMTIzOnAyLWFiYzQ1Ng==",
  "players": [
    {
      "id": "p1-xyz789",
      "name": "Alice",
      "color": "red",
      "isReady": false,
      "isConnected": true,
      "lastSeen": "2025-11-30T14:00:00.000Z"
    },
    {
      "id": "p2-abc456",
      "name": "Bob",
      "color": "blue",
      "isReady": false,
      "isConnected": true,
      "lastSeen": "2025-11-30T14:00:05.000Z"
    }
  ]
}
```

**Error Responses**:
- `404 Not Found`: Game not found
- `400 Bad Request`:
  - Player name is required
  - Room is full (max 4 players)
  - Game already in progress or finished

---

### Get Game Status

Retrieve current game status and state.

```http
GET /api/games/:id
```

**Response (200 OK)**:
```json
{
  "gameId": "abc123",
  "state": "waiting",
  "turn": 0,
  "currentPlayer": "p1-xyz789",
  "players": [
    {
      "id": "p1-xyz789",
      "name": "Alice",
      "color": "red",
      "isReady": true,
      "isConnected": true,
      "lastSeen": "2025-11-30T14:00:00.000Z"
    }
  ],
  "gameState": null
}
```

When game is in progress, `gameState` contains full game state:
```json
{
  "gameState": {
    "gameId": "abc123",
    "turn": 5,
    "phase": "playing",
    "currentPlayer": "p1-xyz789",
    "actionPoints": 12,
    "currentTide": "high",
    "...": "..."
  }
}
```

**Error Responses**:
- `404 Not Found`: Game not found

---

### Health Check

Check server health and status.

```http
GET /health
```

**Response (200 OK)**:
```json
{
  "status": "ok",
  "rooms": 3
}
```

---

## WebSocket Protocol

### Connection

Connect to game room via WebSocket:

```
ws://localhost:3000/api/games/:gameId/connect?token=<playerToken>
```

**Connection Parameters**:
- `:gameId`: Game room ID
- `token`: Player authentication token from create/join response

**Connection Lifecycle**:
1. Client sends connection request with token
2. Server validates token and game membership
3. Server sends `PLAYER_JOINED` to other players
4. Client receives initial game state updates
5. Client sends `READY` when prepared to start
6. Game begins when all players ready

---

### Message Format

All WebSocket messages use JSON with this structure:

```typescript
interface WSMessage {
  type: MessageType;
  payload: any;
  timestamp: number;
  playerId?: string;
  seq?: number;  // Optional sequence number
}
```

---

### Client → Server Messages

#### READY
Player indicates ready to start game.

```json
{
  "type": "READY"
}
```

#### ACTION
Player performs game action.

```json
{
  "type": "ACTION",
  "payload": {
    "type": "MOVE",
    "unitId": "tank-1",
    "params": { "to": { "q": 5, "r": 3 } },
    "playerId": "p1-xyz",
    "timestamp": 1701363200000
  }
}
```

Action types: `MOVE`, `LOAD`, `UNLOAD`, `FIRE`, `CAPTURE`, `BUILD`, `ENTER_ASTRONEF`, `EXIT_ASTRONEF`, `LIFT_OFF`

#### END_TURN
Player ends their turn.

```json
{
  "type": "END_TURN",
  "payload": {
    "savedAP": 5
  }
}
```

#### PONG
Response to server PING (keepalive).

```json
{
  "type": "PONG"
}
```

---

### Server → Client Messages

#### PLAYER_JOINED
New player joined the room.

```json
{
  "type": "PLAYER_JOINED",
  "payload": {
    "player": {
      "id": "p2-abc",
      "name": "Bob",
      "color": "blue",
      "isReady": false,
      "isConnected": true
    }
  },
  "timestamp": 1701363200000,
  "playerId": "p2-abc"
}
```

#### PLAYER_LEFT
Player disconnected from room.

```json
{
  "type": "PLAYER_LEFT",
  "payload": {
    "playerId": "p2-abc"
  },
  "timestamp": 1701363200000
}
```

#### PLAYER_READY
Player marked as ready.

```json
{
  "type": "PLAYER_READY",
  "payload": {
    "playerId": "p1-xyz"
  },
  "timestamp": 1701363200000
}
```

#### GAME_START
Game has started.

```json
{
  "type": "GAME_START",
  "payload": {
    "gameState": { /* full game state */ }
  },
  "timestamp": 1701363200000
}
```

#### ACTION
Game action from another player.

```json
{
  "type": "ACTION",
  "payload": {
    "type": "FIRE",
    "unitId": "tank-2",
    "params": { "target": { "q": 6, "r": 2 } }
  },
  "timestamp": 1701363200000,
  "playerId": "p2-abc"
}
```

#### TURN_END
Player ended their turn.

```json
{
  "type": "TURN_END",
  "payload": {
    "playerId": "p1-xyz",
    "savedAP": 3
  },
  "timestamp": 1701363200000
}
```

#### GAME_END
Game has finished.

```json
{
  "type": "GAME_END",
  "payload": {
    "scores": {
      "p1-xyz": 15,
      "p2-abc": 12
    }
  },
  "timestamp": 1701363200000
}
```

#### ERROR
Error occurred.

```json
{
  "type": "ERROR",
  "payload": {
    "code": "INVALID_ACTION",
    "message": "Unit cannot move there"
  },
  "timestamp": 1701363200000
}
```

#### PING
Server keepalive message (sent every 30 seconds).

```json
{
  "type": "PING",
  "timestamp": 1701363200000
}
```

---

## Room States

| State | Description | Allowed Transitions |
|-------|-------------|---------------------|
| `waiting` | Room created, waiting for 2-4 players | → `ready` |
| `ready` | All players connected and ready | → `playing` |
| `playing` | Game in progress | → `finished` |
| `finished` | Game complete | Terminal state |

---

## Player Colors

Players are automatically assigned unique colors in order:
1. Red (host)
2. Blue
3. Green
4. Yellow

---

## Error Codes

| Code | Description |
|------|-------------|
| `GAME_NOT_FOUND` | Game room doesn't exist |
| `ROOM_FULL` | Maximum 4 players reached |
| `INVALID_TOKEN` | Authentication token invalid |
| `INVALID_MESSAGE` | Message format error |
| `INVALID_ACTION` | Game action not allowed |
| `NOT_YOUR_TURN` | Action attempted out of turn |
| `GAME_NOT_STARTED` | Action before game start |

---

## Rate Limiting

| Endpoint/Operation | Limit |
|-------------------|-------|
| Create room | 10/min per IP |
| Join room | 20/min per IP |
| WebSocket messages | 100/min per player |

---

## Room Cleanup

Rooms are automatically cleaned up:
- After 24 hours of inactivity
- 1 hour after game finishes
- Cleanup runs every hour

---

## Example Flow

### 1. Create and Join Game

```javascript
// Player 1: Create game
const createResponse = await fetch('http://localhost:3000/api/games', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerName: 'Alice' })
});
const { gameId, playerId, playerToken } = await createResponse.json();

// Player 2: Join game
const joinResponse = await fetch(`http://localhost:3000/api/games/${gameId}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerName: 'Bob' })
});
const { playerId: player2Id, playerToken: player2Token } = await joinResponse.json();
```

### 2. Connect via WebSocket

```javascript
// Player 1
const ws1 = new WebSocket(`ws://localhost:3000/api/games/${gameId}/connect?token=${playerToken}`);

ws1.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message.type);
};

// Player 2
const ws2 = new WebSocket(`ws://localhost:3000/api/games/${gameId}/connect?token=${player2Token}`);
```

### 3. Ready and Start

```javascript
// Both players send ready
ws1.send(JSON.stringify({ type: 'READY' }));
ws2.send(JSON.stringify({ type: 'READY' }));

// Server broadcasts PLAYER_READY, then GAME_START when all ready
```

### 4. Play Game

```javascript
// Player 1 makes move
ws1.send(JSON.stringify({
  type: 'ACTION',
  payload: {
    type: 'MOVE',
    unitId: 'tank-1',
    params: { to: { q: 5, r: 3 } },
    playerId,
    timestamp: Date.now()
  }
}));

// Player 2 receives action
ws2.onmessage = (event) => {
  const { type, payload } = JSON.parse(event.data);
  if (type === 'ACTION') {
    // Apply action to local game state
  }
};

// Player 1 ends turn
ws1.send(JSON.stringify({
  type: 'END_TURN',
  payload: { savedAP: 3 }
}));
```

---

## Deployment

### Environment Variables

```bash
PORT=3000                          # Server port
HOST=0.0.0.0                       # Bind address
REDIS_URL=redis://localhost:6379  # Optional: Redis for scaling
NODE_ENV=production               # Environment
```

### Running the Server

```bash
# Development
yarn dev

# Production
yarn build
node dist/server/index.js
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

---

## Testing

### Run Tests

```bash
# All server tests
yarn test src/server/

# With coverage
yarn test src/server/ --coverage

# Watch mode
yarn test src/server/ --watch
```

### Test Coverage

Current coverage (as of implementation):
- **Statements**: 83.13%
- **Branches**: 68.26%
- **Functions**: 88.05%
- **Lines**: 82.30%

---

## Implementation Files

| File | Description | Tests | Lines |
|------|-------------|-------|-------|
| `src/server/types.ts` | TypeScript type definitions | - | 120 |
| `src/server/redis.ts` | Redis manager for persistence | 21 tests | 180 |
| `src/server/room.ts` | Room lifecycle management | 21 tests | 140 |
| `src/server/websocket.ts` | WebSocket handler | 15 tests | 200 |
| `src/server/api.ts` | REST API and server setup | 13 tests | 220 |
| `src/server/index.ts` | Server entry point | - | 20 |

**Total**: 70 tests, 880 lines of implementation code

---

## Future Enhancements

### v1.1
- [ ] Server-side action validation
- [ ] JWT authentication instead of base64
- [ ] Rate limiting with Redis
- [ ] Game replay system

### v2.0
- [ ] Horizontal scaling with Redis pub/sub
- [ ] Persistent game history
- [ ] Spectator mode
- [ ] Reconnection with state sync

### v3.0
- [ ] AI opponents
- [ ] Tournament brackets
- [ ] ELO ranking system
- [ ] Mobile app support
