import { describe, it, expect } from 'vitest';
import {
  getCombatRange,
  canShootTarget,
  getHexesUnderFire,
  getHexesUnderFireByPlayer,
  isHexUnderFire,
  canDestroyTarget,
  canCaptureTarget,
  getValidAttackerPairs,
} from '../combat';
import { TerrainType, TideLevel, UnitType, type Unit, type HexCoord, type GameState, type HexTerrain } from '../types';

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

// Helper to create minimal terrain
function createTerrain(coord: HexCoord, type: TerrainType): HexTerrain {
  return { coord, type };
}

describe('Combat System', () => {
  describe('getCombatRange', () => {
    describe('Tank range', () => {
      it('should have base range of 2', () => {
        const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(tank, TerrainType.Land)).toBe(2);
      });

      it('should have range of 3 on mountain (mountain bonus)', () => {
        const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(tank, TerrainType.Mountain)).toBe(3);
      });

      it('should have range of 2 on marsh', () => {
        const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(tank, TerrainType.Marsh)).toBe(2);
      });
    });

    describe('SuperTank range', () => {
      it('should have base range of 3', () => {
        const superTank = createUnit('supertank-1', UnitType.SuperTank, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(superTank, TerrainType.Land)).toBe(3);
      });

      it('should NOT get mountain bonus (cannot enter mountains)', () => {
        const superTank = createUnit('supertank-1', UnitType.SuperTank, 'p1', { q: 0, r: 0 });
        // SuperTank cannot be on mountain, but if somehow it was, no bonus
        expect(getCombatRange(superTank, TerrainType.Mountain)).toBe(3);
      });
    });

    describe('MotorBoat range', () => {
      it('should have range of 2', () => {
        const motorboat = createUnit('motorboat-1', UnitType.MotorBoat, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(motorboat, TerrainType.Sea)).toBe(2);
      });
    });

    describe('Tower range', () => {
      it('should have range of 2', () => {
        const tower = createUnit('tower-1', UnitType.Tower, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(tower, TerrainType.Land)).toBe(2);
      });
    });

    describe('Non-combat units', () => {
      it('should have range of 0 for Barge', () => {
        const barge = createUnit('barge-1', UnitType.Barge, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(barge, TerrainType.Sea)).toBe(0);
      });

      it('should have range of 0 for Crab', () => {
        const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(crab, TerrainType.Land)).toBe(0);
      });

      it('should have range of 0 for Converter', () => {
        const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
        expect(getCombatRange(converter, TerrainType.Land)).toBe(0);
      });
    });
  });

  describe('canShootTarget', () => {
    it('should return true when target is within range', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const targetHex: HexCoord = { q: 2, r: 0 }; // Distance 2
      expect(canShootTarget(tank, targetHex, TerrainType.Land)).toBe(true);
    });

    it('should return false when target is out of range', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const targetHex: HexCoord = { q: 3, r: 0 }; // Distance 3
      expect(canShootTarget(tank, targetHex, TerrainType.Land)).toBe(false);
    });

    it('should return true for tank on mountain shooting at distance 3', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const targetHex: HexCoord = { q: 3, r: 0 }; // Distance 3
      expect(canShootTarget(tank, targetHex, TerrainType.Mountain)).toBe(true);
    });

    it('should return true for supertank at distance 3', () => {
      const superTank = createUnit('supertank-1', UnitType.SuperTank, 'p1', { q: 0, r: 0 });
      const targetHex: HexCoord = { q: 3, r: 0 }; // Distance 3
      expect(canShootTarget(superTank, targetHex, TerrainType.Land)).toBe(true);
    });

    it('should return false for non-combat unit', () => {
      const barge = createUnit('barge-1', UnitType.Barge, 'p1', { q: 0, r: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 }; // Adjacent
      expect(canShootTarget(barge, targetHex, TerrainType.Sea)).toBe(false);
    });

    it('should return false when unit has no shots remaining', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { shotsRemaining: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 };
      expect(canShootTarget(tank, targetHex, TerrainType.Land)).toBe(false);
    });

    it('should return false when unit is stuck', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: true });
      const targetHex: HexCoord = { q: 1, r: 0 };
      expect(canShootTarget(tank, targetHex, TerrainType.Land)).toBe(false);
    });

    it('should return false when unit is neutralized', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isNeutralized: true });
      const targetHex: HexCoord = { q: 1, r: 0 };
      expect(canShootTarget(tank, targetHex, TerrainType.Land)).toBe(false);
    });

    it('should NOT block tower when neutralized (towers can always fire back)', () => {
      const tower = createUnit('tower-1', UnitType.Tower, 'p1', { q: 0, r: 0 }, { isNeutralized: true });
      const targetHex: HexCoord = { q: 1, r: 0 };
      // Towers can fire back even when neutralized per rules
      expect(canShootTarget(tower, targetHex, TerrainType.Land, true)).toBe(true);
    });
  });

  describe('getHexesUnderFire', () => {
    it('should return empty set when no combat units', () => {
      const units: Unit[] = [];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);
      expect(underFire.size).toBe(0);
    });

    it('should return empty set with only one combat unit (need 2)', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
      ];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);
      expect(underFire.size).toBe(0);
    });

    it('should return hexes covered by 2+ combat units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }),
      ];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);

      // Hex at (1, 0) should be under fire (distance 1 from both tanks)
      expect(underFire.has('1,0')).toBe(true);
    });

    it('should not include hexes covered by only 1 unit', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 5, r: 0 }), // Far apart
      ];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);

      // These tanks are too far apart, no overlapping coverage
      // Tank at (0,0) covers hexes up to distance 2
      // Tank at (5,0) covers hexes up to distance 2
      // No overlap between them
      expect(underFire.has('0,0')).toBe(false); // Own hex not under enemy fire
    });

    it('should not count stuck units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { isStuck: true }),
      ];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);

      // Second tank is stuck, so no overlapping fire
      expect(underFire.size).toBe(0);
    });

    it('should not count neutralized units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { isNeutralized: true }),
      ];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);

      expect(underFire.size).toBe(0);
    });

    it('should only count units belonging to specified player', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p2', { q: 2, r: 0 }), // Different player
      ];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);

      // Only one unit from p1, so no overlapping fire
      expect(underFire.size).toBe(0);
    });

    it('should count 3 overlapping units correctly', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }),
        createUnit('tank-3', UnitType.Tank, 'p1', { q: 1, r: -1 }),
      ];
      const underFire = getHexesUnderFire(units, 'p1', () => TerrainType.Land);

      // Center area should be well covered
      expect(underFire.has('1,0')).toBe(true);
    });

    it('should respect mountain bonus for range calculation', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 6, r: 0 }),
      ];

      // With normal terrain (range 2), no overlap
      const underFireNormal = getHexesUnderFire(units, 'p1', () => TerrainType.Land);
      expect(underFireNormal.has('3,0')).toBe(false);

      // With mountain terrain (range 3), there might be overlap at (3,0)
      const underFireMountain = getHexesUnderFire(units, 'p1', () => TerrainType.Mountain);
      expect(underFireMountain.has('3,0')).toBe(true);
    });
  });

  describe('getHexesUnderFireByPlayer', () => {
    it('should return map of hexes under fire by each enemy player', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }),
        createUnit('tank-3', UnitType.Tank, 'p2', { q: 10, r: 0 }),
        createUnit('tank-4', UnitType.Tank, 'p2', { q: 12, r: 0 }),
      ];

      const fireMap = getHexesUnderFireByPlayer(units, ['p1', 'p2'], () => TerrainType.Land);

      expect(fireMap.has('p1')).toBe(true);
      expect(fireMap.has('p2')).toBe(true);
      expect(fireMap.get('p1')?.has('1,0')).toBe(true);
      expect(fireMap.get('p2')?.has('11,0')).toBe(true);
    });
  });

  describe('isHexUnderFire', () => {
    it('should return true when hex is covered by 2+ enemy units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }),
      ];
      const hex: HexCoord = { q: 1, r: 0 };

      expect(isHexUnderFire(hex, units, 'p1', () => TerrainType.Land)).toBe(true);
    });

    it('should return false when hex is not covered by 2+ units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
      ];
      const hex: HexCoord = { q: 1, r: 0 };

      expect(isHexUnderFire(hex, units, 'p1', () => TerrainType.Land)).toBe(false);
    });
  });

  describe('canDestroyTarget', () => {
    it('should return true with 2 valid attackers', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 };

      const result = canDestroyTarget(
        [attacker1, attacker2],
        targetHex,
        () => TerrainType.Land
      );

      expect(result.valid).toBe(true);
    });

    it('should return false with only 1 attacker', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 };

      const result = canDestroyTarget([attacker1], targetHex, () => TerrainType.Land);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 combat units');
    });

    it('should return false when target out of range', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 1, r: 0 });
      const targetHex: HexCoord = { q: 10, r: 0 }; // Out of range

      const result = canDestroyTarget(
        [attacker1, attacker2],
        targetHex,
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('range');
    });

    it('should return false when attackers belong to different players', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p2', { q: 2, r: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 };

      const result = canDestroyTarget(
        [attacker1, attacker2],
        targetHex,
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('same player');
    });

    it('should return false when attacker has no shots remaining', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { shotsRemaining: 0 });
      const targetHex: HexCoord = { q: 1, r: 0 };

      const result = canDestroyTarget(
        [attacker1, attacker2],
        targetHex,
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('canCaptureTarget', () => {
    it('should return true when 2 combat units adjacent to target', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const result = canCaptureTarget(
        [attacker1, attacker2],
        target,
        [],
        () => TerrainType.Land
      );

      expect(result.valid).toBe(true);
    });

    it('should return false when attackers not adjacent', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 5, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 3, r: 0 });

      const result = canCaptureTarget(
        [attacker1, attacker2],
        target,
        [],
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('adjacent');
    });

    it('should return false when trying to capture own unit', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const target = createUnit('own-tank', UnitType.Tank, 'p1', { q: 1, r: 0 }); // Same player

      const result = canCaptureTarget(
        [attacker1, attacker2],
        target,
        [],
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('enemy');
    });

    it('should return false when attackers are under enemy fire', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      // Enemy units creating fire zone
      const enemyUnits = [
        createUnit('enemy-1', UnitType.Tank, 'p2', { q: -1, r: 0 }),
        createUnit('enemy-2', UnitType.Tank, 'p2', { q: -1, r: 1 }),
      ];

      const result = canCaptureTarget(
        [attacker1, attacker2],
        target,
        enemyUnits,
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('under fire');
    });

    it('should return false when target is under enemy fire', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      // Another enemy player creating fire on the target
      const otherEnemyUnits = [
        createUnit('enemy-p3-1', UnitType.Tank, 'p3', { q: 1, r: 1 }),
        createUnit('enemy-p3-2', UnitType.Tank, 'p3', { q: 1, r: -1 }),
      ];

      const result = canCaptureTarget(
        [attacker1, attacker2],
        target,
        otherEnemyUnits,
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('under fire');
    });

    it('should require only 1 attacker to be adjacent for combat units', () => {
      // Actually per rules, both must be adjacent for capture
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 3, r: 0 }); // Not adjacent
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const result = canCaptureTarget(
        [attacker1, attacker2],
        target,
        [],
        () => TerrainType.Land
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('getValidAttackerPairs', () => {
    it('should return all valid pairs of combat units that can attack a target', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }),
        createUnit('tank-3', UnitType.Tank, 'p1', { q: 1, r: 1 }),
      ];
      const targetHex: HexCoord = { q: 1, r: 0 };

      const pairs = getValidAttackerPairs(units, 'p1', targetHex, () => TerrainType.Land);

      // All 3 tanks can reach the target, so we should have 3 pairs: (1,2), (1,3), (2,3)
      expect(pairs.length).toBe(3);
    });

    it('should return empty array when no valid pairs', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 10, r: 0 }), // Too far
      ];
      const targetHex: HexCoord = { q: 1, r: 0 };

      const pairs = getValidAttackerPairs(units, 'p1', targetHex, () => TerrainType.Land);

      expect(pairs.length).toBe(0);
    });

    it('should not include non-combat units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('crab-1', UnitType.Crab, 'p1', { q: 2, r: 0 }), // Non-combat
      ];
      const targetHex: HexCoord = { q: 1, r: 0 };

      const pairs = getValidAttackerPairs(units, 'p1', targetHex, () => TerrainType.Land);

      expect(pairs.length).toBe(0);
    });

    it('should not include stuck units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { isStuck: true }),
      ];
      const targetHex: HexCoord = { q: 1, r: 0 };

      const pairs = getValidAttackerPairs(units, 'p1', targetHex, () => TerrainType.Land);

      expect(pairs.length).toBe(0);
    });

    it('should not include units with no shots remaining', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { shotsRemaining: 0 }),
      ];
      const targetHex: HexCoord = { q: 1, r: 0 };

      const pairs = getValidAttackerPairs(units, 'p1', targetHex, () => TerrainType.Land);

      expect(pairs.length).toBe(0);
    });

    it('should not include neutralized units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 }, { isNeutralized: true }),
      ];
      const targetHex: HexCoord = { q: 1, r: 0 };

      const pairs = getValidAttackerPairs(units, 'p1', targetHex, () => TerrainType.Land);

      expect(pairs.length).toBe(0);
    });
  });
});

