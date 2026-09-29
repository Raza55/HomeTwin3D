import {
  Constants, MirrorTexture, PBRMaterial, Plane, RawCubeTexture, Ray, Texture, Vector3,
  type AbstractMesh, type BaseTexture, type HemisphericLight, type Observer, type Scene,
} from '@babylonjs/core';
import { isReplacedByRenderBatch } from './RenderBatch';

/**
 * Reflections for metallic glTF materials.
 *
 * The scene has no environment texture, so PBR metals (sink, chrome, mirrors)
 * had nothing to reflect and rendered black. A small procedural room cube is
 * assigned only to metallic materials, leaving every other material's lighting
 * unchanged. Its strength follows the ambient light (day/night).
 *
 * Flat, near-perfect mirrors additionally get a planar MirrorTexture that only
 * renders while the mirror faces the camera, is in view and reasonably close.
 */

const METALLIC_MIN = 0.5;
const MIRROR_MAX_ROUGHNESS = 0.05;
const MIRROR_RANGE = 14;
const MIRROR_MAX_THICKNESS = .03;
const MIRROR_SCENE_RADIUS = 9;
/** Hemispheric intensity at which the environment has its authored brightness. */
const DAY_AMBIENT = 0.5;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Soft neutral interior: light floor, walls with two window glows, bright ceiling (sRGB bytes). */
function roomColor(d: Vector3): [number, number, number] {
  const floor = [158, 154, 148], wall = [190, 188, 184], ceiling = [238, 238, 236];
  const up = smooth(0.15, 0.85, d.y), down = smooth(-0.1, -0.6, d.y);
  const c = wall.map((w, i) => w + (ceiling[i] - w) * up + (floor[i] - w) * down);
  const horizon = 1 - Math.min(1, Math.abs(d.y) / 0.45);
  const windows = Math.max(0, d.x) ** 6 + Math.max(0, -d.z) ** 8 * 0.7;
  const glow = 70 * horizon * windows;
  return [c[0] + glow, c[1] + glow, c[2] + glow * 1.05].map(v => Math.min(255, Math.round(v))) as [number, number, number];
}

function createRoomCube(scene: Scene, size = 64): RawCubeTexture {
  // Babylon face order: +X, -X, +Y, -Y, +Z, -Z (left-handed).
  const faces: Array<(u: number, v: number) => Vector3> = [
    (u, v) => new Vector3(1, -v, -u), (u, v) => new Vector3(-1, -v, u),
    (u, v) => new Vector3(u, 1, v), (u, v) => new Vector3(u, -1, -v),
    (u, v) => new Vector3(u, -v, 1), (u, v) => new Vector3(-u, -v, -1),
  ];
  const data = faces.map(dir => {
    const face = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = dir((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1).normalize();
      const [r, g, b] = roomColor(d), o = (y * size + x) * 4;
      face[o] = r; face[o + 1] = g; face[o + 2] = b; face[o + 3] = 255;
    }
    return face;
  });
  const cube = new RawCubeTexture(scene, data, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true, false, Texture.TRILINEAR_SAMPLINGMODE);
  cube.name = 'metal-room-environment';
  cube.gammaSpace = true;
  return cube;
}

function metallic(material: PBRMaterial): number { return material.metallic ?? 1; }
function roughness(material: PBRMaterial): number { return material.roughness ?? 1; }

/** Dominant outward normal and a point on the mirror's front face (world space). */
function mirrorPlane(scene: Scene, mesh: AbstractMesh): { normal: Vector3; point: Vector3 } | null {
  const positions = mesh.getVerticesData('position');
  if (!positions) return null;
  const world = mesh.computeWorldMatrix(true);
  // A flat mirror is thinnest along its normal.
  const points: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) points.push(Vector3.TransformCoordinates(new Vector3(positions[i], positions[i + 1], positions[i + 2]), world));
  const center = points.reduce((s, p) => s.addInPlace(p), Vector3.Zero()).scaleInPlace(1 / points.length);
  // Candidate directions: the mesh's own face normals (a mirror's front/back faces are among them).
  const normals = mesh.getVerticesData('normal');
  if (!normals) return null;
  const candidates = new Map<string, Vector3>();
  for (let i = 0; i < normals.length; i += 3) {
    const n = Vector3.TransformNormal(new Vector3(normals[i], normals[i + 1], normals[i + 2]), world).normalize();
    if (n.y < 0 || (n.y === 0 && (n.x < 0 || (n.x === 0 && n.z < 0)))) n.negateInPlace();
    candidates.set(`${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)}`, n);
  }
  let normal: Vector3 | null = null, thinnest = Infinity;
  for (const dir of candidates.values()) {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) { const d = Vector3.Dot(p, dir); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    if (hi - lo < thinnest) { thinnest = hi - lo; normal = dir; }
  }
  // Only genuinely flat surfaces (a single mirror, not a batch of panels) get a planar reflection.
  if (!normal || thinnest > MIRROR_MAX_THICKNESS) return null;
  // The room side has open space; the wall side is blocked within a few centimetres.
  const free = (dir: Vector3) => scene.pickWithRay(new Ray(center.add(dir.scale(thinnest / 2 + .01)), dir, 3),
    m => m !== mesh && m.isEnabled() && m.getTotalVertices() > 0)?.distance ?? 3;
  if (free(normal.negate()) > free(normal)) normal = normal.negate();
  // Front face: the extreme vertex along the normal.
  let max = -Infinity; const point = new Vector3();
  for (const p of points) { const d = Vector3.Dot(p, normal); if (d > max) { max = d; point.copyFrom(p); } }
  return { normal, point };
}

