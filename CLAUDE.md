# Full Metal Planète - Web Game

## Project Overview

Web-based multiplayer implementation of the classic French board game "Full Metal Planète" (1988).

## Technology Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Bun |
| **Language** | TypeScript (strict mode) |
| **Rendering** | CSS/DOM (with WebGPU fallback) |
| **Frontend** | Vanilla TypeScript, Vite |
| **Backend** | Fastify with WebSocket |
| **Issue Tracking** | Beads (`fmp-*` prefix) |

## Architecture (v1)

- **Rule enforcement**: Client-side (trusted players)
- **Sync**: Push/PubSub via WebSocket
- **Game access**: Shareable URL links (no auth)

## Project Structure

```
fmp/
├── docs/                    # Requirements documentation (source of truth)
│   ├── 01-RULES.md          # Complete game rules
│   ├── 02-UI.md             # Frontend requirements
│   ├── 03-BACKEND.md        # Backend architecture
│   ├── 04-DATA-MODEL.md     # TypeScript types and schemas
│   └── 05-ROADMAP.md        # Future iterations
├── src/
│   ├── client/              # Frontend application
│   │   ├── renderer/        # WebGPU/WebGL rendering
│   │   ├── game/            # Game state and rules engine
│   │   └── ui/              # HUD and controls
│   ├── server/              # Backend service
│   │   └── sync/            # WebSocket room management
│   └── shared/              # Shared types and utilities
├── .beads/                  # Issue tracking database
├── CLAUDE.md                # This file
└── package.json
```

## Development Commands

```bash
bun install           # Install dependencies
bun dev               # Start unified dev server (Vite + API on ports 5173/3000)
bun dev:server        # Start API server only (with hot reload)
bun build             # Production build (client + server)
bun test              # Run tests
bun run typecheck     # TypeScript validation
```

## Beads Workflow

```bash
bd list               # View all issues
bd ready              # Find ready tasks
bd create             # Create new issue
bd update <id> in_progress  # Claim work
bd close <id>         # Complete work
bd stats              # Project statistics
```

## Key Design Decisions

### Hex Grid
- **Flat-top hexagons** (matching original board)
- Cube coordinates for logic operations
- Axial coordinates for storage/serialization

### Visual Style
- Industrial sci-fi aesthetic (matching original metal miniatures)
- Color palette from original board:
  - Land: `#D4A574` (ochre)
  - Sea: `#6B7B9E` (blue-purple)
  - Minerals: `#E55A3C` (orange-red)

### Game Rules Source
- Primary: `docs/01-RULES.md` (derived from Game Cabinet translation)
- Reference: `rules.html` (original HTML source)

## Testing Strategy

- Unit tests for rules engine (all game mechanics)
- Integration tests for sync protocol
- Visual regression for renderer

## Important Notes

- Always read `docs/01-RULES.md` before implementing game logic
- Rule enforcement is client-side in v1 - validate inputs but trust players
- WebGPU is primary target; WebGL2 fallback for broader support
- 3-minute turn timer is enforced per player
- Game supports 2-4 players


## FULL RULES ARE AVAILBLE HERE
http://jeuxstrategie.free.fr/Full_metal_planete_complet.php
