import { test, expect } from '@playwright/test';

test.describe('Full Metal Planète - Game Flow', () => {

  test.describe('Game Creation and Join', () => {

    test('should create a new game via API', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/games', {
        data: { playerName: 'TestPlayer1' }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('gameId');
      expect(data).toHaveProperty('playerId');
      expect(data).toHaveProperty('playerToken');
      expect(data).toHaveProperty('joinUrl');
      expect(data.gameId).toMatch(/^[a-zA-Z0-9]+$/);  // alphanumeric (nanoid)
      expect(data.joinUrl).toContain('gameId=');
      expect(data.joinUrl).toContain('playerId=');
      expect(data.joinUrl).toContain('token=');
    });

    test('should join an existing game', async ({ request }) => {
      // Create game first
      const createResponse = await request.post('http://localhost:3000/api/games', {
        data: { playerName: 'Host' }
      });
      const { gameId } = await createResponse.json();

      // Join the game
      const joinResponse = await request.post(`http://localhost:3000/api/games/${gameId}/join`, {
        data: { playerName: 'Guest' }
      });

      expect(joinResponse.ok()).toBeTruthy();
      const joinData = await joinResponse.json();

      expect(joinData.gameId).toBe(gameId);
      expect(joinData.players).toHaveLength(2);
    });

    test('should get game status', async ({ request }) => {
      // Create game
      const createResponse = await request.post('http://localhost:3000/api/games', {
        data: { playerName: 'StatusTest' }
      });
      const { gameId, playerToken } = await createResponse.json();

      // Get status
      const statusResponse = await request.get(`http://localhost:3000/api/games/${gameId}`, {
        headers: { 'Authorization': `Bearer ${playerToken}` }
      });

      expect(statusResponse.ok()).toBeTruthy();
      const status = await statusResponse.json();

      expect(status.gameId).toBe(gameId);
      expect(status.state).toBe('waiting');
      expect(status.players).toHaveLength(1);
    });

    test('should reject joining non-existent game', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/games/nonexistent123/join', {
        data: { playerName: 'Ghost' }
      });

      expect(response.status()).toBe(404);
    });
  });

  test.describe('Client UI', () => {

    test('should load client without game params', async ({ page }) => {
      await page.goto('/');

      // Should show home page with game creation options
      await expect(page.locator('h1')).toContainText('FULL METAL PLANETE');
    });

    test('should display game renderer when joining', async ({ page, request }) => {
      // Create game via API
      const createResponse = await request.post('http://localhost:3000/api/games', {
        data: { playerName: 'E2EPlayer' }
      });
      const { gameId, playerId, playerToken } = await createResponse.json();

      // Navigate to client with game params
      await page.goto(`/?gameId=${gameId}&playerId=${playerId}&token=${playerToken}`);

      // Wait for CSS renderer container to be visible (CSS renderer hides canvas)
      const renderer = page.locator('.css-hex-renderer');
      await expect(renderer).toBeVisible({ timeout: 10000 });
    });

    test('should display HUD elements', async ({ page, request }) => {
      // Create and join game
      const createResponse = await request.post('http://localhost:3000/api/games', {
        data: { playerName: 'HUDTest' }
      });
      const { gameId, playerId, playerToken } = await createResponse.json();

      await page.goto(`/?gameId=${gameId}&playerId=${playerId}&token=${playerToken}`);

      // Wait for HUD to appear
      await page.waitForSelector('#hud', { timeout: 10000 });

      // Check HUD elements (IDs from index.html)
      await expect(page.locator('#ap-value')).toBeVisible();
      await expect(page.locator('#turn-value')).toBeVisible();
      await expect(page.locator('#tide-value')).toBeVisible();
    });
  });

  test.describe('WebSocket Communication', () => {

    test('should connect to WebSocket and show game UI', async ({ page, request }) => {
      // Create game
      const createResponse = await request.post('http://localhost:3000/api/games', {
        data: { playerName: 'WSTest' }
      });
      const { gameId, playerId, playerToken } = await createResponse.json();

      await page.goto(`/?gameId=${gameId}&playerId=${playerId}&token=${playerToken}`);

      // Wait for CSS renderer and HUD (indicates successful load and WS connection)
      await page.waitForSelector('.css-hex-renderer', { timeout: 10000 });
      await page.waitForSelector('#hud', { timeout: 10000 });

      // Verify HUD is visible (connection established)
      await expect(page.locator('#ap-value')).toBeVisible();
    });
  });

  test.describe('Two Player Game Flow', () => {

    test('should allow two players to join and see each other', async ({ browser, request }) => {
      // Create game
      const createResponse = await request.post('http://localhost:3000/api/games', {
        data: { playerName: 'Player1' }
      });
      const game1 = await createResponse.json();

      // Player 2 joins
      const joinResponse = await request.post(`http://localhost:3000/api/games/${game1.gameId}/join`, {
        data: { playerName: 'Player2' }
      });
      const game2 = await joinResponse.json();

      // Open two browser contexts
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        // Both players join
        await page1.goto(`http://localhost:5173/?gameId=${game1.gameId}&playerId=${game1.playerId}&token=${game1.playerToken}`);
        await page2.goto(`http://localhost:5173/?gameId=${game2.gameId}&playerId=${game2.playerId}&token=${game2.playerToken}`);

        // Wait for both to load (CSS renderer hides canvas)
        await page1.waitForSelector('.css-hex-renderer', { timeout: 10000 });
        await page2.waitForSelector('.css-hex-renderer', { timeout: 10000 });

        // Both should see the game
        await expect(page1.locator('.css-hex-renderer')).toBeVisible();
        await expect(page2.locator('.css-hex-renderer')).toBeVisible();
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Health Check', () => {

    test('server should be healthy', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health');
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.status).toBe('ok');
    });
  });
});
