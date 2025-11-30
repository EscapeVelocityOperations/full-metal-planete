# Testing the Full Metal Planète Client

## Quick Start Test

Follow these steps to verify the client MVP is working:

### Step 1: Install Dependencies
```bash
yarn install
```

### Step 2: Start Backend Server
```bash
yarn dev:server
```

Server should start on `http://localhost:3000`

### Step 3: Start Client Dev Server (New Terminal)
```bash
yarn dev:client
```

Vite dev server should start on `http://localhost:5173`

### Step 4: Test Client Loading

Open browser to: `http://localhost:5173?gameId=test&playerId=p1&token=abc123`

You should see:
- Loading spinner initially
- Canvas element with black background
- HUD at top showing:
  - Action Points: 15 / 15
  - Turn: 1 / 25
  - Tide: NORMAL
  - Timer: 3:00
  - End Turn button
- Status message "Connected to game" (briefly)
- Error message about connection (expected without real game)

### Step 5: Verify File Structure

```bash
ls -R src/client/
```

Expected output:
```
src/client/:
app.ts
game-client.ts
index.html
main.ts
ui

src/client/ui:
hud.ts
input-handler.ts
```

### Step 6: Type Check Client

```bash
# This will still show some errors since we haven't created tsconfig.client.json script
yarn typecheck
```

## Expected Behavior

### ✅ What Should Work
1. Vite dev server starts without errors
2. Browser loads the page without crashes
3. Canvas element renders
4. HUD displays with default values
5. WebSocket connection attempt (will fail without real game)

### ❌ What Won't Work Yet
1. Actual game connection (no game created yet)
2. Terrain rendering (no game state)
3. Unit movement (no units)
4. Turn management (no active game)

## Full Integration Test

To test the full system:

### 1. Create a Real Game

```bash
# In a new terminal
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"playerName": "Test Player"}'
```

Save the response values:
- `gameId`
- `playerId`
- `playerToken`

### 2. Open Client with Real Credentials

```
http://localhost:5173?gameId=GAME_ID&playerId=PLAYER_ID&token=TOKEN
```

Replace GAME_ID, PLAYER_ID, and TOKEN with values from step 1.

### 3. Verify Connection

Check browser console:
- Should see "WebSocket connected"
- Should see "Connected to game server"
- No connection errors

### 4. Test Basic Interactions

- Click on canvas (should log hex coordinates in console)
- Press Enter (should attempt end turn)
- Press Escape (should deselect if unit selected)
- Click "End Turn" button (should be disabled if not your turn)

## Common Issues

### Issue: "Cannot find module '@/client/renderer'"
**Solution**: Path aliases should work with Vite. If not, check vite.config.ts

### Issue: WebSocket connection fails
**Solution**: Ensure backend server is running on port 3000

### Issue: Blank screen
**Solution**: Check browser console for errors. WebGPU may need fallback to WebGL.

### Issue: TypeScript errors
**Solution**: Client uses DOM types. The separate tsconfig.client.json handles this.

### Issue: Vite can't find files
**Solution**: Ensure vite.config.ts has `root: 'src/client'` set correctly

## Browser Console Commands

Debug the client with these commands:

```javascript
// Access the app instance
window.gameApp

// Check connection status
window.gameApp.client.isConnected()

// Get current game state
window.gameApp.gameState

// Manual render
window.gameApp.render()
```

## Success Criteria

Client MVP is working if:
- ✅ Vite dev server starts
- ✅ Page loads without crashes
- ✅ Canvas element is visible
- ✅ HUD displays correctly
- ✅ WebSocket connection works (with real game)
- ✅ Basic input handling works
- ✅ No console errors (except expected connection failures)

## Next Steps

Once MVP is verified:
1. Add terrain data to game state
2. Implement unit rendering
3. Add movement validation
4. Implement combat actions
5. Add animations
