import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialGameState,
  createStartingForce,
  createTideDeck,
  shuffleArray,
  applyMoveAction,
  applyLoadAction,
  applyUnloadAction,
  applyFireAction,
  applyCaptureAction,
  applyEndTurnAction,
  calculateScore,
  advanceTurn,
  drawTideCard,
  rotateTurnOrder,
  isPlayersTurn,
  isTurnTimerExpired,
  getRemainingTurnTime,
  calculateInitialTurnOrder,
  handleTurnTimeout,
  validateLandAstronefAction,
  applyLandAstronefAction,
  validateDeployUnitAction,
  applyDeployUnitAction,
  haveAllPlayersLanded,
  hasPlayerDeployedAllUnits,
  haveAllPlayersDeployed,
  getUndeployedUnits,
  getAstronefHexes,
} from '../state';
import {
  TerrainType,
  TideLevel,
  UnitType,
  GamePhase,
  PlayerColor,
  GAME_CONSTANTS,
  UNIT_PROPERTIES,
  type Unit,
  type HexCoord,
  type GameState,
  type HexTerrain,
  type Player,
  type Mineral,
  type MoveAction,
  type LoadAction,
  type UnloadAction,
  type FireAction,
  type CaptureAction,
  type EndTurnAction,
  type LandAstronefAction,
  type DeployUnitAction,
} from '../types';

// Helper to create minimal unit for testing
function createUnit(
  id: string,
  type: UnitType,
  owner: string,
  position: HexCoord,
  overrides: Partial<Unit> = {}
): Unit {
  return {
    id,
    type,
    owner,
    position,
    shotsRemaining: 2,
    isStuck: false,
    isNeutralized: false,
    ...overrides,
  };
}

// Helper to create minimal player
function createPlayer(id: string, color: PlayerColor, astronefPosition: HexCoord[] = [{ q: 0, r: 0 }]): Player {
  return {
    id,
    name: `Player ${id}`,
    color,
    isConnected: true,
    isReady: true,
    astronefPosition,
    hasLiftedOff: false,
    capturedAstronefs: [],
  };
}

// Helper to create minimal game state
function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    turn: 5,
    phase: GamePhase.Playing,
    currentPlayer: 'p1',
    turnOrder: ['p1', 'p2'],
    turnStartTime: Date.now(),
    turnTimeLimit: 180000,
    actionPoints: 15,
    savedActionPoints: { p1: 0, p2: 0 },
    currentTide: TideLevel.Normal,
    tideDeck: [TideLevel.Normal, TideLevel.High, TideLevel.Low],
    tideDiscard: [],
    terrain: [],
    minerals: [],
    units: [],
    bridges: [],
    players: [
      createPlayer('p1', PlayerColor.Red),
      createPlayer('p2', PlayerColor.Blue),
    ],
    buildsThisTurn: [],
    liftOffDecisions: { p1: null, p2: null },
    ...overrides,
  };
}

