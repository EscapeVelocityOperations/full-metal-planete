# Full Metal Planète Web Game - Design Plan

## Project Overview

Design a web-based multiplayer implementation of the classic French board game "Full Metal Planète" (1988). This first iteration focuses on a minimal viable product with client-side rule enforcement and simple push/pubsub synchronization.

## Architecture Decision: First Iteration

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Rendering** | WebGPU (WebGL fallback) | Modern GPU rendering for hex board |
| **Rule Engine** | Client-side | Simplicity, all players trusted |
| **Sync** | Push/PubSub | Real-time state broadcast |
| **Game Link** | Shareable URL | No auth required, game ID in URL |

## Documentation Structure

```
docs/
├── 01-RULES.md          # Complete game rules (source of truth)
├── 02-UI.md             # Frontend requirements and UX design
├── 03-BACKEND.md        # Backend architecture and sync protocol
├── 04-DATA-MODEL.md     # Game state schema and data structures
└── 05-ROADMAP.md        # Future iterations and features
```

## 01-RULES.md - Game Rules

**Source**: Game Cabinet translation by Mark Green

### Contents
1. **Game Components** - All unit types, their properties, capacities
2. **Terrain System** - Hex types, movement effects, tide interactions
3. **Tide Mechanics** - 15-card deck, terrain state changes
4. **Action Point System** - Base 15 AP, saving, capture bonuses, costs
5. **Unit Specifications** - Movement, combat range, special abilities
6. **Combat System** - Dual-fire requirement, destruction, capture
7. **Transporter Rules** - Loading, unloading, capacity, restrictions
8. **Astronef Mechanics** - Podes, turrets, capture, take-off
9. **Turn Structure** - 25 turns, special phases (1,2,3-4,21,25)
10. **Scoring** - Victory point calculation

### Key Game Parameters

| Parameter | Value |
|-----------|-------|
| Board hexes | 851 |
| Players | 2-4 |
| Turns | 21-25 |
| Time per turn | 3 minutes |
| Base action points | 15 |
| Max saved AP | 10 |
| Tide cards | 15 (5 each type) |

### Starting Force Per Player
- 1 Astronef (4 hexes, 3 turrets)
- 1 Barge (transporter, 4 capacity)
- 1 Crab (transporter, 2 capacity)
- 1 Converter
- 2 Motor Boats
- 4 Tanks
- 1 Super Tank
- 1 Bridge

## 02-UI.md - Frontend Requirements

### Technology Stack
- **Rendering**: WebGPU primary, WebGL2 fallback
- **Framework**: Vanilla TypeScript or lightweight (Preact)
- **State**: Local game state with sync layer

### UI Components

1. **Game Board** (WebGPU/WebGL)
   - Hex grid rendering (851 hexes)
   - Terrain types with visual distinction
   - Unit sprites/models
   - Movement highlighting
   - Fire range indicators
   - Tide state visualization

2. **HUD Elements**
   - Action point counter (current/max)
   - Turn timer (3 min countdown)
   - Turn number (1-25)
   - Current tide indicator
   - Next tide preview (if converter operational)
   - Player colors/scores

3. **Unit Panel**
   - Selected unit info
   - Valid actions
   - Cargo contents (for transporters)

4. **Game Controls**
   - End turn button
   - Undo last action (if allowed)
   - Lift-off decision (turn 21)

5. **Lobby/Link Sharing**
   - Generate game URL
   - Copy link button
   - Player list/readiness

### Hex Grid Specifications
- **Flat-top hexagons** (matching original board)
- Cube coordinates for logic
- Axial coordinates for storage
- Screen projection for rendering

