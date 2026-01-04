/**
 * Sprite loader and manager for PNG unit sprites
 *
 * Maps game unit types to French-named PNG sprite files.
 * Handles rotation variants for each unit type.
 */

import { UnitType } from '@/shared/game/types';

/**
 * Mapping from UnitType to French sprite base name
 */
const UNIT_TO_SPRITE_NAME: Record<UnitType, string> = {
  [UnitType.Astronef]: 'astronef',
  [UnitType.Tower]: 'tourelle',
  [UnitType.Tank]: 'char',
  [UnitType.SuperTank]: 'gros_tas',
  [UnitType.MotorBoat]: 'vedette',
  [UnitType.Barge]: 'barge',
  [UnitType.Crab]: 'crabe',
  [UnitType.Converter]: 'pondeuse',
  [UnitType.Bridge]: 'caillou', // Using mineral sprite as placeholder for bridge
};

/**
 * Available rotation angles for each unit type
 */
const UNIT_ROTATIONS: Record<UnitType, number[]> = {
  [UnitType.Astronef]: [0, 180],           // Only 2 rotations
  [UnitType.Tower]: [0, 120, 240],         // 3 rotations
  [UnitType.Tank]: [0, 60, 120, 180, 240, 300],
  [UnitType.SuperTank]: [0, 60, 120, 180, 240, 300],
  [UnitType.MotorBoat]: [0, 60, 120, 180, 240, 300],
  [UnitType.Barge]: [0, 60, 120, 180, 240, 300],
  [UnitType.Crab]: [0, 60, 120, 180, 240, 300],
  [UnitType.Converter]: [0, 60, 120, 180, 240, 300],
  [UnitType.Bridge]: [], // No rotation - single sprite
};

/**
 * Base path for sprite images
 */
const SPRITE_BASE_PATH = '/img';

/**
 * Get the sprite URL for a unit at a specific rotation
 *
 * @param unitType - The type of unit
 * @param rotation - The rotation in hex steps (0-5, each step is 60 degrees)
 * @returns The URL path to the sprite image
 */
export function getUnitSpriteUrl(unitType: UnitType, rotation: number = 0): string {
  const spriteName = UNIT_TO_SPRITE_NAME[unitType];
  const availableRotations = UNIT_ROTATIONS[unitType];

  // For units without rotation variants (like bridge/mineral)
  if (availableRotations.length === 0) {
    return `${SPRITE_BASE_PATH}/${spriteName}.png`;
  }

  // Convert hex rotation steps to degrees
  const rotationDegrees = (rotation * 60) % 360;

  // Find the closest available rotation angle
  const closestRotation = findClosestRotation(rotationDegrees, availableRotations);

  return `${SPRITE_BASE_PATH}/${spriteName}_${closestRotation}.png`;
}

/**
 * Find the closest available rotation to the target angle
 */
function findClosestRotation(targetDegrees: number, availableRotations: number[]): number {
  let closest = availableRotations[0];
  let minDiff = Infinity;

  for (const rotation of availableRotations) {
    // Calculate difference accounting for circular nature (0 and 360 are the same)
    let diff = Math.abs(targetDegrees - rotation);
    diff = Math.min(diff, 360 - diff);

    if (diff < minDiff) {
      minDiff = diff;
      closest = rotation;
    }
  }

  return closest;
}

/**
 * Get the mineral sprite URL
 */
export function getMineralSpriteUrl(): string {
  return `${SPRITE_BASE_PATH}/caillou.png`;
}

/**
 * Preload all sprites for a unit type
 * Returns a promise that resolves when all sprites are loaded
 */
export function preloadUnitSprites(unitType: UnitType): Promise<void[]> {
  const spriteName = UNIT_TO_SPRITE_NAME[unitType];
  const rotations = UNIT_ROTATIONS[unitType];

  if (rotations.length === 0) {
    // Single sprite without rotation
    return Promise.all([
      loadImage(`${SPRITE_BASE_PATH}/${spriteName}.png`)
    ]);
  }

  // Load all rotation variants
  const promises = rotations.map(rotation =>
    loadImage(`${SPRITE_BASE_PATH}/${spriteName}_${rotation}.png`)
  );

  return Promise.all(promises);
}

/**
 * Preload all unit sprites
 */
export function preloadAllSprites(): Promise<void[]> {
  const promises: Promise<void>[] = [];

  for (const unitType of Object.values(UnitType)) {
    if (typeof unitType === 'string') continue; // Skip reverse enum mappings
    promises.push(...preloadUnitSprites(unitType as UnitType).catch(() => [undefined as unknown as void]));
  }

  // Also preload mineral sprite
  promises.push(loadImage(getMineralSpriteUrl()));

  return Promise.all(promises);
}

/**
 * Load a single image and return a promise
 */
function loadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load sprite: ${url}`));
    img.src = url;
  });
}

/**
 * Get all available rotations for a unit type
 */
export function getAvailableRotations(unitType: UnitType): number[] {
  return UNIT_ROTATIONS[unitType];
}

/**
 * Check if a unit type has rotation variants
 */
export function hasRotationVariants(unitType: UnitType): boolean {
  return UNIT_ROTATIONS[unitType].length > 1;
}

/**
 * Get the sprite base name (French name) for a unit type
 */
export function getSpriteName(unitType: UnitType): string {
  return UNIT_TO_SPRITE_NAME[unitType];
}