describe('State Management', () => {
  describe('createTideDeck', () => {
    it('should create a deck with 15 cards total', () => {
      const deck = createTideDeck();
      expect(deck.length).toBe(GAME_CONSTANTS.TIDE_CARDS_TOTAL);
    });

    it('should have 5 of each tide level', () => {
      const deck = createTideDeck();
      const lowCount = deck.filter((t) => t === TideLevel.Low).length;
      const normalCount = deck.filter((t) => t === TideLevel.Normal).length;
      const highCount = deck.filter((t) => t === TideLevel.High).length;

      expect(lowCount).toBe(GAME_CONSTANTS.TIDE_CARDS_LOW);
      expect(normalCount).toBe(GAME_CONSTANTS.TIDE_CARDS_NORMAL);
      expect(highCount).toBe(GAME_CONSTANTS.TIDE_CARDS_HIGH);
    });
  });

  describe('shuffleArray', () => {
    it('should maintain array length', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray([...original]);
      expect(shuffled.length).toBe(original.length);
    });

    it('should contain all original elements', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray([...original]);
      for (const item of original) {
        expect(shuffled).toContain(item);
      }
    });
  });

  describe('createStartingForce', () => {
    it('should create correct number of units', () => {
      const force = createStartingForce('p1');

      // Count each type
      const counts = new Map<UnitType, number>();
      for (const unit of force) {
        counts.set(unit.type, (counts.get(unit.type) || 0) + 1);
      }

      expect(counts.get(UnitType.Barge)).toBe(GAME_CONSTANTS.STARTING_FORCE[UnitType.Barge]);
      expect(counts.get(UnitType.Crab)).toBe(GAME_CONSTANTS.STARTING_FORCE[UnitType.Crab]);
      expect(counts.get(UnitType.Converter)).toBe(GAME_CONSTANTS.STARTING_FORCE[UnitType.Converter]);
      expect(counts.get(UnitType.MotorBoat)).toBe(GAME_CONSTANTS.STARTING_FORCE[UnitType.MotorBoat]);
      expect(counts.get(UnitType.Tank)).toBe(GAME_CONSTANTS.STARTING_FORCE[UnitType.Tank]);
      expect(counts.get(UnitType.SuperTank)).toBe(GAME_CONSTANTS.STARTING_FORCE[UnitType.SuperTank]);
      expect(counts.get(UnitType.Bridge)).toBe(GAME_CONSTANTS.STARTING_FORCE[UnitType.Bridge]);
    });

    it('should assign all units to specified player', () => {
      const force = createStartingForce('p1');
      expect(force.every((u) => u.owner === 'p1')).toBe(true);
    });

    it('should give unique IDs to units', () => {
      const force = createStartingForce('p1');
      const ids = force.map((u) => u.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('createInitialGameState', () => {
    it('should create a valid initial state', () => {
      const players = [
        createPlayer('p1', PlayerColor.Red),
        createPlayer('p2', PlayerColor.Blue),
      ];
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
      ];

      const state = createInitialGameState('game-1', players, terrain);

      expect(state.gameId).toBe('game-1');
      expect(state.turn).toBe(1);
      expect(state.phase).toBe(GamePhase.Landing);
      expect(state.players.length).toBe(2);
    });

    it('should initialize tide deck with correct cards', () => {
      const players = [createPlayer('p1', PlayerColor.Red)];
      const terrain: HexTerrain[] = [];

      const state = createInitialGameState('game-1', players, terrain);

      // Active deck should have 9 cards
      expect(state.tideDeck.length).toBe(GAME_CONSTANTS.TIDE_CARDS_ACTIVE);
      // Discard should have 6 cards
      expect(state.tideDiscard.length).toBe(GAME_CONSTANTS.TIDE_CARDS_DISCARDED);
    });

    it('should set initial tide to Normal', () => {
      const players = [createPlayer('p1', PlayerColor.Red)];
      const terrain: HexTerrain[] = [];

      const state = createInitialGameState('game-1', players, terrain);

      expect(state.currentTide).toBe(TideLevel.Normal);
    });

    it('should initialize saved AP to 0 for all players', () => {
      const players = [
        createPlayer('p1', PlayerColor.Red),
        createPlayer('p2', PlayerColor.Blue),
      ];
      const terrain: HexTerrain[] = [];

      const state = createInitialGameState('game-1', players, terrain);

      expect(state.savedActionPoints['p1']).toBe(0);
      expect(state.savedActionPoints['p2']).toBe(0);
    });

    it('should create units for each player', () => {
      const players = [
        createPlayer('p1', PlayerColor.Red),
        createPlayer('p2', PlayerColor.Blue),
      ];
      const terrain: HexTerrain[] = [];

      const state = createInitialGameState('game-1', players, terrain);

      const p1Units = state.units.filter((u) => u.owner === 'p1');
      const p2Units = state.units.filter((u) => u.owner === 'p2');

      expect(p1Units.length).toBeGreaterThan(0);
      expect(p2Units.length).toBeGreaterThan(0);
    });
  });

  describe('drawTideCard', () => {
    it('should draw from deck and add to discard', () => {
      const state = createGameState({
        tideDeck: [TideLevel.High, TideLevel.Low, TideLevel.Normal],
        tideDiscard: [],
      });

      const newState = drawTideCard(state);

      expect(newState.tideDeck.length).toBe(2);
      expect(newState.tideDiscard.length).toBe(1);
      expect(newState.currentTide).toBe(TideLevel.High);
    });

    it('should reshuffle when deck is empty', () => {
      const state = createGameState({
        tideDeck: [],
        tideDiscard: [TideLevel.High, TideLevel.Low, TideLevel.Normal],
      });

      const newState = drawTideCard(state);

      // Should have drawn 1 card from reshuffled deck
      expect(newState.tideDeck.length).toBe(2);
      expect(newState.tideDiscard.length).toBe(1);
    });
  });

  describe('advanceTurn', () => {
    it('should move to next player', () => {
      const state = createGameState({
        currentPlayer: 'p1',
        turnOrder: ['p1', 'p2'],
        turn: 5,
      });

      const newState = advanceTurn(state);

      expect(newState.currentPlayer).toBe('p2');
      expect(newState.turn).toBe(5); // Same turn, different player
    });

    it('should increment turn and rotate order when last player finishes', () => {
      const state = createGameState({
        currentPlayer: 'p2',
        turnOrder: ['p1', 'p2'],
        turn: 5,
      });

      const newState = advanceTurn(state);

      // Turn order rotates: p1 was first, now goes last; p2 becomes first
      expect(newState.currentPlayer).toBe('p2');
      expect(newState.turnOrder).toEqual(['p2', 'p1']);
      expect(newState.turn).toBe(6);
    });

    it('should reset shots for next players combat units on turn advance', () => {
      // Tank owned by p2 (who will play next)
      const tank = createUnit('tank-1', UnitType.Tank, 'p2', { q: 0, r: 0 }, { shotsRemaining: 0 });
      const state = createGameState({
        units: [tank],
        currentPlayer: 'p1',
        turnOrder: ['p1', 'p2'],
      });

      const newState = advanceTurn(state);

      // P2's tank should have shots reset since it's now p2's turn
      const updatedTank = newState.units.find((u) => u.id === 'tank-1');
      expect(updatedTank?.shotsRemaining).toBe(GAME_CONSTANTS.SHOTS_PER_UNIT_PER_TURN);
    });

    it('should set correct AP for turn 3', () => {
      const state = createGameState({
        currentPlayer: 'p2',
        turnOrder: ['p1', 'p2'],
        turn: 2,
        phase: GamePhase.Deployment,
      });

      const newState = advanceTurn(state);

      expect(newState.turn).toBe(3);
      expect(newState.phase).toBe(GamePhase.Playing);
      expect(newState.actionPoints).toBe(GAME_CONSTANTS.TURN_3_AP);
    });

    it('should set correct AP for turn 4', () => {
      const state = createGameState({
        currentPlayer: 'p2',
        turnOrder: ['p1', 'p2'],
        turn: 3,
      });

      const newState = advanceTurn(state);

      expect(newState.turn).toBe(4);
      expect(newState.actionPoints).toBe(GAME_CONSTANTS.TURN_4_AP);
    });

    it('should draw new tide card on turn start', () => {
      const state = createGameState({
        currentPlayer: 'p2',
        turnOrder: ['p1', 'p2'],
        turn: 5,
        tideDeck: [TideLevel.High, TideLevel.Low],
        tideDiscard: [],
      });

      const newState = advanceTurn(state);

      // Tide should have been drawn
      expect(newState.tideDeck.length).toBe(1);
      expect(newState.tideDiscard.length).toBe(1);
    });

    it('should rotate turn order on new round', () => {
      const state = createGameState({
        currentPlayer: 'p3', // Last player in turn order
        turnOrder: ['p1', 'p2', 'p3'],
        turn: 5,
      });

      const newState = advanceTurn(state);

      // New round: turn order should rotate, p1 goes last
      expect(newState.turn).toBe(6);
      expect(newState.turnOrder).toEqual(['p2', 'p3', 'p1']);
      expect(newState.currentPlayer).toBe('p2');
    });

    it('should only reset shots for next player units', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { shotsRemaining: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p2', { q: 1, r: 0 }, { shotsRemaining: 0 });
      const state = createGameState({
        units: [tank1, tank2],
        currentPlayer: 'p1',
        turnOrder: ['p1', 'p2'],
      });

      const newState = advanceTurn(state);

      // Only p2's tank should have shots reset (it's now p2's turn)
      const updatedTank1 = newState.units.find((u) => u.id === 'tank-1');
      const updatedTank2 = newState.units.find((u) => u.id === 'tank-2');
      expect(updatedTank1?.shotsRemaining).toBe(0); // p1's tank unchanged
      expect(updatedTank2?.shotsRemaining).toBe(GAME_CONSTANTS.SHOTS_PER_UNIT_PER_TURN); // p2's tank reset
    });
  });

  describe('rotateTurnOrder', () => {
    it('should move first player to end', () => {
      expect(rotateTurnOrder(['p1', 'p2', 'p3'])).toEqual(['p2', 'p3', 'p1']);
    });

    it('should handle two players', () => {
      expect(rotateTurnOrder(['p1', 'p2'])).toEqual(['p2', 'p1']);
    });

    it('should return same array for single player', () => {
      expect(rotateTurnOrder(['p1'])).toEqual(['p1']);
    });

    it('should return empty array for empty input', () => {
      expect(rotateTurnOrder([])).toEqual([]);
    });
  });

  describe('isPlayersTurn', () => {
    it('should return true when it is the players turn', () => {
      const state = createGameState({ currentPlayer: 'p1' });
      expect(isPlayersTurn(state, 'p1')).toBe(true);
    });

    it('should return false when it is not the players turn', () => {
      const state = createGameState({ currentPlayer: 'p2' });
      expect(isPlayersTurn(state, 'p1')).toBe(false);
    });
  });

  describe('isTurnTimerExpired', () => {
    it('should return false when timer has not expired', () => {
      const state = createGameState({
        turnStartTime: Date.now(),
        turnTimeLimit: 180000,
      });
      expect(isTurnTimerExpired(state)).toBe(false);
    });

    it('should return true when timer has expired', () => {
      const state = createGameState({
        turnStartTime: Date.now() - 200000, // 200 seconds ago
        turnTimeLimit: 180000, // 180 second limit
      });
      expect(isTurnTimerExpired(state)).toBe(true);
    });
  });

  describe('getRemainingTurnTime', () => {
    it('should return remaining time in milliseconds', () => {
      const now = Date.now();
      const state = createGameState({
        turnStartTime: now - 60000, // Started 60 seconds ago
        turnTimeLimit: 180000, // 3 minute limit
      });
      const remaining = getRemainingTurnTime(state);
      // Should be approximately 120000ms (120 seconds remaining)
      expect(remaining).toBeGreaterThan(119000);
      expect(remaining).toBeLessThanOrEqual(120000);
    });

    it('should return 0 when timer has expired', () => {
      const state = createGameState({
        turnStartTime: Date.now() - 200000,
        turnTimeLimit: 180000,
      });
      expect(getRemainingTurnTime(state)).toBe(0);
    });
  });

  describe('calculateInitialTurnOrder', () => {
    it('should sort players by astronef position - furthest from cliffs first', () => {
      const players: Player[] = [
        createPlayer('p1', PlayerColor.Red, [{ q: 10, r: 5 }]),
        createPlayer('p2', PlayerColor.Blue, [{ q: 30, r: 5 }]),
        createPlayer('p3', PlayerColor.Green, [{ q: 20, r: 5 }]),
      ];

      const order = calculateInitialTurnOrder(players);

      // p2 is furthest from left (q=30), then p3 (q=20), then p1 (q=10)
      expect(order).toEqual(['p2', 'p3', 'p1']);
    });

    it('should handle single player', () => {
      const players: Player[] = [createPlayer('p1', PlayerColor.Red, [{ q: 10, r: 5 }])];

      expect(calculateInitialTurnOrder(players)).toEqual(['p1']);
    });
  });

  describe('handleTurnTimeout', () => {
    it('should advance turn with no AP saved', () => {
      const state = createGameState({
        currentPlayer: 'p1',
        turnOrder: ['p1', 'p2'],
        actionPoints: 10,
        savedActionPoints: { p1: 0, p2: 0 },
        turn: 5,
      });

      const newState = handleTurnTimeout(state);

      // Should advance to next player
      expect(newState.currentPlayer).toBe('p2');
      // Original player should not have saved any AP (timeout = no saving)
      expect(newState.savedActionPoints['p1']).toBe(0);
    });
  });

  describe('applyMoveAction', () => {
    it('should update unit position', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: 0 }, type: TerrainType.Land },
      ];
      const state = createGameState({
        units: [tank],
        terrain,
        actionPoints: 10,
      });

      const action: MoveAction = {
        type: 'MOVE',
        playerId: 'p1',
        timestamp: Date.now(),
        unitId: 'tank-1',
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
        apCost: 2,
      };

      const newState = applyMoveAction(state, action);

      const movedTank = newState.units.find((u) => u.id === 'tank-1');
      expect(movedTank?.position).toEqual({ q: 2, r: 0 });
      expect(newState.actionPoints).toBe(8);
    });
  });

  describe('applyLoadAction', () => {
    it('should add cargo to transporter', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const mineral: Mineral = { id: 'mineral-1', position: { q: 1, r: 0 } };
      const state = createGameState({
        units: [crab],
        minerals: [mineral],
        actionPoints: 5,
      });

      const action: LoadAction = {
        type: 'LOAD',
        playerId: 'p1',
        timestamp: Date.now(),
        transporterId: 'crab-1',
        cargoId: 'mineral-1',
        apCost: 1,
      };

      const newState = applyLoadAction(state, action);

      const updatedCrab = newState.units.find((u) => u.id === 'crab-1');
      expect(updatedCrab?.cargo).toContain('mineral-1');
      expect(newState.actionPoints).toBe(4);
    });

    it('should remove mineral from board when loaded', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const mineral: Mineral = { id: 'mineral-1', position: { q: 1, r: 0 } };
      const state = createGameState({
        units: [crab],
        minerals: [mineral],
        actionPoints: 5,
      });

      const action: LoadAction = {
        type: 'LOAD',
        playerId: 'p1',
        timestamp: Date.now(),
        transporterId: 'crab-1',
        cargoId: 'mineral-1',
        apCost: 1,
      };

      const newState = applyLoadAction(state, action);

      // Mineral should still exist but its position is null (loaded)
      const loadedMineral = newState.minerals.find((m) => m.id === 'mineral-1');
      expect(loadedMineral).toBeDefined();
    });
  });

  describe('applyUnloadAction', () => {
    it('should remove cargo from transporter', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const destination: HexCoord = { q: 1, r: 0 };
      const state = createGameState({
        units: [crab],
        minerals: [{ id: 'mineral-1', position: { q: -999, r: -999 } }], // loaded position
        actionPoints: 5,
      });

      const action: UnloadAction = {
        type: 'UNLOAD',
        playerId: 'p1',
        timestamp: Date.now(),
        transporterId: 'crab-1',
        cargoId: 'mineral-1',
        destination,
        apCost: 1,
      };

      const newState = applyUnloadAction(state, action);

      const updatedCrab = newState.units.find((u) => u.id === 'crab-1');
      expect(updatedCrab?.cargo).not.toContain('mineral-1');
      expect(newState.actionPoints).toBe(4);

      // Mineral should be at destination
      const mineral = newState.minerals.find((m) => m.id === 'mineral-1');
      expect(mineral?.position).toEqual(destination);
    });
  });

  describe('applyFireAction', () => {
    it('should destroy target unit', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const enemyTank = createUnit('enemy', UnitType.Tank, 'p2', { q: 1, r: 0 });
      const state = createGameState({
        units: [tank1, tank2, enemyTank],
        actionPoints: 5,
      });

      const action: FireAction = {
        type: 'FIRE',
        playerId: 'p1',
        timestamp: Date.now(),
        attackerIds: ['tank-1', 'tank-2'],
        targetHex: { q: 1, r: 0 },
        apCost: 2,
      };

      const newState = applyFireAction(state, action);

      const destroyedUnit = newState.units.find((u) => u.id === 'enemy');
      expect(destroyedUnit).toBeUndefined();
      expect(newState.actionPoints).toBe(3);
    });

    it('should decrement shots for attackers', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { shotsRemaining: 2 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { shotsRemaining: 2 });
      const enemyTank = createUnit('enemy', UnitType.Tank, 'p2', { q: 1, r: 0 });
      const state = createGameState({
        units: [tank1, tank2, enemyTank],
        actionPoints: 5,
      });

      const action: FireAction = {
        type: 'FIRE',
        playerId: 'p1',
        timestamp: Date.now(),
        attackerIds: ['tank-1', 'tank-2'],
        targetHex: { q: 1, r: 0 },
        apCost: 2,
      };

      const newState = applyFireAction(state, action);

      const updatedTank1 = newState.units.find((u) => u.id === 'tank-1');
      const updatedTank2 = newState.units.find((u) => u.id === 'tank-2');
      expect(updatedTank1?.shotsRemaining).toBe(1);
      expect(updatedTank2?.shotsRemaining).toBe(1);
    });
  });

  describe('applyCaptureAction', () => {
    it('should change unit ownership', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const enemyTank = createUnit('enemy', UnitType.Tank, 'p2', { q: 1, r: 0 });
      const state = createGameState({
        units: [tank1, tank2, enemyTank],
        actionPoints: 5,
      });

      const action: CaptureAction = {
        type: 'CAPTURE',
        playerId: 'p1',
        timestamp: Date.now(),
        attackerIds: ['tank-1', 'tank-2'],
        targetId: 'enemy',
        apCost: 1,
      };

      const newState = applyCaptureAction(state, action);

      const capturedUnit = newState.units.find((u) => u.id === 'enemy');
      expect(capturedUnit?.owner).toBe('p1');
      expect(newState.actionPoints).toBe(4);
    });

    it('should transfer cargo with captured transporter', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const enemyCrab = createUnit('enemy-crab', UnitType.Crab, 'p2', { q: 1, r: 0 }, {
        cargo: ['mineral-1'],
      });
      const state = createGameState({
        units: [tank1, tank2, enemyCrab],
        actionPoints: 5,
      });

      const action: CaptureAction = {
        type: 'CAPTURE',
        playerId: 'p1',
        timestamp: Date.now(),
        attackerIds: ['tank-1', 'tank-2'],
        targetId: 'enemy-crab',
        apCost: 1,
      };

      const newState = applyCaptureAction(state, action);

      const capturedCrab = newState.units.find((u) => u.id === 'enemy-crab');
      expect(capturedCrab?.owner).toBe('p1');
      expect(capturedCrab?.cargo).toContain('mineral-1');
    });
  });

  describe('applyEndTurnAction', () => {
    it('should save remaining AP', () => {
      const state = createGameState({
        actionPoints: 5,
        savedActionPoints: { p1: 3, p2: 0 },
        currentPlayer: 'p1',
      });

      const action: EndTurnAction = {
        type: 'END_TURN',
        playerId: 'p1',
        timestamp: Date.now(),
        savedAP: 5,
      };

      const newState = applyEndTurnAction(state, action);

      // 5 remaining + 3 saved = 8
      expect(newState.savedActionPoints['p1']).toBe(8);
    });

    it('should cap saved AP at 10', () => {
      const state = createGameState({
        actionPoints: 10,
        savedActionPoints: { p1: 8, p2: 0 },
        currentPlayer: 'p1',
      });

      const action: EndTurnAction = {
        type: 'END_TURN',
        playerId: 'p1',
        timestamp: Date.now(),
        savedAP: 10,
      };

      const newState = applyEndTurnAction(state, action);

      expect(newState.savedActionPoints['p1']).toBe(GAME_CONSTANTS.MAX_SAVED_AP);
    });
  });

  describe('calculateScore', () => {
    it('should return 0 if player has not lifted off', () => {
      const player = createPlayer('p1', PlayerColor.Red);
      player.hasLiftedOff = false;

      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [astronef],
        players: [player],
      });

      expect(calculateScore(state, 'p1')).toBe(0);
    });

    it('should count 2 points per mineral in astronef', () => {
      const player = createPlayer('p1', PlayerColor.Red);
      player.hasLiftedOff = true;

      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        cargo: ['mineral-1', 'mineral-2', 'mineral-3'],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [astronef],
        minerals: [
          { id: 'mineral-1', position: { q: 0, r: 0 } },
          { id: 'mineral-2', position: { q: 0, r: 0 } },
          { id: 'mineral-3', position: { q: 0, r: 0 } },
        ],
        players: [player],
      });

      // 3 minerals * 2 points + 3 intact turrets * 1 point = 9
      expect(calculateScore(state, 'p1')).toBe(9);
    });

    it('should count 1 point per equipment in astronef', () => {
      const player = createPlayer('p1', PlayerColor.Red);
      player.hasLiftedOff = true;

      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        cargo: ['tank-1', 'tank-2'],
        turrets: [
          { podeIndex: 0, isDestroyed: true },
          { podeIndex: 1, isDestroyed: true },
          { podeIndex: 2, isDestroyed: true },
        ],
      });

      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 0, r: 0 });

      const state = createGameState({
        units: [astronef, tank1, tank2],
        players: [player],
      });

      // 2 tanks * 1 point + 0 intact turrets = 2
      expect(calculateScore(state, 'p1')).toBe(2);
    });

    it('should count 1 point per intact turret', () => {
      const player = createPlayer('p1', PlayerColor.Red);
      player.hasLiftedOff = true;

      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        cargo: [],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: true },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [astronef],
        players: [player],
      });

      // 0 cargo + 2 intact turrets = 2
      expect(calculateScore(state, 'p1')).toBe(2);
    });
  });
});

