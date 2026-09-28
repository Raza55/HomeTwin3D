import { ArcRotateCamera, Camera, Ray, Vector3, type AbstractMesh, type Scene, type Node } from '@babylonjs/core';
import { RoomDoors } from './RoomDoors';

export type NavigationMode = 'normal' | 'walk' | 'fly';
export const nextNavigationMode = (mode: NavigationMode): NavigationMode => mode === 'normal' ? 'walk' : mode === 'walk' ? 'fly' : 'normal';

/** Reuses the scene camera so outlines, markers and lighting keep the same camera. */
export class WalkthroughCamera {
  mode: NavigationMode = 'normal';
  readonly keys = new Set<string>();
  private eye = Vector3.Zero();
  private saved?: { target: Vector3; alpha: number; beta: number; radius: number; mode: number; minZ: number; layerMask: number; lower: number | null; upper: number | null; lowerBeta: number | null; upperBeta: number | null };
  private drag?: { id: number; x: number; y: number };
  private observer;
  private meshes: Set<AbstractMesh>;
  private floor: number;
  private scale: number;
  private disposed = false;
  private ceilingMasks = new Map<AbstractMesh, number>();
  private passableDoors = new Set<AbstractMesh>();
  private roomDoors: RoomDoors;
  private tap?: { id: number; x: number; y: number; moved: boolean };
  private pendingHover?: PointerEvent;
  private savedPicking?: [boolean, boolean, boolean];
  constructor(private scene: Scene, private camera: ArcRotateCamera, private canvas: HTMLCanvasElement,
    private center: Vector3, private size: Vector3, meshes: AbstractMesh[], private exit: () => void, scale = 1) {
    this.meshes = new Set(meshes); this.scale = scale; this.floor = center.y - size.y / 2;
    this.roomDoors = new RoomDoors(meshes);
    for (const mesh of meshes) {
      // Interior doors may be batched, so retain the exported material identity too.
      const materialName = (mesh.metadata?.originalMaterial ?? mesh.material)?.name ?? '';
      if (/^F53_Tueren_Seidenweiss(?:$|\.)/.test(materialName)) this.passableDoors.add(mesh);
      for (let node: Node | null = mesh; node; node = node.parent) {
        const extras = node.metadata?.gltf?.extras;
        if (extras?.ha_cutaway) this.ceilingMasks.set(mesh, mesh.layerMask);
        if (extras?.ha_walkthrough_passable || /(?:Haustuer|Wohnungseingang_Tuerblatt|Balkontuer)/i.test(node.name)) this.passableDoors.add(mesh);
      }
    }
    // Furniture feet and hidden construction geometry can extend below the floor.
    // Use the dominant horizontal surface rather than the model's minimum Y.
    const floors = new Map<number, { count: number; sum: number }>();
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      const hit = scene.pickWithRay(new Ray(new Vector3(center.x + x * size.x / 10, center.y + size.y / 2 + scale, center.z + z * size.z / 10), Vector3.Down(), size.y + 2 * scale),
        m => this.meshes.has(m) && m.isEnabled() && !(m.layerMask & 0x10000000));
      if (!hit?.pickedPoint || (hit.getNormal(true)?.y ?? 0) < .8) continue;
      const y = hit.pickedPoint.y, key = Math.round(y / (.05 * scale)), group = floors.get(key) ?? { count: 0, sum: 0 };
      group.count++; group.sum += y; floors.set(key, group);
    }
    const dominant = [...floors.values()].sort((a, b) => b.count - a.count)[0];
    if (dominant) this.floor = dominant.sum / dominant.count;
    canvas.addEventListener('keydown', this.keyDown); canvas.addEventListener('keyup', this.keyUp);
    canvas.addEventListener('pointerdown', this.pointerDown); canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp); canvas.addEventListener('pointercancel', this.pointerUp);
    canvas.addEventListener('contextmenu', this.contextMenu); canvas.addEventListener('blur', this.clear);
    window.addEventListener('blur', this.clear); document.addEventListener('visibilitychange', this.clear);
    this.observer = scene.onBeforeRenderObservable.add(() => this.update(Math.min(scene.getEngine().getDeltaTime() / 1000, .05)));
  }
  private pick(origin: Vector3, direction: Vector3, length: number, movement = false, anyHit = false) {
    return this.scene.pickWithRay(new Ray(origin, direction, length), m => this.meshes.has(m) && m.isEnabled() && !m.isDisposed() && (!movement || !this.passableDoors.has(m)), anyHit || movement);
  }
  private ground(x: number, z: number): number | undefined {
    const hit = this.pick(new Vector3(x, this.floor + .85 * this.scale, z), Vector3.Down(), 1.2 * this.scale);
    const y = hit?.pickedPoint?.y;
    return y !== undefined && Math.abs(y - this.floor) < .3 * this.scale ? y : undefined;
  }
  private spawn(): Vector3 {
    const candidates: Vector3[] = [];
    for (let ix = -5; ix <= 5; ix++) for (let iz = -5; iz <= 5; iz++) {
      const x = this.center.x + ix * this.size.x / 12, z = this.center.z + iz * this.size.z / 12;
      candidates.push(new Vector3(x, 0, z));
    }
    // Same stable nearest-first ordering as before, but stop after the first
    // valid candidate instead of ray-testing all 121 points on every entry.
    candidates.sort((a, b) => Math.hypot(a.x - this.center.x, a.z - this.center.z) - Math.hypot(b.x - this.center.x, b.z - this.center.z));
    for (const { x, z } of candidates) {
      const y = this.ground(x, z); if (y === undefined) continue;
      const point = new Vector3(x, y + 1.65 * this.scale, z);
      if ([Vector3.Right(), Vector3.Left(), Vector3.Forward(), Vector3.Backward()].every(d =>
        [0, -.75 * this.scale].every(h => !this.pick(point.add(new Vector3(0, h, 0)), d, .45 * this.scale, false, true)?.hit))) return point;
    }
    return new Vector3(this.center.x, this.floor + 1.65 * this.scale, this.center.z);
  }
  setMode(mode: NavigationMode): void {
    if (mode === this.mode) return;
    this.clear(); this.scene.stopAnimation(this.camera);
    if (this.mode === 'normal') {
      this.savedPicking = [this.scene.skipPointerMovePicking, this.scene.skipPointerDownPicking, this.scene.skipPointerUpPicking];
      // Dashboard handlers return immediately in first person. Only the explicit
      // door hover/click needs picking; camera dragging needs none.
      this.scene.skipPointerMovePicking = this.scene.skipPointerDownPicking = this.scene.skipPointerUpPicking = true;
      const c = this.camera;
      this.saved = { target: c.target.clone(), alpha: c.alpha, beta: c.beta, radius: c.radius, mode: c.mode, minZ: c.minZ,
        layerMask: c.layerMask, lower: c.lowerRadiusLimit, upper: c.upperRadiusLimit, lowerBeta: c.lowerBetaLimit, upperBeta: c.upperBetaLimit };
      c.detachControl(); c.inertialAlphaOffset = c.inertialBetaOffset = c.inertialRadiusOffset = c.inertialPanningX = c.inertialPanningY = 0;
      c.lowerRadiusLimit = c.upperRadiusLimit = null; c.lowerBetaLimit = .05; c.upperBetaLimit = Math.PI - .05;
      c.mode = Camera.PERSPECTIVE_CAMERA; c.minZ = .025 * this.scale;
      // Reveal actual ceilings only. The same hidden layer also contains opaque
      // shadow-only walls across windows, which must never become camera-visible.
      for (const mesh of this.ceilingMasks.keys()) if (!mesh.isDisposed()) mesh.layerMask = c.layerMask;
      this.eye.copyFrom(this.spawn()); c.beta = Math.PI / 2;
      // Look into the longest unobstructed direction from the starting point.
      let best = -1;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, direction = new Vector3(-Math.cos(angle), 0, -Math.sin(angle));
        const hit = this.pick(this.eye, direction, 6 * this.scale);
        let distance = hit?.hit ? hit.distance : 6 * this.scale;
        // Prefer looking into the apartment, not out through an open window.
        if (this.ground(this.eye.x + direction.x * 1.5 * this.scale, this.eye.z + direction.z * 1.5 * this.scale) === undefined) distance *= .1;
        if (distance > best) { best = distance; c.alpha = angle; }
      }
    }
    this.mode = mode;
    if (mode === 'normal' && this.saved) {
      if (this.savedPicking) [this.scene.skipPointerMovePicking, this.scene.skipPointerDownPicking, this.scene.skipPointerUpPicking] = this.savedPicking;
      this.savedPicking = undefined;
      const c = this.camera, s = this.saved;
      c.setTarget(s.target); c.alpha = s.alpha; c.beta = s.beta; c.radius = s.radius; c.mode = s.mode; c.minZ = s.minZ; c.layerMask = s.layerMask;
      c.lowerRadiusLimit = s.lower; c.upperRadiusLimit = s.upper; c.lowerBetaLimit = s.lowerBeta; c.upperBetaLimit = s.upperBeta;
      c.attachControl(this.canvas, true); this.saved = undefined;
      for (const [mesh, mask] of this.ceilingMasks) if (!mesh.isDisposed()) mesh.layerMask = mask;
    } else {
      if (mode === 'walk') { const y = this.ground(this.eye.x, this.eye.z); if (y === undefined) this.eye.copyFrom(this.spawn()); else this.eye.y = y + 1.65 * this.scale; }
      this.syncCamera(); this.canvas.focus({ preventScroll: true });
    }
  }
  recenter(): void { if (this.mode !== 'normal') { this.eye.copyFrom(this.spawn()); this.camera.beta = Math.PI / 2; this.syncCamera(); } }
  private syncCamera() {
    const c = this.camera, radius = .05 * this.scale;
    c.radius = radius;
    c.target.copyFrom(this.eye).subtractInPlace(new Vector3(Math.cos(c.alpha) * Math.sin(c.beta), Math.cos(c.beta), Math.sin(c.alpha) * Math.sin(c.beta)).scaleInPlace(radius));
    c.getViewMatrix(true);
  }
  update(dt: number): void {
    this.roomDoors.update(dt);
    if (this.pendingHover) {
      const event = this.pendingHover; this.pendingHover = undefined;
      if (this.mode === 'walk' && !this.drag) {
        const hit = this.pointerPick(event);
        const cursor = hit?.pickedMesh && this.roomDoors.has(hit.pickedMesh) && hit.distance <= 4 * this.scale ? 'pointer' : 'default';
        if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
      }
    }
    if (this.mode === 'normal' || !this.keys.size) return;
    const c = this.camera;
    const forward = new Vector3(-Math.cos(c.alpha), 0, -Math.sin(c.alpha));
    if (this.mode === 'fly') forward.set(-Math.cos(c.alpha) * Math.sin(c.beta), -Math.cos(c.beta), -Math.sin(c.alpha) * Math.sin(c.beta));
    const right = new Vector3(-Math.sin(c.alpha), 0, Math.cos(c.alpha));
    const move = Vector3.Zero();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.addInPlace(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.subtractInPlace(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.addInPlace(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.subtractInPlace(right);
    if (this.mode === 'fly') { if (this.keys.has('KeyE')) move.y++; if (this.keys.has('KeyQ')) move.y--; }
    if (!move.lengthSquared()) return;
    move.normalize().scaleInPlace(Math.min(dt, .05) * this.scale * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3.6 : 1.5));
    if (this.mode === 'walk') {
      // Axis separation allows sliding along walls; head and torso rays block furniture/walls.
      for (const delta of [new Vector3(move.x, 0, 0), new Vector3(0, 0, move.z)]) {
        if (!delta.lengthSquared()) continue;
        const direction = delta.normalizeToNew(), length = delta.length() + .22 * this.scale;
        if ([0, -.75 * this.scale].some(h => this.pick(this.eye.add(new Vector3(0, h, 0)), direction, length, true)?.hit)) continue;
        const y = this.ground(this.eye.x + delta.x, this.eye.z + delta.z);
        if (y !== undefined) { this.eye.addInPlace(delta); this.eye.y = y + 1.65 * this.scale; }
      }
    } else {
      this.eye.addInPlace(move);
      this.eye.x = Math.max(this.center.x - this.size.x / 2, Math.min(this.center.x + this.size.x / 2, this.eye.x));
      this.eye.z = Math.max(this.center.z - this.size.z / 2, Math.min(this.center.z + this.size.z / 2, this.eye.z));
      this.eye.y = Math.max(this.floor + .2 * this.scale, Math.min(this.center.y + this.size.y / 2 - .1 * this.scale, this.eye.y));
    }
    this.syncCamera();
  }
  private clear = () => { this.keys.clear(); this.drag = undefined; this.tap = undefined; this.pendingHover = undefined; if (this.canvas.style) this.canvas.style.cursor = ''; };
  private keyDown = (event: KeyboardEvent) => {
    if (this.mode === 'normal' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); this.exit(); return; }
    if (/^(Key[WASDQE]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(event.code)) { event.preventDefault(); event.stopPropagation(); this.keys.add(event.code); }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private pointerDown = (event: PointerEvent) => {
    if (this.mode === 'walk' && event.button === 0) this.tap = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (this.mode === 'normal' || (event.button !== 2 && event.pointerType !== 'touch')) return;
    this.canvas.focus({ preventScroll: true }); this.canvas.setPointerCapture(event.pointerId); this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.tap?.id === event.pointerId && Math.hypot(event.clientX - this.tap.x, event.clientY - this.tap.y) > 6) this.tap.moved = true;
    if (this.mode === 'walk' && !this.drag) {
      this.pendingHover = event;
    }
    if (!this.drag || this.drag.id !== event.pointerId) return;
    this.camera.alpha -= (event.clientX - this.drag.x) * .003;
    this.camera.beta = Math.max(.05, Math.min(Math.PI - .05, this.camera.beta - (event.clientY - this.drag.y) * .003));
    this.drag.x = event.clientX; this.drag.y = event.clientY; this.syncCamera();
  };
  private pointerPick(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return this.scene.pick(event.clientX - rect.left, event.clientY - rect.top,
      m => m.isEnabled() && m.isVisible && m.visibility > 0 && !!(m.layerMask & this.camera.layerMask) && this.meshes.has(m), false, this.camera);
  }
  private pointerUp = (event: PointerEvent) => {
    if (event.type === 'pointerup' && this.mode === 'walk' && this.tap?.id === event.pointerId && !this.tap.moved
      && Math.hypot(event.clientX - this.tap.x, event.clientY - this.tap.y) <= 6) {
      const hit = this.pointerPick(event);
      if (hit?.pickedMesh && hit.distance <= 4 * this.scale) this.roomDoors.toggle(hit.pickedMesh);
    }
    if (this.tap?.id === event.pointerId) this.tap = undefined;
    if (this.drag?.id === event.pointerId) this.drag = undefined;
  };
  private contextMenu = (event: Event) => { if (this.mode !== 'normal') event.preventDefault(); };
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.setMode('normal'); this.scene.onBeforeRenderObservable.remove(this.observer);
    this.canvas.removeEventListener('keydown', this.keyDown); this.canvas.removeEventListener('keyup', this.keyUp);
    this.canvas.removeEventListener('pointerdown', this.pointerDown); this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp); this.canvas.removeEventListener('pointercancel', this.pointerUp);
    this.canvas.removeEventListener('contextmenu', this.contextMenu); this.canvas.removeEventListener('blur', this.clear);
    window.removeEventListener('blur', this.clear); document.removeEventListener('visibilitychange', this.clear);
  }
}
