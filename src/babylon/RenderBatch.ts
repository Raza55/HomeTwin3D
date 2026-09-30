import { Color3, HighlightLayer, Mesh, PBRMaterial, StandardMaterial, Vector3, type AbstractMesh, type Material, type Matrix, type Light, type Node, type Scene } from '@babylonjs/core';

/**
 * Render-only batches for static model geometry.
 *
 * WebGL cost in this scene is dominated by the number of draw calls, not by
 * triangles. Static meshes that share a material and are reached by exactly the
 * same floorplan lights are merged into one proxy that is drawn instead of them.
 *
 * The original meshes are never modified or hidden: they stay pickable, cast
 * shadows, feed edge detection, marker occlusion and walk collisions. They are
 * only removed from the camera's active-mesh candidates while their proxy is
 * drawn. A batch whose sources would light differently (per-surface light
 * budget) is temporarily drawn as individual sources, so lighting never changes.
 * A source that changes (material, visibility, transform, highlight) dissolves
 * its batch for good.
 *
 * Most untextured surfaces have a material of their own that differs from others
 * only in its base color. Those are merged across materials: the proxy carries
 * each source's base color as vertex color and draws with a white-based copy of
 * the shared material. Base color and vertex color multiply, so the result is
 * identical; a later base-color change dissolves the batch like a material swap.
 */

interface RenderBatch {
  proxy: Mesh;
  sources: Mesh[];
  snapshots: Array<{ material: unknown; matrix: Matrix; receiveShadows: boolean; color: Color3 | null }>;
  /** Proxy drawn (true) or sources drawn individually (false). */
  active: boolean;
  lights: Map<Mesh, Light[]>;
}

export interface RenderBatchSet {
  /** Called by the floorplan light-influence pass with each source's selected lights. */
  recordLights(mesh: AbstractMesh, lights: Light[]): void;
  /** Resolves recorded lights; returns proxy → lights for batches that stay merged. */
  resolveLights(): Map<Mesh, Light[]>;
  isBatchedSource(mesh: AbstractMesh): boolean;
  /** Proxy of the batch a source belongs to (undefined for any other mesh). */
  proxyOf(source: AbstractMesh): Mesh | undefined;
  /** Sources merged into a batch proxy (undefined for any other mesh). */
  sourcesOf(proxy: AbstractMesh): readonly Mesh[] | undefined;
  /** Increments whenever the drawn set changes, so light influence can re-run. */
  readonly version: number;
  readonly stats: { batches: number; sources: number };
  dispose(): void;
}

const MIN_BATCH_SIZE = 2;

function baseColor(material: Material | null): Color3 | null {
  return material instanceof PBRMaterial ? material.albedoColor : material instanceof StandardMaterial ? material.diffuseColor : null;
}

/** Everything but the base color, for materials whose surfaces can share one vertex-colored proxy; null otherwise. */
function colorMergeKey(material: Material): string | null {
  const color = baseColor(material);
  if (!color || material.alpha !== 1 || material.getAlphaTestTexture()) return null;
  const emissive = (material as PBRMaterial | StandardMaterial).emissiveColor;
  if (emissive.r > 0 || emissive.g > 0 || emissive.b > 0) return null;
  const serialized = material.serialize() as Record<string, unknown>;
  for (const [key, value] of Object.entries(serialized)) if (value && typeof value === 'object' && !Array.isArray(value) && /texture/i.test(key)) return null;
  for (const key of ['name', 'id', 'uniqueId', 'albedo', 'diffuse', 'metadata', 'tags']) delete serialized[key];
  return JSON.stringify(serialized);
}
/** Grid size (scene units, metres at scale 1) for grouping leftover meshes by area. */
const AREA_CELL = 4;
export const DYNAMIC_EXTRAS = ['ha_id', 'ha_door', 'ha_room_door', 'ha_appliance', 'ha_cutaway'] as const;

/** Candidate provider state per scene; also consulted by other explicit render lists. */
const sceneSets = new WeakMap<Scene, RenderBatchSetImpl>();

export function getRenderBatchSet(scene: Scene): RenderBatchSet | undefined {
  return sceneSets.get(scene);
}

/** True when a mesh is currently not drawn by the camera because a batch stands in for it (or vice versa). */
export function isReplacedByRenderBatch(scene: Scene, mesh: AbstractMesh): boolean {
  return sceneSets.get(scene)?.isHidden(mesh) ?? false;
}

