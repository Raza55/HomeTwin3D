import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  PointLight,
  SpotLight,
  ShadowGenerator,
  Quaternion,
  Mesh,
  DynamicTexture,
  type AbstractMesh,
  type Node,
} from '@babylonjs/core';
import type { LightConfig, LightPart, LightPosition, LightSize } from '../types';
import { createFloorplanLightRig, type FloorplanLightRig } from './FloorplanLighting';

export interface LightMeshEntry {
  floorplanRig?: FloorplanLightRig;
  bulb: Mesh;
  /** Additional part meshes (multi-part lights). All share the same material. */
  extraBulbs: Mesh[];
  mat: StandardMaterial;
  /** Primary point light (sphere) or first sub-light (strip). */
  light?: PointLight | SpotLight;
  /** Additional sub-lights spread along a strip. Empty for non-strip lights. */
  stripLights: Array<PointLight | SpotLight>;
  shadowGen?: ShadowGenerator;
  /** Custom hitbox mesh for click detection. Invisible by default, shown when editing. */
  hitboxMesh?: Mesh;
  hitboxMat?: StandardMaterial;
  fixtureMeshes: Mesh[];
  fixtureMat?: StandardMaterial;
  touchIconMesh?: Mesh;
  touchIconMat?: StandardMaterial;
  touchIconTexture?: DynamicTexture;
  touchIdleOpacity: number;
}

export type MeshMap = Record<string, LightMeshEntry>;

export interface StripConfig {
  spacing: number;
  maxLights: number;
  range: number;
}

export const DEFAULT_STRIP_CONFIG: StripConfig = {
  spacing: 1,
  maxLights: 4,
  range: 6,
};

export interface CreateLightMeshOptions {
  withPointLight?: boolean;
  shadowCasters?: AbstractMesh[];
  stripConfig?: StripConfig;
  singleRange?: number;
  shadowResolution?: number;
  parent?: Node;
  sceneScale?: number;
}

/** Minimum ratio between longest and shortest cube dimension to be treated as a strip. */
const STRIP_RATIO = 3;
const NANOLEAF_PANEL_COORDS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
  [2, -1],
  [-2, 1],
  [1, 1],
];

/**
 * Create a light mesh (sphere, ellipsoid, or cube) with optional PointLight(s) and shadow generator.
 * Long thin cubes are detected as LED strips and get multiple sub-lights.
 */
