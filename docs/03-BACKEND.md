# Full Metal Planète - Backend Requirements

## 1. Architecture Overview

### 1.1 First Iteration (v1)

```
┌─────────────┐                           ┌─────────────┐
│  Client A   │◄──────────────────────────►│             │
│  (rules)    │       WebSocket           │   PubSub    │
└─────────────┘                           │   Server    │
                                          │             │
┌─────────────┐                           │             │
│  Client B   │◄──────────────────────────►│             │
│  (rules)    │       WebSocket           └─────────────┘
└─────────────┘                                  │
                                                 │
┌─────────────┐                                  │
│  Client C   │◄─────────────────────────────────┘
│  (rules)    │       WebSocket
└─────────────┘
```

**Key decisions for v1**:
- Rule enforcement: **Client-side** (trusted players)
- State authority: **Distributed** (each client maintains state)
- Sync model: **Event sourcing** (broadcast actions, not state)

### 1.2 Future Architecture (v2+)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Client A   │◄─────►│   Server    │◄─────►│  Database   │
└─────────────┘       │  (rules +   │       └─────────────┘
                      │   state)    │
┌─────────────┐       │             │
│  Client B   │◄─────►│             │
└─────────────┘       └─────────────┘
```

---

## 2. Game Room Service

### 2.1 Room Lifecycle

```
CREATE ROOM → WAITING → READY → PLAYING → FINISHED
                ↑                  │
                └──────────────────┘
                   (player disconnect)
```

### 2.2 Room States

| State | Description | Transitions |
|-------|-------------|-------------|
| `waiting` | Room created, waiting for players | → `ready` when 2-4 players |
| `ready` | All players connected and ready | → `playing` on host start |
| `playing` | Game in progress | → `finished` at turn 25 |
| `finished` | Game complete | Terminal state |

### 2.3 Room Data Structure

```typescript
interface GameRoom {
  id: string;              // Unique room ID (e.g., "abc123")
  state: RoomState;
  hostId: string;          // Player who created room
  players: Player[];       // Connected players (2-4)
  createdAt: Date;
  gameState?: GameState;   // Full game state (for reconnection)
}

interface Player {
  id: string;              // Unique player ID
  name: string;            // Display name
  color: PlayerColor;      // Red, Blue, Green, Yellow
  isReady: boolean;
  isConnected: boolean;
  lastSeen: Date;
}
```

---

## 3. API Design

### 3.1 REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/games` | Create new game room |
| `GET` | `/api/games/:id` | Get room info/state |
| `POST` | `/api/games/:id/join` | Join existing room |

### 3.2 Create Game

**Request**:
```http
POST /api/games
Content-Type: application/json

{
  "playerName": "Alice"
}
```

**Response**:
```json
{
  "gameId": "abc123",
  "playerId": "p1-xyz",
  "playerToken": "jwt-token-here",
  "joinUrl": "https://fmp.game/abc123"
}
```

### 3.3 Join Game

**Request**:
```http
POST /api/games/abc123/join
Content-Type: application/json

{
  "playerName": "Bob"
}
```

**Response**:
```json
{
  "gameId": "abc123",
  "playerId": "p2-xyz",
  "playerToken": "jwt-token-here",
  "players": [
    { "id": "p1-xyz", "name": "Alice", "color": "red" },
    { "id": "p2-xyz", "name": "Bob", "color": "blue" }
  ]
}
```

### 3.4 Get Game State

**Request**:
```http
GET /api/games/abc123
Authorization: Bearer jwt-token-here
```

**Response**:
```json
{
  "gameId": "abc123",
  "state": "playing",
  "turn": 12,
  "currentPlayer": "p1-xyz",
  "players": [...],
  "gameState": { ... }
}
```

---

## 4. WebSocket Protocol

### 4.1 Connection

```
ws://fmp.game/api/games/:gameId/connect?token=jwt-token
```

### 4.2 Message Format

All messages use JSON with this structure:

```typescript
interface WSMessage {
  type: MessageType;
  payload: any;
  timestamp: number;
  playerId?: string;
  seq?: number;         // Sequence number for ordering
}
```