export interface MetalReflections {
  dispose(): void;
  readonly mirrors: number;
  readonly materials: number;
  /** Diagnostics: mirror meshes, their room-facing normals and whether planar rendering is on. */
  mirrorState(): Array<{ mesh: string; normal: number[]; center: number[]; active: boolean }>;
}

export function setupMetalReflections(scene: Scene, meshes: AbstractMesh[]): MetalReflections {
  const environment = createRoomCube(scene);
  const metals = new Set<PBRMaterial>();
  const mirrorMeshes: AbstractMesh[] = [];
  for (const mesh of meshes) {
    const material = mesh.metadata?.originalMaterial ?? mesh.material;
    if (!(material instanceof PBRMaterial) || metallic(material) < METALLIC_MIN || material.reflectionTexture) continue;
    metals.add(material);
    if (roughness(material) <= MIRROR_MAX_ROUGHNESS && metallic(material) >= .9) mirrorMeshes.push(mesh);
  }
  for (const material of metals) material.reflectionTexture = environment;

  // Anisotropy (brushed steel) needs UVs/tangents; without them Babylon shades the surface black.
  const anisotropic = new Set<PBRMaterial>();
  for (const mesh of meshes) {
    const material = mesh.metadata?.originalMaterial ?? mesh.material;
    if (material instanceof PBRMaterial && material.anisotropy.isEnabled && !mesh.isVerticesDataPresent('uv') && !mesh.isVerticesDataPresent('tangent')) anisotropic.add(material);
  }
  for (const material of anisotropic) material.anisotropy.isEnabled = false;

  const hemi = scene.getLightByName('hemi') as HemisphericLight | null;
  let lastIntensity = -1;
  const updateIntensity = () => {
    const ambient = hemi?.isEnabled() ? hemi.intensity : DAY_AMBIENT;
    const value = Math.min(1.2, Math.max(.12, ambient / DAY_AMBIENT));
    if (Math.abs(value - lastIntensity) < .01) return;
    lastIntensity = value;
    for (const material of metals) material.environmentIntensity = value;
  };
  updateIntensity();

  const mirrors: Array<{ mesh: AbstractMesh; texture: MirrorTexture; normal: Vector3; center: Vector3; material: PBRMaterial; active: boolean }> = [];
  for (const mesh of mirrorMeshes) {
    const plane = mirrorPlane(scene, mesh);
    const material = (mesh.metadata?.originalMaterial ?? mesh.material) as PBRMaterial;
    if (!plane) continue;
    const texture = new MirrorTexture('mirror:' + mesh.name, 512, scene, true);
    // The mirror plane faces into the room: reflect across it, clip what is behind.
    texture.mirrorPlane = Plane.FromPositionAndNormal(plane.point, plane.normal.negate());
    const center = mesh.getBoundingInfo().boundingSphere.centerWorld.clone();
    // Same drawn set as the camera (render batches stand in for their sources), limited to the mirror's surroundings.
    texture.renderListPredicate = m => m !== mesh && m.isEnabled() && m.isVisible && m.getTotalVertices() > 0
      && !isReplacedByRenderBatch(scene, m)
      && Vector3.Distance(m.getBoundingInfo().boundingSphere.centerWorld, center) < MIRROR_SCENE_RADIUS + m.getBoundingInfo().boundingSphere.radiusWorld;
    texture.refreshRate = 1;
    texture.level = 1;
    mirrors.push({ mesh, texture, normal: plane.normal, center, material, active: false });
  }

  // Planar reflections are expensive: render only when a mirror can actually be seen.
  const setActive = (mirror: typeof mirrors[number], active: boolean) => {
    if (mirror.active === active) return;
    mirror.active = active;
    const targets = scene.customRenderTargets, index = targets.indexOf(mirror.texture);
    if (active && index < 0) targets.push(mirror.texture);
    if (!active && index >= 0) targets.splice(index, 1);
    mirror.material.reflectionTexture = active ? mirror.texture as BaseTexture : environment;
  };
  const observer: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    updateIntensity();
    const camera = scene.activeCamera; if (!camera) return;
    const eye = camera.globalPosition;
    for (const mirror of mirrors) {
      const toEye = eye.subtract(mirror.center), distance = toEye.length();
      const visible = mirror.mesh.isEnabled() && mirror.mesh.isVisible && mirror.mesh.material === mirror.material
        && distance < MIRROR_RANGE && Vector3.Dot(toEye, mirror.normal) > .05 * distance
        && camera.isInFrustum(mirror.mesh);
      setActive(mirror, visible);
    }
  });

  return {
    mirrors: mirrors.length,
    materials: metals.size,
    mirrorState: () => mirrors.map(m => ({ mesh: m.mesh.name, normal: m.normal.asArray(), center: m.center.asArray(), active: m.active })),
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const mirror of mirrors) { setActive(mirror, false); mirror.texture.dispose(); }
      for (const material of metals) if (material.reflectionTexture === environment) material.reflectionTexture = null;
      environment.dispose();
    },
  };
}