export function createLightMesh(
  scene: Scene,
  cfg: LightConfig,
  id: string,
  options: CreateLightMeshOptions = {},
): LightMeshEntry {
  const { withPointLight = false, shadowCasters, stripConfig, singleRange, shadowResolution, parent, sceneScale = 1 } = options;
  const sc = stripConfig ?? DEFAULT_STRIP_CONFIG;
  const canCreateShadow = !!shadowCasters?.length && shadowResolution !== 0;
  const pos = new Vector3(cfg.position.x, cfg.position.y, cfg.position.z);

  const mat = new StandardMaterial(`bulbmat_${id}`, scene);
  mat.disableLighting = true;

  if (withPointLight) {
    mat.emissiveColor = new Color3(0, 0, 0);
  } else {
    mat.emissiveColor = new Color3(0.9, 0.75, 0.2);
    mat.alpha = 0.85;
  }

  const hasParts = cfg.parts && cfg.parts.length > 0;
  const extraBulbs: Mesh[] = [];

  let bulb: Mesh;
  if (hasParts) {
    // Multi-part: create one mesh per part, all sharing the same material
    const parts = cfg.parts!;
    bulb = createPartMesh(scene, parts[0], `bulb_${id}_0`, mat, cfg.entityId);
    for (let i = 1; i < parts.length; i++) {
      extraBulbs.push(createPartMesh(scene, parts[i], `bulb_${id}_${i}`, mat, cfg.entityId));
    }
    // All parts non-pickable when multi-part (hitbox handles clicks)
    bulb.isPickable = false;
    for (const eb of extraBulbs) eb.isPickable = false;
  } else {
    const shape = cfg.shape || 'sphere';
    const sz = cfg.size || {};
    bulb = createShapeMesh(scene, `bulb_${id}`, shape, sz);
    bulb.position = pos.clone();
    applyTransform(bulb, cfg.rotation, cfg.scale);
    bulb.metadata = { entityId: cfg.entityId };
    bulb.material = mat;
    bulb.applyFog = false;
  }

  const { meshes: fixtureMeshes, material: fixtureMat } = createFixtureMeshes(scene, cfg, id);

  let pointLight: PointLight | SpotLight | undefined;
  let floorplanRig: FloorplanLightRig | undefined;
  let shadowGen: ShadowGenerator | undefined;
  const stripLights: Array<PointLight | SpotLight> = [];

  if (withPointLight && cfg.emitters?.length) {
    floorplanRig = createFloorplanLightRig(scene, cfg, shadowCasters ?? [], sceneScale, shadowResolution ?? 512);
    pointLight = floorplanRig.lights[0];
    stripLights.push(...floorplanRig.lights);
    // The actual Blender diffuser is the visible bulb. Proxies remain editor-only.
    bulb.visibility = 0;
    extraBulbs.forEach(m => { m.visibility = 0; });
  } else if (withPointLight) {
    const singleShape = cfg.shape || 'sphere';
    const singleSz = cfg.size || {};
    const effectiveSingleSz = applySizeScale(singleSz, cfg.scale);
    // Detect strip shape: cube with one dimension >= STRIP_RATIO × the smallest
    const isStrip = !hasParts && singleShape === 'cube' && detectStrip(effectiveSingleSz);

    if (isStrip) {
      // Create multiple sub-lights along the strip
      const stripInfo = getStripAxis(effectiveSingleSz);
      const count = Math.max(2, Math.min(sc.maxLights, Math.ceil(stripInfo.length / sc.spacing)));
      const halfLen = stripInfo.length / 2;
      const axisVector = getAxisVector(stripInfo.axis);

      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1 to +1
        const offset = t * halfLen;
        const lightPos = pos.add(rotateVector(axisVector.scale(offset), cfg.rotation));

        const pl = new PointLight(`pl_${id}_${i}`, lightPos, scene);
        pl.intensity = 0;
        pl.setEnabled(false);
        pl.range = sc.range * sceneScale;
        pl.diffuse = new Color3(1, 0.9, 0.7);
        stripLights.push(pl);
      }

      // Use first sub-light as the "primary" light
      pointLight = stripLights[0];

      // Shadow generator on the center sub-light only (best coverage, cheaper)
      const centerIdx = Math.floor(count / 2);
      const shadowLight = stripLights[centerIdx];
      if (canCreateShadow) {
        shadowGen = createPointShadowGen(shadowLight, shadowCasters!, shadowResolution);
      }
    } else {
      // Single point light at entity position
      pointLight = new PointLight(`pl_${id}`, pos, scene);
      pointLight.intensity = 0;
      pointLight.setEnabled(false);
      pointLight.range = (singleRange ?? 7) * sceneScale;
      pointLight.diffuse = new Color3(1, 0.9, 0.7);

      if (canCreateShadow) {
        shadowGen = createPointShadowGen(pointLight, shadowCasters!, shadowResolution);
      }
    }
  }

  // Create custom hitbox mesh if configured (or auto-create for multi-part)
  let hitboxMesh: Mesh | undefined;
  let hitboxMat: StandardMaterial | undefined;
  const touchZoneEnabled = cfg.interaction?.touchZone ?? false;
  const needsHitbox = cfg.hitbox || hasParts || touchZoneEnabled;
  if (needsHitbox) {
    if (cfg.hitbox) {
      const hbShape = cfg.hitbox.shape;
      const hbSz = cfg.hitbox.size || {};
      hitboxMesh = createShapeMesh(scene, `hitbox_${id}`, hbShape, hbSz, { sphere: 0.5, box: 0.5 });
      const hbPos = cfg.hitbox.position
        ? new Vector3(cfg.hitbox.position.x, cfg.hitbox.position.y, cfg.hitbox.position.z)
        : pos.clone();
      hitboxMesh.position = hbPos;
      applyTransform(hitboxMesh, cfg.hitbox.rotation, cfg.hitbox.scale);
    } else if (hasParts) {
      // Auto-create bounding-box hitbox for multi-part lights
      const bounds = computePartsBounds(cfg.parts!);
      hitboxMesh = MeshBuilder.CreateBox(`hitbox_${id}`, {
        width: bounds.size.x,
        height: bounds.size.y,
        depth: bounds.size.z,
      }, scene);
      hitboxMesh.position = bounds.center;
    } else {
      const dimensions = getShapeDimensions(cfg.shape ?? 'sphere', cfg.size ?? {});
      const diameter = Math.max(dimensions.x, dimensions.y, dimensions.z, 0.45);
      hitboxMesh = MeshBuilder.CreateSphere(`hitbox_${id}`, { diameter }, scene);
      hitboxMesh.position = pos.clone();
    }
    hitboxMesh.metadata = { entityId: cfg.entityId };
    hitboxMesh.isPickable = true;

    hitboxMat = new StandardMaterial(`hitboxmat_${id}`, scene);
    hitboxMat.disableLighting = true;
    hitboxMat.emissiveColor = touchZoneEnabled ? new Color3(0.15, 0.65, 1) : new Color3(1, 0.2, 0.8);
    hitboxMat.diffuseColor = hitboxMat.emissiveColor.clone();
    hitboxMat.alpha = touchZoneEnabled ? Math.max(0.01, Math.min(0.35, cfg.interaction?.idleOpacity ?? 0.06)) : 0.3;
    hitboxMat.wireframe = !touchZoneEnabled;
    hitboxMat.backFaceCulling = false;
    hitboxMat.disableDepthWrite = touchZoneEnabled;
    hitboxMesh.material = hitboxMat;
    hitboxMesh.visibility = touchZoneEnabled && withPointLight ? 1 : 0;

    // When hitbox exists, bulb should not catch clicks
    bulb.isPickable = false;
  }

  let touchIconMesh: Mesh | undefined;
  let touchIconMat: StandardMaterial | undefined;
  let touchIconTexture: DynamicTexture | undefined;
  if (touchZoneEnabled && cfg.interaction?.showIcon !== false && hitboxMesh) {
    const icon = createTouchIcon(scene, cfg, id, hitboxMesh.position);
    touchIconMesh = icon.mesh;
    touchIconMat = icon.material;
    touchIconTexture = icon.texture;
    touchIconMesh.setEnabled(withPointLight);
  }

  const entry: LightMeshEntry = {
    floorplanRig,
    bulb,
    extraBulbs,
    mat,
    light: pointLight,
    stripLights,
    shadowGen,
    hitboxMesh,
    hitboxMat,
    fixtureMeshes,
    fixtureMat,
    touchIconMesh,
    touchIconMat,
    touchIconTexture,
    touchIdleOpacity: Math.max(0.01, Math.min(0.35, cfg.interaction?.idleOpacity ?? 0.06)),
  };
  if (parent) parentLightEntry(entry, parent);
  return entry;
}

