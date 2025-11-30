# Full Metal Planète - Client Setup

## Overview

Minimal playable client for Full Metal Planète that connects the game rules engine, WebGPU renderer, and WebSocket server.

## Files Created

### Core Application
- `/src/client/index.html` - Game HTML page with canvas and HUD
- `/src/client/main.ts` - Client entry point
- `/src/client/app.ts` - Main application orchestrator
- `/src/client/game-client.ts` - WebSocket client wrapper

### UI Components
- `/src/client/ui/hud.ts` - HUD component (AP, turn, tide, timer)
- `/src/client/ui/input-handler.ts` - Mouse/keyboard input handler

### Configuration
- `/vite.config.ts` - Updated Vite configuration for client build
- `/package.json` - Updated with client dev/build scripts

## How to Test the MVP

### 1. Start the Backend Server

```bash
yarn dev:server
```

This starts the FastAPI server on port 3000 with WebSocket support.

### 2. Create a Game (via API)

```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"playerName": "Player 1"}'
```

Response will contain:
```json
{
  "gameId": "abc123",
  "playerId": "p1",
  "playerToken": "token123",
  "joinUrl": "http://localhost:5173?gameId=abc123&playerId=p1&token=token123"
}
```

### 3. Start the Client

```bash
yarn dev:client
```

This starts Vite dev server on port 5173.

### 4. Open the Game

Navigate to the `joinUrl` from step 2, or manually construct:

```
http://localhost:5173?gameId=abc123&playerId=p1&token=token123
```

### 5. Add More Players

For multiplayer testing, create additional players:

```bash
curl -X POST http://localhost:3000/api/games/abc123/join \
  -H "Content-Type: application/json" \
  -d '{"playerName": "Player 2"}'
```

Open the returned `joinUrl` in another browser tab/window.

## MVP Features Implemented

### ✅ Working Features
- WebSocket connection to game server
- Terrain rendering with WebGPU/WebGL fallback
- HUD display (AP, Turn, Tide, Timer)
- Unit selection (click to select own units)
- Basic movement (click destination to move)
- End turn functionality
- Real-time action synchronization
- Disconnect/reconnect handling

### ❌ Not Implemented (Out of MVP Scope)
- Combat (fire/capture)
- Load/unload units
- Build actions
- Animations
- Sound effects
- Advanced pathfinding
- Context menu functionality
- Tide prediction
- Score display

## Controls

### Mouse
- **Left Click**: Select unit (if yours) or move selected unit to hex
- **Right Click**: Reserved for context menu (not implemented)

### Keyboard
- **Enter**: End turn
- **Escape**: Deselect unit

## Architecture

```
┌─────────────────┐
│  Browser Client │
│                 │
│  ┌───────────┐  │
│  │   main.ts │──┼──> Entry point
│  └─────┬─────┘  │
│        │        │
│  ┌─────▼─────┐  │
│  │   app.ts  │──┼──> Orchestrator
│  └─────┬─────┘  │
│        │        │
│  ┌─────┴──────────┬──────────┬─────────┐
│  │                │          │         │
│  ▼                ▼          ▼         ▼
│ ┌──────┐  ┌──────────┐  ┌─────┐  ┌────────┐
│ │ HUD  │  │ Renderer │  │Input│  │ Client │
│ └──────┘  └──────────┘  └─────┘  └────┬───┘
│                                        │
└────────────────────────────────────────┼────
                                         │ WebSocket
                                         │
                                    ┌────▼────┐
                                    │ Server  │
                                    │  :3000  │
                                    └─────────┘
```

## Integration Points

### 1. WebSocket Connection
- URL: `ws://localhost:3000/api/games/:id/connect?token=TOKEN`
- Messages: PLAYER_JOINED, GAME_START, ACTION, TURN_END, GAME_END
- Sends: ACTION, END_TURN, READY, PONG

### 2. Renderer Integration
- Uses `HexRenderer` from `@/client/renderer`
- Sets terrain data from game state
- Updates tide visualization on changes
- WebGPU primary, WebGL fallback

### 3. Game State
- Imports types from `@/shared/game/types`
- Uses state reducers from `@/shared/game/state`
- Validates actions with `@/shared/game/actions`

### 4. Input Handling
- Screen-to-hex coordinate conversion
- Unit selection via click
- Movement via click-to-destination
- Keyboard shortcuts (Enter, Escape)

## Development Workflow

### Run Both Server and Client
```bash
# Terminal 1
yarn dev:server

# Terminal 2
yarn dev:client
```

### Build for Production
```bash
yarn build:server
yarn build:client
```

### Type Checking
```bash
yarn typecheck
```

## Troubleshooting

### WebSocket Connection Failed
- Ensure server is running on port 3000
- Check that gameId and token are valid
- Verify proxy configuration in vite.config.ts

### Renderer Not Initializing
- Check browser WebGPU support
- WebGL2 fallback should activate automatically
- Check console for GPU errors

### Units Not Visible
- Game must be started (all players ready)
- Check that terrain data is loaded
- Verify game state in browser console

### Actions Not Working
- Ensure it's your turn (HUD shows enabled state)
- Check action point availability
- Verify WebSocket connection status

## Next Steps for Full Implementation

1. **Combat System**
   - Fire action with targeting UI
   - Capture mechanics
   - Range calculation and visualization

2. **Cargo System**
   - Load/unload UI
   - Cargo visualization
   - Transport validation

3. **Polish**
   - Movement animations
   - Action feedback animations
   - Sound effects
   - Particle effects

4. **Advanced Features**
   - Tide prediction UI
   - Build menu
   - Score tracking
   - Game history/replay

## Notes

- Client uses Vite for fast development and HMR
- TypeScript strict mode enabled
- Path aliases configured (`@/` maps to `src/`)
- All game logic shared between client and server
