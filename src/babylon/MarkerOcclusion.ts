import { Camera, Matrix, Ray, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';

type Entry = { point: Vector3; visible: boolean; checked: number; seen: number; revision: number };
/** Everything that decides whether a mesh can occlude a marker. */
type MeshState = { disposed: boolean; enabled: boolean; visible: boolean; visibility: number; layerMask: number;
  material: number | undefined; alpha: number | undefined; transparencyMode: number | null | undefined; refraction: boolean | undefined; glass: unknown };

/** Shared, round-robin CPU visibility checks for DOM overlays. No GPU readback. */
export class MarkerOcclusion {
  private entries = new Map<object, Entry>();
  private ray = new Ray(Vector3.Zero(), Vector3.Zero());
  private forward = Vector3.Zero();
  private offset = Vector3.Zero();
  private cursor = 0;
  private revision = 0;
  private view = Matrix.Zero();
  private cameraMask = -1;
  private cameraMode = -1;
  private meshStates = new Map<AbstractMesh, MeshState>();
  private meshTransforms = new Map<AbstractMesh, Matrix>();
  private nextMeshScan = -Infinity;
  private overview = false;
  constructor(private scene: Scene, private meshes: readonly AbstractMesh[], private scale = 1) {}

  visible(key: object, point: Vector3, now = performance.now()): boolean {
    if (this.overview) return true;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { point: point.clone(), visible: false, checked: -Infinity, seen: now, revision: -1 };
      this.entries.set(key, entry);
    } else if (!entry.point.equals(point)) { entry.point.copyFrom(point); entry.revision = -1; }
    entry.seen = now;
    return entry.visible;
  }

  /** Soft 1 ms budget: at most two complete rays, with fair scheduling across icons.
   * Invalidate on camera/object changes; a stationary scene needs no new rays. */
  update(now = performance.now()): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;
    camera.getDirectionToRef(Vector3.Forward(this.scene.useRightHandedSystem), this.forward);
    this.forward.normalize();
    // From 45 degrees downward, keep the full floorplan overview readable.
    // A 2-degree return margin prevents flickering around the boundary.
    const overview = -this.forward.y >= Math.sin((this.overview ? 43 : 45) * Math.PI / 180) - 1e-6;
    if (overview !== this.overview) {
      this.overview = overview;
      this.entries.clear();
      this.revision++;
      this.nextMeshScan = -Infinity;
    }
    if (overview) return;
    let changed = !this.view.equals(camera.getViewMatrix()) || this.cameraMask !== camera.layerMask || this.cameraMode !== camera.mode;
    if (changed) { this.view.copyFrom(camera.getViewMatrix()); this.cameraMask = camera.layerMask; this.cameraMode = camera.mode; }
    // Door/furniture changes need at most 10 scans/s, shared by every marker.
    if (now >= this.nextMeshScan) {
      this.nextMeshScan = now + 100;
      for (const mesh of this.meshes) {
        const world = mesh.getWorldMatrix();
        const previous = this.meshTransforms.get(mesh);
        // Babylon may recompute an identical matrix; updateFlag alone is not a change.
        if (!previous) { this.meshTransforms.set(mesh, world.clone()); changed = true; }
        else if (!previous.equals(world)) { previous.copyFrom(world); changed = true; }
        // Field comparison instead of a state string: no allocations on the 10 Hz scan.
        const material = mesh.metadata?.originalMaterial ?? mesh.material;
        const disposed = mesh.isDisposed(), enabled = mesh.isEnabled(), visible = mesh.isVisible, visibility = mesh.visibility;
        const materialId = material?.uniqueId, alpha = material?.alpha, transparencyMode = material?.transparencyMode;
        const refraction = material?.subSurface?.isRefractionEnabled, glass = mesh.metadata?.windowGlass;
        const state = this.meshStates.get(mesh);
        if (!state) {
          this.meshStates.set(mesh, { disposed, enabled, visible, visibility, layerMask: mesh.layerMask, material: materialId, alpha, transparencyMode, refraction, glass });
          changed = true;
        } else if (state.disposed !== disposed || state.enabled !== enabled || state.visible !== visible || state.visibility !== visibility
          || state.layerMask !== mesh.layerMask || state.material !== materialId || state.alpha !== alpha
          || state.transparencyMode !== transparencyMode || state.refraction !== refraction || state.glass !== glass) {
          Object.assign(state, { disposed, enabled, visible, visibility, layerMask: mesh.layerMask, material: materialId, alpha, transparencyMode, refraction, glass });
          changed = true;
        }
      }
    }
    if (changed) this.revision++;
    for (const [key, entry] of this.entries) if (now - entry.seen > 1000) this.entries.delete(key);
    const entries = [...this.entries.values()];
    const start = performance.now();
    let checks = 0;
    for (let visited = 0; visited < entries.length; visited++) {
      const entry = entries[this.cursor++ % entries.length];
      if (now - entry.checked < 200 || entry.revision === this.revision) continue;
      entry.visible = !this.blocked(entry.point);
      entry.checked = now;
      entry.revision = this.revision;
      if (++checks >= 2 || performance.now() - start >= 1) break;
    }
  }

  private blocked(point: Vector3): boolean {
    const camera = this.scene.activeCamera!;
    this.ray.origin.copyFrom(camera.globalPosition);
    if (camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
      camera.getDirectionToRef(Vector3.Forward(this.scene.useRightHandedSystem), this.forward);
      this.forward.normalize();
      point.subtractToRef(camera.globalPosition, this.offset);
      this.forward.scaleToRef(Vector3.Dot(this.offset, this.forward), this.offset);
      point.subtractToRef(this.offset, this.ray.origin);
    }
    point.subtractToRef(this.ray.origin, this.ray.direction);
    const distance = this.ray.direction.length();
    if (distance <= .2 * this.scale) return false;
    this.ray.direction.scaleInPlace(1 / distance);
    // Anchors often sit slightly inside their own housing or window frame.
    this.ray.length = distance - .2 * this.scale;
    for (const mesh of this.meshes) {
      if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility < 1
        || !(mesh.layerMask & camera.layerMask) || mesh.metadata?.windowGlass) continue;
      const material = mesh.metadata?.originalMaterial ?? mesh.material;
      if (material && (material.alpha < 1 || material.needAlphaBlendingForMesh(mesh)
        || material.subSurface?.isRefractionEnabled)) continue;
      mesh.computeWorldMatrix();
      const box = mesh.getBoundingInfo().boundingBox;
      if (!this.ray.intersectsBoxMinMax(box.minimumWorld, box.maximumWorld)) continue;
      const hit = this.ray.intersectsMesh(mesh, true);
      if (hit.hit && hit.distance <= this.ray.length) return true;
    }
    return false;
  }
}

const occlusion = new WeakMap<Scene, MarkerOcclusion>();
export function configureMarkerOcclusion(scene: Scene, meshes: readonly AbstractMesh[], scale: number): void {
  occlusion.set(scene, new MarkerOcclusion(scene, meshes, scale));
}
export function getMarkerOcclusion(scene: Scene): MarkerOcclusion | undefined { return occlusion.get(scene); }
