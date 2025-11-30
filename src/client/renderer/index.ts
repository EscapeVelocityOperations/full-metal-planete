/**
 * Hex grid renderer module exports
 */

export { HexRenderer } from './renderer';
export { initializeRenderer, detectRendererCapabilities } from './webgpu';
export { TerrainLayer } from './terrain-layer';
export {
  generateHexVertices,
  axialToPixel,
  pixelToAxial,
  hexDistance,
  hexNeighbor,
  hexNeighbors,
  hexesInRange,
  FLAT_TOP_DIRECTIONS,
} from './hex-geometry';
export type {
  HexCoord,
  Point,
  TerrainColors,
  RendererCapabilities,
  RendererBackend,
  Viewport,
  HexTerrainData,
  HexInstanceData,
} from './types';
export { TerrainType, TideLevel, TERRAIN_COLORS, HEX_SIZE } from './types';
