/**
 * Client entry point for Full Metal Planète
 */

import { GameApp } from './app';

async function main() {
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
  const gameId = params.get('gameId');
  const playerId = params.get('playerId');
  const token = params.get('token');

  if (!gameId || !playerId || !token) {
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
      <h2>Missing Game Parameters</h2>
      <p>Please provide: gameId, playerId, and token</p>
      <p style="margin-top: 20px; font-size: 14px; opacity: 0.8;">
        Example: ?gameId=xxx&playerId=yyy&token=zzz
      </p>
    `;
    document.body.appendChild(errorMessage);
    return;
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

main().catch(console.error);