function parentLightEntry(entry: LightMeshEntry, parent: Node): void {
  entry.bulb.parent = parent;
  for (const mesh of entry.extraBulbs) mesh.parent = parent;
  for (const mesh of entry.fixtureMeshes) mesh.parent = parent;
  if (entry.hitboxMesh) entry.hitboxMesh.parent = parent;
  if (entry.touchIconMesh) entry.touchIconMesh.parent = parent;
  if (entry.light) entry.light.parent = parent;
  for (const light of entry.stripLights) light.parent = parent;
}

function createFixtureMeshes(scene: Scene, cfg: LightConfig, id: string): { meshes: Mesh[]; material?: StandardMaterial } {
  const style = cfg.fixtureStyle ?? 'none';
  if (style === 'none') return { meshes: [] };

  const material = new StandardMaterial(`fixturemat_${id}`, scene);
  material.diffuseColor = new Color3(0.16, 0.18, 0.21);
  material.specularColor = new Color3(0.35, 0.38, 0.42);
  material.roughness = 0.55;
  const base = new Vector3(cfg.position.x, cfg.position.y, cfg.position.z);
  const size = getShapeDimensions(cfg.shape ?? 'sphere', cfg.size ?? {});
  const radius = Math.max(0.08, Math.max(size.x, size.z) * 0.65);
  const meshes: Mesh[] = [];

  const add = (mesh: Mesh, offset: Vector3) => {
    mesh.position = base.add(rotateVector(offset, cfg.rotation));
    if (cfg.rotation) mesh.rotation.set(toRadians(cfg.rotation.x), toRadians(cfg.rotation.y), toRadians(cfg.rotation.z));
    mesh.material = material;
    mesh.isPickable = false;
    mesh.applyFog = false;
    meshes.push(mesh);
  };

  if (style === 'ceiling') {
    add(MeshBuilder.CreateCylinder(`fixture_${id}_canopy`, { diameter: radius * 2.2, height: radius * 0.28, tessellation: 32 }, scene), new Vector3(0, radius * 0.5, 0));
    add(MeshBuilder.CreateTorus(`fixture_${id}_rim`, { diameter: radius * 1.8, thickness: radius * 0.18, tessellation: 32 }, scene), new Vector3(0, radius * 0.15, 0));
  } else if (style === 'pendant') {
    add(MeshBuilder.CreateCylinder(`fixture_${id}_cable`, { diameter: radius * 0.1, height: radius * 2.8, tessellation: 16 }, scene), new Vector3(0, radius * 1.7, 0));
    add(MeshBuilder.CreateCylinder(`fixture_${id}_shade`, { diameterTop: radius * 0.65, diameterBottom: radius * 2.1, height: radius * 0.9, tessellation: 32 }, scene), new Vector3(0, radius * 0.45, 0));
  } else if (style === 'floor') {
    add(MeshBuilder.CreateCylinder(`fixture_${id}_base`, { diameter: radius * 1.8, height: radius * 0.2, tessellation: 32 }, scene), new Vector3(0, -radius * 3.8, 0));
    add(MeshBuilder.CreateCylinder(`fixture_${id}_stem`, { diameter: radius * 0.12, height: radius * 3.8, tessellation: 16 }, scene), new Vector3(0, -radius * 1.9, 0));
    add(MeshBuilder.CreateCylinder(`fixture_${id}_shade`, { diameterTop: radius * 0.8, diameterBottom: radius * 2.2, height: radius, tessellation: 32 }, scene), new Vector3(0, radius * 0.15, 0));
  } else if (style === 'spot') {
    const spot = MeshBuilder.CreateCylinder(`fixture_${id}_spot`, { diameterTop: radius * 1.3, diameterBottom: radius * 1.8, height: radius * 1.8, tessellation: 32 }, scene);
    add(spot, new Vector3(0, 0, radius * 0.55));
    spot.rotation.x += Math.PI / 2;
  } else if (style === 'strip') {
    add(MeshBuilder.CreateBox(`fixture_${id}_strip`, { width: Math.max(size.x * 1.08, radius * 3), height: Math.max(size.y * 1.35, 0.06), depth: Math.max(size.z * 1.35, 0.06) }, scene), Vector3.Zero());
  }

  return { meshes, material };
}

