/**
 * Terrain shader for instanced flat-top hex rendering
 * Renders 851 hexes with per-instance color
 */

// Vertex attributes
struct VertexInput {
  @location(0) position: vec2f,  // Hex vertex position (6 vertices)
}

// Instance attributes
struct InstanceInput {
  @location(1) instancePosition: vec2f,  // World position of hex center
  @location(2) instanceColor: vec3f,     // RGB color for this hex
}

// Uniforms
struct Uniforms {
  viewProjection: mat4x4f,  // Combined view-projection matrix
  zoom: f32,                // Zoom level for scaling
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Vertex shader output
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vertexMain(
  vertex: VertexInput,
  instance: InstanceInput,
) -> VertexOutput {
  var output: VertexOutput;

  // Apply instance position offset to vertex
  let worldPosition = vertex.position + instance.instancePosition;

  // Apply view-projection transformation
  output.position = uniforms.viewProjection * vec4f(worldPosition, 0.0, 1.0);

  // Pass through color
  output.color = instance.instanceColor;

  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Simple solid color for terrain
  // Alpha is 1.0 (fully opaque)
  return vec4f(input.color, 1.0);
}
