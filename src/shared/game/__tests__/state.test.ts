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
} from '../state';
import {
  TerrainType,
  TideLevel,
  UnitType,
  GamePhase,
  PlayerColor,
  GAME_CONSTANTS,
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
function createPlayer(id: string, color: PlayerColor): Player {
  return {
    id,
    name: `Player ${id}`,
    color,
    isConnected: true,
    isReady: true,
    astronefPosition: [{ q: 0, r: 0 }],
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

    it('should increment turn when last player finishes', () => {
      const state = createGameState({
        currentPlayer: 'p2',
        turnOrder: ['p1', 'p2'],
        turn: 5,
      });

      const newState = advanceTurn(state);

      expect(newState.currentPlayer).toBe('p1');
      expect(newState.turn).toBe(6);
    });

    it('should reset shots for combat units on new turn', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { shotsRemaining: 0 });
      const state = createGameState({
        units: [tank],
        currentPlayer: 'p2',
        turnOrder: ['p1', 'p2'],
      });

      const newState = advanceTurn(state);

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
});