function createTouchIcon(scene: Scene, cfg: LightConfig, id: string, center: Vector3) {
  const texture = new DynamicTexture(`touchicontex_${id}`, { width: 128, height: 128 }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = 'rgba(8, 18, 30, 0.72)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 53, 20, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(48, 66); ctx.lineTo(52, 76); ctx.lineTo(76, 76); ctx.lineTo(80, 66);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(54, 87); ctx.lineTo(74, 87);
  ctx.stroke();
  texture.update();

  const material = new StandardMaterial(`touchiconmat_${id}`, scene);
  material.disableLighting = true;
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.emissiveColor = new Color3(0.45, 0.75, 1);
  material.backFaceCulling = false;

  const dimensions = cfg.hitbox ? getShapeDimensions(cfg.hitbox.shape, cfg.hitbox.size) : getShapeDimensions(cfg.shape ?? 'sphere', cfg.size ?? {});
  const iconSize = 1.3 * Math.max(0.18, Math.min(0.42, Math.max(dimensions.x, dimensions.y, dimensions.z) * 0.42));
  const mesh = MeshBuilder.CreatePlane(`touchicon_${id}`, { size: iconSize }, scene);
  mesh.position = center.add(new Vector3(0, Math.max(dimensions.y * 0.62, iconSize * 0.8), 0));
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.material = material;
  mesh.metadata = { entityId: cfg.entityId };
  mesh.isPickable = true;
  mesh.renderingGroupId = 2;
  return { mesh, material, texture };
}

export function setLightTouchZoneHovered(entry: LightMeshEntry, hovered: boolean): void {
  if (entry.touchIconMesh) entry.touchIconMesh.scaling.setAll(hovered ? 1.4 : 1);
  if (!entry.hitboxMat || !entry.hitboxMesh || entry.hitboxMesh.visibility === 0) return;
  entry.hitboxMat.alpha = hovered ? Math.max(0.18, entry.touchIdleOpacity * 3) : entry.touchIdleOpacity;
}

export function updateLightInteractionVisual(entry: LightMeshEntry, color: Color3, isOn: boolean): void {
  const displayColor = isOn ? color : new Color3(0.22, 0.42, 0.58);
  if (entry.hitboxMat) {
    entry.hitboxMat.emissiveColor.copyFrom(displayColor);
    entry.hitboxMat.diffuseColor.copyFrom(displayColor);
  }
  if (entry.touchIconMat) entry.touchIconMat.emissiveColor.copyFrom(displayColor);
}

/** Create a shadow generator for a PointLight. */
function createPointShadowGen(
  light: PointLight | SpotLight,
  shadowCasters: AbstractMesh[],
  resolution = 512,
): ShadowGenerator {
  const sg = new ShadowGenerator(resolution, light);
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  sg.bias = 0;
  sg.normalBias = 0.05;

  for (const mesh of shadowCasters) {
    sg.addShadowCaster(mesh, false);
  }
  return sg;
}

/** Create a primitive mesh for a configured light shape. */
function createShapeMesh(
  scene: Scene,
  name: string,
  shape: LightPart['shape'],
  size: LightSize,
  fallback: { sphere: number; box: number } = { sphere: 0.25, box: 0.3 },
): Mesh {
  if (shape === 'nanoleafShapes') {
    return createNanoleafShapesMesh(scene, name, size, fallback);
  }

  if (shape === 'cube') {
    return MeshBuilder.CreateBox(name, {
      width: size.width ?? fallback.box,
      height: size.height ?? fallback.box,
      depth: size.depth ?? fallback.box,
    }, scene);
  }

  if (shape === 'ellipsoid') {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 1 }, scene);
    mesh.scaling = new Vector3(
      size.width ?? size.diameter ?? fallback.box,
      size.height ?? size.diameter ?? fallback.box,
      size.depth ?? size.diameter ?? fallback.box,
    );
    return mesh;
  }

  return MeshBuilder.CreateSphere(name, {
    diameter: size.diameter ?? fallback.sphere,
  }, scene);
}