### 4.3 Message Types

#### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `PLAYER_JOINED` | `{ player }` | New player joined room |
| `PLAYER_LEFT` | `{ playerId }` | Player disconnected |
| `PLAYER_READY` | `{ playerId }` | Player marked ready |
| `GAME_START` | `{ gameState }` | Game begins |
| `ACTION` | `{ action }` | Game action from other player |
| `TURN_END` | `{ playerId, savedAP }` | Player ended turn |
| `GAME_END` | `{ scores }` | Game finished |
| `ERROR` | `{ code, message }` | Error occurred |
| `PING` | `{}` | Keepalive |

#### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `READY` | `{}` | Player ready to start |
| `ACTION` | `{ action }` | Game action |
| `END_TURN` | `{}` | End current turn |
| `PONG` | `{}` | Keepalive response |

### 4.4 Action Format

```typescript
interface GameAction {
  type: ActionType;
  unitId: string;
  params: ActionParams;
}

type ActionType =
  | 'MOVE'
  | 'LOAD'
  | 'UNLOAD'
  | 'FIRE'
  | 'CAPTURE'
  | 'BUILD'
  | 'ENTER_ASTRONEF'
  | 'EXIT_ASTRONEF'
  | 'LIFT_OFF';

// Examples:
{ type: 'MOVE', unitId: 'tank-1', params: { to: { q: 5, r: 3 } } }
{ type: 'FIRE', unitId: 'tank-1', params: { target: { q: 6, r: 2 } } }
{ type: 'LOAD', unitId: 'barge-1', params: { cargo: 'mineral-5' } }
{ type: 'BUILD', unitId: 'converter-1', params: { unitType: 'tank' } }
```

### 4.5 Example Message Flow

```
Client A                Server                Client B
   │                      │                      │
   │──READY──────────────►│                      │
   │                      │──PLAYER_READY───────►│
   │                      │                      │
   │                      │◄──READY──────────────│
   │◄──PLAYER_READY───────│                      │
   │                      │                      │
   │                      │──GAME_START─────────►│
   │◄──GAME_START─────────│                      │
   │                      │                      │
   │──ACTION (move)──────►│                      │
   │                      │──ACTION─────────────►│
   │                      │                      │
   │──END_TURN───────────►│                      │
   │                      │──TURN_END───────────►│
   │                      │                      │
```

---

## 5. State Synchronization

### 5.1 Event Sourcing Model

Instead of syncing full state, clients exchange **actions**.

```
Initial State → Action 1 → Action 2 → ... → Current State
```

Each client:
1. Receives action from server
2. Validates action locally
3. Applies action to local state
4. Updates UI

### 5.2 Conflict Resolution

Since rule enforcement is client-side in v1:
- Server does **not** validate actions
- Server only broadcasts to other clients
- Conflicts are resolved by timestamp (first wins)

### 5.3 Reconnection

When a player reconnects:
1. Server sends full `gameState` snapshot
2. Server sends any pending actions since disconnect
3. Client rebuilds state and resumes

```typescript
interface ReconnectPayload {
  gameState: GameState;
  pendingActions: GameAction[];
  lastSeq: number;
}
```

---

## 6. Persistence

### 6.1 Storage Requirements (v1)

| Data | Storage | TTL |
|------|---------|-----|
| Room info | Memory/Redis | 24 hours |
| Game state | Memory/Redis | Until game end + 1 hour |
| Action log | Optional | Until game end |

### 6.2 Redis Schema

```
games:{gameId}:info     → Room metadata (JSON)
games:{gameId}:state    → Current game state (JSON)
games:{gameId}:actions  → Action log (List)
games:{gameId}:players  → Player connections (Set)
```

### 6.3 Persistence Strategy

```typescript
// Save state periodically and on turn end
async function saveGameState(gameId: string, state: GameState) {
  await redis.set(`games:${gameId}:state`, JSON.stringify(state));
  await redis.expire(`games:${gameId}:state`, 3600); // 1 hour TTL
}

// Append action to log
async function logAction(gameId: string, action: GameAction) {
  await redis.rpush(`games:${gameId}:actions`, JSON.stringify(action));
}
```

