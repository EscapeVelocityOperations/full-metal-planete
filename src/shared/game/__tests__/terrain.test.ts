import { describe, it, expect } from 'vitest';
import {
  getEffectiveTerrain,
  canUnitEnterTerrain,
  isUnitStuck,
  isUnitGrounded,
  canCollectMineral,
  getTerrainMovementEffect,
  canVoluntarilyNeutralize,
  getVoluntaryNeutralizationResult,
} from '../terrain';
import { TerrainType, TideLevel, UnitType } from '../types';

describe('Terrain System', () => {
  describe('getEffectiveTerrain', () => {
    // Sea terrain - always sea regardless of tide
    describe('Sea terrain', () => {
      it('should return sea at low tide', () => {
        expect(getEffectiveTerrain(TerrainType.Sea, TideLevel.Low)).toBe('sea');
      });

      it('should return sea at normal tide', () => {
        expect(getEffectiveTerrain(TerrainType.Sea, TideLevel.Normal)).toBe('sea');
      });

      it('should return sea at high tide', () => {
        expect(getEffectiveTerrain(TerrainType.Sea, TideLevel.High)).toBe('sea');
      });
    });

    // Land terrain - always land regardless of tide
    describe('Land terrain', () => {
      it('should return land at low tide', () => {
        expect(getEffectiveTerrain(TerrainType.Land, TideLevel.Low)).toBe('land');
      });

      it('should return land at normal tide', () => {
        expect(getEffectiveTerrain(TerrainType.Land, TideLevel.Normal)).toBe('land');
      });

      it('should return land at high tide', () => {
        expect(getEffectiveTerrain(TerrainType.Land, TideLevel.High)).toBe('land');
      });
    });

    // Mountain terrain - always land (elevated ground)
    describe('Mountain terrain', () => {
      it('should return land at low tide', () => {
        expect(getEffectiveTerrain(TerrainType.Mountain, TideLevel.Low)).toBe('land');
      });

      it('should return land at normal tide', () => {
        expect(getEffectiveTerrain(TerrainType.Mountain, TideLevel.Normal)).toBe('land');
      });

      it('should return land at high tide', () => {
        expect(getEffectiveTerrain(TerrainType.Mountain, TideLevel.High)).toBe('land');
      });
    });

    // Marsh terrain - affected by tide
    describe('Marsh terrain', () => {
      it('should return land at low tide', () => {
        expect(getEffectiveTerrain(TerrainType.Marsh, TideLevel.Low)).toBe('land');
      });

      it('should return land at normal tide', () => {
        expect(getEffectiveTerrain(TerrainType.Marsh, TideLevel.Normal)).toBe('land');
      });

      it('should return sea at high tide', () => {
        expect(getEffectiveTerrain(TerrainType.Marsh, TideLevel.High)).toBe('sea');
      });
    });

    // Reef terrain - affected by tide
    describe('Reef terrain', () => {
      it('should return land at low tide', () => {
        expect(getEffectiveTerrain(TerrainType.Reef, TideLevel.Low)).toBe('land');
      });

      it('should return sea at normal tide', () => {
        expect(getEffectiveTerrain(TerrainType.Reef, TideLevel.Normal)).toBe('sea');
      });

      it('should return sea at high tide', () => {
        expect(getEffectiveTerrain(TerrainType.Reef, TideLevel.High)).toBe('sea');
      });
    });
  });

  describe('canUnitEnterTerrain', () => {
    // Land units
    describe('Tank (land unit)', () => {
      it('should be able to enter land terrain', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Land, TideLevel.Normal)).toBe(true);
      });

      it('should be able to enter marsh at low tide', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Marsh, TideLevel.Low)).toBe(true);
      });

      it('should be able to enter marsh at normal tide', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Marsh, TideLevel.Normal)).toBe(true);
      });

      it('should NOT be able to enter marsh at high tide (becomes sea)', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Marsh, TideLevel.High)).toBe(false);
      });

      it('should be able to enter reef at low tide', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Reef, TideLevel.Low)).toBe(true);
      });

      it('should NOT be able to enter reef at normal tide (becomes sea)', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Reef, TideLevel.Normal)).toBe(false);
      });

      it('should NOT be able to enter sea', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Sea, TideLevel.Normal)).toBe(false);
      });

      it('should be able to enter mountain', () => {
        expect(canUnitEnterTerrain(UnitType.Tank, TerrainType.Mountain, TideLevel.Normal)).toBe(true);
      });
    });

    describe('SuperTank (land unit, cannot enter mountains)', () => {
      it('should be able to enter land terrain', () => {
        expect(canUnitEnterTerrain(UnitType.SuperTank, TerrainType.Land, TideLevel.Normal)).toBe(true);
      });

      it('should NOT be able to enter mountain', () => {
        expect(canUnitEnterTerrain(UnitType.SuperTank, TerrainType.Mountain, TideLevel.Normal)).toBe(false);
      });

      it('should NOT be able to enter sea', () => {
        expect(canUnitEnterTerrain(UnitType.SuperTank, TerrainType.Sea, TideLevel.Normal)).toBe(false);
      });
    });

    // Sea units
    describe('MotorBoat (sea unit)', () => {
      it('should be able to enter sea terrain', () => {
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Sea, TideLevel.Normal)).toBe(true);
      });

      it('should NOT be able to enter land terrain', () => {
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Land, TideLevel.Normal)).toBe(false);
      });

      it('should NOT be able to enter marsh at low/normal tide (land)', () => {
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Low)).toBe(false);
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Normal)).toBe(false);
      });

      it('should be able to enter marsh at high tide (becomes sea)', () => {
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.High)).toBe(true);
      });

      it('should NOT be able to enter reef at low tide (land)', () => {
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Reef, TideLevel.Low)).toBe(false);
      });

      it('should be able to enter reef at normal/high tide (sea)', () => {
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Reef, TideLevel.Normal)).toBe(true);
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Reef, TideLevel.High)).toBe(true);
      });

      it('should NOT be able to enter mountain', () => {
        expect(canUnitEnterTerrain(UnitType.MotorBoat, TerrainType.Mountain, TideLevel.Normal)).toBe(false);
      });
    });

    describe('Barge (sea unit)', () => {
      it('should be able to enter sea terrain', () => {
        expect(canUnitEnterTerrain(UnitType.Barge, TerrainType.Sea, TideLevel.Normal)).toBe(true);
      });

      it('should NOT be able to enter land terrain', () => {
        expect(canUnitEnterTerrain(UnitType.Barge, TerrainType.Land, TideLevel.Normal)).toBe(false);
      });
    });

    // Land transporters
    describe('Crab (land transporter)', () => {
      it('should be able to enter land terrain', () => {
        expect(canUnitEnterTerrain(UnitType.Crab, TerrainType.Land, TideLevel.Normal)).toBe(true);
      });

      it('should be able to enter mountain', () => {
        expect(canUnitEnterTerrain(UnitType.Crab, TerrainType.Mountain, TideLevel.Normal)).toBe(true);
      });

      it('should NOT be able to enter sea', () => {
        expect(canUnitEnterTerrain(UnitType.Crab, TerrainType.Sea, TideLevel.Normal)).toBe(false);
      });
    });

    describe('Converter (land unit)', () => {
      it('should be able to enter land terrain', () => {
        expect(canUnitEnterTerrain(UnitType.Converter, TerrainType.Land, TideLevel.Normal)).toBe(true);
      });

      it('should be able to enter mountain', () => {
        expect(canUnitEnterTerrain(UnitType.Converter, TerrainType.Mountain, TideLevel.Normal)).toBe(true);
      });
    });

    // Fixed/inert units
    describe('Bridge (inert)', () => {
      it('should not have normal movement rules (domain is none)', () => {
        // Bridges are placed, not moved normally
        expect(canUnitEnterTerrain(UnitType.Bridge, TerrainType.Sea, TideLevel.Normal)).toBe(false);
        expect(canUnitEnterTerrain(UnitType.Bridge, TerrainType.Land, TideLevel.Normal)).toBe(false);
      });
    });

    describe('Tower (fixed)', () => {
      it('should not have normal movement rules', () => {
        expect(canUnitEnterTerrain(UnitType.Tower, TerrainType.Land, TideLevel.Normal)).toBe(false);
      });
    });

    describe('Astronef (fixed)', () => {
      it('should not have normal movement rules', () => {
        expect(canUnitEnterTerrain(UnitType.Astronef, TerrainType.Land, TideLevel.Normal)).toBe(false);
      });
    });
  });

  describe('isUnitStuck', () => {
    describe('Land units on terrain that becomes sea', () => {
      it('should be stuck when on marsh at high tide', () => {
        expect(isUnitStuck(UnitType.Tank, TerrainType.Marsh, TideLevel.High)).toBe(true);
      });

      it('should NOT be stuck when on marsh at normal tide', () => {
        expect(isUnitStuck(UnitType.Tank, TerrainType.Marsh, TideLevel.Normal)).toBe(false);
      });

      it('should be stuck when on reef at normal tide', () => {
        expect(isUnitStuck(UnitType.Tank, TerrainType.Reef, TideLevel.Normal)).toBe(true);
      });

      it('should be stuck when on reef at high tide', () => {
        expect(isUnitStuck(UnitType.Tank, TerrainType.Reef, TideLevel.High)).toBe(true);
      });

      it('should NOT be stuck when on reef at low tide', () => {
        expect(isUnitStuck(UnitType.Tank, TerrainType.Reef, TideLevel.Low)).toBe(false);
      });

      it('should never be stuck on land terrain', () => {
        expect(isUnitStuck(UnitType.Tank, TerrainType.Land, TideLevel.Low)).toBe(false);
        expect(isUnitStuck(UnitType.Tank, TerrainType.Land, TideLevel.Normal)).toBe(false);
        expect(isUnitStuck(UnitType.Tank, TerrainType.Land, TideLevel.High)).toBe(false);
      });

      it('should never be stuck on mountain terrain', () => {
        expect(isUnitStuck(UnitType.Tank, TerrainType.Mountain, TideLevel.High)).toBe(false);
      });
    });

    describe('Crab stuck behavior', () => {
      it('should be stuck on marsh at high tide', () => {
        expect(isUnitStuck(UnitType.Crab, TerrainType.Marsh, TideLevel.High)).toBe(true);
      });

      it('should be stuck on reef at normal/high tide', () => {
        expect(isUnitStuck(UnitType.Crab, TerrainType.Reef, TideLevel.Normal)).toBe(true);
        expect(isUnitStuck(UnitType.Crab, TerrainType.Reef, TideLevel.High)).toBe(true);
      });
    });

    describe('Sea units should not get stuck (they get grounded)', () => {
      it('should NOT be stuck for motor boat', () => {
        expect(isUnitStuck(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Low)).toBe(false);
        expect(isUnitStuck(UnitType.MotorBoat, TerrainType.Reef, TideLevel.Low)).toBe(false);
      });

      it('should NOT be stuck for barge', () => {
        expect(isUnitStuck(UnitType.Barge, TerrainType.Marsh, TideLevel.Low)).toBe(false);
      });
    });
  });

  describe('isUnitGrounded', () => {
    describe('Sea units on terrain that becomes land', () => {
      it('should be grounded when on marsh at low tide', () => {
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Low)).toBe(true);
      });

      it('should be grounded when on marsh at normal tide', () => {
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Normal)).toBe(true);
      });

      it('should NOT be grounded when on marsh at high tide', () => {
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.High)).toBe(false);
      });

      it('should be grounded when on reef at low tide', () => {
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Reef, TideLevel.Low)).toBe(true);
      });

      it('should NOT be grounded when on reef at normal/high tide', () => {
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Reef, TideLevel.Normal)).toBe(false);
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Reef, TideLevel.High)).toBe(false);
      });

      it('should never be grounded on sea terrain', () => {
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Sea, TideLevel.Low)).toBe(false);
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Sea, TideLevel.Normal)).toBe(false);
        expect(isUnitGrounded(UnitType.MotorBoat, TerrainType.Sea, TideLevel.High)).toBe(false);
      });
    });

    describe('Barge grounded behavior', () => {
      it('should be grounded on marsh at low/normal tide', () => {
        expect(isUnitGrounded(UnitType.Barge, TerrainType.Marsh, TideLevel.Low)).toBe(true);
        expect(isUnitGrounded(UnitType.Barge, TerrainType.Marsh, TideLevel.Normal)).toBe(true);
      });

      it('should be grounded on reef at low tide', () => {
        expect(isUnitGrounded(UnitType.Barge, TerrainType.Reef, TideLevel.Low)).toBe(true);
      });
    });

    describe('Land units should not get grounded (they get stuck)', () => {
      it('should NOT be grounded for tank', () => {
        expect(isUnitGrounded(UnitType.Tank, TerrainType.Marsh, TideLevel.High)).toBe(false);
      });

      it('should NOT be grounded for crab', () => {
        expect(isUnitGrounded(UnitType.Crab, TerrainType.Marsh, TideLevel.High)).toBe(false);
      });
    });
  });

  describe('getTerrainMovementEffect', () => {
    describe('Land units', () => {
      it('should return normal for land unit on land', () => {
        expect(getTerrainMovementEffect(UnitType.Tank, TerrainType.Land, TideLevel.Normal)).toBe('normal');
      });

      it('should return stuck for land unit on flooded terrain', () => {
        expect(getTerrainMovementEffect(UnitType.Tank, TerrainType.Marsh, TideLevel.High)).toBe('stuck');
      });

      it('should return blocked for land unit trying to enter sea', () => {
        expect(getTerrainMovementEffect(UnitType.Tank, TerrainType.Sea, TideLevel.Normal)).toBe('blocked');
      });
    });

    describe('Sea units', () => {
      it('should return normal for sea unit on sea', () => {
        expect(getTerrainMovementEffect(UnitType.MotorBoat, TerrainType.Sea, TideLevel.Normal)).toBe('normal');
      });

      it('should return grounded for sea unit on exposed terrain', () => {
        expect(getTerrainMovementEffect(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Low)).toBe('grounded');
      });

      it('should return blocked for sea unit trying to enter land', () => {
        expect(getTerrainMovementEffect(UnitType.MotorBoat, TerrainType.Land, TideLevel.Normal)).toBe('blocked');
      });
    });
  });

  describe('canCollectMineral', () => {
    describe('Plain terrain', () => {
      it('should allow collection at any tide', () => {
        expect(canCollectMineral(TerrainType.Land, TideLevel.Low)).toBe(true);
        expect(canCollectMineral(TerrainType.Land, TideLevel.Normal)).toBe(true);
        expect(canCollectMineral(TerrainType.Land, TideLevel.High)).toBe(true);
      });
    });

    describe('Marsh terrain', () => {
      it('should allow collection at low tide', () => {
        expect(canCollectMineral(TerrainType.Marsh, TideLevel.Low)).toBe(true);
      });

      it('should allow collection at normal tide', () => {
        expect(canCollectMineral(TerrainType.Marsh, TideLevel.Normal)).toBe(true);
      });

      it('should NOT allow collection at high tide (flooded)', () => {
        expect(canCollectMineral(TerrainType.Marsh, TideLevel.High)).toBe(false);
      });
    });

    describe('Reef terrain', () => {
      it('should allow collection at low tide', () => {
        expect(canCollectMineral(TerrainType.Reef, TideLevel.Low)).toBe(true);
      });

      it('should NOT allow collection at normal tide (flooded)', () => {
        expect(canCollectMineral(TerrainType.Reef, TideLevel.Normal)).toBe(false);
      });

      it('should NOT allow collection at high tide (flooded)', () => {
        expect(canCollectMineral(TerrainType.Reef, TideLevel.High)).toBe(false);
      });
    });

    describe('Sea terrain', () => {
      it('should NOT allow collection (no minerals placed on sea)', () => {
        expect(canCollectMineral(TerrainType.Sea, TideLevel.Low)).toBe(false);
        expect(canCollectMineral(TerrainType.Sea, TideLevel.Normal)).toBe(false);
        expect(canCollectMineral(TerrainType.Sea, TideLevel.High)).toBe(false);
      });
    });

    describe('Mountain terrain', () => {
      it('should NOT allow collection (no minerals on mountains per rules)', () => {
        // Rules state minerals on plain, marsh, reef only
        expect(canCollectMineral(TerrainType.Mountain, TideLevel.Normal)).toBe(false);
      });
    });
  });
});

