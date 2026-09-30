import { Color3, Constants, Mesh, StandardMaterial, VertexBuffer, type Observer, type RenderTargetTexture, type Scene } from '@babylonjs/core';

/**
 * Light touch zones (a faint tint around each lamp: its color when on, dim blue
 * when off, stronger while hovered) drawn as one transparent mesh instead of
 * one per lamp (~30 draw calls on the apartment).
 *
 * Each zone keeps its own hitbox mesh for picking and state (material color and
 * alpha are still set per lamp); the hitbox is only no longer drawn. The merged
 * mesh carries each zone's color and alpha as vertex colors and follows every
 * change within the frame. Effect layers (glow) still render the individual
 * zones, so the zones' glow is exactly as before. Zones are rebuilt when one is added, removed,
 * enabled, disabled or moved.
 */
interface Zone { mesh: Mesh; material: StandardMaterial; start: number; count: number; rgba: [number, number, number, number] }

const batches = new WeakMap<Scene, TouchZoneBatch>();

/** The dashboard merges its touch zones; the config editor shows hitboxes one by one. */
export function enableTouchZoneBatching(scene: Scene): void {
  if (batches.has(scene)) return;
  const batch = new TouchZoneBatch(scene);
  batches.set(scene, batch);
  // Dev-only handle for in-browser comparison (merged vs. individual zones).
  if (import.meta.env?.DEV) (window as Window & { __touchZones?: unknown }).__touchZones = batch;
}

/** Registers a lamp's touch zone (hitbox with its tint material); no-op where batching is off. */
export function registerTouchZone(mesh: Mesh, material: StandardMaterial): void {
  batches.get(mesh.getScene())?.add(mesh, material);
}

/** True while a zone is drawn by the merged mesh (its own visibility is 0 then). */
export function isBatchedTouchZone(mesh: Mesh): boolean {
  return !!batches.get(mesh.getScene())?.has(mesh);
}

/**
 * Color the original material shows: with lighting disabled a StandardMaterial
 * outputs its emissive color (the diffuse term drops out). The merged material
 * is emissive white, multiplied by this color per vertex.
 */
function shownColor(material: StandardMaterial, out: Color3): Color3 {
  return out.copyFrom(material.emissiveColor);
}

class TouchZoneBatch {
  private registered = new Set<Mesh>();
  private materials = new Map<Mesh, StandardMaterial>();
  private zones: Zone[] = [];
  private merged: Mesh | null = null;
  private material: StandardMaterial;
  structureDirty = true;
  private colors = new Float32Array(0);
  private color = new Color3();
  private observer: Observer<Scene>;
  private hookedTargets = new Map<RenderTargetTexture, () => void>();

  constructor(private scene: Scene) {
    this.material = new StandardMaterial('touch-zones', scene);
    this.material.disableLighting = true;
    this.material.diffuseColor = Color3.Black();
    this.material.emissiveColor = Color3.White();
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.material.alphaMode = Constants.ALPHA_COMBINE;
    this.observer = scene.onBeforeRenderObservable.add(() => this.update());
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  has(mesh: Mesh): boolean { return this.zones.some(zone => zone.mesh === mesh); }

  add(mesh: Mesh, material: StandardMaterial): void {
    this.registered.add(mesh);
    this.materials.set(mesh, material);
    this.structureDirty = true;
    mesh.onDisposeObservable.addOnce(() => { this.registered.delete(mesh); this.materials.delete(mesh); this.structureDirty = true; });
  }

  /** Zones to draw: enabled, visible, touch-zone tinted (not the editor's wireframe hitboxes). */
  private candidates(): Mesh[] {
    return [...this.registered].filter(mesh => {
      const material = this.materials.get(mesh)!;
      return !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && !material.wireframe && mesh.material === material
        && (this.has(mesh) || mesh.visibility === 1);
    });
  }

  /**
   * Effect layers (glow, highlight) render the zones one by one, as before the
   * merge: only during their pass the zones are visible and the merged mesh is not.
   */
  private hookEffectLayers(): void {
    for (const layer of this.scene.effectLayers) {
      const target = (layer as unknown as { _mainTexture?: RenderTargetTexture })._mainTexture;
      if (!target || this.hookedTargets.has(target)) continue;
      const before = target.onBeforeRenderObservable.add(() => {
        for (const zone of this.zones) zone.mesh.visibility = 1;
        this.merged?.setEnabled(false);
      });
      const after = target.onAfterRenderObservable.add(() => {
        for (const zone of this.zones) zone.mesh.visibility = 0;
        this.merged?.setEnabled(true);
      });
      this.hookedTargets.set(target, () => { target.onBeforeRenderObservable.remove(before); target.onAfterRenderObservable.remove(after); });
      target.onDisposeObservable.addOnce(() => this.hookedTargets.delete(target));
    }
  }

  private update(): void {
    this.hookEffectLayers();
    const candidates = this.candidates();
    if (!this.structureDirty && (candidates.length !== this.zones.length || candidates.some((mesh, i) => this.zones[i].mesh !== mesh))) this.structureDirty = true;
    if (!this.structureDirty && this.zones.some(zone => zone.mesh.computeWorldMatrix().updateFlag !== (zone as Zone & { flag?: number }).flag)) this.structureDirty = true;
    if (this.structureDirty) this.rebuild(candidates);
    if (!this.merged) return;
    let changed = false;
    for (const zone of this.zones) {
      const c = shownColor(zone.material, this.color), a = zone.material.alpha;
      const rgba = zone.rgba;
      if (rgba[0] === c.r && rgba[1] === c.g && rgba[2] === c.b && rgba[3] === a) continue;
      rgba[0] = c.r; rgba[1] = c.g; rgba[2] = c.b; rgba[3] = a;
      for (let v = zone.start, end = zone.start + zone.count; v < end; v++) this.colors.set(rgba, v * 4);
      changed = true;
    }
    if (changed) this.merged.updateVerticesData(VertexBuffer.ColorKind, this.colors);
  }

  private rebuild(candidates: Mesh[]): void {
    this.structureDirty = false;
    this.restore();
    if (candidates.length < 2) return;
    const merged = Mesh.MergeMeshes(candidates, false, true, undefined, false, false);
    if (!merged) return;
    merged.name = 'touch-zones';
    merged.material = this.material;
    merged.isPickable = false;
    merged.hasVertexAlpha = true;
    merged.renderingGroupId = candidates[0].renderingGroupId;
    merged.metadata = { touchZones: true };
    let start = 0;
    this.zones = candidates.map(mesh => {
      const count = mesh.getTotalVertices();
      const zone: Zone & { flag?: number } = { mesh, material: this.materials.get(mesh)!, start, count, rgba: [-1, -1, -1, -1] };
      zone.flag = mesh.computeWorldMatrix().updateFlag;
      start += count;
      // Still pickable and stateful; drawn by the merged mesh.
      mesh.visibility = 0;
      return zone;
    });
    this.colors = new Float32Array(merged.getTotalVertices() * 4);
    merged.setVerticesData(VertexBuffer.ColorKind, this.colors, true, 4);
    this.merged = merged;
  }

  /** Back to drawing each zone itself. */
  restore(): void {
    for (const zone of this.zones) if (!zone.mesh.isDisposed()) zone.mesh.visibility = 1;
    this.zones = [];
    this.merged?.dispose(false, false);
    this.merged = null;
  }

  private dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.observer);
    for (const unhook of this.hookedTargets.values()) unhook();
    this.hookedTargets.clear();
    this.restore();
    this.material.dispose();
  }
}
