import { MeshBuilder, type Scene, type Mesh, Color3, StandardMaterial, DynamicTexture, Vector3 } from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';

let groundMesh: Mesh | null = null;
let gridMat: GridMaterial | null = null;
let shadowMesh: Mesh | null = null;
let shadowMat: StandardMaterial | null = null;
let shadowTex: DynamicTexture | null = null;

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

  gridMat = new GridMaterial('groundGridMat', scene);
  gridMat.majorUnitFrequency = 5;
  gridMat.minorUnitVisibility = 0.45;
  gridMat.gridRatio = 0.5;
  gridMat.opacity = 1;
  gridMat.useMaxLine = true;

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
  gridMat.mainColor = new Color3(bg.r, bg.g, bg.b);
  scene.fogColor = new Color3(bg.r, bg.g, bg.b);

  // Determine if dark or light theme based on luminance
  const lum = bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114;
  gridMat.lineColor = lum < 0.5
    ? new Color3(0.2, 0.25, 0.35)   // subtle lines on dark bg
    : new Color3(0.75, 0.78, 0.82); // subtle lines on light bg
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
