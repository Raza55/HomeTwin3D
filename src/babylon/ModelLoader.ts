import {
  Scene,
  SceneLoader,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  AbstractMesh,
  Tools,
  type Node,
  type Mesh,
  type ISceneLoaderProgressEvent,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { ModelObjectOverride, ModelObjectTransform } from '../types';
import { prepareWindowGlass, simplifyRefractiveGlass } from './WindowGlass';
import { optimizeTransmissionPass } from './TransmissionCulling';
import { setupMetalReflections } from './MetalReflections';
import { normalizeModelScale } from './SceneScale';
import { readFloorplanManifest } from '../services/floorplanImport';

export interface ModelObjectInfo {
  id: string;
  label: string;
  mesh: AbstractMesh;
}

export interface ModelLoadResult {
  meshes: AbstractMesh[];
  shadowCasters: AbstractMesh[];
  center: Vector3;
  diagonal: number;
  /** Model bounding-box size (max − min) in world units. */
  size: Vector3;
  /** Imported solid model meshes that can be selected in the editor. */
  editableObjects: ModelObjectInfo[];
  /** User scale applied on top of any automatic unit conversion. */
  modelScale: number;
}

export interface LoadModelOptions {
  /** When true, keep original textured materials and skip the white cartoon edges. */
  showTextures?: boolean;
  /** Base color of the cartoon material when textures are off (hex string, e.g. "#ffffff"). */
  sketchColor?: string;
  /** Specular intensity (0..1) of the cartoon material; applied as uniform grayscale. */
  sketchSpecular?: number;
  /** Enable Babylon's per-mesh edge renderer for classic sketch outlines. */
  edgeRendering?: boolean;
  /** User model scale applied after automatic unit conversion. */
  modelScale?: number;
  /** Local transform overrides for imported model sub-objects. */
  objectOverrides?: ModelObjectOverride[];
}

function hexToColor3(hex: string): Color3 {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16);
  return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function loadModel(
  scene: Scene,
  source: string | Blob,
  onProgress?: (percent: number) => void,
  options?: LoadModelOptions,
): Promise<ModelLoadResult> {
  let dir: string;
  let file: string;
  let blobUrl: string | null = null;

  if (source instanceof Blob) {
    blobUrl = URL.createObjectURL(source);
    dir = '';
    file = blobUrl;
    // Revoke on scene dispose (not earlier — Babylon may reference the URL async for textures)
    scene.onDisposeObservable.addOnce(() => { if (blobUrl) URL.revokeObjectURL(blobUrl); });
  } else {
    dir = source.substring(0, source.lastIndexOf('/') + 1) || './';
    file = source.substring(source.lastIndexOf('/') + 1);
  }

  const t0 = performance.now();
  const floorplan = source instanceof Blob ? await readFloorplanManifest(source) : undefined;
  const result = await SceneLoader.ImportMeshAsync(
    '',
    dir,
    file,
    scene,
    (evt: ISceneLoaderProgressEvent) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
    blobUrl ? '.glb' : undefined, // hint Babylon to use the glTF loader for blob URLs
  );
  result.animationGroups.filter(g=>g.name.startsWith('3Dash_Appliance_')).forEach(g=>g.stop());
  optimizeTransmissionPass(scene);
  console.log(`[ModelLoader] loaded in ${(performance.now() - t0).toFixed(0)}ms`);

  // Collect solid meshes first; bounds are computed after overrides and scaling.
  const solidMeshes: AbstractMesh[] = [];

  result.meshes.forEach((m) => {
    if (!(m instanceof AbstractMesh)) return;
    if (!m.getTotalVertices || m.getTotalVertices() === 0) return;
    let cutaway = false;
    for (let node: Node | null = m; node; node = node.parent) {
      if (node.metadata?.gltf?.extras?.ha_cutaway) cutaway = true;
    }
    if (cutaway) {
      // Ceilings still cast shadows, but do not obscure the floorplan camera.
      m.layerMask = 0x10000000;
      m.isPickable = false;
    }
    m.receiveShadows = true;
    prepareWindowGlass(m);
    simplifyRefractiveGlass(m);
    solidMeshes.push(m);
  });

  const editableObjects = prepareModelObjects(solidMeshes, options?.objectOverrides ?? []);
  let bounds = computeModelBounds(solidMeshes, !!floorplan);
  let center = bounds.center;
  let diagonal = bounds.diagonal;

  // Auto-scale: if model is in millimeters (diagonal > 100), convert to meters.
  // User scale is applied on top of that normalized coordinate system.
  const autoScale = !floorplan && diagonal > 100 ? 0.001 : 1;
  const modelScale = normalizeModelScale(options?.modelScale);
  const combinedScale = autoScale * modelScale;

  if (combinedScale !== 1) {
    const rootMesh = result.meshes[0];
    rootMesh.scaling.scaleInPlace(combinedScale);

    // Force world matrix recalculation on all meshes
    scene.meshes.forEach((m) => m.computeWorldMatrix(true));

    // Recompute bounding box with new world positions
    for (const m of solidMeshes) {
      m.refreshBoundingInfo({});
    }
    bounds = computeModelBounds(solidMeshes, !!floorplan);
    center = bounds.center;
    diagonal = bounds.diagonal;
  }

  // Disable lights imported from the model (e.g. UE lights)
  result.lights.forEach((l) => l.setEnabled(false));

  // Apply white cartoon style or keep original textures depending on user setting.
  applyRenderStyle(scene, solidMeshes, {
    showTextures: options?.showTextures ?? false,
    sketchColor: options?.sketchColor ?? '#ffffff',
    sketchSpecular: options?.sketchSpecular ?? 0.1,
    edgeRendering: options?.edgeRendering ?? true,
  });

  // Metals and mirrors need something to reflect; replaces the previous model's setup.
  scene.metadata ??= {};
  scene.metadata.metalReflections?.dispose();
  scene.metadata.metalReflections = setupMetalReflections(scene, solidMeshes);

  const shadowCasters: AbstractMesh[] = solidMeshes.filter(m=>!m.metadata?.windowGlass);

  return { meshes: result.meshes, shadowCasters, center, diagonal, size: bounds.size, editableObjects, modelScale };
}

function computeModelBounds(meshes: AbstractMesh[], precise = false): { min: Vector3; max: Vector3; center: Vector3; diagonal: number; size: Vector3 } {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);

  for (const mesh of meshes) {
    try {
      mesh.computeWorldMatrix(true);
      const positions = precise ? mesh.getVerticesData('position') : null;
      if (positions) {
        // Batching a rotated chair with another object creates a very loose local
        // AABB. Camera framing must use actual vertices, not that rotated box.
        const matrix = mesh.getWorldMatrix();
        const point = Vector3.Zero();
        for (let i = 0; i < positions.length; i += 3) {
          Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i+1], positions[i+2], matrix, point);
          min.minimizeInPlace(point); max.maximizeInPlace(point);
        }
        continue;
      }
      const b = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, b.minimumWorld);
      max = Vector3.Maximize(max, b.maximumWorld);
    } catch {
      // Some imported helper meshes can fail bounds refresh; skip them.
    }
  }

  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    min = Vector3.Zero();
    max = Vector3.Zero();
  }

  return {
    min,
    max,
    center: Vector3.Lerp(min, max, 0.5),
    diagonal: Vector3.Distance(min, max),
    size: max.subtract(min),
  };
}

