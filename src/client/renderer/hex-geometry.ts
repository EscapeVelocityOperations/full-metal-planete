/**
 * Hex grid geometry calculations for flat-top hexagons
 * Based on https://www.redblobgames.com/grids/hexagons/
 */

import type { HexCoord, Point } from './types';

/**
 * Flat-top hex direction vectors (clockwise from East)
 */
export const FLAT_TOP_DIRECTIONS: ReadonlyArray<HexCoord> = [
  { q: 1, r: 0 },   // East
  { q: 1, r: -1 },  // Northeast
  { q: 0, r: -1 },  // Northwest
  { q: -1, r: 0 },  // West
  { q: -1, r: 1 },  // Southwest
  { q: 0, r: 1 },   // Southeast
] as const;

/**
 * Generate vertex positions for a flat-top hexagon as triangles
 * Uses triangle-list topology: 6 triangles, each connecting center to two adjacent vertices
 * @param size - Hex size (distance from center to vertex)
 * @returns Array of 18 vertex positions [x, y] (6 triangles * 3 vertices each)
 */
export function generateHexVertices(size: number): Array<[number, number]> {
  const vertices: Array<[number, number]> = [];
  const center: [number, number] = [0, 0];

  // Generate corner vertices
  const corners: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    // Flat-top: vertices at 0°, 60°, 120°, 180°, 240°, 300°
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;

    const x = size * Math.cos(angleRad);
    const y = size * Math.sin(angleRad);

    corners.push([x, y]);
  }

  // Create 6 triangles from center to each edge
  for (let i = 0; i < 6; i++) {
    const nextI = (i + 1) % 6;
    vertices.push(center);
    vertices.push(corners[i]!);
    vertices.push(corners[nextI]!);
  }

  return vertices;
}

/**
 * Convert axial hex coordinates to pixel coordinates (flat-top, offset columns)
 * Uses "odd-q" offset layout matching the official Full Metal Planète board
 * where odd columns are shifted down by half a hex height
 * @param q - Axial q coordinate (column)
 * @param r - Axial r coordinate (row)
 * @param size - Hex size (distance from center to vertex)
 * @returns Pixel position
 */
export function axialToPixel(q: number, r: number, size: number): Point {
  // Flat-top hex dimensions
  const hexWidth = size * 2;        // Width: 2 * size
  const hexHeight = size * Math.sqrt(3); // Height: sqrt(3) * size

  // Horizontal spacing: 3/4 of hex width (hexes overlap by 1/4)
  const horizSpacing = hexWidth * 0.75;

  // Vertical spacing: full hex height
  const vertSpacing = hexHeight;

  // X position: columns are evenly spaced
  const x = q * horizSpacing;

  // Y position: rows are evenly spaced, but odd columns are offset down by half
  const oddColumnOffset = (q % 2 !== 0) ? hexHeight / 2 : 0;
  const y = r * vertSpacing + oddColumnOffset;

  return { x, y };
}

/**
 * Convert pixel coordinates to axial hex coordinates (flat-top, offset columns)
 * Matches the "odd-q" offset layout of the official Full Metal Planète board
 * @param x - Pixel x coordinate
 * @param y - Pixel y coordinate
 * @param size - Hex size
 * @returns Nearest hex coordinate
 */
export function pixelToAxial(x: number, y: number, size: number): HexCoord {
  // Flat-top hex dimensions
  const hexWidth = size * 2;
  const hexHeight = size * Math.sqrt(3);
  const horizSpacing = hexWidth * 0.75;
  const vertSpacing = hexHeight;

  // First, estimate the column (q)
  const q = Math.round(x / horizSpacing);

  // Then calculate the row (r), accounting for odd column offset
  const oddColumnOffset = (q % 2 !== 0) ? hexHeight / 2 : 0;
  const r = Math.round((y - oddColumnOffset) / vertSpacing);

  return { q, r };
}

/**
 * Round fractional axial coordinates to nearest hex
 * Uses cube coordinate conversion for accurate rounding
 * @param q - Fractional q coordinate
 * @param r - Fractional r coordinate
 * @returns Rounded hex coordinate
 */
function hexRound(q: number, r: number): HexCoord {
  // Convert axial to cube coordinates
  const x = q;
  const z = r;
  const y = -x - z;

  // Round to integers
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  // Calculate rounding differences
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  // Reset the coordinate with largest difference to maintain constraint x + y + z = 0
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  // Convert cube back to axial, ensuring no negative zeros
  return {
    q: rx === 0 ? 0 : rx,
    r: rz === 0 ? 0 : rz,
  };
}

/**
 * Calculate distance between two hexes in hex steps
 * @param a - First hex coordinate
 * @param b - Second hex coordinate
 * @returns Distance in hex steps
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  // Convert to cube coordinates for distance calculation
  const ax = a.q;
  const az = a.r;
  const ay = -ax - az;

  const bx = b.q;
  const bz = b.r;
  const by = -bx - bz;

  // Cube distance formula
  return Math.max(
    Math.abs(ax - bx),
    Math.abs(ay - by),
    Math.abs(az - bz)
  );
}

/**
 * Get neighboring hex in specified direction
 * @param hex - Center hex coordinate
 * @param direction - Direction index (0-5), wraps around
 * @returns Neighbor hex coordinate
 */
export function hexNeighbor(hex: HexCoord, direction: number): HexCoord {
  const dir = FLAT_TOP_DIRECTIONS[direction % 6];
  if (!dir) {
    throw new Error(`Invalid direction: ${direction}`);
  }

  return {
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  };
}

/**
 * Get all 6 neighbors of a hex
 * @param hex - Center hex coordinate
 * @returns Array of 6 neighbor coordinates
 */
export function hexNeighbors(hex: HexCoord): HexCoord[] {
  return FLAT_TOP_DIRECTIONS.map((dir) => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  }));
}

/**
 * Get all hexes within a certain range
 * @param center - Center hex coordinate
 * @param range - Range in hex steps
 * @returns Array of hex coordinates within range
 */
export function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];

  for (let q = -range; q <= range; q++) {
    const r1 = Math.max(-range, -q - range);
    const r2 = Math.min(range, -q + range);

    for (let r = r1; r <= r2; r++) {
      results.push({
        q: center.q + q,
        r: center.r + r,
      });
    }
  }

  return results;
}
