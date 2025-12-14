import { describe, it, expect } from 'vitest';
import {
  getBaseActionPoints,
  calculateTotalActionPoints,
  calculateMoveCost,
  validateMoveAction,
  validateLoadAction,
  validateUnloadAction,
  validateFireAction,
  validateCaptureAction,
  validateBuildAction,
  calculateSavedAP,
} from '../actions';
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
    astronefPosition: [],
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
    tideDeck: [TideLevel.Normal],
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

describe('Action System', () => {
  describe('getBaseActionPoints', () => {
    it('should return 0 for landing phase (turn 1)', () => {
      expect(getBaseActionPoints(1, GamePhase.Landing)).toBe(0);
    });

    it('should return 0 for deployment phase (turn 2)', () => {
      expect(getBaseActionPoints(2, GamePhase.Deployment)).toBe(0);
    });

    it('should return 5 AP for turn 3', () => {
      expect(getBaseActionPoints(3, GamePhase.Playing)).toBe(GAME_CONSTANTS.TURN_3_AP);
    });

    it('should return 10 AP for turn 4', () => {
      expect(getBaseActionPoints(4, GamePhase.Playing)).toBe(GAME_CONSTANTS.TURN_4_AP);
    });

    it('should return 15 AP for turn 5+', () => {
      expect(getBaseActionPoints(5, GamePhase.Playing)).toBe(GAME_CONSTANTS.BASE_AP);
      expect(getBaseActionPoints(10, GamePhase.Playing)).toBe(GAME_CONSTANTS.BASE_AP);
      expect(getBaseActionPoints(20, GamePhase.Playing)).toBe(GAME_CONSTANTS.BASE_AP);
    });

    it('should return 15 AP for turn 21-25', () => {
      expect(getBaseActionPoints(21, GamePhase.Playing)).toBe(GAME_CONSTANTS.BASE_AP);
      expect(getBaseActionPoints(25, GamePhase.Playing)).toBe(GAME_CONSTANTS.BASE_AP);
    });
  });

  describe('calculateTotalActionPoints', () => {
    it('should add base AP and saved AP', () => {
      expect(calculateTotalActionPoints(5, GamePhase.Playing, 5, 0)).toBe(20);
    });

    it('should cap saved AP at 10', () => {
      // Even if somehow more than 10 was saved, cap at 10
      expect(calculateTotalActionPoints(5, GamePhase.Playing, 15, 0)).toBe(25);
    });

    it('should add bonus AP from captured astronefs', () => {
      // 15 base + 0 saved + 5 per captured astronef
      expect(calculateTotalActionPoints(5, GamePhase.Playing, 0, 1)).toBe(20);
      expect(calculateTotalActionPoints(5, GamePhase.Playing, 0, 2)).toBe(25);
    });

    it('should combine all bonuses', () => {
      // 15 base + 10 saved + 10 (2 captured astronefs)
      expect(calculateTotalActionPoints(5, GamePhase.Playing, 10, 2)).toBe(35);
    });

    it('should handle turn 3 with saved AP', () => {
      // Turn 3: 5 base + 3 saved = 8
      expect(calculateTotalActionPoints(3, GamePhase.Playing, 3, 0)).toBe(8);
    });
  });

  describe('calculateMoveCost', () => {
    it('should return 1 AP per hex for Tank movement', () => {
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ];
      expect(calculateMoveCost(path, UnitType.Tank)).toBe(2); // 2 hexes moved at 1 AP each
    });

    it('should return 2 AP per hex for SuperTank movement', () => {
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ];
      expect(calculateMoveCost(path, UnitType.SuperTank)).toBe(4); // 2 hexes moved at 2 AP each
    });

    it('should return 0 for staying in place', () => {
      const path: HexCoord[] = [{ q: 0, r: 0 }];
      expect(calculateMoveCost(path, UnitType.Tank)).toBe(0);
    });

    it('should handle longer paths', () => {
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
        { q: 4, r: 0 },
        { q: 5, r: 0 },
      ];
      expect(calculateMoveCost(path, UnitType.Tank)).toBe(5);
    });

    it('should return Infinity for fixed units', () => {
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ];
      expect(calculateMoveCost(path, UnitType.Tower)).toBe(Infinity);
      expect(calculateMoveCost(path, UnitType.Astronef)).toBe(Infinity);
      expect(calculateMoveCost(path, UnitType.Bridge)).toBe(Infinity);
    });

    it('should correctly calculate cost for heavy units', () => {
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ];
      // Barge: 2 AP per hex
      expect(calculateMoveCost(path, UnitType.Barge)).toBe(4);
      // Converter: 2 AP per hex
      expect(calculateMoveCost(path, UnitType.Converter)).toBe(4);
    });
  });

  describe('calculateSavedAP', () => {
    it('should save unused AP up to max', () => {
      expect(calculateSavedAP(5, 0)).toBe(5);
    });

    it('should cap at MAX_SAVED_AP (10)', () => {
      expect(calculateSavedAP(15, 0)).toBe(GAME_CONSTANTS.MAX_SAVED_AP);
    });

    it('should add to existing saved AP', () => {
      expect(calculateSavedAP(5, 3)).toBe(8);
    });

    it('should not exceed max when adding', () => {
      expect(calculateSavedAP(8, 5)).toBe(GAME_CONSTANTS.MAX_SAVED_AP);
    });

    it('should handle 0 remaining AP', () => {
      expect(calculateSavedAP(0, 5)).toBe(5);
    });
  });

  describe('validateMoveAction', () => {
    it('should validate a simple move', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ];
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

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(true);
      expect(result.apCost).toBe(2);
    });

    it('should reject move with insufficient AP', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
        { q: 4, r: 0 },
        { q: 5, r: 0 },
      ];
      const terrain: HexTerrain[] = Array.from({ length: 6 }, (_, i) => ({
        coord: { q: i, r: 0 },
        type: TerrainType.Land,
      }));

      const state = createGameState({
        units: [tank],
        terrain,
        actionPoints: 3, // Not enough for 5 hex move
      });

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('action points');
    });

    it('should reject move for stuck unit', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: true });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ];
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank],
        terrain,
        actionPoints: 10,
        currentTide: TideLevel.High,
      });

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('stuck');
    });

    it('should reject move for wrong player', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p2', { q: 0, r: 0 });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ];
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank],
        terrain,
        currentPlayer: 'p1', // Player 1's turn but unit belongs to p2
      });

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('do not own');
    });

    it('should reject move into impassable terrain', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 }, // Sea
      ];
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Sea },
      ];

      const state = createGameState({
        units: [tank],
        terrain,
        actionPoints: 10,
      });

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('enter');
    });

    it('should reject move into hex under enemy fire', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const enemyTank1 = createUnit('enemy-1', UnitType.Tank, 'p2', { q: 2, r: -1 });
      const enemyTank2 = createUnit('enemy-2', UnitType.Tank, 'p2', { q: 2, r: 1 });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 }, // Under fire from both enemy tanks
      ];
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: -1 }, type: TerrainType.Land },
        { coord: { q: 2, r: 1 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank, enemyTank1, enemyTank2],
        terrain,
        actionPoints: 10,
      });

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('under fire');
    });

    it('should reject move onto occupied hex', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 }, // Occupied
      ];
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2],
        terrain,
        actionPoints: 10,
      });

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('occupied');
    });

    it('should reject non-adjacent path segments', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const path: HexCoord[] = [
        { q: 0, r: 0 },
        { q: 3, r: 0 }, // Not adjacent
      ];
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 3, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank],
        terrain,
        actionPoints: 10,
      });

      const result = validateMoveAction(state, 'tank-1', path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('adjacent');
    });
  });

  describe('validateLoadAction', () => {
    it('should validate loading mineral into transporter', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const mineral: Mineral = { id: 'mineral-1', position: { q: 1, r: 0 } };
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab],
        minerals: [mineral],
        terrain,
        actionPoints: 5,
      });

      const result = validateLoadAction(state, 'crab-1', 'mineral-1');
      expect(result.valid).toBe(true);
      expect(result.apCost).toBe(GAME_CONSTANTS.AP_COST_LOAD);
    });

    it('should reject loading when transporter is full', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, {
        cargo: ['tank-1', 'tank-2'], // Crab capacity is 2
      });
      const mineral: Mineral = { id: 'mineral-1', position: { q: 1, r: 0 } };
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab],
        minerals: [mineral],
        terrain,
        actionPoints: 5,
      });

      const result = validateLoadAction(state, 'crab-1', 'mineral-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('capacity');
    });

    it('should reject loading from non-adjacent hex', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const mineral: Mineral = { id: 'mineral-1', position: { q: 3, r: 0 } }; // Not adjacent
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 3, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab],
        minerals: [mineral],
        terrain,
        actionPoints: 5,
      });

      const result = validateLoadAction(state, 'crab-1', 'mineral-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('adjacent');
    });

    it('should reject loading when under enemy fire', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const mineral: Mineral = { id: 'mineral-1', position: { q: 1, r: 0 } };
      const enemyTank1 = createUnit('enemy-1', UnitType.Tank, 'p2', { q: -1, r: 0 });
      const enemyTank2 = createUnit('enemy-2', UnitType.Tank, 'p2', { q: 0, r: -1 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: -1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 0, r: -1 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab, enemyTank1, enemyTank2],
        minerals: [mineral],
        terrain,
        actionPoints: 5,
      });

      const result = validateLoadAction(state, 'crab-1', 'mineral-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('under fire');
    });

    it('should reject loading unit that is stuck', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 }, { isStuck: true });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Reef },
      ];

      const state = createGameState({
        units: [crab, tank],
        terrain,
        actionPoints: 5,
        currentTide: TideLevel.Normal, // Reef becomes sea at normal tide
      });

      const result = validateLoadAction(state, 'crab-1', 'tank-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('stuck');
    });

    it('should validate loading a tank into crab', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab, tank],
        terrain,
        actionPoints: 5,
      });

      const result = validateLoadAction(state, 'crab-1', 'tank-1');
      expect(result.valid).toBe(true);
    });

    it('should reject loading converter into crab (too large)', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab, converter],
        terrain,
        actionPoints: 5,
      });

      const result = validateLoadAction(state, 'crab-1', 'converter-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot carry');
    });
  });

  describe('validateUnloadAction', () => {
    it('should validate unloading mineral to adjacent land hex', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const destination: HexCoord = { q: 1, r: 0 };
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab],
        minerals: [], // mineral is in cargo
        terrain,
        actionPoints: 5,
      });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', destination);
      expect(result.valid).toBe(true);
      expect(result.apCost).toBe(GAME_CONSTANTS.AP_COST_UNLOAD);
    });

    it('should reject unloading to sea hex', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const destination: HexCoord = { q: 1, r: 0 };
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Sea },
      ];

      const state = createGameState({
        units: [crab],
        terrain,
        actionPoints: 5,
      });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', destination);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sea');
    });

    it('should reject unloading to non-adjacent hex', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const destination: HexCoord = { q: 5, r: 0 }; // Not adjacent
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 5, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab],
        terrain,
        actionPoints: 5,
      });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', destination);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('adjacent');
    });

    it('should reject unloading to hex under fire', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const enemyTank1 = createUnit('enemy-1', UnitType.Tank, 'p2', { q: 2, r: -1 });
      const enemyTank2 = createUnit('enemy-2', UnitType.Tank, 'p2', { q: 2, r: 1 });
      const destination: HexCoord = { q: 1, r: 0 }; // Under fire
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: -1 }, type: TerrainType.Land },
        { coord: { q: 2, r: 1 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab, enemyTank1, enemyTank2],
        terrain,
        actionPoints: 5,
      });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', destination);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('under fire');
    });

    it('should reject unloading item not in cargo', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const destination: HexCoord = { q: 1, r: 0 };
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [crab],
        terrain,
        actionPoints: 5,
      });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-999', destination); // Wrong mineral
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in cargo');
    });
  });

  describe('validateFireAction', () => {
    it('should validate destruction with 2 units in range', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const enemyTank = createUnit('enemy', UnitType.Tank, 'p2', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2, enemyTank],
        terrain,
        actionPoints: 5,
      });

      const result = validateFireAction(state, ['tank-1', 'tank-2'], { q: 1, r: 0 });
      expect(result.valid).toBe(true);
      expect(result.apCost).toBe(GAME_CONSTANTS.AP_COST_FIRE);
    });

    it('should reject with only 1 attacker', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const enemyTank = createUnit('enemy', UnitType.Tank, 'p2', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, enemyTank],
        terrain,
        actionPoints: 5,
      });

      const result = validateFireAction(state, ['tank-1'], { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2');
    });

    it('should reject when target is out of range', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const targetHex: HexCoord = { q: 10, r: 0 }; // Out of range
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 10, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2],
        terrain,
        actionPoints: 5,
      });

      const result = validateFireAction(state, ['tank-1', 'tank-2'], targetHex);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('range');
    });

    it('should reject when attacker has no shots remaining', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { shotsRemaining: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 };
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2],
        terrain,
        actionPoints: 5,
      });

      const result = validateFireAction(state, ['tank-1', 'tank-2'], targetHex);
      expect(result.valid).toBe(false);
    });

    it('should reject when insufficient AP', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 };
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2],
        terrain,
        actionPoints: 1, // Not enough for 2 AP fire cost
      });

      const result = validateFireAction(state, ['tank-1', 'tank-2'], targetHex);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('action points');
    });
  });

  describe('validateCaptureAction', () => {
    it('should validate capture with 2 adjacent units', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const enemyTank = createUnit('enemy', UnitType.Tank, 'p2', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2, enemyTank],
        terrain,
        actionPoints: 5,
      });

      const result = validateCaptureAction(state, ['tank-1', 'tank-2'], 'enemy');
      expect(result.valid).toBe(true);
      expect(result.apCost).toBe(GAME_CONSTANTS.AP_COST_CAPTURE);
    });

    it('should reject capture of own unit', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const ownTank = createUnit('own', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 2, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2, ownTank],
        terrain,
        actionPoints: 5,
      });

      const result = validateCaptureAction(state, ['tank-1', 'tank-2'], 'own');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('enemy');
    });

    it('should reject capture when attackers not adjacent', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 5, r: 0 }); // Not adjacent
      const enemyTank = createUnit('enemy', UnitType.Tank, 'p2', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
        { coord: { q: 5, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank1, tank2, enemyTank],
        terrain,
        actionPoints: 5,
      });

      const result = validateCaptureAction(state, ['tank-1', 'tank-2'], 'enemy');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('adjacent');
    });
  });

  describe('validateBuildAction', () => {
    it('should validate building a tank', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 }, {
        cargo: ['mineral-1'],
      });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [converter],
        terrain,
        actionPoints: 5,
      });

      const result = validateBuildAction(state, 'converter-1', UnitType.Tank);
      expect(result.valid).toBe(true);
    });

    it('should reject building without mineral in converter', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 }, {
        cargo: [], // No mineral
      });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [converter],
        terrain,
        actionPoints: 5,
      });

      const result = validateBuildAction(state, 'converter-1', UnitType.Tank);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('mineral');
    });

    it('should reject building by non-converter unit', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank],
        terrain,
        actionPoints: 5,
      });

      const result = validateBuildAction(state, 'tank-1', UnitType.Tank);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Converter');
    });

    it('should reject building when converter is stuck', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 }, {
        cargo: ['mineral-1'],
        isStuck: true,
      });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Marsh },
      ];

      const state = createGameState({
        units: [converter],
        terrain,
        actionPoints: 5,
        currentTide: TideLevel.High,
      });

      const result = validateBuildAction(state, 'converter-1', UnitType.Tank);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('stuck');
    });
  });
});