// Import additional state functions for extended tests
import {
  applyBuildAction,
  getTerrainAt,
  getUnitAt,
  getMineralAt,
  isGameFinished,
  getWinners,
  calculateAllScores,
  createAstronef,
  createTowers,
} from '../state';
import type { BuildAction } from '../types';

describe('State Helpers', () => {
  describe('getTerrainAt', () => {
    it('should return terrain type at specified coordinate', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Mountain },
        { coord: { q: 2, r: 0 }, type: TerrainType.Marsh },
      ];
      const state = createGameState({ terrain });

      expect(getTerrainAt(state, { q: 0, r: 0 })).toBe(TerrainType.Land);
      expect(getTerrainAt(state, { q: 1, r: 0 })).toBe(TerrainType.Mountain);
      expect(getTerrainAt(state, { q: 2, r: 0 })).toBe(TerrainType.Marsh);
    });

    it('should return Sea for unknown coordinates', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
      ];
      const state = createGameState({ terrain });

      expect(getTerrainAt(state, { q: 99, r: 99 })).toBe(TerrainType.Sea);
    });
  });

  describe('getUnitAt', () => {
    it('should return unit at specified coordinate', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 5, r: 3 });
      const state = createGameState({ units: [tank] });

      const foundUnit = getUnitAt(state, { q: 5, r: 3 });
      expect(foundUnit).toBeDefined();
      expect(foundUnit?.id).toBe('tank-1');
    });

    it('should return undefined for empty hex', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 5, r: 3 });
      const state = createGameState({ units: [tank] });

      const foundUnit = getUnitAt(state, { q: 0, r: 0 });
      expect(foundUnit).toBeUndefined();
    });

    it('should find correct unit among multiple', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const tank3 = createUnit('tank-3', UnitType.Tank, 'p2', { q: 2, r: 0 });
      const state = createGameState({ units: [tank1, tank2, tank3] });

      expect(getUnitAt(state, { q: 1, r: 0 })?.id).toBe('tank-2');
    });
  });

  describe('getMineralAt', () => {
    it('should return mineral at specified coordinate', () => {
      const minerals: Mineral[] = [
        { id: 'mineral-1', position: { q: 3, r: 2 } },
        { id: 'mineral-2', position: { q: 5, r: 1 } },
      ];
      const state = createGameState({ minerals });

      const foundMineral = getMineralAt(state, { q: 3, r: 2 });
      expect(foundMineral).toBeDefined();
      expect(foundMineral?.id).toBe('mineral-1');
    });

    it('should return undefined for hex without mineral', () => {
      const minerals: Mineral[] = [
        { id: 'mineral-1', position: { q: 3, r: 2 } },
      ];
      const state = createGameState({ minerals });

      const foundMineral = getMineralAt(state, { q: 0, r: 0 });
      expect(foundMineral).toBeUndefined();
    });
  });

  describe('isGameFinished', () => {
    it('should return true when phase is Finished', () => {
      const state = createGameState({ phase: GamePhase.Finished });
      expect(isGameFinished(state)).toBe(true);
    });

    it('should return false when phase is Playing', () => {
      const state = createGameState({ phase: GamePhase.Playing });
      expect(isGameFinished(state)).toBe(false);
    });

    it('should return false when phase is Landing', () => {
      const state = createGameState({ phase: GamePhase.Landing });
      expect(isGameFinished(state)).toBe(false);
    });

    it('should return false when phase is LiftOffDecision', () => {
      const state = createGameState({ phase: GamePhase.LiftOffDecision });
      expect(isGameFinished(state)).toBe(false);
    });
  });

  describe('getWinners', () => {
    it('should return empty array if game is not finished', () => {
      const state = createGameState({ phase: GamePhase.Playing });
      expect(getWinners(state)).toEqual([]);
    });

    it('should return player with highest score', () => {
      const player1 = createPlayer('p1', PlayerColor.Red);
      player1.hasLiftedOff = true;
      const player2 = createPlayer('p2', PlayerColor.Blue);
      player2.hasLiftedOff = true;

      // Player 1 has 3 minerals (6 points) + 3 turrets (3 points) = 9
      const astronef1 = createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        cargo: ['mineral-1', 'mineral-2', 'mineral-3'],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      // Player 2 has 1 mineral (2 points) + 1 turret (1 point) = 3
      const astronef2 = createUnit('astronef-p2', UnitType.Astronef, 'p2', { q: 10, r: 0 }, {
        cargo: ['mineral-4'],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: true },
          { podeIndex: 2, isDestroyed: true },
        ],
      });

      const state = createGameState({
        phase: GamePhase.Finished,
        players: [player1, player2],
        units: [astronef1, astronef2],
      });

      const winners = getWinners(state);
      expect(winners).toEqual(['p1']);
    });

    it('should return multiple players in case of tie', () => {
      const player1 = createPlayer('p1', PlayerColor.Red);
      player1.hasLiftedOff = true;
      const player2 = createPlayer('p2', PlayerColor.Blue);
      player2.hasLiftedOff = true;

      // Both have same cargo and turrets
      const astronef1 = createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        cargo: ['mineral-1'],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: true },
          { podeIndex: 2, isDestroyed: true },
        ],
      });

      const astronef2 = createUnit('astronef-p2', UnitType.Astronef, 'p2', { q: 10, r: 0 }, {
        cargo: ['mineral-2'],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: true },
          { podeIndex: 2, isDestroyed: true },
        ],
      });

      const state = createGameState({
        phase: GamePhase.Finished,
        players: [player1, player2],
        units: [astronef1, astronef2],
      });

      const winners = getWinners(state);
      expect(winners).toHaveLength(2);
      expect(winners).toContain('p1');
      expect(winners).toContain('p2');
    });
  });

  describe('calculateAllScores', () => {
    it('should return scores for all players', () => {
      const player1 = createPlayer('p1', PlayerColor.Red);
      player1.hasLiftedOff = true;
      const player2 = createPlayer('p2', PlayerColor.Blue);
      player2.hasLiftedOff = false; // Not lifted off

      const astronef1 = createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        cargo: ['mineral-1'],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const astronef2 = createUnit('astronef-p2', UnitType.Astronef, 'p2', { q: 10, r: 0 }, {
        cargo: ['mineral-2'],
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        players: [player1, player2],
        units: [astronef1, astronef2],
      });

      const scores = calculateAllScores(state);
      expect(scores['p1']).toBe(5); // 2 (mineral) + 3 (turrets)
      expect(scores['p2']).toBe(0); // Not lifted off
    });
  });
});

