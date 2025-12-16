#!/bin/bash
# Master build script for generating SVG sprites from 3D models
#
# Pipeline:
# 1. Render 3D models to PNG (Blender)
# 2. Vectorize PNG to SVG (VTracer)
# 3. Post-process SVGs (normalize viewBox, optimize)
# 4. Generate color variants

set -e

# Add cargo bin and bun to PATH
export PATH="$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Blender path
BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"

echo "==================================="
echo "Full Metal Planète - Sprite Builder"
echo "==================================="
echo ""

# Check dependencies
echo "Checking dependencies..."

if [ ! -f "$BLENDER" ]; then
    echo "Error: Blender not found at $BLENDER"
    echo "Install from: https://www.blender.org/download/"
    exit 1
fi
echo "  ✓ Blender found"

if ! command -v vtracer &> /dev/null; then
    echo "  ✗ VTracer not found"
    echo ""
    echo "Install VTracer with one of:"
    echo "  cargo install vtracer"
    echo "  brew install vtracer"
    exit 1
fi
echo "  ✓ VTracer found"

if ! command -v bun &> /dev/null; then
    echo "  ✗ Bun not found"
    echo "Install from: https://bun.sh"
    exit 1
fi
echo "  ✓ Bun found"

echo ""

# Create output directories
mkdir -p "$PROJECT_DIR/public/sprites/units/rendered"
mkdir -p "$PROJECT_DIR/public/sprites/units/vectorized"

# Step 1: Render 3D models
echo "Step 1/4: Rendering 3D models to PNG..."
echo "----------------------------------------"
"$BLENDER" --background --python "$SCRIPT_DIR/render_sprites.py"
echo ""

# Step 2: Vectorize PNGs
echo "Step 2/4: Vectorizing PNG to SVG..."
echo "-----------------------------------"
"$SCRIPT_DIR/vectorize.sh"
echo ""

# Step 3: Post-process SVGs
echo "Step 3/4: Post-processing SVGs..."
echo "----------------------------------"
cd "$PROJECT_DIR"
bun run "$SCRIPT_DIR/postprocess.ts"
echo ""

# Step 4: Generate color variants
echo "Step 4/4: Generating color variants..."
echo "---------------------------------------"
node "$PROJECT_DIR/scripts/generate-colored-sprites.cjs"
echo ""

# Cleanup intermediate files (optional)
# rm -rf "$PROJECT_DIR/public/sprites/units/rendered"
# rm -rf "$PROJECT_DIR/public/sprites/units/vectorized"

echo "==================================="
echo "Build complete!"
echo "==================================="
echo ""
echo "Output files:"
echo "  Base:    $PROJECT_DIR/public/sprites/units/*.svg"
echo "  Red:     $PROJECT_DIR/public/sprites/units/red/*.svg"
echo "  Blue:    $PROJECT_DIR/public/sprites/units/blue/*.svg"
echo "  Green:   $PROJECT_DIR/public/sprites/units/green/*.svg"
echo "  Yellow:  $PROJECT_DIR/public/sprites/units/yellow/*.svg"
