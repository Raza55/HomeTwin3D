import { MeshBuilder, type Scene, type Mesh, Color3, StandardMaterial, DynamicTexture, Vector3, ShaderMaterial, ShaderLanguage, Vector4 } from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';

let groundMesh: Mesh | null = null;
let gridMat: GridMaterial | ShaderMaterial | null = null;
let shadowMesh: Mesh | null = null;
let shadowMat: StandardMaterial | null = null;
let shadowTex: DynamicTexture | null = null;

const GRID_SETTINGS = { majorUnitFrequency: 5, minorUnitVisibility: 0.45, gridRatio: 0.5 } as const;

/**
 * WGSL port of @babylonjs/materials GridMaterial (which only ships GLSL) with
 * the options used here: antialiased lines, max-line blending, opaque, and
 * Babylon's linear/exp fog. Keeps the grid identical under the WebGPU engine.
 */
function createWgslGridMaterial(scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial('groundGridMat', scene, {
    vertexSource: `
attribute position: vec3f;
attribute normal: vec3f;
uniform world: mat4x4f;
uniform view: mat4x4f;
uniform viewProjection: mat4x4f;
varying vPosition: vec3f;
varying vNormal: vec3f;
varying vFogDistance: vec3f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let worldPos = uniforms.world * vec4f(input.position, 1.0);
  vertexOutputs.vFogDistance = (uniforms.view * worldPos).xyz;
  vertexOutputs.position = uniforms.viewProjection * worldPos;
  vertexOutputs.vPosition = input.position;
  vertexOutputs.vNormal = input.normal;
}`,
    fragmentSource: `
varying vPosition: vec3f;
varying vNormal: vec3f;
varying vFogDistance: vec3f;
uniform visibility: f32;
uniform mainColor: vec3f;
uniform lineColor: vec3f;
uniform gridControl: vec4f;
uniform gridOffset: vec3f;
uniform vFogInfos: vec4f;
uniform vFogColor: vec3f;
const SQRT2: f32 = 1.41421356;
const PI: f32 = 3.14159;

fn getDynamicVisibility(position: f32) -> f32 {
  let majorGridFrequency = uniforms.gridControl.y;
  if (floor(position + 0.5) == floor(position / majorGridFrequency + 0.5) * majorGridFrequency) { return 1.0; }
  return uniforms.gridControl.z;
}

fn getAnisotropicAttenuation(differentialLength: f32) -> f32 {
  return clamp(1.0 / (differentialLength + 1.0) - 1.0 / 10.0, 0.0, 1.0);
}

fn isPointOnLine(position: f32, differentialLength: f32) -> f32 {
  let fractionPart = clamp((position - floor(position + 0.5)) / differentialLength, -1.0, 1.0);
  return 0.5 + 0.5 * cos(fractionPart * PI);
}

fn contributionOnAxis(position: f32, differentialLength: f32) -> f32 {
  return isPointOnLine(position, differentialLength) * getDynamicVisibility(position) * getAnisotropicAttenuation(differentialLength);
}

fn normalImpactOnAxis(x: f32) -> f32 {
  return clamp(1.0 - 3.0 * abs(x * x * x), 0.0, 1.0);
}

fn calcFogFactor() -> f32 {
  let fogDistance = length(fragmentInputs.vFogDistance);
  var fogCoeff = 1.0;
  if (uniforms.vFogInfos.x == 3.0) {
    fogCoeff = (uniforms.vFogInfos.z - fogDistance) / (uniforms.vFogInfos.z - uniforms.vFogInfos.y);
  } else if (uniforms.vFogInfos.x == 1.0) {
    fogCoeff = 1.0 / pow(2.71828, fogDistance * uniforms.vFogInfos.w);
  } else if (uniforms.vFogInfos.x == 2.0) {
    fogCoeff = 1.0 / pow(2.71828, fogDistance * fogDistance * uniforms.vFogInfos.w * uniforms.vFogInfos.w);
  }
  return clamp(fogCoeff, 0.0, 1.0);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let gridPos = (input.vPosition + uniforms.gridOffset) / uniforms.gridControl.x;
  // Derivatives in uniform control flow, as GridMaterial computes them per axis.
  let dx = length(vec2f(dpdx(gridPos.x), dpdy(gridPos.x))) * SQRT2;
  let dy = length(vec2f(dpdx(gridPos.y), dpdy(gridPos.y))) * SQRT2;
  let dz = length(vec2f(dpdx(gridPos.z), dpdy(gridPos.z))) * SQRT2;
  let normal = normalize(input.vNormal);
  let x = contributionOnAxis(gridPos.x, dx) * normalImpactOnAxis(normal.x);
  let y = contributionOnAxis(gridPos.y, dy) * normalImpactOnAxis(normal.y);
  let z = contributionOnAxis(gridPos.z, dz) * normalImpactOnAxis(normal.z);
  let grid = clamp(max(max(x, y), z), 0.0, 1.0);
  var color = mix(uniforms.mainColor, uniforms.lineColor, grid);
  color = mix(uniforms.vFogColor, color, calcFogFactor());
  fragmentOutputs.color = vec4f(color, uniforms.visibility);
}`,
  }, {
    attributes: ['position', 'normal'],
    uniforms: ['world', 'view', 'viewProjection', 'visibility', 'mainColor', 'lineColor', 'gridControl', 'gridOffset', 'vFogInfos', 'vFogColor'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  material.setVector4('gridControl', new Vector4(GRID_SETTINGS.gridRatio, GRID_SETTINGS.majorUnitFrequency, GRID_SETTINGS.minorUnitVisibility, 1));
  material.setVector3('gridOffset', Vector3.Zero());
  material.onBindObservable.add(mesh => {
    const effect = material.getEffect();
    if (!effect) return;
    effect.setFloat('visibility', mesh.visibility);
    const fogOn = scene.fogEnabled && mesh.applyFog ? scene.fogMode : 0;
    effect.setFloat4('vFogInfos', fogOn, scene.fogStart, scene.fogEnd, scene.fogDensity);
    effect.setColor3('vFogColor', scene.fogColor);
  });
  return material;
}

/** Radius of the circular ground grid (world units). */
export const GRID_RADIUS = 90;

/**
 * Create or show a circular ground grid.
 * Scene fog handles the edge fade — fog start/end are synced to the grid radius.
 */
export function showGroundGrid(scene: Scene): void {
  if (groundMesh) {
    groundMesh.setEnabled(true);
    syncGridColors(scene);
    return;
  }

  if (scene.getEngine().isWebGPU) {
    gridMat = createWgslGridMaterial(scene);
  } else {
    const grid = new GridMaterial('groundGridMat', scene);
    grid.majorUnitFrequency = GRID_SETTINGS.majorUnitFrequency;
    grid.minorUnitVisibility = GRID_SETTINGS.minorUnitVisibility;
    grid.gridRatio = GRID_SETTINGS.gridRatio;
    grid.opacity = 1;
    grid.useMaxLine = true;
    gridMat = grid;
  }

  syncGridColors(scene);

  groundMesh = MeshBuilder.CreateDisc('groundGrid', {
    radius: GRID_RADIUS,
    tessellation: 64,
  }, scene);
  groundMesh.rotation.x = Math.PI / 2; // lay flat
  groundMesh.position.y = -1; // float the model above the grid
  groundMesh.material = gridMat;
  groundMesh.isPickable = false;
  groundMesh.receiveShadows = false;
}

/** Hide the ground grid without disposing it. */
export function hideGroundGrid(): void {
  if (groundMesh) groundMesh.setEnabled(false);
}

/** Update grid + fog colors to match the current scene background. */
export function syncGridColors(scene: Scene): void {
  if (!gridMat) return;
  const bg = scene.clearColor;
  const mainColor = new Color3(bg.r, bg.g, bg.b);
  scene.fogColor = new Color3(bg.r, bg.g, bg.b);

  // Determine if dark or light theme based on luminance
  const lum = bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114;
  const lineColor = lum < 0.5
    ? new Color3(0.2, 0.25, 0.35)   // subtle lines on dark bg
    : new Color3(0.75, 0.78, 0.82); // subtle lines on light bg
  if (gridMat instanceof GridMaterial) {
    gridMat.mainColor = mainColor;
    gridMat.lineColor = lineColor;
  } else {
    gridMat.setColor3('mainColor', mainColor);
    gridMat.setColor3('lineColor', lineColor);
  }
}

/**
 * Create a fake blurred shadow blob on the ground beneath the model.
 * Uses a radial gradient texture — no lights involved.
 */
export function createModelShadow(
  scene: Scene,
  center: Vector3,
  size: Vector3,
): void {
  if (shadowMesh) return;

  const texSize = 256;
  shadowTex = new DynamicTexture('shadowTex', texSize, scene, false);
  const ctx2d = shadowTex.getContext();
  const half = texSize / 2;
  const gradient = ctx2d.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, texSize, texSize);
  shadowTex.update();

  shadowMat = new StandardMaterial('shadowBlobMat', scene);
  shadowMat.diffuseTexture = shadowTex;
  shadowMat.opacityTexture = shadowTex;
  shadowMat.disableLighting = true;
  shadowMat.backFaceCulling = false;

  const padding = 1.5;
  shadowMesh = MeshBuilder.CreateGround('shadowBlob', {
    width: size.x * padding,
    height: size.z * padding,
  }, scene);
  shadowMesh.position.x = center.x;
  shadowMesh.position.z = center.z;
  shadowMesh.position.y = groundMesh ? groundMesh.position.y + 0.01 : -0.99;
  shadowMesh.material = shadowMat;
  shadowMesh.isPickable = false;
  shadowMesh.applyFog = false;
}

/** Dispose all grid resources. */
export function disposeGroundGrid(): void {
  groundMesh?.dispose();
  gridMat?.dispose();
  shadowMesh?.dispose();
  shadowMat?.dispose();
  shadowTex?.dispose();
  groundMesh = null;
  gridMat = null;
  shadowMesh = null;
  shadowMat = null;
  shadowTex = null;
}