describe('applyBuildAction', () => {
  it('should create new unit from converter', () => {
    const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 }, {
      cargo: ['mineral-1'],
    });
    const minerals: Mineral[] = [{ id: 'mineral-1', position: { q: -999, r: -999 } }];

    const state = createGameState({
      units: [converter],
      minerals,
      actionPoints: 5,
    });

    const action: BuildAction = {
      type: 'BUILD',
      playerId: 'p1',
      timestamp: Date.now(),
      converterId: 'converter-1',
      unitType: UnitType.Tank,
      apCost: 2,
    };

    const newState = applyBuildAction(state, action);

    // Check new unit was created
    const newTanks = newState.units.filter((u) => u.type === UnitType.Tank);
    expect(newTanks.length).toBe(1);
    expect(newTanks[0].owner).toBe('p1');
    expect(newTanks[0].position).toEqual({ q: 0, r: 0 }); // At converter position

    // Check converter cargo is empty
    const updatedConverter = newState.units.find((u) => u.id === 'converter-1');
    expect(updatedConverter?.cargo).toEqual([]);

    // Check AP was deducted
    expect(newState.actionPoints).toBe(3);

    // Check mineral was removed
    expect(newState.minerals.length).toBe(0);
  });

  it('should return unchanged state if converter not found', () => {
    const state = createGameState({ units: [] });

    const action: BuildAction = {
      type: 'BUILD',
      playerId: 'p1',
      timestamp: Date.now(),
      converterId: 'nonexistent',
      unitType: UnitType.Tank,
      apCost: 2,
    };

    const newState = applyBuildAction(state, action);
    expect(newState).toEqual(state);
  });

  it('should create unit with cargo if it is a transporter', () => {
    const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 }, {
      cargo: ['mineral-1'],
    });
    const minerals: Mineral[] = [{ id: 'mineral-1', position: { q: -999, r: -999 } }];

    const state = createGameState({
      units: [converter],
      minerals,
      actionPoints: 5,
    });

    const action: BuildAction = {
      type: 'BUILD',
      playerId: 'p1',
      timestamp: Date.now(),
      converterId: 'converter-1',
      unitType: UnitType.Crab, // Crab is a transporter with cargo
      apCost: 2,
    };

    const newState = applyBuildAction(state, action);

    const newCrab = newState.units.find((u) => u.type === UnitType.Crab);
    expect(newCrab).toBeDefined();
    expect(newCrab?.cargo).toEqual([]); // Empty cargo array for transporters
  });

  it('should give correct shots to combat unit', () => {
    const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 }, {
      cargo: ['mineral-1'],
    });
    const minerals: Mineral[] = [{ id: 'mineral-1', position: { q: -999, r: -999 } }];

    const state = createGameState({
      units: [converter],
      minerals,
      actionPoints: 5,
    });

    const action: BuildAction = {
      type: 'BUILD',
      playerId: 'p1',
      timestamp: Date.now(),
      converterId: 'converter-1',
      unitType: UnitType.Tank,
      apCost: 2,
    };

    const newState = applyBuildAction(state, action);

    const newTank = newState.units.find((u) => u.type === UnitType.Tank);
    expect(newTank?.shotsRemaining).toBe(GAME_CONSTANTS.SHOTS_PER_UNIT_PER_TURN);
  });
});

