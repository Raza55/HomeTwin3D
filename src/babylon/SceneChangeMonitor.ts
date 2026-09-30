import { DynamicTexture, type AbstractMesh, type Light, type Material, type Scene } from '@babylonjs/core';

/**
 * Detects whether the rendered image can have changed since the last check.
 * Used to render at a low floor rate while nothing on screen changes; any
 * change (including animations driven from render observers) brings the full
 * idle rate back on the next rendered frame.
 */

/** Incremented whenever any DynamicTexture uploads new content (displays, labels, screens). */
let dynamicTextureVersion = 0;
let dynamicTexturesHooked = false;

export function getDynamicTextureVersion(): number {
  if (!dynamicTexturesHooked) {
    dynamicTexturesHooked = true;
    const update = DynamicTexture.prototype.update;
    DynamicTexture.prototype.update = function (this: DynamicTexture, ...args: Parameters<typeof update>) {
      dynamicTextureVersion++;
      return update.apply(this, args);
    };
  }
  return dynamicTextureVersion;
}

type ColorLike = { r: number; g: number; b: number } | null | undefined;
type ShadedMaterial = Material & {
  emissiveColor?: ColorLike; emissiveIntensity?: number; emissiveTexture?: { uniqueId: number; level: number } | null;
  diffuseColor?: ColorLike; albedoColor?: ColorLike; diffuseTexture?: { uniqueId: number } | null; albedoTexture?: { uniqueId: number } | null;
  getAlphaTestTexture?: () => { uniqueId: number } | null;
};

const color = (c: ColorLike) => (c ? `${c.r},${c.g},${c.b}` : '-');

/** Number of values readMaterialState() writes. */
export const MATERIAL_STATE_SIZE = 14;

/**
 * Material inputs that change the image without changing a mesh (colors,
 * textures, alpha), written as numbers. Comparing these arrays replaces a
 * string key per material and frame (no allocation on the render path).
 */
export function readMaterialState(material: Material, out: Float64Array): void {
  const m = material as ShadedMaterial;
  const e = m.emissiveColor, d = m.diffuseColor ?? m.albedoColor;
  out[0] = e ? e.r : -1; out[1] = e ? e.g : -1; out[2] = e ? e.b : -1;
  out[3] = m.emissiveIntensity ?? 1;
  out[4] = m.emissiveTexture?.uniqueId ?? 0; out[5] = m.emissiveTexture?.level ?? 0;
  out[6] = d ? d.r : -1; out[7] = d ? d.g : -1; out[8] = d ? d.b : -1;
  out[9] = (m.diffuseTexture ?? m.albedoTexture)?.uniqueId ?? 0;
  out[10] = m.alpha;
  out[11] = m.getAlphaTestTexture?.()?.uniqueId ?? 0;
  out[12] = m.backFaceCulling ? 1 : 0;
  out[13] = material.uniqueId;
}

interface MeshState { matrix: Float64Array; visible: boolean; material: Material | null }
interface MaterialState { values: Float64Array; stamp: number }

export class SceneChangeMonitor {
  private meshes = new Map<AbstractMesh, MeshState>();
  private materials = new WeakMap<Material, MaterialState>();
  private scratch = new Float64Array(MATERIAL_STATE_SIZE);
  private stamp = 0;
  private lastActive: AbstractMesh[] = [];
  private lights: number[] = [];
  private dynamicVersion = -1;
  private background = '';
  /** What the last check() found changed first (diagnostics for the perf overlay). */
  lastReason = '';

  constructor(private scene: Scene) {}

  /** True when a material's inputs differ from the last check (each material compared once per check). */
  private materialChanged(material: Material): boolean {
    let state = this.materials.get(material);
    if (!state) {
      state = { values: new Float64Array(MATERIAL_STATE_SIZE), stamp: this.stamp };
      readMaterialState(material, state.values);
      this.materials.set(material, state);
      return true;
    }
    if (state.stamp === this.stamp) return false;
    state.stamp = this.stamp;
    readMaterialState(material, this.scratch);
    let changed = false;
    for (let k = 0; k < MATERIAL_STATE_SIZE; k++) if (this.scratch[k] !== state.values[k]) { changed = true; break; }
    if (changed) state.values.set(this.scratch);
    return changed;
  }