export function batchStaticRendering(scene: Scene, meshes: AbstractMesh[], floorplanLights: Light[]): RenderBatchSet {
  sceneSets.get(scene)?.dispose();
  const set = new RenderBatchSetImpl(scene, meshes, floorplanLights);
  sceneSets.set(scene, set);
  // Dev-only handle for in-browser performance inspection.
  if (import.meta.env?.DEV) (window as Window & { __renderBatches?: RenderBatchSet }).__renderBatches = set;
  return set;
}

class RenderBatchSetImpl implements RenderBatchSet {
  private batches: RenderBatch[] = [];
  private sourceToBatch = new Map<AbstractMesh, RenderBatch>();
  private proxyToBatch = new Map<AbstractMesh, RenderBatch>();
  private candidates: AbstractMesh[] = [];
  private candidatesDirty = true;
  private validateCursor = 0;
  private observers: Array<() => void> = [];
  private disposed = false;
  version = 0;

  constructor(private scene: Scene, meshes: AbstractMesh[], floorplanLights: Light[]) {
    this.build(meshes, floorplanLights);
    if (!this.batches.length) return;
    const candidates = { data: this.candidates, length: 0 };
    scene.getActiveMeshCandidates = () => {
      candidates.data = this.getCandidates();
      candidates.length = candidates.data.length;
      return candidates;
    };
    const added = scene.onNewMeshAddedObservable.add(() => { this.candidatesDirty = true; });
    const removed = scene.onMeshRemovedObservable.add(mesh => {
      this.candidatesDirty = true;
      const batch = this.sourceToBatch.get(mesh);
      if (batch) this.dissolve(batch, true, 'removed');
    });
    const validate = scene.onBeforeRenderObservable.add(() => this.validate());
    this.observers.push(
      () => scene.onNewMeshAddedObservable.remove(added),
      () => scene.onMeshRemovedObservable.remove(removed),
      () => scene.onBeforeRenderObservable.remove(validate),
    );
  }

  get stats() {
    return { batches: this.batches.length, sources: this.sourceToBatch.size };
  }

  isBatchedSource(mesh: AbstractMesh): boolean {
    return this.sourceToBatch.has(mesh);
  }

  proxyOf(source: AbstractMesh): Mesh | undefined {
    return this.sourceToBatch.get(source)?.proxy;
  }

  sourcesOf(proxy: AbstractMesh): readonly Mesh[] | undefined {
    return this.proxyToBatch.get(proxy)?.sources;
  }

  isHidden(mesh: AbstractMesh): boolean {
    const asSource = this.sourceToBatch.get(mesh);
    if (asSource) return asSource.active;
    const asProxy = this.proxyToBatch.get(mesh);
    return asProxy ? !asProxy.active : false;
  }

  recordLights(mesh: AbstractMesh, lights: Light[]): void {
    const batch = this.sourceToBatch.get(mesh);
    if (batch) batch.lights.set(mesh as Mesh, lights.slice());
  }

  resolveLights(): Map<Mesh, Light[]> {
    const result = new Map<Mesh, Light[]>();
    let changed = false;
    for (const batch of this.batches) {
      const first = batch.lights.get(batch.sources[0]) ?? [];
      const ids = new Set(first);
      const consistent = batch.sources.every(source => {
        const lights = batch.lights.get(source) ?? [];
        return lights.length === ids.size && lights.every(light => ids.has(light));
      });
      if (consistent !== batch.active) { batch.active = consistent; changed = true; }
      if (consistent) result.set(batch.proxy, first);
      batch.lights.clear();
    }
    if (changed) this.markChanged();
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observers.forEach(remove => remove());
    for (const batch of [...this.batches]) this.dissolve(batch, false, 'dispose');
    this.scene.setDefaultCandidateProviders();
    if (sceneSets.get(this.scene) === this) sceneSets.delete(this.scene);
  }

  private markChanged(): void {
    this.candidatesDirty = true;
    this.version++;
  }

  private getCandidates(): AbstractMesh[] {
    if (this.candidatesDirty) {
      this.candidatesDirty = false;
      this.candidates = this.scene.meshes.filter(mesh => !this.isHidden(mesh));
    }
    return this.candidates;
  }