function prepareModelObjects(meshes: AbstractMesh[], overrides: ModelObjectOverride[]): ModelObjectInfo[] {
  const overridesById = new Map(overrides.map((override) => [override.id, override]));
  const usedIds = new Map<string, number>();

  return meshes.map((mesh) => {
    const id = buildStableModelObjectId(mesh, usedIds);
    const label = buildModelObjectLabel(mesh, id);
    const metadata = ensureMetadata(mesh);

    metadata.modelObjectId = id;
    metadata.modelObjectLabel = label;
    metadata.modelObjectOriginalTransform = readModelObjectTransform(mesh);

    const override = overridesById.get(id);
    if (override) applyModelObjectTransform(mesh, override);

    return { id, label, mesh };
  });
}

function buildStableModelObjectId(mesh: AbstractMesh, usedIds: Map<string, number>): string {
  const parts: string[] = [];
  let node: Node | null = mesh;

  while (node) {
    const name = sanitizeName(readNodeName(node));
    if (name && name !== '__root__') parts.push(name);
    node = node.parent;
  }

  const base = parts.reverse().join('/') || sanitizeName(mesh.name || mesh.id) || 'mesh';
  const count = (usedIds.get(base) ?? 0) + 1;
  usedIds.set(base, count);
  return count === 1 ? base : `${base}#${count}`;
}