function createNanoleafShapesMesh(
  scene: Scene,
  name: string,
  size: LightSize,
  fallback: { sphere: number; box: number },
): Mesh {
  const targetWidth = size.width ?? Math.max(1.15, fallback.box * 4);
  const targetHeight = size.height ?? Math.max(0.78, fallback.box * 2.6);
  const targetDepth = size.depth ?? 0.035;
  const rawRadius = 0.5;
  const rawDx = rawRadius * 1.58;
  const rawDy = rawRadius * 1.36;

  const rawPositions = NANOLEAF_PANEL_COORDS.map(([q, r]) => ({
    x: q * rawDx,
    y: (r + q * 0.5) * rawDy,
  }));
  const minX = Math.min(...rawPositions.map((p) => p.x - rawRadius));
  const maxX = Math.max(...rawPositions.map((p) => p.x + rawRadius));
  const minY = Math.min(...rawPositions.map((p) => p.y - rawRadius));
  const maxY = Math.max(...rawPositions.map((p) => p.y + rawRadius));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const panelScale = Math.min(
    targetWidth / Math.max(0.001, maxX - minX),
    targetHeight / Math.max(0.001, maxY - minY),
  );

  const panels = rawPositions.map((p, index) => {
    const panel = MeshBuilder.CreateCylinder(`${name}_panel_${index}`, {
      height: targetDepth,
      diameter: rawRadius * panelScale * 1.88,
      tessellation: 6,
    }, scene);
    panel.rotation.x = Math.PI / 2;
    panel.position.set((p.x - centerX) * panelScale, (p.y - centerY) * panelScale, 0);
    panel.bakeCurrentTransformIntoVertices();
    return panel;
  });

  const merged = Mesh.MergeMeshes(panels, true, true, undefined, false, true);
  if (merged) {
    merged.name = name;
    return merged;
  }

  return MeshBuilder.CreateBox(name, {
    width: targetWidth,
    height: targetHeight,
    depth: targetDepth,
  }, scene);
}