  /** True when anything visible differs from the previous call. Call after a render. */
  check(): boolean {
    const scene = this.scene;
    let changed = false;
    this.stamp++;
    this.lastReason = '';
    const note = (reason: string) => { if (!this.lastReason) this.lastReason = reason; changed = true; };

    const version = getDynamicTextureVersion();
    if (version !== this.dynamicVersion) { this.dynamicVersion = version; note('texture'); }

    const background = `${color(scene.clearColor)}/${color(scene.fogColor)}/${scene.fogStart}/${scene.fogEnd}`;
    if (background !== this.background) { this.background = background; note('background'); }

    if (this.lightsChanged(scene.lights)) note('lights');

    // Running particle systems (rain, snow) and skeletal/morph animations change every frame.
    if (scene.particleSystems.some(system => system.isStarted() && system.getActiveCount() > 0)) note('particles');
    const animating = scene.animationGroups.some(group => group.isPlaying) || scene.animatables.length > 0;
    if (animating) note('animation');

    const active = scene.getActiveMeshes();
    if (active.length !== this.lastActive.length) note('active meshes');
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i];
      if (this.lastActive[i] !== mesh) { this.lastActive[i] = mesh; note('active meshes'); }
      const material = mesh.material;
      if (material && this.materialChanged(material)) note(`material ${material.name}`);
      const matrix = mesh.getWorldMatrix().m;
      const visible = mesh.isVisible && mesh.visibility === 1;
      const state = this.meshes.get(mesh);
      if (!state) {
        this.meshes.set(mesh, { matrix: Float64Array.from(matrix), visible, material });
        note('new mesh');
        continue;
      }
      if (state.visible !== visible || state.material !== material) { state.visible = visible; state.material = material; note(`visibility ${mesh.name}`); }
      for (let k = 0; k < 16; k++) if (matrix[k] !== state.matrix[k]) { state.matrix.set(matrix); note(`moved ${mesh.name}`); break; }
      if ((mesh as AbstractMesh & { hasThinInstances?: boolean }).hasThinInstances) note(`instances ${mesh.name}`);
    }
    this.lastActive.length = active.length;
    if (this.meshes.size > active.length * 4 + 256) {
      const current = new Set(this.lastActive);
      for (const mesh of this.meshes.keys()) if (!current.has(mesh)) this.meshes.delete(mesh);
    }
    return changed;
  }

  private lightsChanged(sceneLights: Light[]): boolean {
    // Clustered emitters leave scene.lights; their container lists them.
    const lights: Light[] = [];
    for (const light of sceneLights) {
      lights.push(light);
      const children = (light as Light & { lights?: Light[] }).lights;
      if (Array.isArray(children)) lights.push(...children);
    }
    const values = this.lights;
    let index = 0, changed = values.length !== lights.length * 12;
    const push = (value: number) => { if (values[index] !== value) { values[index] = value; changed = true; } index++; };
    for (const light of lights) {
      const l = light as Light & { direction?: { x: number; y: number; z: number }; position?: { x: number; y: number; z: number } };
      push(light.isEnabled() ? 1 : 0); push(light.intensity); push(light.shadowEnabled ? 1 : 0);
      push(light.diffuse.r); push(light.diffuse.g); push(light.diffuse.b);
      push(l.direction?.x ?? 0); push(l.direction?.y ?? 0); push(l.direction?.z ?? 0);
      push(l.position?.x ?? 0); push(l.position?.y ?? 0); push(l.position?.z ?? 0);
    }
    values.length = index;
    return changed;
  }
}