function buildModelObjectLabel(mesh: AbstractMesh, id: string): string {
  const directName = sanitizeName(mesh.name || mesh.id);
  if (directName && directName !== '__root__') return directName;
  return id.split('/').pop() ?? id;
}

function readNodeName(node: Node): string {
  const candidate = node as { name?: string; id?: string };
  return candidate.name || candidate.id || '';
}

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function ensureMetadata(mesh: AbstractMesh): Record<string, unknown> {
  if (!mesh.metadata) mesh.metadata = {};
  return mesh.metadata as Record<string, unknown>;
}

export function readModelObjectTransform(mesh: AbstractMesh): ModelObjectTransform {
  ensureEulerRotation(mesh);
  return {
    position: vectorToPlain(mesh.position),
    rotation: {
      x: round(toDegrees(mesh.rotation.x)),
      y: round(toDegrees(mesh.rotation.y)),
      z: round(toDegrees(mesh.rotation.z)),
    },
    scale: vectorToPlain(mesh.scaling),
  };
}

export function getOriginalModelObjectTransform(mesh: AbstractMesh): ModelObjectTransform | null {
  const transform = (mesh.metadata as Record<string, unknown> | null)?.modelObjectOriginalTransform;
  return transform && typeof transform === 'object' ? structuredClone(transform as ModelObjectTransform) : null;
}

export function applyModelObjectTransform(mesh: AbstractMesh, transform: ModelObjectTransform): void {
  if (transform.position) {
    mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
  }
  if (transform.rotation) {
    ensureEulerRotation(mesh);
    mesh.rotation.set(
      toRadians(transform.rotation.x),
      toRadians(transform.rotation.y),
      toRadians(transform.rotation.z),
    );
  }
  if (transform.scale) {
    mesh.scaling.set(
      Math.max(0.001, transform.scale.x),
      Math.max(0.001, transform.scale.y),
      Math.max(0.001, transform.scale.z),
    );
  }
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo({});
}

function ensureEulerRotation(mesh: AbstractMesh): void {
  if (!mesh.rotationQuaternion) return;
  mesh.rotation = mesh.rotationQuaternion.toEulerAngles();
  mesh.rotationQuaternion = null;
}

function vectorToPlain(v: Vector3) {
  return { x: round(v.x), y: round(v.y), z: round(v.z) };
}

function round(value: number): number {
  return parseFloat(value.toFixed(4));
}

function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

const CARTOON_MAT_NAME = 'cartoon_white';

function getOrCreateCartoonMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName(CARTOON_MAT_NAME);
  if (existing) return existing as StandardMaterial;
  // Shared StandardMaterial (more robust than PBR for CAD exports lacking normals/UVs)
  const mat = new StandardMaterial(CARTOON_MAT_NAME, scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mat.maxSimultaneousLights = 48;
  return mat;
}

/**
 * Update the cartoon material's diffuse and specular at runtime.
 * `sketchSpecular` is applied as a uniform grayscale on all three channels.
 */
export function setSketchAppearance(scene: Scene, sketchColor: string, sketchSpecular: number): void {
  const mat = getOrCreateCartoonMaterial(scene);
  mat.diffuseColor = hexToColor3(sketchColor);
  const s = Math.max(0, Math.min(1, sketchSpecular));
  mat.specularColor = new Color3(s, s, s);
}

/**
 * See-through sketch model (energy view): the flows and devices show through walls and
 * furniture. The depth pre-pass draws only the front-most surface, a clean glass look.
 */
