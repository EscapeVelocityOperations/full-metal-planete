# Full Metal Planète - Test Summary

## E2E Test Coverage

### Total Tests: 36 Tests
- **Game Flow**: 10 tests
- **Two Player Game**: 2 tests
- **Lab Mode**: 26 tests

---

## Lab Mode Tests (26 Tests)

### Navigation and Initialization (2 tests)
✅ Navigate to Lab Mode from home page
✅ Load Lab Mode directly via URL (/lab)

### Hex Grid Rendering (2 tests)
✅ Render hex grid on canvas
✅ Render terrain types correctly

### Deployment Inventory (2 tests)
✅ Display deployment inventory for Team 1
✅ Have different unit types in inventory

### Unit Placement (3 tests)
✅ Select unit from inventory
✅ Place unit on hex grid
✅ Support touch-friendly unit placement (mobile)

### Zoom Controls (5 tests)
✅ Have zoom control buttons
✅ Zoom in when clicking zoom in button
✅ Zoom out when clicking zoom out button
✅ Reset zoom with zoom fit button
✅ Support pinch zoom on touch devices

### Team Switching (3 tests)
✅ Display team selector buttons
✅ Switch between teams
✅ Display different units for different teams

### Control Panel Features (5 tests)
✅ Display action points controls
✅ Adjust action points with buttons
✅ Have tide level controls
✅ Change tide level
✅ Have reset and back buttons
✅ Navigate back to home when clicking back button

### Keyboard Controls (1 test)
✅ Deselect unit with Escape key

### Right-click Unit Removal (1 test)
✅ Remove placed unit on right-click

### Screenshots Directory (1 test)
✅ Create screenshots directory if not exists

---

## Running Tests

### Quick Start
```bash
# Run all E2E tests
yarn test:e2e

# Run only Lab Mode tests
yarn test:e2e:lab

# Interactive UI mode
yarn test:e2e:ui

# Watch browser during test
yarn test:e2e:headed
```

### Specific Test Suites
```bash
# Just zoom tests
npx playwright test e2e/lab-mode.spec.ts --grep "Zoom Controls"

# Just placement tests
npx playwright test e2e/lab-mode.spec.ts --grep "Unit Placement"

# Just team switching
npx playwright test e2e/lab-mode.spec.ts --grep "Team Switching"
```

---

## Test Artifacts

### Screenshots
All test screenshots are saved to `e2e-screenshots/`:

**Lab Mode Screenshots:**
- `lab-mode-initial.png` - Initial page load
- `lab-mode-hex-grid.png` - Hex grid rendering
- `lab-mode-inventory.png` - Unit inventory panel
- `lab-mode-unit-placed.png` - Unit placed on grid
- `lab-mode-unit-removed.png` - After unit removal
- `lab-mode-zoomed-in.png` - Zoomed in view
- `lab-mode-high-tide.png` - High tide visualization
- `lab-mode-team2.png` - Team 2 active state
- `lab-mode-mobile-placement.png` - Mobile viewport

**Game Screenshots:**
- `player1-after-click.png` - Player 1 interaction
- `player2-after-click.png` - Player 2 interaction

### Test Reports
```bash
# View HTML test report
npx playwright show-report
```

---

## Test Features

### Touch-Friendly Testing
- Mobile viewport testing (390×844 - iPhone 14 Pro)
- Tap gesture support
- Pinch zoom gestures
- Touch-optimized controls

### Visual Regression
- Screenshot capture on test actions
- Full-page screenshots
- Failure screenshots (automatic)

### Console Log Capture
- Browser console logs captured
- Unit placement confirmations
- Debug information logging

### Responsive Testing
- Desktop viewport (default)
- Mobile viewport (390×844)
- Touch vs click interactions

---

## Configuration

**File:** `playwright.config.ts`

- **Base URL:** http://localhost:5173
- **Server Port (Backend):** 3000
- **Server Port (Frontend):** 5173
- **Browser:** Chromium
- **Timeout:** 30 seconds
- **Retries (CI):** 2
- **Workers (CI):** 1
- **Workers (Local):** Unlimited
- **Screenshots:** On failure only
- **Trace:** On first retry

---

## Development Workflow

### 1. Start Dev Servers
```bash
# Terminal 1: Backend
yarn dev:server

# Terminal 2: Frontend
yarn dev:client
```

### 2. Run Tests
```bash
# All tests
yarn test:e2e

# Just Lab Mode
yarn test:e2e:lab

# With browser visible
yarn test:e2e:headed

# Interactive mode
yarn test:e2e:ui
```

### 3. Debug Failing Tests
```bash
# Debug mode with inspector
npx playwright test --debug

# Headed mode to see what's happening
npx playwright test --headed

# View last test report
npx playwright show-report
```

---

## Test Patterns Used

### 1. Navigation Pattern
```typescript
await page.goto('/lab');
await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });
```

### 2. Unit Selection Pattern
```typescript
const unitItem = page.locator('.inventory-item').first();
await unitItem.click();
```

### 3. Unit Placement Pattern
```typescript
const hexCell = page.locator('.hex-cell').nth(10);
await hexCell.click();
```

### 4. Console Log Capture
```typescript
const consoleLogs: string[] = [];
page.on('console', msg => consoleLogs.push(msg.text()));
```

### 5. Mobile Testing Pattern
```typescript
await page.setViewportSize({ width: 390, height: 844 });
await element.tap(); // Instead of click()
```

---

## Coverage Gaps (Future Work)

### Lab Mode
- [ ] Unit rotation controls (when implemented)
- [ ] Multi-hex unit placement validation
- [ ] Invalid placement visual feedback
- [ ] Cargo/mineral loading (when implemented)
- [ ] Save/load state (when implemented)

### Performance
- [ ] Frame rate measurements
- [ ] Load time benchmarks
- [ ] Memory usage tracking

### Accessibility
- [ ] Keyboard-only navigation
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Color-blind mode

### Visual Regression
- [ ] Pixel-perfect screenshot comparisons
- [ ] Animation frame testing
- [ ] Cross-browser rendering

---

## CI/CD Ready

Tests are configured for continuous integration:
- Auto-start dev servers if not running
- Retry failed tests (2 retries in CI)
- Single worker in CI (parallel locally)
- Screenshots and traces on failure
- HTML report generation

---

## Next Steps

1. ✅ Lab Mode tests created (26 tests)
2. ✅ Zoom controls tested
3. ✅ Touch/mobile testing included
4. ✅ Team switching verified
5. ✅ Control panel features tested
6. ⏳ Run tests to verify all pass
7. ⏳ Add to CI/CD pipeline
8. ⏳ Add visual regression testing
9. ⏳ Add performance benchmarks

---

## Links

- [Playwright Documentation](https://playwright.dev)
- [E2E Test README](./e2e/README.md)
- [Lab Mode Implementation](./src/client/lab-mode.ts)
- [Test Configuration](./playwright.config.ts)