  private build(meshes: AbstractMesh[], floorplanLights: Light[]): void {
    const animated = new Set<unknown>(this.scene.animationGroups.flatMap(group => group.targetedAnimations.map(a => a.target)));
    const lightPoses = floorplanLights.map(light => ({
      light,
      position: (light as Light & { getAbsolutePosition?: () => Vector3 }).getAbsolutePosition?.() ?? Vector3.Zero(),
      rangeSquared: light.range * light.range,
    }));
    const nearest = Vector3.Zero();
    const addTo = (groups: Map<string, Mesh[]>, key: string, mesh: Mesh) => {
      const group = groups.get(key);
      if (group) group.push(mesh); else groups.set(key, [mesh]);
    };
    // Pass 1: same reachable lights ⇒ the per-surface budget picks the same lights for all members.
    const byReach = new Map<string, Mesh[]>();
    const renderKeys = new Map<Mesh, string>();
    const colorKeys = new Map<Material, string | null>();
    for (const mesh of new Set(meshes)) {
      if (!this.eligible(mesh, animated)) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      const reach: number[] = [];
      for (const { light: source, position, rangeSquared } of lightPoses) {
        Vector3.ClampToRef(position, box.minimumWorld, box.maximumWorld, nearest);
        if (Vector3.DistanceSquared(position, nearest) <= rangeSquared) reach.push(source.uniqueId);
      }
      const material = mesh.material!;
      if (!colorKeys.has(material)) colorKeys.set(material, colorMergeKey(material));
      const colorKey = colorKeys.get(material);
      const renderKey = [
        colorKey ? `color:${colorKey}` : material.uniqueId, mesh.getVerticesDataKinds().sort().join(','),
        mesh.sideOrientation, mesh.overrideMaterialSideOrientation, mesh.getWorldMatrix().determinant() < 0,
        mesh.receiveShadows, mesh.renderingGroupId, mesh.useVertexColors, mesh.hasVertexAlpha,
      ].join('|');
      renderKeys.set(mesh, renderKey);
      addTo(byReach, `${renderKey}|${reach.join('.')}`, mesh);
    }
    // Pass 2: leftover single meshes with the same material in the same area.
    // Their reachable lights differ, so resolveLights() draws them individually
    // whenever a lamp would light members differently (lighting stays exact).
    const byArea = new Map<string, Mesh[]>();
    for (const group of byReach.values()) {
      if (group.length >= MIN_BATCH_SIZE) continue;
      const mesh = group[0], center = mesh.getBoundingInfo().boundingBox.centerWorld;
      addTo(byArea, `${renderKeys.get(mesh)}|${Math.floor(center.x / AREA_CELL)},${Math.floor(center.z / AREA_CELL)}`, mesh);
    }
    for (const sources of [...byReach.values(), ...byArea.values()]) {
      if (sources.length < MIN_BATCH_SIZE) continue;
      const shared = sources.every(source => source.material === sources[0].material);
      const proxy = shared ? Mesh.MergeMeshes(sources, false, true, undefined, false, false) : this.mergeWithColors(sources);
      if (!proxy) continue;
      proxy.name = `render-batch:${this.batches.length}`;
      if (shared) proxy.material = sources[0].material;
      proxy.sideOrientation = sources[0].sideOrientation;
      proxy.overrideMaterialSideOrientation = sources[0].overrideMaterialSideOrientation;
      proxy.receiveShadows = sources[0].receiveShadows;
      proxy.renderingGroupId = sources[0].renderingGroupId;
      proxy.useVertexColors = shared ? sources[0].useVertexColors : true;
      proxy.hasVertexAlpha = sources[0].hasVertexAlpha;
      proxy.isPickable = false;
      proxy.checkCollisions = false;
      proxy.metadata = { renderBatch: true, ownMaterial: !shared };
      // Not frozen: Babylon 9 computes shadows on meshes with a frozen world
      // matrix incorrectly (black/white surfaces). A few dozen static proxies cost nothing.
      proxy.computeWorldMatrix(true);
      const batch: RenderBatch = {
        proxy, sources, active: true, lights: new Map(),
        snapshots: sources.map(source => ({
          material: source.material,
          matrix: source.getWorldMatrix().clone(),
          receiveShadows: source.receiveShadows,
          color: shared ? null : baseColor(source.material)!.clone(),
        })),
      };
      this.batches.push(batch);
      this.proxyToBatch.set(proxy, batch);
      for (const source of sources) this.sourceToBatch.set(source, batch);
    }
    this.markChanged();
  }

  /** Proxy for sources whose materials differ only in base color (see colorMergeKey). */
  private mergeWithColors(sources: Mesh[]): Mesh | null {
    // Babylon's MergeMeshes handles world transforms (incl. mirrored parts) exactly
    // like the single-material batches; it appends sources in order, so the base
    // colors follow as one run of vertices per source.
    const proxy = Mesh.MergeMeshes(sources, false, true, undefined, false, false);
    if (!proxy) return null;
    const colors = new Float32Array(proxy.getTotalVertices() * 4);
    let offset = 0;
    for (const source of sources) {
      const color = baseColor(source.material)!, count = source.getTotalVertices();
      for (let i = 0; i < count; i++, offset += 4) { colors[offset] = color.r; colors[offset + 1] = color.g; colors[offset + 2] = color.b; colors[offset + 3] = 1; }
    }
    if (offset !== colors.length) { proxy.dispose(false, false); return null; }
    proxy.setVerticesData('color', colors, false, 4);
    const material = sources[0].material!.clone(`${sources[0].material!.name}:vertex-color`)!;
    baseColor(material)!.set(1, 1, 1);
    proxy.material = material;
    return proxy;
  }

