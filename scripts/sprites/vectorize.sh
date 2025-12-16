#!/bin/bash
# Vectorize PNG renders to SVG using VTracer
# Install: cargo install vtracer

set -e

# Add cargo bin to PATH
export PATH="$HOME/.cargo/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
INPUT_DIR="$PROJECT_DIR/public/sprites/units/rendered"
OUTPUT_DIR="$PROJECT_DIR/public/sprites/units/vectorized"

# Check for vtracer
if ! command -v vtracer &> /dev/null; then
    echo "Error: vtracer is not installed"
    echo "Install with: cargo install vtracer"
    echo "Or with: brew install vtracer"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Unit size configurations (for reference - postprocess.ts handles final sizing)
# tank, supertank, crab, converter, motorboat, bridge, marker: 60x52
# barge: 120x52
# astronef: 120x104

echo "Vectorizing PNG files to SVG..."

for png_file in "$INPUT_DIR"/*.png; do
    if [ -f "$png_file" ]; then
        filename=$(basename "$png_file" .png)
        output_file="$OUTPUT_DIR/$filename.svg"

        echo "  $filename.png -> $filename.svg"

        # VTracer parameters for detailed shaded output
        # - color_precision: higher = more colors preserved (1-8)
        # - gradient_step: color difference between gradient layers
        # - filter_speckle: remove small artifacts (pixels)
        # - path_precision: decimal places for path coordinates
        # - mode: spline (smooth curves) vs polygon
        vtracer \
            --input "$png_file" \
            --output "$output_file" \
            --colormode color \
            --hierarchical stacked \
            --mode spline \
            --filter_speckle 4 \
            --color_precision 6 \
            --gradient_step 16 \
            --corner_threshold 60 \
            --splice_threshold 45 \
            --path_precision 3
    fi
done

echo "Vectorization complete!"
echo "Output: $OUTPUT_DIR"