---

## 7. Server Implementation

### 7.1 Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Framework | Fastify or Hono |
| WebSocket | ws or uWebSockets.js |
| Cache | Redis or in-memory |

### 7.2 Server Structure

```
src/server/
├── index.ts           # Entry point
├── routes/
│   └── games.ts       # REST endpoints
├── ws/
│   ├── handler.ts     # WebSocket connection handler
│   └── messages.ts    # Message type definitions
├── rooms/
│   ├── manager.ts     # Room lifecycle management
│   └── room.ts        # Single room instance
└── storage/
    └── redis.ts       # Persistence layer
```

### 7.3 Room Manager

```typescript
class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();

  createRoom(hostPlayer: Player): GameRoom {
    const id = generateRoomId(); // 6-char alphanumeric
    const room = new GameRoom(id, hostPlayer);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): GameRoom | undefined {
    return this.rooms.get(id);
  }

  deleteRoom(id: string): void {
    this.rooms.delete(id);
  }
}
```

### 7.4 WebSocket Handler

```typescript
class WSHandler {
  handleConnection(ws: WebSocket, room: GameRoom, player: Player) {
    room.addConnection(player.id, ws);

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      this.handleMessage(room, player, msg);
    });

    ws.on('close', () => {
      room.removeConnection(player.id);
      room.broadcast({ type: 'PLAYER_LEFT', payload: { playerId: player.id } });
    });
  }

  handleMessage(room: GameRoom, player: Player, msg: WSMessage) {
    switch (msg.type) {
      case 'ACTION':
        // Broadcast to all other players
        room.broadcast(msg, [player.id]);
        break;
      case 'END_TURN':
        room.broadcast({ type: 'TURN_END', payload: { playerId: player.id } });
        break;
      // ... other message types
    }
  }
}
```

---

## 8. Security Considerations

### 8.1 Authentication (v1 - Minimal)

- JWT token issued on room create/join
- Token includes: `{ playerId, gameId, exp }`
- Token required for WebSocket connection
- No user accounts (anonymous players)

### 8.2 Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Create room | 10/min per IP |
| Join room | 20/min per IP |
| WebSocket messages | 100/min per player |

### 8.3 Input Validation

Even without server-side rule enforcement:
- Validate message format
- Validate player is in room
- Validate it's player's turn (for actions)
- Reject obviously invalid data

---

## 9. Scalability (Future)

### 9.1 Horizontal Scaling

```
                    ┌─────────────┐
                    │   Load      │
                    │  Balancer   │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
    │  Server 1 │    │  Server 2 │    │  Server 3 │
    └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                    ┌──────▼──────┐
                    │    Redis    │
                    │   Pub/Sub   │
                    └─────────────┘
```

### 9.2 Redis Pub/Sub for Multi-Server

```typescript
// Publish action to Redis channel
await redis.publish(`game:${gameId}`, JSON.stringify(action));

// Subscribe to game channel
redis.subscribe(`game:${gameId}`, (message) => {
  room.broadcast(JSON.parse(message));
});
```

---

## 10. Monitoring & Logging

### 10.1 Metrics

| Metric | Description |
|--------|-------------|
| `rooms_active` | Current active game rooms |
| `players_connected` | Current WebSocket connections |
| `messages_per_second` | WebSocket message throughput |
| `room_duration_seconds` | Game length histogram |

### 10.2 Logging

```typescript
// Structured logging
logger.info({
  event: 'game_action',
  gameId: room.id,
  playerId: player.id,
  actionType: action.type,
  turn: state.turn,
});
```

---

## 11. Deployment

### 11.1 Options

| Platform | Pros | Cons |
|----------|------|------|
| Cloudflare Workers + Durable Objects | Global edge, auto-scale | WebSocket limitations |
| Fly.io | Easy deploy, good WS support | Cost at scale |
| Railway | Simple, cheap | Limited regions |
| Self-hosted VPS | Full control | Manual scaling |

### 11.2 Environment Variables

```env
PORT=3000
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://fmp.game
NODE_ENV=production
```

### 11.3 Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```