/** Create a single part mesh with shared material. */
function createPartMesh(
  scene: Scene,
  part: LightPart,
  name: string,
  mat: StandardMaterial,
  entityId: string,
): Mesh {
  const sz = part.size || {};
  const mesh = createShapeMesh(scene, name, part.shape, sz);
  mesh.position = new Vector3(part.position.x, part.position.y, part.position.z);
  applyTransform(mesh, part.rotation, part.scale);
  mesh.metadata = { entityId };
  mesh.material = mat;
  mesh.applyFog = false;
  return mesh;
}

/** Compute an axis-aligned bounding box around all parts. */
function computePartsBounds(parts: LightPart[]): { center: Vector3; size: Vector3 } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of parts) {
    const dimensions = getShapeDimensions(p.shape, p.size || {}).multiply(vectorFromScale(p.scale));
    const hw = dimensions.x / 2;
    const hh = dimensions.y / 2;
    const hd = dimensions.z / 2;
    minX = Math.min(minX, p.position.x - hw);
    maxX = Math.max(maxX, p.position.x + hw);
    minY = Math.min(minY, p.position.y - hh);
    maxY = Math.max(maxY, p.position.y + hh);
    minZ = Math.min(minZ, p.position.z - hd);
    maxZ = Math.max(maxZ, p.position.z + hd);
  }
  return {
    center: new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    size: new Vector3(maxX - minX, maxY - minY, maxZ - minZ),
  };
}

function applyTransform(mesh: Mesh, rotation?: LightPosition, scale?: LightPosition): void {
  if (rotation) {
    mesh.rotation.set(toRadians(rotation.x), toRadians(rotation.y), toRadians(rotation.z));
  }
  if (scale) {
    const safeScale = vectorFromScale(scale);
    mesh.scaling.multiplyInPlace(safeScale);
  }
}

function applySizeScale(size: LightSize, scale?: LightPosition): LightSize {
  if (!scale) return size;
  const safeScale = vectorFromScale(scale);
  return {
    diameter: size.diameter !== undefined ? size.diameter * Math.max(safeScale.x, safeScale.y, safeScale.z) : undefined,
    width: (size.width ?? size.diameter) !== undefined ? (size.width ?? size.diameter)! * safeScale.x : undefined,
    height: (size.height ?? size.diameter) !== undefined ? (size.height ?? size.diameter)! * safeScale.y : undefined,
    depth: (size.depth ?? size.diameter) !== undefined ? (size.depth ?? size.diameter)! * safeScale.z : undefined,
  };
}

function vectorFromScale(scale?: LightPosition): Vector3 {
  return new Vector3(
    Math.max(0.001, scale?.x ?? 1),
    Math.max(0.001, scale?.y ?? 1),
    Math.max(0.001, scale?.z ?? 1),
  );
}

