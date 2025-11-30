/**
 * Terrain layer for instanced hex rendering
 */

import { axialToPixel } from './hex-geometry';
import { TerrainType, TideLevel, TERRAIN_COLORS, HEX_SIZE } from './types';

export interface TerrainHex {
  coord: { q: number; r: number };
  type: TerrainType;
}

/**
 * Get effective terrain color based on tide level
 * @param terrainType - Base terrain type
 * @param tide - Current tide level
 * @returns RGB color array
 */
function getTerrainColor(
  terrainType: TerrainType,
  tide: TideLevel
): [number, number, number] {
  switch (terrainType) {
    case TerrainType.Land:
      return TERRAIN_COLORS.land;

    case TerrainType.Sea:
      return TERRAIN_COLORS.sea;

    case TerrainType.Mountain:
      return TERRAIN_COLORS.mountain;

    case TerrainType.Marsh:
      // Marsh: land at low/normal, sea at high
      return tide === TideLevel.High ? TERRAIN_COLORS.sea : TERRAIN_COLORS.land;

    case TerrainType.Reef:
      // Reef: land at low, sea at normal/high
      return tide === TideLevel.Low ? TERRAIN_COLORS.land : TERRAIN_COLORS.sea;

    default:
      return TERRAIN_COLORS.land;
  }
}

/**
 * Create instance buffer data for terrain hexes
 * @param terrainHexes - Array of terrain hex data
 * @param tide - Current tide level
 * @returns Float32Array of instance data
 */
export function createTerrainBufferData(
  terrainHexes: TerrainHex[],
  tide: TideLevel
): Float32Array {
  // Each instance: position (2 floats) + color (3 floats) = 5 floats
  const data = new Float32Array(terrainHexes.length * 5);

  terrainHexes.forEach((hex, i) => {
    const offset = i * 5;

    // Convert hex coordinates to pixel position
    const position = axialToPixel(hex.coord.q, hex.coord.r, HEX_SIZE);

    // Position
    data[offset] = position.x;
    data[offset + 1] = position.y;

    // Color based on terrain type and tide
    const color = getTerrainColor(hex.type, tide);
    data[offset + 2] = color[0];
    data[offset + 3] = color[1];
    data[offset + 4] = color[2];
  });

  return data;
}

/**
 * Terrain layer managing hex terrain rendering
 */
export class TerrainLayer {
  private device: GPUDevice;
  private terrainHexes: TerrainHex[];
  private currentTide: TideLevel;
  private instanceBuffer: GPUBuffer | null = null;

  constructor(device: GPUDevice, terrainHexes: TerrainHex[]) {
    this.device = device;
    this.terrainHexes = terrainHexes;
    this.currentTide = TideLevel.Normal;

    this.createBuffers();
  }

  /**
   * Create or recreate GPU buffers for terrain data
   */
  private createBuffers(): void {
    // Destroy old buffer if exists
    if (this.instanceBuffer) {
      this.instanceBuffer.destroy();
    }

    // Create instance data
    const instanceData = createTerrainBufferData(this.terrainHexes, this.currentTide);

    // Create instance buffer
    this.instanceBuffer = this.device.createBuffer({
      size: instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(this.instanceBuffer.getMappedRange()).set(instanceData);
    this.instanceBuffer.unmap();
  }

  /**
   * Update tide level and recreate buffers with new colors
   * @param tide - New tide level
   */
  updateTide(tide: TideLevel): void {
    if (this.currentTide !== tide) {
      this.currentTide = tide;
      this.createBuffers();
    }
  }

  /**
   * Get instance buffer for rendering
   * @returns GPU buffer with instance data
   */
  getInstanceBuffer(): GPUBuffer | null {
    return this.instanceBuffer;
  }

  /**
   * Get number of hex instances
   * @returns Number of hexes
   */
  get hexCount(): number {
    return this.terrainHexes.length;
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    if (this.instanceBuffer) {
      this.instanceBuffer.destroy();
      this.instanceBuffer = null;
    }
  }
}
