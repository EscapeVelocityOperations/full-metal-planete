#!/usr/bin/env node
/**
 * Generate colored variants of unit sprites
 * Replaces olive/gray tones with team colors (red, blue, green, yellow)
 */

const fs = require('fs');
const path = require('path');

const UNITS_DIR = path.join(__dirname, '../public/sprites/units');

// Color mappings for each team
const COLOR_SCHEMES = {
  red: {
    name: 'red',
    // Hull/body colors (olive greens -> reds)
    primary: ['#CC4444', '#AA3333', '#882222', '#661111'],
    // Track/metal colors (grays -> dark reds)
    metal: ['#441111', '#552222', '#331111', '#220000'],
    // Highlight colors
    highlight: ['#DD5555', '#BB4444'],
    // Stroke colors
    stroke: ['#993333', '#772222', '#551111'],
  },
  blue: {
    name: 'blue',
    primary: ['#4466CC', '#3355AA', '#223388', '#113366'],
    metal: ['#112244', '#223355', '#111133', '#000022'],
    highlight: ['#5577DD', '#4466BB'],
    stroke: ['#3355AA', '#224477', '#113355'],
  },
  green: {
    name: 'green',
    primary: ['#44AA44', '#339933', '#227722', '#116611'],
    metal: ['#113311', '#224422', '#112211', '#001100'],
    highlight: ['#55BB55', '#44AA44'],
    stroke: ['#339933', '#227722', '#115511'],
  },
  yellow: {
    name: 'yellow',
    primary: ['#CCAA44', '#AA8833', '#887722', '#665511'],
    metal: ['#332211', '#443322', '#221100', '#110000'],
    highlight: ['#DDBB55', '#CCAA44'],
    stroke: ['#AA8833', '#887722', '#665511'],
  },
};

// Replacement map for base colors -> team colors
function getReplacements(scheme) {
  return [
    // Primary hull colors (olive)
    ['#6B6B50', scheme.primary[0]],
    ['#5A5A40', scheme.primary[1]],
    ['#4A4A30', scheme.primary[2]],
    ['#3A3A25', scheme.primary[3]],
    ['#4A4A35', scheme.primary[2]],
    ['#505040', scheme.primary[1]],
    ['#404030', scheme.primary[2]],
    ['#454535', scheme.primary[2]],
    ['#353525', scheme.primary[3]],
    ['#3A3A28', scheme.stroke[0]],
    ['#2A2A1A', scheme.stroke[2]],
    // Track/metal colors
    ['#404040', scheme.metal[0]],
    ['#252525', scheme.metal[1]],
    ['#353535', scheme.metal[2]],
    ['#383838', scheme.metal[0]],
    ['#454545', scheme.metal[1]],
    ['#1A1A1A', scheme.metal[3]],
    // More hull variants
    ['#5A5A45', scheme.primary[1]],
    ['#6A6A55', scheme.primary[0]],
    ['#4A4A38', scheme.primary[2]],
    // Industrial browns (converter, crab)
    ['#C0A050', scheme.primary[0]],
    ['#A08040', scheme.primary[1]],
    ['#806030', scheme.primary[2]],
    ['#B87333', scheme.primary[0]],
    ['#996B2D', scheme.primary[1]],
    ['#7A5525', scheme.primary[2]],
    ['#6B4423', scheme.stroke[0]],
    ['#A06030', scheme.primary[1]],
    ['#6B4020', scheme.primary[3]],
    ['#8B5A2B', scheme.primary[1]],
    // Brown shades
    ['#6B5030', scheme.primary[2]],
    ['#5A4028', scheme.primary[3]],
    ['#4A3020', scheme.metal[0]],
    ['#8B6040', scheme.primary[1]],
    ['#6B4530', scheme.primary[2]],
    ['#5A4020', scheme.metal[0]],
    ['#4A3518', scheme.metal[1]],
    // Barge browns
    ['#D4B060', scheme.highlight[0]],
    ['#B09050', scheme.highlight[1]],
    ['#907040', scheme.primary[1]],
    // Bridge/engineering colors
    ['#708090', scheme.primary[0]],
    ['#5A6A7A', scheme.primary[1]],
    ['#4A5A6A', scheme.primary[2]],
    ['#506070', scheme.primary[2]],
    ['#405060', scheme.primary[3]],
    ['#3A4A5A', scheme.stroke[0]],
    ['#6A7A8A', scheme.primary[0]],
    ['#8090A0', scheme.highlight[0]],
    ['#607080', scheme.primary[1]],
    // Tower grays
    ['#707070', scheme.primary[1]],
    ['#909090', scheme.primary[0]],
    ['#606060', scheme.primary[2]],
    ['#505050', scheme.primary[2]],
    ['#808080', scheme.primary[1]],
    ['#7A7A7A', scheme.primary[1]],
    // Motorboat/naval
    ['#E8E8E8', scheme.highlight[0]],
    ['#D0D0D0', scheme.primary[0]],
    ['#B0B0B0', scheme.primary[1]],
    ['#D8D8D8', scheme.highlight[0]],
    ['#C0C0C0', scheme.primary[0]],
    ['#354050', scheme.primary[2]],
    ['#253040', scheme.primary[3]],
    ['#404550', scheme.primary[2]],
    ['#303540', scheme.primary[3]],
    // Astronef
    ['#C0C0C0', scheme.primary[0]],
    ['#A0A0A0', scheme.primary[1]],
    ['#D0D0D0', scheme.highlight[0]],
  ];
}