// Import additional combat functions
import {
  isCombatUnit,
  canUnitFire,
  getActiveCombatUnits,
} from '../combat';

describe('Combat Unit Detection', () => {
  describe('isCombatUnit', () => {
    it('should return true for Tank', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(tank)).toBe(true);
    });

    it('should return true for SuperTank', () => {
      const superTank = createUnit('supertank-1', UnitType.SuperTank, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(superTank)).toBe(true);
    });

    it('should return true for MotorBoat', () => {
      const motorBoat = createUnit('motorboat-1', UnitType.MotorBoat, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(motorBoat)).toBe(true);
    });

    it('should return true for Tower', () => {
      const tower = createUnit('tower-1', UnitType.Tower, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(tower)).toBe(true);
    });

    it('should return false for Barge', () => {
      const barge = createUnit('barge-1', UnitType.Barge, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(barge)).toBe(false);
    });

    it('should return false for Crab', () => {
      const crab = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(crab)).toBe(false);
    });

    it('should return false for Converter', () => {
      const converter = createUnit('converter-1', UnitType.Converter, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(converter)).toBe(false);
    });

    it('should return false for Bridge', () => {
      const bridge = createUnit('bridge-1', UnitType.Bridge, 'p1', { q: 0, r: 0 });
      expect(isCombatUnit(bridge)).toBe(false);
    });
  });

  describe('canUnitFire', () => {
    it('should return true for healthy combat unit', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      expect(canUnitFire(tank)).toBe(true);
    });

    it('should return false for non-combat unit', () => {
      const barge = createUnit('barge-1', UnitType.Barge, 'p1', { q: 0, r: 0 });
      expect(canUnitFire(barge)).toBe(false);
    });

    it('should return false when unit has no shots remaining', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { shotsRemaining: 0 });
      expect(canUnitFire(tank)).toBe(false);
    });

    it('should return false when unit is stuck', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: true });
      expect(canUnitFire(tank)).toBe(false);
    });

    it('should return false when unit is neutralized (except Tower)', () => {
      const tank = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isNeutralized: true });
      expect(canUnitFire(tank)).toBe(false);
    });

    it('should return true for neutralized Tower (can fire back)', () => {
      const tower = createUnit('tower-1', UnitType.Tower, 'p1', { q: 0, r: 0 }, { isNeutralized: true });
      expect(canUnitFire(tower)).toBe(true);
    });
  });

  describe('getActiveCombatUnits', () => {
    it('should return only combat units that can fire', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 1, r: 0 }, { shotsRemaining: 0 }),
        createUnit('crab-1', UnitType.Crab, 'p1', { q: 2, r: 0 }),
        createUnit('tank-3', UnitType.Tank, 'p2', { q: 3, r: 0 }), // Different player
      ];

      const active = getActiveCombatUnits(units, 'p1');

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('tank-1');
    });

    it('should return empty array when no active combat units', () => {
      const units = [
        createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 }),
        createUnit('barge-1', UnitType.Barge, 'p1', { q: 1, r: 0 }),
      ];

      const active = getActiveCombatUnits(units, 'p1');

      expect(active).toHaveLength(0);
    });

    it('should include all healthy combat units for player', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('supertank-1', UnitType.SuperTank, 'p1', { q: 1, r: 0 }),
        createUnit('motorboat-1', UnitType.MotorBoat, 'p1', { q: 2, r: 0 }),
        createUnit('tower-1', UnitType.Tower, 'p1', { q: 3, r: 0 }),
      ];

      const active = getActiveCombatUnits(units, 'p1');

      expect(active).toHaveLength(4);
    });

    it('should exclude stuck and neutralized combat units', () => {
      const units = [
        createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }),
        createUnit('tank-2', UnitType.Tank, 'p1', { q: 1, r: 0 }, { isStuck: true }),
        createUnit('tank-3', UnitType.Tank, 'p1', { q: 2, r: 0 }, { isNeutralized: true }),
      ];

      const active = getActiveCombatUnits(units, 'p1');

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('tank-1');
    });

    it('should include neutralized Tower (can fire back)', () => {
      const units = [
        createUnit('tower-1', UnitType.Tower, 'p1', { q: 0, r: 0 }, { isNeutralized: true }),
      ];

      const active = getActiveCombatUnits(units, 'p1');

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('tower-1');
    });
  });
});