// Import additional action functions
import {
  validateEnterAstronefAction,
  validateExitAstronefAction,
} from '../actions';

describe('Astronef Enter/Exit Actions', () => {
  describe('validateEnterAstronefAction', () => {
    it('should validate entering astronef with valid unit', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank, astronef],
        terrain,
        actionPoints: 5,
      });

      const result = validateEnterAstronefAction(state, 'tank-1', 0);
      expect(result.valid).toBe(true);
      expect(result.apCost).toBe(GAME_CONSTANTS.AP_COST_ENTER_ASTRONEF);
    });

    it('should reject entering with insufficient AP', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [tank, astronef],
        terrain,
        actionPoints: 0, // No AP
      });

      const result = validateEnterAstronefAction(state, 'tank-1', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('action points');
    });

    it('should reject entering with non-existent unit', () => {
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [astronef],
        actionPoints: 5,
      });

      const result = validateEnterAstronefAction(state, 'nonexistent', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject entering with enemy unit', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p2', { q: 1, r: 0 }); // Enemy unit
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [tank, astronef],
        actionPoints: 5,
        currentPlayer: 'p1',
      });

      const result = validateEnterAstronefAction(state, 'tank-1', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('enemy');
    });

    it('should reject entering when no astronef exists', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 });

      const state = createGameState({
        units: [tank],
        actionPoints: 5,
      });

      const result = validateEnterAstronefAction(state, 'tank-1', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('astronef');
    });

    it('should reject entering with invalid pode index', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [tank, astronef],
        actionPoints: 5,
      });

      const result = validateEnterAstronefAction(state, 'tank-1', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pode');
    });

    it('should reject entering with negative pode index', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [tank, astronef],
        actionPoints: 5,
      });

      const result = validateEnterAstronefAction(state, 'tank-1', -1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pode');
    });
  });

  describe('validateExitAstronefAction', () => {
    it('should validate exiting astronef to valid destination', () => {
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [astronef],
        terrain,
        actionPoints: 5,
      });

      const result = validateExitAstronefAction(state, 'tank-1', 0, { q: 1, r: 0 });
      expect(result.valid).toBe(true);
      expect(result.apCost).toBe(GAME_CONSTANTS.AP_COST_EXIT_ASTRONEF);
    });

    it('should reject exiting with insufficient AP', () => {
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [astronef],
        actionPoints: 0, // No AP
      });

      const result = validateExitAstronefAction(state, 'tank-1', 0, { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('action points');
    });

    it('should reject exiting when no astronef exists', () => {
      const state = createGameState({
        units: [],
        actionPoints: 5,
      });

      const result = validateExitAstronefAction(state, 'tank-1', 0, { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('astronef');
    });

    it('should reject exiting via destroyed tower', () => {
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: true }, // Tower 0 is destroyed
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [astronef],
        actionPoints: 5,
      });

      const result = validateExitAstronefAction(state, 'tank-1', 0, { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('destroyed');
    });

    it('should reject exiting with invalid pode index', () => {
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });

      const state = createGameState({
        units: [astronef],
        actionPoints: 5,
      });

      const result = validateExitAstronefAction(state, 'tank-1', 5, { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pode');
    });

    it('should reject exiting to hex under enemy fire', () => {
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: false },
          { podeIndex: 1, isDestroyed: false },
          { podeIndex: 2, isDestroyed: false },
        ],
      });
      const enemyTank1 = createUnit('enemy-1', UnitType.Tank, 'p2', { q: 2, r: -1 });
      const enemyTank2 = createUnit('enemy-2', UnitType.Tank, 'p2', { q: 2, r: 1 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land }, // Under fire
        { coord: { q: 2, r: -1 }, type: TerrainType.Land },
        { coord: { q: 2, r: 1 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [astronef, enemyTank1, enemyTank2],
        terrain,
        actionPoints: 5,
      });

      const result = validateExitAstronefAction(state, 'tank-1', 0, { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('under fire');
    });

    it('should allow exiting via intact tower', () => {
      const astronef = createUnit('astronef-1', UnitType.Astronef, 'p1', { q: 0, r: 0 }, {
        turrets: [
          { podeIndex: 0, isDestroyed: true },
          { podeIndex: 1, isDestroyed: false }, // Tower 1 is intact
          { podeIndex: 2, isDestroyed: true },
        ],
      });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({
        units: [astronef],
        terrain,
        actionPoints: 5,
      });

      const result = validateExitAstronefAction(state, 'tank-1', 1, { q: 1, r: 0 });
      expect(result.valid).toBe(true);
    });
  });
});

