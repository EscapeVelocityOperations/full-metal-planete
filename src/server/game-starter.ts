/**
 * Game Starter - Handles initialization of game state when all players are ready
 */

import type { Player as ServerPlayer } from './types.js';
import { generateDemoMap } from '../shared/game/map-generator.js';
import { createInitialGameState } from '../shared/game/state.js';
import type { Player as GamePlayer, GameState, PlayerColor } from '../shared/game/types.js';

/**
 * Convert server Player type to game Player type
 * During the landing phase (Turn 1), astronef positions are empty
 */
function convertToGamePlayer(serverPlayer: ServerPlayer): GamePlayer {
  return {
    id: serverPlayer.id,
    name: serverPlayer.name,
    color: serverPlayer.color as PlayerColor,
    isConnected: serverPlayer.isConnected,
    isReady: serverPlayer.isReady,
    // These will be set during the landing phase
    astronefPosition: [],
    hasLiftedOff: false,
    capturedAstronefs: [],
  };
}

/**
 * Initialize a new game with all players
 * @param gameId - The game/room ID
 * @param serverPlayers - Array of server Player objects
 * @returns The initialized GameState
 */
export function initializeGame(gameId: string, serverPlayers: ServerPlayer[]): GameState {
  // Generate terrain (using demo map for now)
  const terrain = generateDemoMap();

  // Convert server players to game players
  const gamePlayers = serverPlayers.map(convertToGamePlayer);

  // Create the initial game state
  const gameState = createInitialGameState(gameId, gamePlayers, terrain);

  return gameState;
}
