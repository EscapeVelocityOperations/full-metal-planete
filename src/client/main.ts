/**
 * Client entry point for Full Metal Planète
 */

import { GameApp } from './app';
import { HomePage } from './ui/home-page';

/**
 * Determine which page to show based on URL
 */
function getRoute(): 'home' | 'game' {
  const params = new URLSearchParams(window.location.search);
  const hasGameParams = params.has('gameId') && params.has('playerId') && params.has('token');
  const isGamePath = window.location.pathname === '/game';

  return (hasGameParams || isGamePath) ? 'game' : 'home';
}

/**
 * Show the home page
 */
function showHomePage(): void {
  const homePage = document.getElementById('home-page');
  const gameContainer = document.getElementById('game-container');

  if (homePage) homePage.classList.remove('hidden');
  if (gameContainer) gameContainer.classList.add('hidden');

  new HomePage();
}

/**
 * Show the game page
 */
async function showGamePage(): Promise<void> {
  const homePage = document.getElementById('home-page');
  const gameContainer = document.getElementById('game-container');

  if (homePage) homePage.classList.add('hidden');
  if (gameContainer) gameContainer.classList.remove('hidden');

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('gameId')!;
  const playerId = params.get('playerId')!;
  const token = params.get('token')!;

  // Update game ID display in HUD
  const gameIdEl = document.getElementById('game-id-value');
  if (gameIdEl) {
    gameIdEl.textContent = gameId.toUpperCase();
  }

  try {
    const app = new GameApp(canvas, { gameId, playerId, token });
    await app.initialize();
    app.startRenderLoop();

    (window as any).gameApp = app;

    console.log('Full Metal Planète client started');
    console.log('Game ID:', gameId);
    console.log('Player ID:', playerId);
  } catch (error) {
    console.error('Failed to start game:', error);

    const errorMessage = document.createElement('div');
    errorMessage.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 30px;
      border-radius: 8px;
      font-size: 18px;
      text-align: center;
    `;
    errorMessage.innerHTML = `
      <h2>Failed to Start Game</h2>
      <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
    `;
    document.body.appendChild(errorMessage);
  }
}

async function main() {
  const route = getRoute();

  if (route === 'home') {
    showHomePage();
  } else {
    await showGamePage();
  }
}

main().catch(console.error);