describe('Action Edge Cases', () => {
  describe('validateMoveAction edge cases', () => {
    it('should reject move for unit not found', () => {
      const state = createGameState({ units: [], actionPoints: 5 });
      const result = validateMoveAction(state, 'nonexistent', [{ q: 0, r: 0 }]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject move for neutralized unit', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isNeutralized: true });
      const state = createGameState({ units: [tank], actionPoints: 5 });

      const result = validateMoveAction(state, 'tank-1', [{ q: 0, r: 0 }, { q: 1, r: 0 }]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('neutralized');
    });

    it('should reject move when path does not start at unit position', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const state = createGameState({ units: [tank], actionPoints: 5 });

      const result = validateMoveAction(state, 'tank-1', [{ q: 5, r: 5 }, { q: 6, r: 5 }]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start at unit position');
    });
  });

  describe('validateLoadAction edge cases', () => {
    it('should reject loading with non-transporter', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const minerals: Mineral[] = [{ id: 'mineral-1', position: { q: 1, r: 0 } }];

      const state = createGameState({ units: [tank], minerals, actionPoints: 5 });

      const result = validateLoadAction(state, 'tank-1', 'mineral-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a transporter');
    });

    it('should reject loading with insufficient AP', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });
      const minerals: Mineral[] = [{ id: 'mineral-1', position: { q: 1, r: 0 } }];

      const state = createGameState({ units: [crab], minerals, actionPoints: 0 });

      const result = validateLoadAction(state, 'crab-1', 'mineral-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('action points');
    });

    it('should reject loading non-existent mineral', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });

      const state = createGameState({ units: [crab], minerals: [], actionPoints: 5 });

      const result = validateLoadAction(state, 'crab-1', 'mineral-nonexistent');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Mineral');
    });

    it('should reject loading non-existent unit', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });

      const state = createGameState({ units: [crab], actionPoints: 5 });

      const result = validateLoadAction(state, 'crab-1', 'tank-nonexistent');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('validateUnloadAction edge cases', () => {
    it('should reject unload with non-existent transporter', () => {
      const state = createGameState({ units: [], actionPoints: 5 });

      const result = validateUnloadAction(state, 'nonexistent', 'mineral-1', { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject unload with insufficient AP', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });

      const state = createGameState({ units: [crab], actionPoints: 0 });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('action points');
    });

    it('should reject unload when cargo not in transporter', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: [] });

      const state = createGameState({ units: [crab], actionPoints: 5 });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in cargo');
    });

    it('should reject unload to sea hex', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Sea },
      ];

      const state = createGameState({ units: [crab], terrain, actionPoints: 5 });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sea');
    });

    it('should reject unload to occupied hex', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }, { cargo: ['mineral-1'] });
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const terrain: HexTerrain[] = [
        { coord: { q: 0, r: 0 }, type: TerrainType.Land },
        { coord: { q: 1, r: 0 }, type: TerrainType.Land },
      ];

      const state = createGameState({ units: [crab, tank], terrain, actionPoints: 5 });

      const result = validateUnloadAction(state, 'crab-1', 'mineral-1', { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('occupied');
    });
  });

  describe('validateFireAction edge cases', () => {
    it('should reject fire with insufficient attackers', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });

      const state = createGameState({ units: [tank], actionPoints: 5 });

      const result = validateFireAction(state, ['tank-1'], { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2');
    });

    it('should reject fire with non-existent attacker', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });

      const state = createGameState({ units: [tank], actionPoints: 5 });

      const result = validateFireAction(state, ['tank-1', 'nonexistent'], { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject fire using enemy unit', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p2', { q: 2, r: 0 }); // Enemy

      const state = createGameState({ units: [tank1, tank2], actionPoints: 5 });

      const result = validateFireAction(state, ['tank-1', 'tank-2'], { q: 1, r: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('enemy');
    });
  });

  describe('validateCaptureAction edge cases', () => {
    it('should reject capture with insufficient attackers', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const enemy = createUnit('enemy-1', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const state = createGameState({ units: [tank, enemy], actionPoints: 5 });

      const result = validateCaptureAction(state, ['tank-1'], 'enemy-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2');
    });

    it('should reject capture with non-existent attacker', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const enemy = createUnit('enemy-1', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const state = createGameState({ units: [tank, enemy], actionPoints: 5 });

      const result = validateCaptureAction(state, ['tank-1', 'nonexistent'], 'enemy-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject capture using enemy unit as attacker', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p2', { q: 2, r: 0 }); // Enemy
      const target = createUnit('target', UnitType.Tank, 'p3', { q: 1, r: 0 });

      const state = createGameState({ units: [tank1, tank2, target], actionPoints: 5 });

      const result = validateCaptureAction(state, ['tank-1', 'tank-2'], 'target');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('enemy');
    });

    it('should reject capture with non-existent target', () => {
      const tank1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const tank2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });

      const state = createGameState({ units: [tank1, tank2], actionPoints: 5 });

      const result = validateCaptureAction(state, ['tank-1', 'tank-2'], 'nonexistent');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
