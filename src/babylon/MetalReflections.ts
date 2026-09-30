import {
  Constants, PBRMaterial, RawCubeTexture, Texture, Vector3,
  type AbstractMesh, type HemisphericLight, type Observer, type Scene,
} from '@babylonjs/core';
import { setupMirrorProbes } from './MirrorProbes';

/**
 * Reflections for metallic glTF materials.
 *
 * The scene has no environment texture, so PBR metals (sink, chrome, mirrors)
 * had nothing to reflect and rendered black. A small procedural room cube is
 * assigned only to metallic materials, leaving every other material's lighting
 * unchanged. Its strength follows the ambient light (day/night).
 *
 * Mirrors avoid planar reflections (a MirrorTexture re-renders the scene per
 * visible mirror and frame). They reflect a probe captured once of their real
 * surroundings (see MirrorProbes) and use the procedural cube until then.
 */

const METALLIC_MIN = 0.5;
/** Near-perfect metal: reflects a captured probe of its real surroundings. */
const MIRROR_MAX_ROUGHNESS = 0.05;
/** Hemispheric intensity at which the environment has its authored brightness. */
const DAY_AMBIENT = 0.5;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Neutral interior as seen from a mirror: floor, furniture band, walls with windows, ceiling (sRGB bytes). */
function roomColor(d: Vector3): [number, number, number] {
  const floor = [150, 145, 138], wall = [196, 194, 190], ceiling = [240, 240, 238], furniture = [118, 116, 112];
  const up = smooth(0.15, 0.85, d.y), down = smooth(-0.1, -0.6, d.y);
  const c = wall.map((w, i) => w + (ceiling[i] - w) * up + (floor[i] - w) * down);
  const azimuth = Math.atan2(d.z, d.x);
  // Furniture/skirting band just below eye height, interrupted like separate pieces.
  const band = smooth(-0.02, -0.12, d.y) * (1 - smooth(-0.38, -0.5, d.y)) * (0.55 + 0.45 * Math.max(0, Math.sin(azimuth * 3)));
  for (let i = 0; i < 3; i++) c[i] += (furniture[i] - c[i]) * band * 0.7;
  // Two bright window panes and one darker door edge on the horizon.
  const pane = (center: number, width: number, bottom: number, top: number) => {
    const da = Math.abs(Math.atan2(Math.sin(azimuth - center), Math.cos(azimuth - center)));
    return (1 - smooth(width * 0.8, width, da)) * smooth(bottom - 0.06, bottom + 0.06, d.y) * (1 - smooth(top - 0.08, top + 0.08, d.y));
  };
  const light = 62 * (pane(0, 0.32, 0, 0.52) + 0.8 * pane(-Math.PI / 2, 0.24, 0, 0.52));
  const door = 40 * pane(Math.PI * 0.8, 0.09, -0.55, 0.38);
  return [c[0] + light - door, c[1] + light - door, c[2] + light * 1.05 - door]
    .map(v => Math.max(0, Math.min(255, Math.round(v)))) as [number, number, number];
}

function createRoomCube(scene: Scene, size = 128): RawCubeTexture {
  // Babylon face order: +X, -X, +Y, -Y, +Z, -Z (left-handed).
  const faces: Array<(u: number, v: number) => Vector3> = [
    (u, v) => new Vector3(1, -v, -u), (u, v) => new Vector3(-1, -v, u),
    (u, v) => new Vector3(u, 1, v), (u, v) => new Vector3(u, -1, -v),
    (u, v) => new Vector3(u, -v, 1), (u, v) => new Vector3(-u, -v, -1),
  ];
  const d = new Vector3();
  const data = faces.map(dir => {
    const face = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      d.copyFrom(dir((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1)).normalize();
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

export interface MetalReflections {
  dispose(): void;
  readonly materials: number;
}

export function setupMetalReflections(scene: Scene, meshes: AbstractMesh[]): MetalReflections {
  const environment = createRoomCube(scene);
  const metals = new Set<PBRMaterial>();
  const anisotropic = new Set<PBRMaterial>();
  for (const mesh of meshes) {
    const material = mesh.metadata?.originalMaterial ?? mesh.material;
    if (!(material instanceof PBRMaterial)) continue;
    // Metals, plus glass that lost its refraction (see simplifyRefractiveGlass) for a glassy sheen.
    if ((metallic(material) >= METALLIC_MIN || material.metadata?.simpleGlass) && !material.reflectionTexture) metals.add(material);
    // Anisotropy (brushed steel) needs UVs/tangents; without them Babylon shades the surface black.
    if (material.anisotropy.isEnabled && !mesh.isVerticesDataPresent('uv') && !mesh.isVerticesDataPresent('tangent')) anisotropic.add(material);
  }
  for (const material of metals) material.reflectionTexture = environment;
  for (const material of anisotropic) material.anisotropy.isEnabled = false;

  const mirrorGroups = new Map<PBRMaterial, AbstractMesh[]>();
  for (const mesh of meshes) {
    const material = mesh.metadata?.originalMaterial ?? mesh.material;
    if (material instanceof PBRMaterial && metals.has(material) && metallic(material) >= .9 && (material.roughness ?? 1) <= MIRROR_MAX_ROUGHNESS) {
      mirrorGroups.set(material, [...(mirrorGroups.get(material) ?? []), mesh]);
    }
  }
  const probes = setupMirrorProbes(scene, mirrorGroups, environment);

  const hemi = scene.getLightByName('hemi') as HemisphericLight | null;
  let lastIntensity = -1, capturedIntensity = -1;
  const updateIntensity = () => {
    const ambient = hemi?.isEnabled() ? hemi.intensity : DAY_AMBIENT;
    const value = Math.min(1.2, Math.max(.12, ambient / DAY_AMBIENT));
    if (Math.abs(value - lastIntensity) < .01) return;
    // Daylight changed noticeably: mirrors show a stale room, capture again.
    if (lastIntensity >= 0 && Math.abs(value - capturedIntensity) > .15) { capturedIntensity = value; probes.refresh(); }
    if (lastIntensity < 0) capturedIntensity = value;
    lastIntensity = value;
    for (const material of metals) if (!probes.materials.has(material)) material.environmentIntensity = value;
  };
  updateIntensity();
  const observer: Observer<Scene> | null = scene.onBeforeRenderObservable.add(updateIntensity);

  return {
    materials: metals.size,
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      probes.dispose();
      for (const material of metals) if (material.reflectionTexture === environment) material.reflectionTexture = null;
      environment.dispose();
    },
  };
}