  private eligible(mesh: AbstractMesh, animated: Set<unknown>): mesh is Mesh {
    if (!(mesh instanceof Mesh) || mesh.isDisposed() || mesh.metadata?.shadowBatch || mesh.metadata?.renderBatch) return false;
    if (mesh.skeleton || mesh.morphTargetManager || mesh.instances.length || mesh.hasThinInstances || mesh.isAnInstance) return false;
    if (mesh.subMeshes?.length !== 1 || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility !== 1) return false;
    // Cut-away ceilings and other masked meshes follow camera-specific visibility.
    if (mesh.layerMask !== 0x0FFFFFFF || mesh.nonUniformScaling || mesh.edgesRenderer || mesh.billboardMode) return false;
    if (mesh.renderOutline || mesh.renderOverlay || mesh.alwaysSelectAsActiveMesh || mesh.infiniteDistance) return false;
    if (mesh.getVertexBuffer('position')?.isUpdatable() || !mesh.getTotalIndices()) return false;
    const material = mesh.material;
    // Transparent meshes are depth-sorted per mesh; refractive glass has its own pass.
    if (!material || material.needAlphaBlendingForMesh(mesh) || mesh.metadata?.windowGlass
      || (material as { subSurface?: { isRefractionEnabled?: boolean } }).subSurface?.isRefractionEnabled) return false;
    for (let node: Node | null = mesh; node; node = node.parent) {
      const extras = node.metadata?.gltf?.extras;
      if (extras && DYNAMIC_EXTRAS.some(key => extras[key])) return false;
      if (animated.has(node) || node.animations.length) return false;
    }
    return true;
  }

  /** Cheap checks on every frame, transform checks round-robin (static meshes rarely move). */
  private validate(): void {
    const highlightLayers = this.scene.effectLayers.filter((layer): layer is HighlightLayer => layer instanceof HighlightLayer);
    for (let b = this.batches.length - 1; b >= 0; b--) {
      const batch = this.batches[b];
      for (let i = 0; i < batch.sources.length; i++) {
        const reason = this.changeReason(batch.sources[i], batch.snapshots[i], highlightLayers);
        if (reason) { this.dissolve(batch, true, reason); break; }
      }
    }
    // Transforms: a few batches per frame.
    if (!this.batches.length) return;
    for (let n = 0; n < 4 && this.batches.length; n++) {
      this.validateCursor = (this.validateCursor + 1) % this.batches.length;
      const batch = this.batches[this.validateCursor];
      // Parents may recompute identical matrices, so compare values, not update flags.
      if (batch.sources.some((source, i) => !source.computeWorldMatrix().equals(batch.snapshots[i].matrix))) this.dissolve(batch, true, 'transform');
    }
  }

  private changeReason(source: Mesh, snapshot: RenderBatch['snapshots'][number], highlightLayers: HighlightLayer[]): string | null {
    if (source.isDisposed()) return 'disposed';
    if (!source.isVisible || source.visibility !== 1 || !source.isEnabled()) return 'visibility';
    if (source.material !== snapshot.material) return 'material';
    if (snapshot.color && !baseColor(source.material)?.equals(snapshot.color)) return 'color';
    if (source.layerMask !== 0x0FFFFFFF) return 'layerMask';
    if (source.edgesRenderer || source.renderOutline || source.renderOverlay) return 'outline';
    if (source.receiveShadows !== snapshot.receiveShadows) return 'shadows';
    if (highlightLayers.some(layer => layer.hasMesh(source))) return 'highlight';
    return null;
  }

  /** Why batches were dissolved (diagnostics). */
  readonly dissolved: Record<string, number> = {};

  private dissolve(batch: RenderBatch, notify = true, reason = 'other'): void {
    this.dissolved[reason] = (this.dissolved[reason] ?? 0) + 1;
    const index = this.batches.indexOf(batch);
    if (index < 0) return;
    this.batches.splice(index, 1);
    for (const source of batch.sources) this.sourceToBatch.delete(source);
    this.proxyToBatch.delete(batch.proxy);
    const material = batch.proxy.metadata?.ownMaterial ? batch.proxy.material : null;
    batch.proxy.dispose(false, false);
    material?.dispose(false, false);
    if (notify) this.markChanged();
  }
}
