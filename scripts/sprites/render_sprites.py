#!/usr/bin/env python3
"""
Render 3D Blender models to PNG for SVG conversion.
Run with: /Applications/Blender.app/Contents/MacOS/Blender --background --python render_sprites.py
"""

import bpy
from mathutils import Vector
import os
import sys
import math
from pathlib import Path

# Configuration
MODELS_DIR = Path(__file__).parent.parent.parent / "3Dmodels"
OUTPUT_DIR = Path(__file__).parent.parent.parent / "public" / "sprites" / "units" / "rendered"

# Unit configuration: French name -> (English name, width_hexes, height_hexes)
UNIT_CONFIG = {
    "3dprint_char": ("tank", 1, 1),
    "3dprint_gros_tas": ("supertank", 1, 1),
    "3dprint_crabe": ("crab", 1, 1),
    "3dprint_pondeuse_meteo": ("converter", 1, 1),
    "3dprint_barge": ("barge", 2, 1),
    "3dPrint_vedette": ("motorboat", 1, 1),
    "3dprint_pont": ("bridge", 1, 1),
    "3dprint_astronef": ("astronef", 2, 2),
    "3dprint_marqueur": ("marker", 1, 1),
}

# Base resolution per hex (maintains 60:52 aspect ratio)
BASE_WIDTH = 512
BASE_HEIGHT = int(512 * 52 / 60)  # ~443

# Object name patterns to exclude (bases, platforms, etc.)
EXCLUDE_PATTERNS = [
    'plane', 'base', 'floor', 'platform', 'ground',
    'hex', 'hexagon', 'hexagone', 'socle',
    'support', 'stand', 'pad'
]


def should_exclude_object(obj):
    """Check if an object should be excluded from rendering."""
    if obj.type != 'MESH':
        return False

    name_lower = obj.name.lower()

    # Check name patterns
    for pattern in EXCLUDE_PATTERNS:
        if pattern in name_lower:
            return True

    # Check if object is very flat (likely a base/platform)
    # Get bounding box dimensions
    bbox = obj.bound_box
    z_coords = [v[2] for v in bbox]
    z_height = max(z_coords) - min(z_coords)

    xy_coords_x = [v[0] for v in bbox]
    xy_coords_y = [v[1] for v in bbox]
    xy_size = max(max(xy_coords_x) - min(xy_coords_x), max(xy_coords_y) - min(xy_coords_y))

    # If very flat relative to XY size, it's likely a base
    if xy_size > 0 and z_height / xy_size < 0.05:
        return True

    return False


def setup_scene():
    """Clear scene and set up rendering."""
    # Clear existing objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Set up render settings
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True

    # Transparent background
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    # Set up world lighting
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    scene.world = world
    # In Blender 5.0+, worlds use nodes by default
    if hasattr(world, 'use_nodes'):
        world.use_nodes = True
    if world.node_tree:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.8, 0.8, 0.8, 1)  # Light gray ambient
            bg.inputs[1].default_value = 0.5  # Strength


def create_camera(width_hexes, height_hexes):
    """Create orthographic camera looking down."""
    bpy.ops.object.camera_add(location=(0, 0, 10))
    camera = bpy.context.active_object
    camera.name = "RenderCamera"
    camera.data.type = 'ORTHO'
    camera.rotation_euler = (0, 0, 0)  # Looking straight down

    bpy.context.scene.camera = camera
    return camera


def create_lights():
    """Create lighting setup for good shading."""
    # Key light (main)
    bpy.ops.object.light_add(type='SUN', location=(5, -5, 10))
    key_light = bpy.context.active_object
    key_light.name = "KeyLight"
    key_light.data.energy = 3
    key_light.rotation_euler = (math.radians(45), math.radians(15), math.radians(45))

    # Fill light (softer, opposite side)
    bpy.ops.object.light_add(type='SUN', location=(-5, 5, 8))
    fill_light = bpy.context.active_object
    fill_light.name = "FillLight"
    fill_light.data.energy = 1.5
    fill_light.rotation_euler = (math.radians(50), math.radians(-15), math.radians(-45))

    # Rim light (from behind/above for edge definition)
    bpy.ops.object.light_add(type='SUN', location=(0, 5, 12))
    rim_light = bpy.context.active_object
    rim_light.name = "RimLight"
    rim_light.data.energy = 1
    rim_light.rotation_euler = (math.radians(30), 0, 0)


def fit_camera_to_objects(camera, padding=1.2):
    """Adjust camera orthographic scale to fit all objects."""
    # Get all mesh objects
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        return

    # Calculate bounding box of all objects
    min_x = min_y = float('inf')
    max_x = max_y = float('-inf')

    for obj in meshes:
        for vertex in obj.bound_box:
            world_vertex = obj.matrix_world @ Vector(vertex)
            min_x = min(min_x, world_vertex.x)
            max_x = max(max_x, world_vertex.x)
            min_y = min(min_y, world_vertex.y)
            max_y = max(max_y, world_vertex.y)

    # Calculate required orthographic scale
    width = max_x - min_x
    height = max_y - min_y

    # Get render aspect ratio
    scene = bpy.context.scene
    aspect = scene.render.resolution_x / scene.render.resolution_y

    # Set orthographic scale with padding
    if width / aspect > height:
        camera.data.ortho_scale = width * padding
    else:
        camera.data.ortho_scale = height * aspect * padding

    # Center camera over objects
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    camera.location.x = center_x
    camera.location.y = center_y


def render_model(blend_file, output_name, width_hexes, height_hexes):
    """Render a single model to PNG."""
    print(f"Rendering {blend_file} -> {output_name}")

    # Set up clean scene
    setup_scene()

    # Import the model
    with bpy.data.libraries.load(str(blend_file), link=False) as (data_from, data_to):
        data_to.objects = data_from.objects

    # Link objects to scene, filtering out bases/platforms
    excluded_objects = []
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            if should_exclude_object(obj):
                excluded_objects.append(obj)

    # Remove excluded objects
    for obj in excluded_objects:
        print(f"  Excluding object: {obj.name}")
        bpy.data.objects.remove(obj, do_unlink=True)

    # Set resolution based on hex count
    scene = bpy.context.scene
    scene.render.resolution_x = BASE_WIDTH * width_hexes
    scene.render.resolution_y = BASE_HEIGHT * height_hexes
    scene.render.resolution_percentage = 100

    # Create camera and lights
    camera = create_camera(width_hexes, height_hexes)
    create_lights()

    # Fit camera to model
    fit_camera_to_objects(camera)

    # Set output path
    output_path = OUTPUT_DIR / f"{output_name}.png"
    scene.render.filepath = str(output_path)

    # Render
    bpy.ops.render.render(write_still=True)
    print(f"  Saved: {output_path}")


def main():
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find and render all models
    for blend_name, (output_name, w, h) in UNIT_CONFIG.items():
        # Try both .blend extension patterns
        blend_file = MODELS_DIR / f"{blend_name}.blend"

        if blend_file.exists():
            render_model(blend_file, output_name, w, h)
        else:
            print(f"Warning: {blend_file} not found")

    print("\nRendering complete!")
    print(f"Output directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
