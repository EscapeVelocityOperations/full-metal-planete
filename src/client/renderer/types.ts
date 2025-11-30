/**
 * Renderer-specific types for Full Metal Planète hex grid rendering
 */

// Coordinate types (from data model)
export interface HexCoord {
  q: number;
  r: number;
}

export interface Point {
  x: number;
  y: number;
}

// Terrain types (from data model)
export enum TerrainType {
  Sea = 'sea',
  Land = 'land',
  Marsh = 'marsh',
  Reef = 'reef',
  Mountain = 'mountain',
}

export enum TideLevel {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
}

// Color palette (from UI specs)
export interface TerrainColors {
  land: [number, number, number];
  sea: [number, number, number];
  marsh: [number, number, number];
  reef: [number, number, number];
  mountain: [number, number, number];
  mineral: [number, number, number];
}

export const TERRAIN_COLORS: TerrainColors = {
  land: [212 / 255, 165 / 255, 116 / 255], // #D4A574
  sea: [107 / 255, 123 / 255, 158 / 255], // #6B7B9E
  marsh: [184 / 255, 153 / 255, 107 / 255], // #B8996B
  reef: [122 / 255, 139 / 255, 168 / 255], // #7A8BA8
  mountain: [128 / 255, 128 / 255, 128 / 255], // #808080
  mineral: [229 / 255, 90 / 255, 60 / 255], // #E55A3C
};

// Hex geometry constants
export const HEX_SIZE = 30; // pixels
export const HEX_WIDTH = HEX_SIZE * 2;
export const HEX_HEIGHT = HEX_SIZE * Math.sqrt(3);

// Renderer backend types
export type RendererBackend = 'webgpu' | 'webgl2';

export interface RendererCapabilities {
  backend: RendererBackend;
  maxTextureSize: number;
  supportsInstancing: boolean;
  supportsCompute: boolean;
}

// Viewport/Camera
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

// Hex terrain data for rendering
export interface HexTerrainData {
  coord: HexCoord;
  type: TerrainType;
  color: [number, number, number];
}

// Instance data for GPU buffer
export interface HexInstanceData {
  position: [number, number]; // World position
  color: [number, number, number]; // RGB color
}