// Import additional terrain functions
import {
  canAstronefLandOn,
  isAstronefAffectedByTide,
  canPlaceBridge,
  isBridgeValid,
} from '../terrain';

describe('Astronef Landing Rules', () => {
  describe('canAstronefLandOn', () => {
    it('should allow landing on plain (land) terrain', () => {
      expect(canAstronefLandOn(TerrainType.Land)).toBe(true);
    });

    it('should allow landing on marsh terrain', () => {
      expect(canAstronefLandOn(TerrainType.Marsh)).toBe(true);
    });

    it('should NOT allow landing on sea terrain', () => {
      expect(canAstronefLandOn(TerrainType.Sea)).toBe(false);
    });

    it('should NOT allow landing on mountain terrain', () => {
      expect(canAstronefLandOn(TerrainType.Mountain)).toBe(false);
    });

    it('should NOT allow landing on reef terrain', () => {
      expect(canAstronefLandOn(TerrainType.Reef)).toBe(false);
    });
  });

  describe('isAstronefAffectedByTide', () => {
    it('should return false (astronef is immune to tides)', () => {
      expect(isAstronefAffectedByTide()).toBe(false);
    });
  });
});

describe('Bridge Rules', () => {
  describe('canPlaceBridge', () => {
    it('should allow placement on sea terrain at any tide', () => {
      expect(canPlaceBridge(TerrainType.Sea, TideLevel.Low)).toBe(true);
      expect(canPlaceBridge(TerrainType.Sea, TideLevel.Normal)).toBe(true);
      expect(canPlaceBridge(TerrainType.Sea, TideLevel.High)).toBe(true);
    });

    it('should NOT allow placement on land terrain', () => {
      expect(canPlaceBridge(TerrainType.Land, TideLevel.Normal)).toBe(false);
    });

    it('should NOT allow placement on mountain terrain', () => {
      expect(canPlaceBridge(TerrainType.Mountain, TideLevel.Normal)).toBe(false);
    });

    it('should allow placement on reef at normal/high tide (when sea)', () => {
      expect(canPlaceBridge(TerrainType.Reef, TideLevel.Normal)).toBe(true);
      expect(canPlaceBridge(TerrainType.Reef, TideLevel.High)).toBe(true);
    });

    it('should NOT allow placement on reef at low tide (when land)', () => {
      expect(canPlaceBridge(TerrainType.Reef, TideLevel.Low)).toBe(false);
    });

    it('should allow placement on marsh at high tide (when sea)', () => {
      expect(canPlaceBridge(TerrainType.Marsh, TideLevel.High)).toBe(true);
    });

    it('should NOT allow placement on marsh at low/normal tide (when land)', () => {
      expect(canPlaceBridge(TerrainType.Marsh, TideLevel.Low)).toBe(false);
      expect(canPlaceBridge(TerrainType.Marsh, TideLevel.Normal)).toBe(false);
    });
  });

  describe('isBridgeValid', () => {
    it('should return true when bridge connects to land or another bridge', () => {
      expect(isBridgeValid(TerrainType.Sea, TideLevel.Normal, true)).toBe(true);
    });

    it('should return false when bridge has no connecting land/bridge', () => {
      expect(isBridgeValid(TerrainType.Sea, TideLevel.Normal, false)).toBe(false);
    });

    it('should return true on reef terrain with connection', () => {
      expect(isBridgeValid(TerrainType.Reef, TideLevel.Normal, true)).toBe(true);
    });

    it('should return true on marsh terrain with connection', () => {
      expect(isBridgeValid(TerrainType.Marsh, TideLevel.High, true)).toBe(true);
    });
  });
});

