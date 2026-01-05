import { describe, it, expect } from 'vitest';
import {
  getUnitSpriteUrl,
  getMineralSpriteUrl,
  getAvailableRotations,
  hasRotationVariants,
  getSpriteName,
} from '../sprites';
import { UnitType } from '@/shared/game/types';

describe('Sprite Loader', () => {
  describe('getUnitSpriteUrl', () => {
    it('should return correct path for astronef at rotation 0', () => {
      const url = getUnitSpriteUrl(UnitType.Astronef, 0);
      expect(url).toBe('/img/astronef_0.png');
    });

    it('should return correct path for astronef at rotation 3 (180 degrees)', () => {
      const url = getUnitSpriteUrl(UnitType.Astronef, 3);
      expect(url).toBe('/img/astronef_180.png');
    });

    it('should return correct path for tank at various rotations', () => {
      expect(getUnitSpriteUrl(UnitType.Tank, 0)).toBe('/img/char_0.png');
      expect(getUnitSpriteUrl(UnitType.Tank, 1)).toBe('/img/char_60.png');
      expect(getUnitSpriteUrl(UnitType.Tank, 2)).toBe('/img/char_120.png');
      expect(getUnitSpriteUrl(UnitType.Tank, 3)).toBe('/img/char_180.png');
      expect(getUnitSpriteUrl(UnitType.Tank, 4)).toBe('/img/char_240.png');
      expect(getUnitSpriteUrl(UnitType.Tank, 5)).toBe('/img/char_300.png');
    });

    it('should return correct path for crab (crabe)', () => {
      expect(getUnitSpriteUrl(UnitType.Crab, 0)).toBe('/img/crabe_0.png');
      expect(getUnitSpriteUrl(UnitType.Crab, 2)).toBe('/img/crabe_120.png');
    });

    it('should return correct path for converter (pondeuse)', () => {
      expect(getUnitSpriteUrl(UnitType.Converter, 0)).toBe('/img/pondeuse_0.png');
    });

    it('should return correct path for motor boat (vedette)', () => {
      expect(getUnitSpriteUrl(UnitType.MotorBoat, 0)).toBe('/img/vedette_0.png');
    });

    it('should return correct path for super tank (gros_tas)', () => {
      expect(getUnitSpriteUrl(UnitType.SuperTank, 0)).toBe('/img/gros_tas_0.png');
    });

    it('should return correct path for barge', () => {
      expect(getUnitSpriteUrl(UnitType.Barge, 0)).toBe('/img/barge_0.png');
      expect(getUnitSpriteUrl(UnitType.Barge, 3)).toBe('/img/barge_180.png');
    });

    it('should return correct path for tower (tourelle) with 3 rotations', () => {
      expect(getUnitSpriteUrl(UnitType.Tower, 0)).toBe('/img/tourelle_0.png');
      expect(getUnitSpriteUrl(UnitType.Tower, 2)).toBe('/img/tourelle_120.png');
      expect(getUnitSpriteUrl(UnitType.Tower, 4)).toBe('/img/tourelle_240.png');
    });

    it('should find closest rotation for tower', () => {
      // Tower has rotations 0, 120, 240
      // Rotation 1 (60 degrees) should snap to 0
      expect(getUnitSpriteUrl(UnitType.Tower, 1)).toBe('/img/tourelle_0.png');
      // Rotation 3 (180 degrees) should snap to 120 (closer than 240)
      expect(getUnitSpriteUrl(UnitType.Tower, 3)).toBe('/img/tourelle_120.png');
    });

    it('should handle default rotation of 0', () => {
      expect(getUnitSpriteUrl(UnitType.Tank)).toBe('/img/char_0.png');
    });

    it('should return single sprite for bridge (no rotation variants)', () => {
      expect(getUnitSpriteUrl(UnitType.Bridge, 0)).toBe('/img/caillou.png');
      expect(getUnitSpriteUrl(UnitType.Bridge, 3)).toBe('/img/caillou.png');
    });
  });

  describe('getMineralSpriteUrl', () => {
    it('should return correct path for mineral', () => {
      expect(getMineralSpriteUrl()).toBe('/img/caillou.png');
    });
  });

  describe('getAvailableRotations', () => {
    it('should return 2 rotations for astronef', () => {
      const rotations = getAvailableRotations(UnitType.Astronef);
      expect(rotations).toEqual([0, 180]);
    });

    it('should return 3 rotations for tower', () => {
      const rotations = getAvailableRotations(UnitType.Tower);
      expect(rotations).toEqual([0, 120, 240]);
    });

    it('should return 6 rotations for tank', () => {
      const rotations = getAvailableRotations(UnitType.Tank);
      expect(rotations).toEqual([0, 60, 120, 180, 240, 300]);
    });

    it('should return empty array for bridge', () => {
      const rotations = getAvailableRotations(UnitType.Bridge);
      expect(rotations).toEqual([]);
    });
  });

  describe('hasRotationVariants', () => {
    it('should return true for units with multiple rotations', () => {
      expect(hasRotationVariants(UnitType.Tank)).toBe(true);
      expect(hasRotationVariants(UnitType.Astronef)).toBe(true);
      expect(hasRotationVariants(UnitType.Tower)).toBe(true);
    });

    it('should return false for bridge (single sprite)', () => {
      expect(hasRotationVariants(UnitType.Bridge)).toBe(false);
    });
  });

  describe('getSpriteName', () => {
    it('should return French names for units', () => {
      expect(getSpriteName(UnitType.Tank)).toBe('char');
      expect(getSpriteName(UnitType.Crab)).toBe('crabe');
      expect(getSpriteName(UnitType.Converter)).toBe('pondeuse');
      expect(getSpriteName(UnitType.MotorBoat)).toBe('vedette');
      expect(getSpriteName(UnitType.SuperTank)).toBe('gros_tas');
      expect(getSpriteName(UnitType.Tower)).toBe('tourelle');
      expect(getSpriteName(UnitType.Astronef)).toBe('astronef');
      expect(getSpriteName(UnitType.Barge)).toBe('barge');
      expect(getSpriteName(UnitType.Bridge)).toBe('caillou');
    });
  });
});