function rotateVector(vector: Vector3, rotation?: LightPosition): Vector3 {
  if (!rotation) return vector;
  const q = Quaternion.FromEulerAngles(
    toRadians(rotation.x),
    toRadians(rotation.y),
    toRadians(rotation.z),
  );
  const result = new Vector3();
  vector.rotateByQuaternionToRef(q, result);
  return result;
}

function getAxisVector(axis: 'x' | 'y' | 'z'): Vector3 {
  if (axis === 'x') return new Vector3(1, 0, 0);
  if (axis === 'y') return new Vector3(0, 1, 0);
  return new Vector3(0, 0, 1);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getShapeDimensions(shape: LightPart['shape'], size: LightSize): Vector3 {
  if (shape === 'sphere') {
    const diameter = size.diameter ?? 0.25;
    return new Vector3(diameter, diameter, diameter);
  }

  return new Vector3(
    size.width ?? size.diameter ?? 0.3,
    size.height ?? size.diameter ?? 0.3,
    size.depth ?? size.diameter ?? 0.3,
  );
}

/** Check if cube dimensions qualify as a strip (one axis ≥ STRIP_RATIO × smallest). */
function detectStrip(sz: LightSize): boolean {
  const w = sz.width ?? 0.3;
  const h = sz.height ?? 0.3;
  const d = sz.depth ?? 0.3;
  const maxDim = Math.max(w, h, d);
  const minDim = Math.min(w, h, d);
  return maxDim >= minDim * STRIP_RATIO;
}

/** Determine the longest axis and length for a strip. */
function getStripAxis(sz: LightSize): { axis: 'x' | 'y' | 'z'; length: number } {
  const w = sz.width ?? 0.3;
  const h = sz.height ?? 0.3;
  const d = sz.depth ?? 0.3;
  if (w >= h && w >= d) return { axis: 'x', length: w };
  if (h >= w && h >= d) return { axis: 'y', length: h };
  return { axis: 'z', length: d };
}

export function removeLightMesh(meshMap: MeshMap, entityId: string): void {
  const entry = meshMap[entityId];
  if (!entry) return;
  entry.shadowGen?.dispose();
  entry.floorplanRig?.shadows.forEach(s => s.dispose());
  // Dispose strip sub-lights (skip index 0 if it's also entry.light — disposed below)
  for (let i = 0; i < entry.stripLights.length; i++) {
    const sl = entry.stripLights[i];
    if (sl !== entry.light) sl.dispose();
  }
  for (const eb of entry.extraBulbs) eb.dispose();
  for (const fixture of entry.fixtureMeshes) fixture.dispose();
  entry.fixtureMat?.dispose();
  entry.touchIconMesh?.dispose();
  entry.touchIconMat?.dispose();
  entry.touchIconTexture?.dispose();
  entry.hitboxMesh?.dispose();
  entry.bulb.dispose();
  entry.mat.dispose();
  entry.hitboxMat?.dispose();
  entry.light?.dispose();
  delete meshMap[entityId];
}

export function rebuildAllMeshes(
  scene: Scene,
  meshMap: MeshMap,
  lights: LightConfig[],
  options: CreateLightMeshOptions = {},
): void {
  Object.keys(meshMap).forEach((id) => removeLightMesh(meshMap, id));

  lights.forEach((cfg, i) => {
    const entry = createLightMesh(
      scene,
      cfg,
      options.withPointLight ? cfg.entityId : String(i),
      options,
    );
    meshMap[cfg.entityId] = entry;
  });
}

/**
 * Freeze all PointLight shadow maps after the first render.
 * Call once all lights are created and at least one frame has rendered.
 */
export function freezePointLightShadows(meshMap: MeshMap): void {
  for (const key of Object.keys(meshMap)) {
    const entry = meshMap[key];
    if (entry.shadowGen) {
      const sm = entry.shadowGen.getShadowMap();
      if (sm) sm.refreshRate = 0;
    }
  }
}
