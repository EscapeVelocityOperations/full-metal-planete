#!/usr/bin/env bun
/**
 * Post-process vectorized SVGs:
 * - Normalize viewBox to game standards
 * - Center and scale sprites
 * - Add unit-specific ID prefixes
 * - Optimize output
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

const PROJECT_DIR = join(import.meta.dir, '..', '..');
const INPUT_DIR = join(PROJECT_DIR, 'public', 'sprites', 'units', 'vectorized');
const OUTPUT_DIR = join(PROJECT_DIR, 'public', 'sprites', 'units');

// Unit viewBox configurations
const UNIT_VIEWBOX: Record<string, { width: number; height: number }> = {
  tank: { width: 60, height: 52 },
  supertank: { width: 60, height: 52 },
  crab: { width: 60, height: 52 },
  converter: { width: 60, height: 52 },
  motorboat: { width: 60, height: 52 },
  bridge: { width: 60, height: 52 },
  marker: { width: 60, height: 52 },
  barge: { width: 120, height: 52 },
  astronef: { width: 120, height: 104 },
};

interface SVGBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function parseViewBox(svg: string): SVGBounds | null {
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/);
  if (!viewBoxMatch) return null;

  const [minX, minY, width, height] = viewBoxMatch[1].split(/\s+/).map(Number);
  return {
    minX,
    minY,
    maxX: minX + width,
    maxY: minY + height,
    width,
    height,
  };
}

function parseWidthHeight(svg: string): { width: number; height: number } | null {
  const widthMatch = svg.match(/width=["'](\d+(?:\.\d+)?)(px)?["']/);
  const heightMatch = svg.match(/height=["'](\d+(?:\.\d+)?)(px)?["']/);

  if (widthMatch && heightMatch) {
    return {
      width: parseFloat(widthMatch[1]),
      height: parseFloat(heightMatch[1]),
    };
  }
  return null;
}

function normalizeViewBox(
  svg: string,
  unitName: string
): string {
  const config = UNIT_VIEWBOX[unitName];
  if (!config) {
    console.warn(`No viewBox config for ${unitName}, using default 60x52`);
    return svg;
  }

  const { width: targetWidth, height: targetHeight } = config;

  // Get current dimensions
  const dims = parseWidthHeight(svg);
  if (!dims) {
    console.warn(`Could not parse dimensions for ${unitName}`);
    return svg;
  }

  // Calculate scaling to fit within target while preserving aspect ratio
  const scaleX = targetWidth / dims.width;
  const scaleY = targetHeight / dims.height;
  const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave padding

  // Calculate centering offset
  const scaledWidth = dims.width * scale;
  const scaledHeight = dims.height * scale;
  const offsetX = (targetWidth - scaledWidth) / 2;
  const offsetY = (targetHeight - scaledHeight) / 2;

  // Build transform
  const transform = `translate(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) scale(${scale.toFixed(4)})`;

  // Extract SVG content (everything between <svg ...> and </svg>)
  const svgOpenMatch = svg.match(/<svg[^>]*>/);
  if (!svgOpenMatch) {
    console.warn(`Could not find SVG opening tag for ${unitName}`);
    return svg;
  }

  const svgOpenEnd = svg.indexOf(svgOpenMatch[0]) + svgOpenMatch[0].length;
  const svgCloseStart = svg.lastIndexOf('</svg>');

  if (svgCloseStart === -1) {
    console.warn(`Could not find SVG closing tag for ${unitName}`);
    return svg;
  }

  const innerContent = svg.substring(svgOpenEnd, svgCloseStart);

  // Build new SVG with proper viewBox
  const newSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetWidth} ${targetHeight}" width="${targetWidth}" height="${targetHeight}">
  <g transform="${transform}">
${innerContent}
  </g>
</svg>`;

  return newSvg;
}

function addIdPrefixes(svg: string, unitName: string): string {
  // Add unit-specific prefixes to IDs to avoid conflicts
  const prefix = unitName.replace(/[^a-z0-9]/gi, '-');

  // Replace id="..." with id="unitname-..."
  let result = svg.replace(/id="([^"]+)"/g, (match, id) => {
    return `id="${prefix}-${id}"`;
  });

  // Update url(#...) references
  result = result.replace(/url\(#([^)]+)\)/g, (match, id) => {
    return `url(#${prefix}-${id})`;
  });

  // Update href="#..." references
  result = result.replace(/href="#([^"]+)"/g, (match, id) => {
    return `href="#${prefix}-${id}"`;
  });

  return result;
}

function optimizeSvg(svg: string): string {
  let result = svg;

  // Remove empty groups
  result = result.replace(/<g[^>]*>\s*<\/g>/g, '');

  // Reduce precision of numbers (keep 2 decimal places)
  result = result.replace(/(\d+\.\d{3,})/g, (match) => {
    return parseFloat(match).toFixed(2);
  });

  // Remove unnecessary whitespace
  result = result.replace(/>\s+</g, '><');
  result = result.replace(/\s+/g, ' ');

  // Add back newlines for readability
  result = result.replace(/></g, '>\n<');

  return result;
}

async function processFile(inputPath: string, outputPath: string, unitName: string): Promise<void> {
  console.log(`  Processing ${unitName}...`);

  let svg = await readFile(inputPath, 'utf-8');

  // Apply transformations
  svg = normalizeViewBox(svg, unitName);
  svg = addIdPrefixes(svg, unitName);
  svg = optimizeSvg(svg);

  await writeFile(outputPath, svg, 'utf-8');
}

async function main(): Promise<void> {
  console.log('Post-processing vectorized SVGs...\n');

  // Check input directory
  if (!existsSync(INPUT_DIR)) {
    console.error(`Error: Input directory not found: ${INPUT_DIR}`);
    console.error('Run vectorize.sh first');
    process.exit(1);
  }

  // Read all SVG files
  const files = await readdir(INPUT_DIR);
  const svgFiles = files.filter((f) => f.endsWith('.svg'));

  if (svgFiles.length === 0) {
    console.error('No SVG files found in input directory');
    process.exit(1);
  }

  console.log(`Found ${svgFiles.length} SVG files\n`);

  // Process each file
  for (const file of svgFiles) {
    const unitName = basename(file, '.svg');
    const inputPath = join(INPUT_DIR, file);
    const outputPath = join(OUTPUT_DIR, file);

    await processFile(inputPath, outputPath, unitName);
  }

  console.log(`\nPost-processing complete!`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch(console.error);
