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

/** Material inputs that change the image without changing a mesh (colors, textures, alpha). */
export function materialKey(material: Material | null): string {
  if (!material) return '';
  const m = material as ShadedMaterial;
  return `${material.uniqueId}/${color(m.emissiveColor)}/${m.emissiveIntensity ?? 1}/${m.emissiveTexture?.uniqueId ?? 0}:${m.emissiveTexture?.level ?? 0}`
    + `/${color(m.diffuseColor ?? m.albedoColor)}/${(m.diffuseTexture ?? m.albedoTexture)?.uniqueId ?? 0}/${m.alpha}`
    + `/${m.getAlphaTestTexture?.()?.uniqueId ?? 0}/${m.backFaceCulling}`;
}

interface MeshState { matrix: Float64Array; visible: boolean; material: string }

export class SceneChangeMonitor {
  private meshes = new Map<AbstractMesh, MeshState>();
  private lastActive: AbstractMesh[] = [];
  private lights: number[] = [];
  private dynamicVersion = -1;
  private background = '';

  constructor(private scene: Scene) {}

  /** True when anything visible differs from the previous call. Call after a render. */
  check(): boolean {
    const scene = this.scene;
    let changed = false;

    const version = getDynamicTextureVersion();
    if (version !== this.dynamicVersion) { this.dynamicVersion = version; changed = true; }

    const background = `${color(scene.clearColor)}/${color(scene.fogColor)}/${scene.fogStart}/${scene.fogEnd}`;
    if (background !== this.background) { this.background = background; changed = true; }

    if (this.lightsChanged(scene.lights)) changed = true;

    // Running particle systems (rain, snow) and skeletal/morph animations change every frame.
    if (scene.particleSystems.some(system => system.isStarted() && system.getActiveCount() > 0)) changed = true;
    const animating = scene.animationGroups.some(group => group.isPlaying) || scene.animatables.length > 0;
    if (animating) changed = true;

    const active = scene.getActiveMeshes();
    if (active.length !== this.lastActive.length) changed = true;
    const materialKeys = new Map<Material, string>();
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i];
      if (this.lastActive[i] !== mesh) { this.lastActive[i] = mesh; changed = true; }
      const material = mesh.material;
      let key = material ? materialKeys.get(material) : '';
      if (key === undefined) { key = materialKey(material); materialKeys.set(material!, key); }
      const matrix = mesh.getWorldMatrix().m;
      const visible = mesh.isVisible && mesh.visibility === 1;
      const state = this.meshes.get(mesh);
      if (!state) {
        this.meshes.set(mesh, { matrix: Float64Array.from(matrix), visible, material: key });
        changed = true;
        continue;
      }
      if (state.visible !== visible || state.material !== key) { state.visible = visible; state.material = key; changed = true; }
      for (let k = 0; k < 16; k++) if (matrix[k] !== state.matrix[k]) { state.matrix.set(matrix); changed = true; break; }
      if ((mesh as AbstractMesh & { hasThinInstances?: boolean }).hasThinInstances) changed = true;
    }
    this.lastActive.length = active.length;
    if (this.meshes.size > active.length * 4 + 256) {
      const current = new Set(this.lastActive);
      for (const mesh of this.meshes.keys()) if (!current.has(mesh)) this.meshes.delete(mesh);
    }
    return changed;
  }

  private lightsChanged(lights: Light[]): boolean {
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