// Import new tide-related functions
import {
  predictNextTide,
  canPlayerPredictTide,
  getTideProbabilities,
  getTideForecast,
  getPlayerConverterCount,
  updateUnitsStuckStatus,
  getStuckUnits,
  isUnitStuckAtPosition,
  seededRandom,
} from '../state';

describe('Tide Prediction', () => {
  describe('predictNextTide', () => {
    it('should return the top card of the tide deck', () => {
      const state = createGameState({
        tideDeck: [TideLevel.High, TideLevel.Low, TideLevel.Normal],
      });

      expect(predictNextTide(state)).toBe(TideLevel.High);
    });

    it('should return undefined when deck is empty', () => {
      const state = createGameState({
        tideDeck: [],
        tideDiscard: [TideLevel.Low, TideLevel.Normal],
      });

      expect(predictNextTide(state)).toBeUndefined();
    });
  });

  describe('getPlayerConverterCount', () => {
    it('should return 0 when player has no converters', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const state = createGameState({ units: [tank] });

      expect(getPlayerConverterCount(state, 'p1')).toBe(0);
    });

    it('should return 1 when player has one active converter', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const state = createGameState({ units: [converter] });

      expect(getPlayerConverterCount(state, 'p1')).toBe(1);
    });

    it('should return 2 when player has two active converters', () => {
      const converter1 = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const converter2 = createUnit('converter-2', UnitType.Converter, 'p1', { q: 1, r: 0 });
      const state = createGameState({ units: [converter1, converter2] });

      expect(getPlayerConverterCount(state, 'p1')).toBe(2);
    });

    it('should not count converters in cargo (position -9999)', () => {
      const activeConverter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const cargoConverter = createUnit('converter-2', UnitType.Converter, 'p1', { q: -9999, r: -9999 });
      const state = createGameState({ units: [activeConverter, cargoConverter] });

      expect(getPlayerConverterCount(state, 'p1')).toBe(1);
    });

    it('should not count enemy converters', () => {
      const ownConverter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const enemyConverter = createUnit('converter-2', UnitType.Converter, 'p2', { q: 1, r: 0 });
      const state = createGameState({ units: [ownConverter, enemyConverter] });

      expect(getPlayerConverterCount(state, 'p1')).toBe(1);
    });
  });

  describe('getTideForecast', () => {
    it('should return empty array when player has no converters', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const state = createGameState({
        units: [tank],
        tideDeck: [TideLevel.High, TideLevel.Low, TideLevel.Normal],
      });

      expect(getTideForecast(state, 'p1')).toEqual([]);
    });

    it('should return 1 turn ahead with 1 converter', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const state = createGameState({
        units: [converter],
        tideDeck: [TideLevel.High, TideLevel.Low, TideLevel.Normal],
        tideDiscard: [],
      });

      const forecast = getTideForecast(state, 'p1');
      expect(forecast).toHaveLength(1);
      expect(forecast[0]).toBe(TideLevel.High);
    });

    it('should return 2 turns ahead with 2 converters', () => {
      const converter1 = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const converter2 = createUnit('converter-2', UnitType.Converter, 'p1', { q: 1, r: 0 });
      const state = createGameState({
        units: [converter1, converter2],
        tideDeck: [TideLevel.High, TideLevel.Low, TideLevel.Normal],
        tideDiscard: [],
      });

      const forecast = getTideForecast(state, 'p1');
      expect(forecast).toHaveLength(2);
      expect(forecast[0]).toBe(TideLevel.High);
      expect(forecast[1]).toBe(TideLevel.Low);
    });

    it('should cap forecast at 2 even with 3+ converters', () => {
      const converter1 = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const converter2 = createUnit('converter-2', UnitType.Converter, 'p1', { q: 1, r: 0 });
      const converter3 = createUnit('converter-3', UnitType.Converter, 'p1', { q: 2, r: 0 });
      const state = createGameState({
        units: [converter1, converter2, converter3],
        tideDeck: [TideLevel.High, TideLevel.Low, TideLevel.Normal],
        tideDiscard: [],
      });

      const forecast = getTideForecast(state, 'p1');
      expect(forecast).toHaveLength(2);
    });
  });

  describe('canPlayerPredictTide', () => {
    it('should return true if player owns a Converter', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      const state = createGameState({ units: [converter] });

      expect(canPlayerPredictTide(state, 'p1')).toBe(true);
    });

    it('should return false if player does not own a Converter', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p2', { q: 0, r: 0 });
      const state = createGameState({ units: [converter] });

      expect(canPlayerPredictTide(state, 'p1')).toBe(false);
    });

    it('should return false if Converter is in cargo', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: -9999, r: -9999 });
      const state = createGameState({ units: [converter] });

      expect(canPlayerPredictTide(state, 'p1')).toBe(false);
    });
  });

  describe('getTideProbabilities', () => {
    it('should calculate probabilities from deck', () => {
      const state = createGameState({
        tideDeck: [TideLevel.Low, TideLevel.Low, TideLevel.High, TideLevel.Normal],
      });

      const probs = getTideProbabilities(state);
      expect(probs[TideLevel.Low]).toBeCloseTo(0.5, 5);
      expect(probs[TideLevel.High]).toBeCloseTo(0.25, 5);
      expect(probs[TideLevel.Normal]).toBeCloseTo(0.25, 5);
    });

    it('should calculate from discard when deck is empty', () => {
      const state = createGameState({
        tideDeck: [],
        tideDiscard: [TideLevel.Low, TideLevel.Normal, TideLevel.Normal],
      });

      const probs = getTideProbabilities(state);
      expect(probs[TideLevel.Low]).toBeCloseTo(1/3, 5);
      expect(probs[TideLevel.Normal]).toBeCloseTo(2/3, 5);
      expect(probs[TideLevel.High]).toBeCloseTo(0, 5);
    });
  });
});