describe('Capture Edge Cases', () => {
  describe('canCaptureTarget - additional cases', () => {
    it('should reject capture with less than 2 attackers', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const result = canCaptureTarget([attacker1], target, [], () => TerrainType.Land);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('2');
    });

    it('should reject capture when attackers belong to different players', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p3', { q: 2, r: 0 }); // Different owner
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const result = canCaptureTarget([attacker1, attacker2], target, [], () => TerrainType.Land);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('same player');
    });

    it('should reject capture with non-combat unit (Crab)', () => {
      const attacker1 = createUnit('crab-1', UnitType.Crab, 'p1', { q: 0, r: 0 });
      const attacker2 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const result = canCaptureTarget([attacker1, attacker2], target, [], () => TerrainType.Land);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a combat unit');
    });

    it('should reject capture when attacker is stuck', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isStuck: true });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const result = canCaptureTarget([attacker1, attacker2], target, [], () => TerrainType.Land);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('stuck');
    });

    it('should reject capture when attacker is neutralized', () => {
      const attacker1 = createUnit('tank-1', UnitType.Tank, 'p1', { q: 0, r: 0 }, { isNeutralized: true });
      const attacker2 = createUnit('tank-2', UnitType.Tank, 'p1', { q: 2, r: 0 });
      const target = createUnit('enemy-tank', UnitType.Tank, 'p2', { q: 1, r: 0 });

      const result = canCaptureTarget([attacker1, attacker2], target, [], () => TerrainType.Land);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('neutralized');
    });
  });
});
