# Full Metal Planète - E2E Tests

Playwright end-to-end tests for Full Metal Planète web game.

## Test Files

### game.spec.ts
Basic game flow tests covering:
- Game creation and joining via API
- Client UI rendering
- WebSocket communication
- HUD elements display
- Health checks

### two-player-game.spec.ts
Complete two-player game flow tests:
- Creating and joining games
- Ready state management
- Game start sequence
- Hex click interactions
- Astronef landing phase
- Multi-player synchronization

### lab-mode.spec.ts
Lab Mode testing environment tests:
- Navigation to Lab Mode
- Hex grid rendering
- Deployment inventory
- Unit placement (click and touch)
- Zoom controls (buttons and gestures)
- Team switching
- Control panel features (AP, tide level)
- Keyboard shortcuts
- Right-click unit removal

## Running Tests

### All Tests
```bash
yarn test:e2e
```

### Specific Test File
```bash
npx playwright test e2e/lab-mode.spec.ts
```

### Specific Test Suite
```bash
npx playwright test e2e/lab-mode.spec.ts --grep "Zoom Controls"
```

### With UI Mode (Interactive)
```bash
npx playwright test --ui
```

### Debug Mode
```bash
npx playwright test --debug
```

### Headed Mode (See Browser)
```bash
npx playwright test --headed
```

## Test Development

### Dev Server
The tests expect the dev server to be running:
```bash
# Terminal 1: Backend server
yarn dev:server

# Terminal 2: Frontend client
yarn dev:client
```

The Playwright config will auto-start these servers if not running.

### Configuration
- **Base URL**: http://localhost:5173
- **Server Port**: 3000 (backend)
- **Client Port**: 5173 (frontend)
- **Timeout**: 30 seconds for server startup
- **Screenshots**: Saved to `e2e-screenshots/` on failure
- **Trace**: Captured on first retry

## Lab Mode Test Coverage

### 🎯 Core Features
- ✅ Navigation (home → lab)
- ✅ Direct URL access (/lab)
- ✅ Hex grid rendering
- ✅ Deployment inventory display
- ✅ Unit selection from inventory
- ✅ Unit placement on hexes

### 🖱️ User Interactions
- ✅ Click to select units
- ✅ Click to place units
- ✅ Right-click to remove units
- ✅ Touch tap for mobile
- ✅ Escape key to deselect

### 🔍 Zoom Controls
- ✅ Zoom in button
- ✅ Zoom out button
- ✅ Zoom to fit button
- ✅ Zoom level display
- ✅ Pinch zoom (touch)
- ✅ Wheel zoom

### 👥 Team Management
- ✅ Team selector buttons
- ✅ Team switching
- ✅ Per-team inventory
- ✅ Active team indication

### 🎛️ Control Panel
- ✅ Action points adjustment (+/-)
- ✅ Action points reset (MAX)
- ✅ Tide level selection (Low/Normal/High)
- ✅ Reset all units button
- ✅ Back to home button

### 📱 Responsive Design
- ✅ Mobile viewport (390×844)
- ✅ Touch-friendly controls
- ✅ Tap gestures
- ✅ Mobile layout verification

## Screenshots

Test screenshots are saved to `e2e-screenshots/`:

### Lab Mode Screenshots
- `lab-mode-initial.png` - Initial load
- `lab-mode-hex-grid.png` - Hex grid rendering
- `lab-mode-inventory.png` - Deployment inventory
- `lab-mode-unit-placed.png` - Unit placed on grid
- `lab-mode-unit-removed.png` - After unit removal
- `lab-mode-zoomed-in.png` - Zoomed in view
- `lab-mode-high-tide.png` - High tide state
- `lab-mode-team2.png` - Team 2 active
- `lab-mode-mobile-placement.png` - Mobile layout

### Game Screenshots
- `player1-after-click.png` - Player 1 hex interaction
- `player2-after-click.png` - Player 2 hex interaction

## Common Patterns

### Waiting for Lab Mode to Load
```typescript
await page.goto('/lab');
await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });
```

### Selecting and Placing a Unit
```typescript
// Select unit
const unitItem = page.locator('.inventory-item').first();
await unitItem.click();

// Place on hex
const hexCell = page.locator('.hex-cell').nth(10);
await hexCell.click();
```

### Verifying Console Logs
```typescript
const consoleLogs: string[] = [];
page.on('console', msg => consoleLogs.push(msg.text()));

// ... perform actions ...

const placementLogs = consoleLogs.filter(log =>
  log.includes('Placed unit')
);
```

### Mobile Testing
```typescript
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('.hex-cell').nth(10).tap();
```

## Debugging Tips

### 1. View Test in Browser
```bash
npx playwright test --headed --debug
```

### 2. Pause Test at Point
```typescript
await page.pause();
```

### 3. Check Console Logs
Add console log capture:
```typescript
page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
```

### 4. Take Screenshot Anywhere
```typescript
await page.screenshot({
  path: 'e2e-screenshots/debug.png',
  fullPage: true
});
```

### 5. View Test Report
```bash
npx playwright show-report
```

## CI/CD Integration

Tests are configured for CI environments:
- **Retries**: 2 retries on failure (CI only)
- **Workers**: 1 worker (CI) vs unlimited (local)
- **forbidOnly**: Prevents `.only()` in CI

## Touch Testing Notes

Lab Mode is designed to be touch-friendly:
- All clickable elements support `tap()` method
- Zoom controls work with pinch gestures
- Unit placement works with single tap
- Right-click context menu replaced with long-press

## Known Limitations

1. **Multi-hex Units**: Tests verify placement but not all rotation angles
2. **Tide Visualization**: Visual changes tested via screenshots, not pixel-perfect
3. **Animation Testing**: Some animations may require longer waits
4. **WebGPU vs CSS**: Tests primarily use CSS renderer (fallback)

## Future Test Coverage

- [ ] Unit rotation controls
- [ ] Multi-hex unit placement validation
- [ ] Invalid placement feedback
- [ ] Cargo/mineral loading
- [ ] Save/load game state
- [ ] Performance benchmarks
- [ ] Accessibility testing (keyboard navigation)
- [ ] Visual regression testing

## Contributing

When adding new tests:
1. Follow existing patterns (test.describe blocks)
2. Add descriptive test names
3. Include console logging for debugging
4. Take screenshots for visual tests
5. Test both desktop and mobile viewports
6. Update this README with new coverage