describe('Stuck Unit Mechanics', () => {
  describe('updateUnitsStuckStatus', () => {
    it('should mark land unit stuck when on marsh at high tide', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: false });
      const state = createGameState({
        terrain,
        units: [tank],
        currentTide: TideLevel.High,
      });

      const newState = updateUnitsStuckStatus(state);
      const updatedTank = newState.units.find((u) => u.id === 'tank-1');
      expect(updatedTank?.isStuck).toBe(true);
    });

    it('should mark land unit not stuck on marsh at normal tide', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: true });
      const state = createGameState({
        terrain,
        units: [tank],
        currentTide: TideLevel.Normal,
      });

      const newState = updateUnitsStuckStatus(state);
      const updatedTank = newState.units.find((u) => u.id === 'tank-1');
      expect(updatedTank?.isStuck).toBe(false);
    });

    it('should mark sea unit grounded on reef at low tide', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Reef },
      ];
      const boat = createUnit('boat-1', UnitType.MotorBoat, 'p1', { q: 0, r: 0 }, { isStuck: false });
      const state = createGameState({
        terrain,
        units: [boat],
        currentTide: TideLevel.Low,
      });

      const newState = updateUnitsStuckStatus(state);
      const updatedBoat = newState.units.find((u) => u.id === 'boat-1');
      expect(updatedBoat?.isStuck).toBe(true);
    });

    it('should skip units in cargo', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: -9999, r: -9999 }, { isStuck: false });
      const state = createGameState({
        terrain,
        units: [tank],
        currentTide: TideLevel.High,
      });

      const newState = updateUnitsStuckStatus(state);
      const updatedTank = newState.units.find((u) => u.id === 'tank-1');
      expect(updatedTank?.isStuck).toBe(false);
    });
  });

  describe('getStuckUnits', () => {
    it('should return all stuck units', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: true });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 1, r: 0 }, { isStuck: false });
      const boat = createUnit('boat-1', UnitType.MotorBoat, 'p1', { q: 2, r: 0 }, { isStuck: true });
      const state = createGameState({ units: [tank1, tank2, boat] });

      const stuckUnits = getStuckUnits(state);
      expect(stuckUnits).toHaveLength(2);
      expect(stuckUnits.map((u) => u.id)).toContain('tank-1');
      expect(stuckUnits.map((u) => u.id)).toContain('boat-1');
    });
  });

  describe('isUnitStuckAtPosition', () => {
    it('should return true for stuck tank on flooded marsh', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const state = createGameState({
        terrain,
        units: [tank],
        currentTide: TideLevel.High,
      });

      expect(isUnitStuckAtPosition(state, 'tank-1')).toBe(true);
    });

    it('should return false for tank on land', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
      ];
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const state = createGameState({
        terrain,
        units: [tank],
        currentTide: TideLevel.High,
      });

      expect(isUnitStuckAtPosition(state, 'tank-1')).toBe(false);
    });

    it('should return false for unit in cargo', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: -9999, r: -9999 });
      const state = createGameState({ units: [tank] });

      expect(isUnitStuckAtPosition(state, 'tank-1')).toBe(false);
    });
  });

  describe('advanceTurn with stuck status update', () => {
    it('should update stuck status when tide changes on new round', () => {
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: false });
      const state = createGameState({
        terrain,
        units: [tank],
        currentPlayer: 'p2',
        turnOrder: ['p1', 'p2'],
        turn: 5,
        tideDeck: [TideLevel.High], // Will draw High tide
        tideDiscard: [TideLevel.Low, TideLevel.Normal],
      });

      const newState = advanceTurn(state);

      // Turn should advance
      expect(newState.turn).toBe(6);
      // Tide should be High
      expect(newState.currentTide).toBe(TideLevel.High);
      // Tank on marsh should now be stuck
      const updatedTank = newState.units.find((u) => u.id === 'tank-1');
      expect(updatedTank?.isStuck).toBe(true);
    });
  });
});