### Visual Design (from original board reference)
- **Color Palette**:
  - Land: Ochre/orange-yellow (#D4A574)
  - Sea: Blue-purple (#6B7B9E)
  - Marshes: Ochre with blue spots
  - Mountains: Grey (#808080)
  - Reefs: Blue with ochre spots
  - Minerals: Bright orange-red (#E55A3C)

- **Unit Aesthetic**: Industrial sci-fi metal miniatures
  - Weathered metallic surfaces
  - Player colors via gem/marker indicators
  - Astronef: Cross-shaped with visible turret pods
  - Barges: Long rectangular with cargo bays
  - Tanks: Compact treaded vehicles

## 03-BACKEND.md - Backend Architecture

### First Iteration: Minimal Server

```
┌─────────────┐     WebSocket/SSE      ┌─────────────┐
│  Client A   │◄──────────────────────►│  PubSub     │
│  (rules)    │                        │  Server     │
└─────────────┘                        └─────────────┘
                                              ▲
┌─────────────┐                              │
│  Client B   │◄─────────────────────────────┘
│  (rules)    │
└─────────────┘
```

### Components

1. **Game Room Service**
   - Create game → generate unique ID
   - Join game by ID
   - Track connected players

2. **State Sync Protocol**
   - Broadcast game actions to all players
   - Action format: `{type, player, params, timestamp}`
   - Each client applies actions to local state

3. **Persistence (Optional v1)**
   - Store game state in Redis/memory
   - Allow reconnection to in-progress games

### API Design

```
POST /api/games              # Create new game
GET  /api/games/:id          # Get game state
WS   /api/games/:id/connect  # Real-time sync
```

### Message Types
- `PLAYER_JOIN` - Player connected
- `PLAYER_READY` - Player ready to start
- `GAME_START` - Game begins
- `ACTION` - Game action (move, fire, load, etc.)
- `END_TURN` - Player ends turn
- `GAME_END` - Final scores

## 04-DATA-MODEL.md - Data Structures

### Core Types

```typescript
// Coordinates
type HexCoord = { q: number; r: number };

// Terrain
type TerrainType = 'sea' | 'land' | 'marsh' | 'reef' | 'mountain';
type TideLevel = 'low' | 'normal' | 'high';

// Units
type UnitType =
  | 'astronef' | 'tower' | 'tank' | 'supertank'
  | 'motorboat' | 'barge' | 'crab' | 'converter' | 'bridge';

// Game State
interface GameState {
  turn: number;
  phase: GamePhase;
  tide: TideLevel;
  tidesDeck: TideLevel[];
  players: Player[];
  units: Unit[];
  minerals: HexCoord[];
  currentPlayer: PlayerId;
  actionPoints: number;
  savedAP: Record<PlayerId, number>;
}
```

### Unit Properties Table

| Unit | Movement | Range | Capacity | Size | Notes |
|------|----------|-------|----------|------|-------|
| Tank | Land | 2 | - | 1 | 3 range on mountain |
| Super Tank | Land | 3 | - | 1 | Cannot enter mountain |
| Motor Boat | Sea | 2 | - | - | - |
| Barge | Sea | - | 4 | - | Can carry converter/crab |
| Crab | Land | - | 2 | 2 | Cannot carry converter/crab |
| Converter | Land | - | 1* | 2 | Builds units, predicts tide |
| Bridge | - | - | - | 1 | Inert, neutral |
| Tower | - | 2 | - | - | Part of Astronef |
| Astronef | - | - | ∞ | 4 hex | Landing zone only |

## 05-ROADMAP.md - Future Iterations

### v1.0 (Current Scope)
- [ ] Complete game rules implementation
- [ ] WebGPU hex board rendering
- [ ] Client-side rule enforcement
- [ ] Simple push/pubsub sync
- [ ] Shareable game links

### v1.1
- [ ] Server-side rule validation
- [ ] Game replay system
- [ ] Basic animations

### v2.0
- [ ] User accounts
- [ ] Matchmaking
- [ ] ELO ratings
- [ ] Persistent game history

### v3.0
- [ ] AI opponents
- [ ] Tournament mode
- [ ] Mobile responsive UI
- [ ] Spectator mode

## CLAUDE.md Configuration

Create project-specific instructions for Claude Code:
- Yarn as package manager
- TypeScript strict mode
- WebGPU focus with WebGL fallback
- Client-side first architecture
- Beads for issue tracking

## Implementation Order

1. **Initialize project** - `bd init fmp`, create CLAUDE.md
2. **Write requirements docs** - 01-RULES.md through 05-ROADMAP.md
3. **Create beads issues** - Break down into trackable work items
4. **Frontend scaffold** - TypeScript + WebGPU setup
5. **Hex grid renderer** - Core board visualization
6. **Game state machine** - Rules engine
7. **Backend service** - WebSocket sync
8. **Integration** - Full playable game

## Open Questions for User

1. **Player count**: Support 2-4 players, or start with 2-player only?
2. **Timer enforcement**: Server-side timer or trust clients?
3. **Deployment target**: Vercel, Cloudflare Workers, self-hosted?
4. **Visual style**: Pixel art, 3D isometric, clean vector?