function colorizeSprite(svgContent, scheme) {
  let result = svgContent;
  const replacements = getReplacements(scheme);

  for (const [from, to] of replacements) {
    // Case-insensitive replacement
    const regex = new RegExp(from.replace('#', '#'), 'gi');
    result = result.replace(regex, to);
  }

  // Update gradient IDs to include color name (avoid conflicts)
  result = result.replace(/id="([^"]+)"/g, (match, id) => {
    if (id.includes('-gradient') || id.includes('-hull') || id.includes('-body') ||
        id.includes('-turret') || id.includes('-track') || id.includes('-metal') ||
        id.includes('-pod') || id.includes('-engine') || id.includes('-claw') ||
        id.includes('-leg') || id.includes('-dome') || id.includes('-chute') ||
        id.includes('-beam') || id.includes('-deck') || id.includes('-bridge') ||
        id.includes('st-') || id.includes('mb-') || id.includes('bl-') ||
        id.includes('conv-') || id.includes('crab-') || id.includes('barge-') ||
        id.includes('tower-') || id.includes('astronef-')) {
      return `id="${id}-${scheme.name}"`;
    }
    return match;
  });

  // Update url() references to match new IDs
  result = result.replace(/url\(#([^)]+)\)/g, (match, id) => {
    if (id.includes('-gradient') || id.includes('-hull') || id.includes('-body') ||
        id.includes('-turret') || id.includes('-track') || id.includes('-metal') ||
        id.includes('-pod') || id.includes('-engine') || id.includes('-claw') ||
        id.includes('-leg') || id.includes('-dome') || id.includes('-chute') ||
        id.includes('-beam') || id.includes('-deck') || id.includes('-bridge') ||
        id.includes('st-') || id.includes('mb-') || id.includes('bl-') ||
        id.includes('conv-') || id.includes('crab-') || id.includes('barge-') ||
        id.includes('tower-') || id.includes('astronef-')) {
      return `url(#${id}-${scheme.name})`;
    }
    return match;
  });

  return result;
}

// Process all unit sprites
const unitFiles = fs.readdirSync(UNITS_DIR).filter(f => f.endsWith('.svg'));

for (const unitFile of unitFiles) {
  const basePath = path.join(UNITS_DIR, unitFile);
  const baseSvg = fs.readFileSync(basePath, 'utf8');

  for (const [colorName, scheme] of Object.entries(COLOR_SCHEMES)) {
    const colorDir = path.join(UNITS_DIR, colorName);

    // Ensure color directory exists
    if (!fs.existsSync(colorDir)) {
      fs.mkdirSync(colorDir, { recursive: true });
    }

    const coloredSvg = colorizeSprite(baseSvg, scheme);
    const outputPath = path.join(colorDir, unitFile);

    fs.writeFileSync(outputPath, coloredSvg);
    console.log(`Generated: ${colorName}/${unitFile}`);
  }
}

console.log('Done! All colored variants generated.');