describe('Seeded Random', () => {
  describe('seededRandom', () => {
    it('should produce consistent results with same seed', () => {
      const random1 = seededRandom(42);
      const random2 = seededRandom(42);

      const values1 = [random1(), random1(), random1()];
      const values2 = [random2(), random2(), random2()];

      expect(values1).toEqual(values2);
    });

    it('should produce different results with different seeds', () => {
      const random1 = seededRandom(42);
      const random2 = seededRandom(43);

      const value1 = random1();
      const value2 = random2();

      expect(value1).not.toBe(value2);
    });

    it('should produce values between 0 and 1', () => {
      const random = seededRandom(12345);

      for (let i = 0; i < 100; i++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });

  describe('shuffleArray with seed', () => {
    it('should produce consistent results with same seed', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled1 = shuffleArray([...array], 42);
      const shuffled2 = shuffleArray([...array], 42);

      expect(shuffled1).toEqual(shuffled2);
    });

    it('should produce different results with different seeds', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled1 = shuffleArray([...array], 42);
      const shuffled2 = shuffleArray([...array], 43);

      // Very unlikely to be the same
      expect(shuffled1).not.toEqual(shuffled2);
    });
  });
});

describe('Astronef and Tower Creation', () => {
  describe('createAstronef', () => {
    it('should create astronef with 3 turrets', () => {
      const position: HexCoord[] = [{ q: 5, r: 5 }];
      const astronef = createAstronef('p1', position);

      expect(astronef.type).toBe(UnitType.Astronef);
      expect(astronef.owner).toBe('p1');
      expect(astronef.turrets).toHaveLength(3);
      expect(astronef.turrets?.every((t) => !t.isDestroyed)).toBe(true);
    });

    it('should set initial position from first pode position', () => {
      const position: HexCoord[] = [{ q: 10, r: 3 }, { q: 11, r: 3 }, { q: 10, r: 4 }];
      const astronef = createAstronef('p1', position);

      expect(astronef.position).toEqual({ q: 10, r: 3 });
    });

    it('should default to origin if no position provided', () => {
      const astronef = createAstronef('p1', []);

      expect(astronef.position).toEqual({ q: 0, r: 0 });
    });

    it('should initialize with empty cargo', () => {
      const astronef = createAstronef('p1', [{ q: 0, r: 0 }]);

      expect(astronef.cargo).toEqual([]);
    });

    it('should initialize with hasLiftedOff false', () => {
      const astronef = createAstronef('p1', [{ q: 0, r: 0 }]);

      expect(astronef.hasLiftedOff).toBe(false);
    });
  });

  describe('createTowers', () => {
    it('should create 3 towers for a player', () => {
      const towers = createTowers('p1');

      expect(towers).toHaveLength(3);
      expect(towers.every((t) => t.type === UnitType.Tower)).toBe(true);
      expect(towers.every((t) => t.owner === 'p1')).toBe(true);
    });

    it('should give towers unique IDs', () => {
      const towers = createTowers('p1');
      const ids = towers.map((t) => t.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(3);
    });

    it('should initialize towers with shots', () => {
      const towers = createTowers('p1');

      expect(towers.every((t) => t.shotsRemaining === GAME_CONSTANTS.SHOTS_PER_UNIT_PER_TURN)).toBe(true);
    });
  });

  // ============================================================================
  // Setup Phase Tests
  // ============================================================================

  describe('getAstronefHexes', () => {
    it('should return 4 hex positions for astronef footprint', () => {
      const hexes = getAstronefHexes({ q: 5, r: 5 });
      expect(hexes).toHaveLength(4);
    });

    it('should include the center hex', () => {
      const center = { q: 5, r: 5 };
      const hexes = getAstronefHexes(center);
      expect(hexes).toContainEqual(center);
    });
  });

  describe('validateLandAstronefAction', () => {
    function createLandingState(): GameState {
      const terrain: HexTerrain[] = [
        { coord: { q: 5, r: 5 }, type: TerrainType.Land },
        { coord: { q: 6, r: 5 }, type: TerrainType.Land },
        { coord: { q: 5, r: 6 }, type: TerrainType.Land },
        { coord: { q: 6, r: 4 }, type: TerrainType.Land },
        { coord: { q: 7, r: 5 }, type: TerrainType.Sea },
      ];
      return {
        ...createGameState(),
        phase: GamePhase.Landing,
        turn: 1,
        terrain,
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }),
          createUnit('astronef-p2', UnitType.Astronef, 'p2', { q: 0, r: 0 }),
        ],
      };
    }

    it('should reject landing outside of Landing phase', () => {
      const state = { ...createLandingState(), phase: GamePhase.Playing };
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 5, r: 5 },
          { q: 6, r: 5 },
          { q: 5, r: 6 },
          { q: 6, r: 4 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Landing phase');
    });

    it('should reject landing if not player turn', () => {
      const state = { ...createLandingState(), currentPlayer: 'p2' };
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 5, r: 5 },
          { q: 6, r: 5 },
          { q: 5, r: 6 },
          { q: 6, r: 4 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not your turn');
    });

    it('should reject landing with wrong number of positions', () => {
      const state = createLandingState();
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 5, r: 5 },
          { q: 6, r: 5 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exactly 4');
    });

    it('should reject landing on sea terrain', () => {
      const state = createLandingState();
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 5, r: 5 },
          { q: 6, r: 5 },
          { q: 5, r: 6 },
          { q: 7, r: 5 }, // Sea terrain
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot land on');
    });

    it('should accept valid landing position', () => {
      const state = createLandingState();
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 5, r: 5 },
          { q: 6, r: 5 },
          { q: 5, r: 6 },
          { q: 6, r: 4 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(true);
    });
  });

  describe('applyLandAstronefAction', () => {
    function createLandingState(): GameState {
      const terrain: HexTerrain[] = [
        { coord: { q: 5, r: 5 }, type: TerrainType.Land },
        { coord: { q: 6, r: 5 }, type: TerrainType.Land },
        { coord: { q: 5, r: 6 }, type: TerrainType.Land },
        { coord: { q: 6, r: 4 }, type: TerrainType.Land },
      ];
      return {
        ...createGameState(),
        phase: GamePhase.Landing,
        turn: 1,
        terrain,
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }),
          createUnit('tower-p1-0', UnitType.Tower, 'p1', { q: 0, r: 0 }),
          createUnit('tower-p1-1', UnitType.Tower, 'p1', { q: 0, r: 0 }),
          createUnit('tower-p1-2', UnitType.Tower, 'p1', { q: 0, r: 0 }),
        ],
      };
    }

    it('should update astronef position', () => {
      const state = createLandingState();
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 5, r: 5 },
          { q: 6, r: 5 },
          { q: 5, r: 6 },
          { q: 6, r: 4 },
        ],
      };

      const newState = applyLandAstronefAction(state, action);
      const astronef = newState.units.find((u) => u.id === 'astronef-p1');

      expect(astronef?.position).toEqual({ q: 5, r: 5 });
    });

    it('should update player astronef position array', () => {
      const state = createLandingState();
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 5, r: 5 },
          { q: 6, r: 5 },
          { q: 5, r: 6 },
          { q: 6, r: 4 },
        ],
      };

      const newState = applyLandAstronefAction(state, action);
      const player = newState.players.find((p) => p.id === 'p1');

      expect(player?.astronefPosition).toEqual(action.position);
    });
  });

  describe('validateLandAstronefAction - zone validation', () => {
    /**
     * Create a landing state with terrain that has landing zones.
     * Zone 1 is in top area (around q=18, r=2)
     * Zone 5 is in bottom area (around q=18, r=20)
     */
    function createLandingStateWithZones(): GameState {
      // Create terrain with landing zones (based on angular sectors)
      // Zone 1 around top, Zone 5 around bottom
      const terrain: HexTerrain[] = [
        // Zone 1 - top area (for p1 landing)
        { coord: { q: 18, r: 2 }, type: TerrainType.Land, landingZone: 1 },
        { coord: { q: 19, r: 2 }, type: TerrainType.Land, landingZone: 1 },
        { coord: { q: 18, r: 3 }, type: TerrainType.Land, landingZone: 1 },
        { coord: { q: 19, r: 1 }, type: TerrainType.Land, landingZone: 1 },
        // More Zone 1 hexes for testing same-zone rejection
        { coord: { q: 20, r: 2 }, type: TerrainType.Land, landingZone: 1 },
        { coord: { q: 21, r: 2 }, type: TerrainType.Land, landingZone: 1 },
        { coord: { q: 20, r: 3 }, type: TerrainType.Land, landingZone: 1 },
        { coord: { q: 21, r: 1 }, type: TerrainType.Land, landingZone: 1 },
        // Zone 2 - adjacent to zone 1
        { coord: { q: 25, r: 3 }, type: TerrainType.Land, landingZone: 2 },
        { coord: { q: 26, r: 3 }, type: TerrainType.Land, landingZone: 2 },
        { coord: { q: 25, r: 4 }, type: TerrainType.Land, landingZone: 2 },
        { coord: { q: 26, r: 2 }, type: TerrainType.Land, landingZone: 2 },
        // Zone 3 - 2 away from zone 1
        { coord: { q: 32, r: 8 }, type: TerrainType.Land, landingZone: 3 },
        { coord: { q: 33, r: 8 }, type: TerrainType.Land, landingZone: 3 },
        { coord: { q: 32, r: 9 }, type: TerrainType.Land, landingZone: 3 },
        { coord: { q: 33, r: 7 }, type: TerrainType.Land, landingZone: 3 },
        // Zone 5 - opposite side (4 zones away from zone 1)
        { coord: { q: 18, r: 20 }, type: TerrainType.Land, landingZone: 5 },
        { coord: { q: 19, r: 20 }, type: TerrainType.Land, landingZone: 5 },
        { coord: { q: 18, r: 21 }, type: TerrainType.Land, landingZone: 5 },
        { coord: { q: 19, r: 19 }, type: TerrainType.Land, landingZone: 5 },
      ];

      return {
        ...createGameState(),
        phase: GamePhase.Landing,
        turn: 1,
        currentPlayer: 'p2',
        terrain,
        units: [
          // P1 astronef already landed in zone 1
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 18, r: 2 }),
          // P2 astronef not yet landed
          createUnit('astronef-p2', UnitType.Astronef, 'p2', { q: 0, r: 0 }),
        ],
        players: [
          { id: 'p1', name: 'Player 1', color: PlayerColor.Red, isConnected: true, isReady: true, astronefPosition: [{ q: 18, r: 2 }], hasLiftedOff: false, capturedAstronefs: [] },
          { id: 'p2', name: 'Player 2', color: PlayerColor.Blue, isConnected: true, isReady: true, astronefPosition: [], hasLiftedOff: false, capturedAstronefs: [] },
        ],
        turnOrder: ['p1', 'p2'],
      };
    }

    it('should allow first player to land anywhere', () => {
      const state = {
        ...createLandingStateWithZones(),
        currentPlayer: 'p1',
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }),
        ],
        players: [
          { id: 'p1', name: 'Player 1', color: PlayerColor.Red, isConnected: true, isReady: true, astronefPosition: [], hasLiftedOff: false, capturedAstronefs: [] },
        ],
      };

      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p1',
        timestamp: Date.now(),
        position: [
          { q: 18, r: 2 },
          { q: 19, r: 2 },
          { q: 18, r: 3 },
          { q: 19, r: 1 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(true);
    });

    it('should reject landing in same zone as existing astronef', () => {
      const state = createLandingStateWithZones();

      // P2 trying to land in zone 1 (same as P1) but different hexes
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p2',
        timestamp: Date.now(),
        position: [
          { q: 20, r: 2 }, // Zone 1 - same zone but different hexes from P1
          { q: 21, r: 2 },
          { q: 20, r: 3 },
          { q: 21, r: 1 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('zones away');
    });

    it('should reject landing in adjacent zone (distance 1)', () => {
      const state = createLandingStateWithZones();

      // P2 trying to land in zone 2 (adjacent to P1's zone 1)
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p2',
        timestamp: Date.now(),
        position: [
          { q: 25, r: 3 }, // Zone 2
          { q: 26, r: 3 },
          { q: 25, r: 4 },
          { q: 26, r: 2 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 zones away');
    });

    it('should allow landing 2 zones away', () => {
      const state = createLandingStateWithZones();

      // P2 trying to land in zone 3 (2 away from P1's zone 1)
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p2',
        timestamp: Date.now(),
        position: [
          { q: 32, r: 8 }, // Zone 3
          { q: 33, r: 8 },
          { q: 32, r: 9 },
          { q: 33, r: 7 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(true);
    });

    it('should allow landing on opposite side of map', () => {
      const state = createLandingStateWithZones();

      // P2 trying to land in zone 5 (4 away from P1's zone 1)
      const action: LandAstronefAction = {
        type: 'LAND_ASTRONEF',
        playerId: 'p2',
        timestamp: Date.now(),
        position: [
          { q: 18, r: 20 }, // Zone 5
          { q: 19, r: 20 },
          { q: 18, r: 21 },
          { q: 19, r: 19 },
        ],
      };

      const result = validateLandAstronefAction(state, action);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateDeployUnitAction', () => {
    function createDeploymentState(): GameState {
      const terrain: HexTerrain[] = [
        { coord: { q: 5, r: 5 }, type: TerrainType.Land },
        { coord: { q: 6, r: 5 }, type: TerrainType.Land },
        { coord: { q: 5, r: 6 }, type: TerrainType.Land },
        { coord: { q: 4, r: 5 }, type: TerrainType.Land },
        { coord: { q: 7, r: 5 }, type: TerrainType.Sea },
        { coord: { q: 8, r: 5 }, type: TerrainType.Sea },
      ];
      return {
        ...createGameState({
          phase: GamePhase.Deployment,
          turn: 2,
        }),
        terrain,
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 5, r: 5 }),
          createUnit('tank-p1-0', UnitType.Tank, 'p1', { q: 0, r: 0 }),
          createUnit('motorboat-p1-0', UnitType.MotorBoat, 'p1', { q: 0, r: 0 }),
        ],
        players: [
          {
            ...createPlayer('p1', PlayerColor.Red),
            astronefPosition: [{ q: 5, r: 5 }, { q: 6, r: 5 }, { q: 5, r: 6 }, { q: 4, r: 5 }],
          },
          createPlayer('p2', PlayerColor.Blue),
        ],
      };
    }

    it('should reject deployment outside of Deployment phase', () => {
      const state = { ...createDeploymentState(), phase: GamePhase.Playing };
      const action: DeployUnitAction = {
        type: 'DEPLOY_UNIT',
        playerId: 'p1',
        timestamp: Date.now(),
        unitId: 'tank-p1-0',
        position: { q: 6, r: 5 },
      };

      const result = validateDeployUnitAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Deployment phase');
    });

    it('should reject deployment of non-existent unit', () => {
      const state = createDeploymentState();
      const action: DeployUnitAction = {
        type: 'DEPLOY_UNIT',
        playerId: 'p1',
        timestamp: Date.now(),
        unitId: 'nonexistent',
        position: { q: 6, r: 5 },
      };

      const result = validateDeployUnitAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject deployment of already deployed unit', () => {
      const state = createDeploymentState();
      // Move the tank to a deployed position
      state.units = state.units.map((u) =>
        u.id === 'tank-p1-0' ? { ...u, position: { q: 6, r: 5 } } : u
      );

      const action: DeployUnitAction = {
        type: 'DEPLOY_UNIT',
        playerId: 'p1',
        timestamp: Date.now(),
        unitId: 'tank-p1-0',
        position: { q: 4, r: 5 },
      };

      const result = validateDeployUnitAction(state, action);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already deployed');
    });

    it('should reject land unit deployment on sea terrain', () => {
      const state = createDeploymentState();
      const action: DeployUnitAction = {
        type: 'DEPLOY_UNIT',
        playerId: 'p1',
        timestamp: Date.now(),
        unitId: 'tank-p1-0',
        position: { q: 7, r: 5 },
      };

      const result = validateDeployUnitAction(state, action);
      expect(result.valid).toBe(false);
      // May not be adjacent to astronef OR may fail on terrain check
      expect(result.valid).toBe(false);
    });

    it('should accept valid deployment position', () => {
      const state = createDeploymentState();
      const action: DeployUnitAction = {
        type: 'DEPLOY_UNIT',
        playerId: 'p1',
        timestamp: Date.now(),
        unitId: 'tank-p1-0',
        position: { q: 6, r: 5 },
      };

      const result = validateDeployUnitAction(state, action);
      expect(result.valid).toBe(true);
    });
  });

  describe('applyDeployUnitAction', () => {
    function createDeploymentState(): GameState {
      const terrain: HexTerrain[] = [
        { coord: { q: 5, r: 5 }, type: TerrainType.Land },
        { coord: { q: 6, r: 5 }, type: TerrainType.Land },
      ];
      return {
        ...createGameState({
          phase: GamePhase.Deployment,
          turn: 2,
        }),
        terrain,
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 5, r: 5 }),
          createUnit('tank-p1-0', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        ],
        players: [
          {
            ...createPlayer('p1', PlayerColor.Red),
            astronefPosition: [{ q: 5, r: 5 }, { q: 6, r: 5 }],
          },
          createPlayer('p2', PlayerColor.Blue),
        ],
      };
    }

    it('should update unit position', () => {
      const state = createDeploymentState();
      const action: DeployUnitAction = {
        type: 'DEPLOY_UNIT',
        playerId: 'p1',
        timestamp: Date.now(),
        unitId: 'tank-p1-0',
        position: { q: 6, r: 5 },
      };

      const newState = applyDeployUnitAction(state, action);
      const tank = newState.units.find((u) => u.id === 'tank-p1-0');

      expect(tank?.position).toEqual({ q: 6, r: 5 });
    });
  });

  describe('haveAllPlayersLanded', () => {
    it('should return false when astronef is at origin', () => {
      const state = createGameState({
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }),
          createUnit('astronef-p2', UnitType.Astronef, 'p2', { q: 5, r: 5 }),
        ],
      });

      expect(haveAllPlayersLanded(state)).toBe(false);
    });

    it('should return true when all astronefs have non-origin positions', () => {
      const state = createGameState({
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 3, r: 3 }),
          createUnit('astronef-p2', UnitType.Astronef, 'p2', { q: 5, r: 5 }),
        ],
      });

      expect(haveAllPlayersLanded(state)).toBe(true);
    });
  });

  describe('hasPlayerDeployedAllUnits', () => {
    it('should return false when units are at origin', () => {
      const state = createGameState({
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 5, r: 5 }),
          createUnit('tower-p1-0', UnitType.Tower, 'p1', { q: 6, r: 5 }),
          createUnit('tank-p1-0', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        ],
      });

      expect(hasPlayerDeployedAllUnits(state, 'p1')).toBe(false);
    });

    it('should return true when all units are deployed', () => {
      const state = createGameState({
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 5, r: 5 }),
          createUnit('tower-p1-0', UnitType.Tower, 'p1', { q: 6, r: 5 }),
          createUnit('tank-p1-0', UnitType.Tank, 'p1', { q: 4, r: 5 }),
        ],
      });

      expect(hasPlayerDeployedAllUnits(state, 'p1')).toBe(true);
    });
  });

  describe('getUndeployedUnits', () => {
    it('should return units at origin excluding astronef and towers', () => {
      const state = createGameState({
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 0, r: 0 }),
          createUnit('tower-p1-0', UnitType.Tower, 'p1', { q: 0, r: 0 }),
          createUnit('tank-p1-0', UnitType.Tank, 'p1', { q: 0, r: 0 }),
          createUnit('barge-p1-0', UnitType.Barge, 'p1', { q: 5, r: 5 }),
        ],
      });

      const undeployed = getUndeployedUnits(state, 'p1');

      expect(undeployed).toHaveLength(1);
      expect(undeployed[0]?.id).toBe('tank-p1-0');
    });

    it('should return empty array when all units deployed', () => {
      const state = createGameState({
        units: [
          createUnit('astronef-p1', UnitType.Astronef, 'p1', { q: 5, r: 5 }),
          createUnit('tower-p1-0', UnitType.Tower, 'p1', { q: 6, r: 5 }),
          createUnit('tank-p1-0', UnitType.Tank, 'p1', { q: 4, r: 5 }),
        ],
      });

      const undeployed = getUndeployedUnits(state, 'p1');

      expect(undeployed).toHaveLength(0);
    });
  });
});