export function setSketchTransparency(scene: Scene, alpha: number): void {
  const mat = getOrCreateCartoonMaterial(scene);
  const value = Math.max(.05, Math.min(1, alpha));
  mat.alpha = value;
  // Depth is written in the same pass: a depth pre-pass made Babylon re-check every sub-mesh
  // of the shared material twice per frame (about 15 ms on a desktop) for the same look.
  mat.needDepthPrePass = false;
  mat.forceDepthWrite = value < 1;
}

interface RenderStyleOptions {
  showTextures: boolean;
  sketchColor: string;
  sketchSpecular: number;
  edgeRendering: boolean;
}

/**
 * Apply either the cartoon (sketch) style or the original textured materials.
 * Stores each mesh's original material once so the modes can be toggled at runtime.
 */
function applyRenderStyle(scene: Scene, meshes: AbstractMesh[], opts: RenderStyleOptions): void {
  setSketchAppearance(scene, opts.sketchColor, opts.sketchSpecular);
  const cartoonMat = getOrCreateCartoonMaterial(scene);

  for (const mesh of meshes) {
    if (!mesh.metadata) mesh.metadata = {};
    if (mesh.metadata.originalMaterial === undefined) {
      mesh.metadata.originalMaterial = mesh.material;
    }
    mesh.applyFog = false; // fog is only for the ground grid fade

    if (mesh.metadata?.windowGlass) { mesh.material=mesh.metadata.originalMaterial; mesh.disableEdgesRendering(); continue; }
    if (opts.showTextures) {
      const orig = mesh.metadata.originalMaterial;
      if (orig) mesh.material = orig;
      mesh.disableEdgesRendering();
    } else if (opts.edgeRendering) {
      mesh.material = cartoonMat;
      // Per-mesh edges for classic outer corners.
      mesh.enableEdgesRendering();
      mesh.edgesWidth = 3;
      mesh.edgesColor = new Color4(0, 0, 0, 1);
    } else {
      mesh.material = cartoonMat;
      mesh.disableEdgesRendering();
    }
  }
}

/**
 * Toggle the textured / sketch render style on already-loaded meshes.
 * Restores original materials when enabled, or re-applies the cartoon white + black edges when disabled.
 */
export function setTexturesEnabled(
  scene: Scene,
  meshes: AbstractMesh[],
  enabled: boolean,
  edgeWidth: number,
  edgeRendering = true,
): void {
  const whiteMat = getOrCreateCartoonMaterial(scene);
  for (const mesh of meshes) {
    if (mesh.metadata?.windowGlass) { mesh.material=mesh.metadata.originalMaterial; mesh.disableEdgesRendering(); continue; }
    if (enabled) {
      const orig = mesh.metadata?.originalMaterial;
      if (orig) mesh.material = orig;
      mesh.disableEdgesRendering();
    } else if (edgeRendering) {
      mesh.material = whiteMat;
      mesh.enableEdgesRendering();
      mesh.edgesWidth = edgeWidth;
      mesh.edgesColor = new Color4(0, 0, 0, 1);
    } else {
      mesh.material = whiteMat;
      mesh.disableEdgesRendering();
    }
  }
}

/**
 * Create invisible shadow wall meshes from config.
 * Hidden from the camera via layerMask but included in the shadow generator.
 */
export function createShadowWalls(
  scene: Scene,
  walls: Array<{
    position: { x: number; y: number; z: number };
    size: { width: number; height: number; depth: number };
    rotation?: { x: number; y: number; z: number };
  }>,
  parent?: Node,
): Mesh[] {
  const mat = new StandardMaterial('shadow_wall_mat', scene);
  mat.disableLighting = true;

  return walls.map((w, i) => {
    const mesh = MeshBuilder.CreateBox(`shadow_wall_${i}`, {
      width: w.size.width,
      height: w.size.height,
      depth: w.size.depth,
    }, scene);
    mesh.position = new Vector3(w.position.x, w.position.y, w.position.z);
    if (w.rotation) {
      mesh.rotation.set(
        Tools.ToRadians(w.rotation.x),
        Tools.ToRadians(w.rotation.y),
        Tools.ToRadians(w.rotation.z),
      );
    }
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    // Hidden from camera but visible to shadow generator
    mesh.layerMask = 0x10000000;
    mesh.material = mat;
    if (parent) mesh.parent = parent;
    return mesh;
  });
}