describe('Terrain Edge Cases', () => {
  describe('getTerrainMovementEffect edge cases', () => {
    it('should return blocked for fixed units (Tower)', () => {
      expect(getTerrainMovementEffect(UnitType.Tower, TerrainType.Land, TideLevel.Normal)).toBe('blocked');
    });

    it('should return blocked for inert units (Bridge)', () => {
      expect(getTerrainMovementEffect(UnitType.Bridge, TerrainType.Sea, TideLevel.Normal)).toBe('blocked');
    });

    it('should return blocked for Astronef (fixed domain)', () => {
      expect(getTerrainMovementEffect(UnitType.Astronef, TerrainType.Land, TideLevel.Normal)).toBe('blocked');
    });

    it('should return blocked for SuperTank trying to enter mountain', () => {
      expect(getTerrainMovementEffect(UnitType.SuperTank, TerrainType.Mountain, TideLevel.Normal)).toBe('blocked');
    });
  });
});

describe('Voluntary Neutralization (Section 3.4)', () => {
  describe('canVoluntarilyNeutralize', () => {
    describe('Land units can voluntarily neutralize on variable terrain that becomes sea', () => {
      it('should allow Tank to enter marsh at high tide (becomes stuck)', () => {
        expect(canVoluntarilyNeutralize(UnitType.Tank, TerrainType.Marsh, TideLevel.High)).toBe(true);
      });

      it('should allow Tank to enter reef at normal tide (becomes stuck)', () => {
        expect(canVoluntarilyNeutralize(UnitType.Tank, TerrainType.Reef, TideLevel.Normal)).toBe(true);
      });

      it('should allow Tank to enter reef at high tide (becomes stuck)', () => {
        expect(canVoluntarilyNeutralize(UnitType.Tank, TerrainType.Reef, TideLevel.High)).toBe(true);
      });

      it('should NOT allow Tank to enter permanent sea (blocked, not voluntary neutralization)', () => {
        expect(canVoluntarilyNeutralize(UnitType.Tank, TerrainType.Sea, TideLevel.Normal)).toBe(false);
      });

      it('should NOT allow Tank to enter passable terrain (normal move, not voluntary neutralization)', () => {
        expect(canVoluntarilyNeutralize(UnitType.Tank, TerrainType.Land, TideLevel.Normal)).toBe(false);
        expect(canVoluntarilyNeutralize(UnitType.Tank, TerrainType.Marsh, TideLevel.Normal)).toBe(false);
        expect(canVoluntarilyNeutralize(UnitType.Tank, TerrainType.Reef, TideLevel.Low)).toBe(false);
      });
    });

    describe('Sea units can voluntarily neutralize on variable terrain that becomes land', () => {
      it('should allow MotorBoat to enter marsh at low tide (becomes grounded)', () => {
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Low)).toBe(true);
      });

      it('should allow MotorBoat to enter marsh at normal tide (becomes grounded)', () => {
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Normal)).toBe(true);
      });

      it('should allow MotorBoat to enter reef at low tide (becomes grounded)', () => {
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Reef, TideLevel.Low)).toBe(true);
      });

      it('should allow Barge to enter marsh at low tide (becomes grounded)', () => {
        expect(canVoluntarilyNeutralize(UnitType.Barge, TerrainType.Marsh, TideLevel.Low)).toBe(true);
      });

      it('should NOT allow MotorBoat to enter permanent land (blocked)', () => {
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Land, TideLevel.Normal)).toBe(false);
      });

      it('should NOT allow MotorBoat to enter mountain (blocked)', () => {
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Mountain, TideLevel.Normal)).toBe(false);
      });

      it('should NOT allow MotorBoat to enter passable terrain (normal move)', () => {
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Sea, TideLevel.Normal)).toBe(false);
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.High)).toBe(false);
        expect(canVoluntarilyNeutralize(UnitType.MotorBoat, TerrainType.Reef, TideLevel.Normal)).toBe(false);
      });
    });

    describe('Fixed and inert units cannot voluntarily neutralize', () => {
      it('should NOT allow Tower to voluntarily neutralize', () => {
        expect(canVoluntarilyNeutralize(UnitType.Tower, TerrainType.Marsh, TideLevel.High)).toBe(false);
      });

      it('should NOT allow Bridge to voluntarily neutralize', () => {
        expect(canVoluntarilyNeutralize(UnitType.Bridge, TerrainType.Marsh, TideLevel.High)).toBe(false);
      });

      it('should NOT allow Astronef to voluntarily neutralize', () => {
        expect(canVoluntarilyNeutralize(UnitType.Astronef, TerrainType.Marsh, TideLevel.High)).toBe(false);
      });
    });

    describe('SuperTank cannot voluntarily neutralize on mountain', () => {
      it('should NOT allow SuperTank to enter mountain (blocked, not stuck)', () => {
        expect(canVoluntarilyNeutralize(UnitType.SuperTank, TerrainType.Mountain, TideLevel.Normal)).toBe(false);
      });

      it('should allow SuperTank to enter reef at normal tide (becomes stuck)', () => {
        expect(canVoluntarilyNeutralize(UnitType.SuperTank, TerrainType.Reef, TideLevel.Normal)).toBe(true);
      });
    });
  });

  describe('getVoluntaryNeutralizationResult', () => {
    describe('Returns stuck for land units on flooded variable terrain', () => {
      it('should return stuck for Tank on marsh at high tide', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.Tank, TerrainType.Marsh, TideLevel.High)).toBe('stuck');
      });

      it('should return stuck for Tank on reef at normal tide', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.Tank, TerrainType.Reef, TideLevel.Normal)).toBe('stuck');
      });

      it('should return stuck for Crab on marsh at high tide', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.Crab, TerrainType.Marsh, TideLevel.High)).toBe('stuck');
      });
    });

    describe('Returns grounded for sea units on exposed variable terrain', () => {
      it('should return grounded for MotorBoat on marsh at low tide', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.MotorBoat, TerrainType.Marsh, TideLevel.Low)).toBe('grounded');
      });

      it('should return grounded for Barge on reef at low tide', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.Barge, TerrainType.Reef, TideLevel.Low)).toBe('grounded');
      });
    });

    describe('Returns null for normal movement or blocked terrain', () => {
      it('should return null for Tank on passable land', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.Tank, TerrainType.Land, TideLevel.Normal)).toBe(null);
      });

      it('should return null for Tank on blocked permanent sea', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.Tank, TerrainType.Sea, TideLevel.Normal)).toBe(null);
      });

      it('should return null for MotorBoat on passable sea', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.MotorBoat, TerrainType.Sea, TideLevel.Normal)).toBe(null);
      });

      it('should return null for MotorBoat on blocked land', () => {
        expect(getVoluntaryNeutralizationResult(UnitType.MotorBoat, TerrainType.Land, TideLevel.Normal)).toBe(null);
      });
    });
  });
});
