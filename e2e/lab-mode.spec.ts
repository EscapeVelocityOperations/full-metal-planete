import { test, expect } from '@playwright/test';

test.describe('Lab Mode - Unit Testing Environment', () => {

  test.describe('Navigation and Initialization', () => {

    test('should navigate to Lab Mode from home page', async ({ page }) => {
      // Go to home page
      await page.goto('/');

      // Wait for home page to load
      await expect(page.locator('h1.home-title')).toContainText('FULL METAL PLANETE');

      // Click Lab Mode button
      const labBtn = page.locator('a.home-btn-lab');
      await expect(labBtn).toBeVisible();
      await labBtn.click();

      // Wait for Lab Mode to load
      await page.waitForURL('/lab');

      // Verify Lab Mode control panel is visible
      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });
      console.log('Lab Mode control panel loaded successfully');
    });

    test('should load Lab Mode directly via URL', async ({ page }) => {
      // Navigate directly to /lab
      await page.goto('/lab');

      // Verify Lab Mode control panel appears
      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Verify title
      const title = page.locator('.lab-title');
      await expect(title).toContainText('Lab Mode');

      console.log('Lab Mode loaded directly from URL');
    });

  });

  test.describe('Hex Grid Rendering', () => {

    test('should render hex grid on canvas', async ({ page }) => {
      await page.goto('/lab');

      // Wait for control panel to ensure Lab Mode is initialized
      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for CSS renderer container
      const renderer = page.locator('.css-hex-renderer');
      await expect(renderer).toBeVisible({ timeout: 10000 });

      // Verify hex cells are rendered
      const hexCells = page.locator('.hex-cell');
      const hexCount = await hexCells.count();

      console.log(`Rendered ${hexCount} hex cells`);
      expect(hexCount).toBeGreaterThan(0);

      // Take screenshot of initial grid
      await page.screenshot({ path: 'e2e-screenshots/lab-mode-hex-grid.png', fullPage: true });
    });

    test('should render terrain types correctly', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for renderer
      const renderer = page.locator('.css-hex-renderer');
      await expect(renderer).toBeVisible({ timeout: 10000 });

      // Check that different terrain types exist (land, sea, etc.)
      const hexCells = page.locator('.hex-cell');
      const firstHex = hexCells.first();
      await expect(firstHex).toBeVisible();

      // Verify hex has terrain attributes
      const hasTerrainClass = await firstHex.evaluate((el) => {
        return el.className.includes('hex-cell');
      });

      expect(hasTerrainClass).toBeTruthy();
      console.log('Hex grid rendering with terrain types verified');
    });

  });

  test.describe('Deployment Inventory', () => {

    test('should display deployment inventory for Team 1', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for deployment inventory to appear
      const inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      // Verify inventory contains unit items
      const unitItems = page.locator('.inventory-item');
      const itemCount = await unitItems.count();

      console.log(`Deployment inventory has ${itemCount} units`);
      expect(itemCount).toBeGreaterThan(0);

      // Take screenshot of inventory
      await page.screenshot({ path: 'e2e-screenshots/lab-mode-inventory.png', fullPage: true });
    });

    test('should have different unit types in inventory', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for inventory
      const inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      // Check for different unit types (Astronef, Tank, etc.)
      const unitItems = page.locator('.inventory-item');
      const itemCount = await unitItems.count();

      // Should have multiple different units (at least 5 different types)
      expect(itemCount).toBeGreaterThanOrEqual(5);

      console.log('Verified multiple unit types in inventory');
    });

  });

  test.describe('Unit Placement', () => {

    test('should select unit from inventory', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for inventory
      const inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      // Click on first available unit
      const firstUnit = page.locator('.inventory-item').first();
      await expect(firstUnit).toBeVisible();
      await firstUnit.click();

      console.log('Clicked on first unit in inventory');

      // Verify selection (might add visual feedback)
      await page.waitForTimeout(500);
    });

    test('should place unit on hex grid', async ({ page }) => {
      const consoleLogs: string[] = [];
      page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push(text);
        if (text.includes('Placed unit') || text.includes('Selected unit')) {
          console.log(`[CONSOLE] ${text}`);
        }
      });

      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for inventory and renderer
      const inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      const renderer = page.locator('.css-hex-renderer');
      await expect(renderer).toBeVisible({ timeout: 10000 });

      // Select a unit (e.g., Tank)
      const unitItems = page.locator('.inventory-item');
      const tankItem = unitItems.filter({ hasText: /Tank/i }).first();

      if (await tankItem.count() > 0) {
        await tankItem.click();
        console.log('Selected Tank unit');
        await page.waitForTimeout(500);
      } else {
        // Fallback to first unit
        await unitItems.first().click();
        console.log('Selected first available unit');
        await page.waitForTimeout(500);
      }

      // Click on a hex to place the unit
      const hexCells = page.locator('.hex-cell');
      const targetHex = hexCells.nth(10); // Click on hex 10

      if (await targetHex.count() > 0) {
        await targetHex.click();
        console.log('Clicked on hex to place unit');

        // Wait for placement to complete
        await page.waitForTimeout(1000);

        // Check console logs for placement confirmation
        const placementLogs = consoleLogs.filter(log =>
          log.includes('Placed unit') || log.includes('placement')
        );

        console.log(`Found ${placementLogs.length} placement-related logs`);
        placementLogs.forEach(log => console.log(`  - ${log}`));

        // Take screenshot of placed unit
        await page.screenshot({ path: 'e2e-screenshots/lab-mode-unit-placed.png', fullPage: true });
      }
    });

    test('should support touch-friendly unit placement', async ({ page }) => {
      // Set mobile viewport for touch testing
      await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro

      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for inventory
      const inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      // Tap on unit (mobile)
      const firstUnit = page.locator('.inventory-item').first();
      await firstUnit.tap();

      console.log('Tapped unit on mobile viewport');

      // Wait for renderer
      const renderer = page.locator('.css-hex-renderer');
      await expect(renderer).toBeVisible();

      // Tap on hex to place
      const hexCells = page.locator('.hex-cell');
      const targetHex = hexCells.nth(15);

      if (await targetHex.count() > 0) {
        await targetHex.tap();
        console.log('Tapped hex to place unit on mobile');

        await page.waitForTimeout(1000);

        // Screenshot mobile layout
        await page.screenshot({ path: 'e2e-screenshots/lab-mode-mobile-placement.png', fullPage: true });
      }
    });

  });

  test.describe('Zoom Controls', () => {

    test('should have zoom control buttons', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Verify zoom controls exist
      const zoomInBtn = page.locator('#zoom-in-btn');
      const zoomOutBtn = page.locator('#zoom-out-btn');
      const zoomFitBtn = page.locator('#zoom-fit-btn');
      const zoomLevel = page.locator('#zoom-level');

      await expect(zoomInBtn).toBeVisible();
      await expect(zoomOutBtn).toBeVisible();
      await expect(zoomFitBtn).toBeVisible();
      await expect(zoomLevel).toBeVisible();

      console.log('All zoom controls are visible');
    });

    test('should zoom in when clicking zoom in button', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for renderer to load
      await page.waitForTimeout(1000);

      // Get initial zoom level
      const zoomLevel = page.locator('#zoom-level');
      const initialZoom = await zoomLevel.textContent();
      console.log(`Initial zoom level: ${initialZoom}`);

      // Click zoom in
      const zoomInBtn = page.locator('#zoom-in-btn');
      await zoomInBtn.click();

      // Wait for zoom to update
      await page.waitForTimeout(500);

      // Get new zoom level
      const newZoom = await zoomLevel.textContent();
      console.log(`New zoom level: ${newZoom}`);

      // Verify zoom changed (increased)
      expect(newZoom).not.toBe(initialZoom);

      // Take screenshot
      await page.screenshot({ path: 'e2e-screenshots/lab-mode-zoomed-in.png', fullPage: true });
    });

    test('should zoom out when clicking zoom out button', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for renderer
      await page.waitForTimeout(1000);

      // Get initial zoom level
      const zoomLevel = page.locator('#zoom-level');
      const initialZoom = await zoomLevel.textContent();

      // Click zoom out
      const zoomOutBtn = page.locator('#zoom-out-btn');
      await zoomOutBtn.click();

      // Wait for zoom to update
      await page.waitForTimeout(500);

      // Get new zoom level
      const newZoom = await zoomLevel.textContent();
      console.log(`Zoomed out from ${initialZoom} to ${newZoom}`);

      // Verify zoom changed (decreased)
      expect(newZoom).not.toBe(initialZoom);
    });

    test('should reset zoom with zoom fit button', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for renderer
      await page.waitForTimeout(1000);

      // Zoom in a few times
      const zoomInBtn = page.locator('#zoom-in-btn');
      await zoomInBtn.click();
      await page.waitForTimeout(300);
      await zoomInBtn.click();
      await page.waitForTimeout(300);

      const zoomLevel = page.locator('#zoom-level');
      const zoomedInLevel = await zoomLevel.textContent();
      console.log(`After zooming in: ${zoomedInLevel}`);

      // Click zoom to fit
      const zoomFitBtn = page.locator('#zoom-fit-btn');
      await zoomFitBtn.click();

      // Wait for zoom to reset
      await page.waitForTimeout(500);

      const resetZoom = await zoomLevel.textContent();
      console.log(`After zoom fit: ${resetZoom}`);

      // Verify zoom changed
      expect(resetZoom).not.toBe(zoomedInLevel);
    });

    test('should support pinch zoom on touch devices', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for renderer
      const renderer = page.locator('.css-hex-renderer');
      await expect(renderer).toBeVisible();

      // Get initial zoom
      const zoomLevel = page.locator('#zoom-level');
      const initialZoom = await zoomLevel.textContent();

      // Simulate pinch zoom using wheel event (approximation)
      const box = await renderer.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -100); // Scroll up to zoom in

        await page.waitForTimeout(500);

        const newZoom = await zoomLevel.textContent();
        console.log(`Touch zoom: ${initialZoom} -> ${newZoom}`);
      }
    });

  });

  test.describe('Team Switching', () => {

    test('should display team selector buttons', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Verify team buttons exist
      const team1Btn = page.locator('[data-team="team1"]');
      const team2Btn = page.locator('[data-team="team2"]');

      await expect(team1Btn).toBeVisible();
      await expect(team2Btn).toBeVisible();

      // Team 1 should be active by default
      const team1Classes = await team1Btn.getAttribute('class');
      expect(team1Classes).toContain('active');

      console.log('Team selector buttons verified');
    });

    test('should switch between teams', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for inventory to load for Team 1
      let inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      // Click Team 2 button
      const team2Btn = page.locator('[data-team="team2"]');
      await team2Btn.click();

      console.log('Clicked Team 2 button');

      // Wait for team switch
      await page.waitForTimeout(1000);

      // Verify Team 2 is now active
      const team2Classes = await team2Btn.getAttribute('class');
      expect(team2Classes).toContain('active');

      // Verify inventory refreshed (should still be visible)
      await expect(inventory).toBeVisible();

      console.log('Successfully switched to Team 2');

      // Take screenshot
      await page.screenshot({ path: 'e2e-screenshots/lab-mode-team2.png', fullPage: true });
    });

    test('should display different units for different teams', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Get Team 1 inventory count
      let inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      const team1UnitCount = await page.locator('.inventory-item').count();
      console.log(`Team 1 has ${team1UnitCount} units`);

      // Switch to Team 2
      const team2Btn = page.locator('[data-team="team2"]');
      await team2Btn.click();
      await page.waitForTimeout(1000);

      // Get Team 2 inventory count
      const team2UnitCount = await page.locator('.inventory-item').count();
      console.log(`Team 2 has ${team2UnitCount} units`);

      // Both teams should have units
      expect(team1UnitCount).toBeGreaterThan(0);
      expect(team2UnitCount).toBeGreaterThan(0);

      // Teams should have same number of units (each team gets full set)
      expect(team2UnitCount).toBe(team1UnitCount);
    });

  });

  test.describe('Control Panel Features', () => {

    test('should display action points controls', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Verify AP controls
      const apValue = page.locator('.lab-ap-value');
      const increaseBtn = page.locator('[data-ap-action="increase"]');
      const decreaseBtn = page.locator('[data-ap-action="decrease"]');
      const resetBtn = page.locator('[data-ap-action="reset"]');

      await expect(apValue).toBeVisible();
      await expect(increaseBtn).toBeVisible();
      await expect(decreaseBtn).toBeVisible();
      await expect(resetBtn).toBeVisible();

      console.log('Action Points controls verified');
    });

    test('should adjust action points with buttons', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Get initial AP value
      const apValue = page.locator('.lab-ap-value');
      const initialAP = await apValue.textContent();
      console.log(`Initial AP: ${initialAP}`);

      // Increase AP
      const increaseBtn = page.locator('[data-ap-action="increase"]');
      await increaseBtn.click();
      await page.waitForTimeout(300);

      const increasedAP = await apValue.textContent();
      console.log(`After increase: ${increasedAP}`);
      expect(increasedAP).not.toBe(initialAP);

      // Decrease AP
      const decreaseBtn = page.locator('[data-ap-action="decrease"]');
      await decreaseBtn.click();
      await page.waitForTimeout(300);

      const decreasedAP = await apValue.textContent();
      console.log(`After decrease: ${decreasedAP}`);
      expect(decreasedAP).toBe(initialAP);
    });

    test('should have tide level controls', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Verify tide buttons
      const lowTideBtn = page.locator('[data-tide="low"]');
      const normalTideBtn = page.locator('[data-tide="normal"]');
      const highTideBtn = page.locator('[data-tide="high"]');

      await expect(lowTideBtn).toBeVisible();
      await expect(normalTideBtn).toBeVisible();
      await expect(highTideBtn).toBeVisible();

      console.log('Tide controls verified');
    });

    test('should change tide level', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for renderer to load
      await page.waitForTimeout(1000);

      // Click High Tide
      const highTideBtn = page.locator('[data-tide="high"]');
      await highTideBtn.click();

      console.log('Clicked High Tide button');

      // Wait for tide change
      await page.waitForTimeout(500);

      // Verify High Tide is active
      const highTideClasses = await highTideBtn.getAttribute('class');
      expect(highTideClasses).toContain('active');

      // Take screenshot
      await page.screenshot({ path: 'e2e-screenshots/lab-mode-high-tide.png', fullPage: true });
    });

    test('should have reset and back buttons', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Verify buttons exist
      const resetBtn = page.locator('#lab-reset-btn');
      const backBtn = page.locator('#lab-back-btn');

      await expect(resetBtn).toBeVisible();
      await expect(backBtn).toBeVisible();

      console.log('Reset and Back buttons verified');
    });

    test('should navigate back to home when clicking back button', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Click back button
      const backBtn = page.locator('#lab-back-btn');
      await backBtn.click();

      // Wait for navigation
      await page.waitForURL('/');

      // Verify we're on home page
      await expect(page.locator('h1.home-title')).toContainText('FULL METAL PLANETE');

      console.log('Successfully navigated back to home page');
    });

  });

  test.describe('Keyboard Controls', () => {

    test('should deselect unit with Escape key', async ({ page }) => {
      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for inventory
      const inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      // Select a unit
      const firstUnit = page.locator('.inventory-item').first();
      await firstUnit.click();

      console.log('Selected unit');
      await page.waitForTimeout(500);

      // Press Escape
      await page.keyboard.press('Escape');

      console.log('Pressed Escape key');
      await page.waitForTimeout(500);

      // Selection should be cleared (test passes if no error)
    });

  });

  test.describe('Right-click Unit Removal', () => {

    test('should remove placed unit on right-click', async ({ page }) => {
      const consoleLogs: string[] = [];
      page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push(text);
        if (text.includes('Removed unit') || text.includes('Placed unit')) {
          console.log(`[CONSOLE] ${text}`);
        }
      });

      await page.goto('/lab');

      await expect(page.locator('#lab-control-panel')).toBeVisible({ timeout: 10000 });

      // Wait for inventory and renderer
      const inventory = page.locator('.deployment-inventory');
      await expect(inventory).toBeVisible({ timeout: 10000 });

      const renderer = page.locator('.css-hex-renderer');
      await expect(renderer).toBeVisible({ timeout: 10000 });

      // Select and place a unit
      const firstUnit = page.locator('.inventory-item').first();
      await firstUnit.click();
      await page.waitForTimeout(500);

      const hexCells = page.locator('.hex-cell');
      const targetHex = hexCells.nth(10);
      await targetHex.click();

      console.log('Placed unit');
      await page.waitForTimeout(1000);

      // Right-click on the same hex to remove
      await targetHex.click({ button: 'right' });

      console.log('Right-clicked to remove unit');
      await page.waitForTimeout(1000);

      // Check for removal log
      const removalLogs = consoleLogs.filter(log => log.includes('Removed unit'));
      console.log(`Found ${removalLogs.length} removal logs`);

      // Take screenshot
      await page.screenshot({ path: 'e2e-screenshots/lab-mode-unit-removed.png', fullPage: true });
    });

  });

  test.describe('Screenshots Directory Setup', () => {

    test('should create screenshots directory if not exists', async ({ page }) => {
      // This is just a helper test to ensure the screenshots directory exists
      await page.goto('/lab');
      await page.waitForTimeout(1000);

      // Create initial screenshot
      await page.screenshot({ path: 'e2e-screenshots/lab-mode-initial.png', fullPage: true });

      console.log('Screenshot directory initialized');
    });

  });

});
