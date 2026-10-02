/**
 * Camera direction for the day demo's first-person shots: finds windows, the
 * PC monitor and the TV in the loaded model and turns a shot (see story.ts)
 * into an eye position and a look-at point for every moment.
 */
import { Ray, Vector3, VertexBuffer, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { DayDemoCast, RoomRole } from './cast';
import type { Framing, Shot, ShotAnchor } from './story';
import { floorplanId } from '../../babylon/FloorplanBindings';

/** First-person camera the director drives (the dashboard's walk mode). */
export interface WalkControl {
  enter(): void;
  exit(): void;
  active(): boolean;
  pose(eye: Vector3, lookAt: Vector3): void;
  floorY(): number;
  /** Scene units per metre. */
  unit(): number;
  groundAt(x: number, z: number): number | undefined;
  /** Blocks the viewer's input in first person while the script runs. */
  lock(on: boolean): void;
}

interface Anchor {
  center: Vector3; inward: Vector3; out: boolean; meshes: AbstractMesh[]; view?: Vector3;
  /** Standing spots (decimetres from the anchor) with floor and a free view, found once by ray casts. */
  spots?: { reach: number; floor: boolean[] };
}

const ease = (t: number) => t * t * (3 - 2 * t);

function bounds(meshes: AbstractMesh[]): { center: Vector3; size: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld); max.maximizeInPlace(box.maximumWorld);
  }
  return { center: min.add(max).scale(.5), size: max.subtract(min) };
}

/** Horizontal normal of a flat mesh: the face normal along which its vertices are thinnest. */
function flatNormal(mesh: AbstractMesh): Vector3 | null {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind), normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions || !normals) return null;
  const world = mesh.computeWorldMatrix(true);
  const points: Vector3[] = [];
  for (let i = 0; i < positions.length && points.length < 400; i += 3 * Math.max(1, Math.floor(positions.length / 1200))) {
    points.push(Vector3.TransformCoordinates(new Vector3(positions[i], positions[i + 1], positions[i + 2]), world));
  }
  let best: Vector3 | null = null, thinnest = Infinity;
  for (let i = 0; i < normals.length && i < 3 * 60; i += 3) {
    const n = Vector3.TransformNormal(new Vector3(normals[i], normals[i + 1], normals[i + 2]), world);
    n.y = 0;
    if (n.lengthSquared() < 1e-6) continue;
    n.normalize();
    let lo = Infinity, hi = -Infinity;
    for (const p of points) { const d = Vector3.Dot(p, n); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    if (hi - lo < thinnest) { thinnest = hi - lo; best = n; }
  }
  return best;
}

export class ShotDirector {
  private cache = new Map<string, Anchor | null>();

  constructor(private scene: Scene, private cast: DayDemoCast, private walk: WalkControl, private tvPlanes: () => AbstractMesh[]) {}

  /**
   * Eye and look-at point for a shot at virtual time `virtual`; null when its
   * anchors are missing. Between keys the eye glides and the view turns;
   * `scene` counts the cuts passed so far (the overlay dips to black on change).
   */
  pose(shot: Shot, virtual: number): { eye: Vector3; look: Vector3; segment: number } | null {
    const f = Math.max(0, Math.min(1, (virtual - shot.from) / (shot.to - shot.from)));
    const keys = shot.keys;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= f) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const cuts = keys.slice(1, i + 1).filter(k => k.cut).length;
    const eyeA = this.eyeOf(shot, i), lookA = eyeA && this.lookOf(a, eyeA);
    if (!eyeA || !lookA) return null;
    let eye = eyeA, look = lookA;
    if (b !== a && !b.cut) {
      const eyeB = this.eyeOf(shot, i + 1), lookB = eyeB && this.lookOf(b, eyeB);
      if (!eyeB || !lookB) return null;
      const u = ease(Math.max(0, Math.min(1, (f - a.t) / Math.max(1e-6, b.t - a.t))));
      eye = Vector3.Lerp(eyeA, eyeB, u);
      // Turn the head (shortest way round, then up/down) rather than sliding the look-at point:
      // a blend of two near-opposite directions would dip towards the floor.
      const from = lookA.subtract(eyeA), to = lookB.subtract(eyeB);
      const yawA = Math.atan2(from.x, from.z), yawB = Math.atan2(to.x, to.z);
      const pitchA = Math.atan2(from.y, Math.hypot(from.x, from.z)), pitchB = Math.atan2(to.y, Math.hypot(to.x, to.z));
      const yaw = yawA + Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA)) * u, pitch = pitchA + (pitchB - pitchA) * u;
      look = eye.add(new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).scale(4 * this.walk.unit()));
    }
    // A natural head angle: at most ~60° down (looking at a desk) or 20° up.
    const unit = this.walk.unit(), time = performance.now() / 1000;
    eye = eye.clone(); look = look.clone();
    const view = look.subtract(eye), flat = Math.hypot(view.x, view.z);
    if (flat > 1e-6) look.y = eye.y + Math.max(-1.7 * flat, Math.min(.36 * flat, view.y));
    // A slight breathing sway keeps the hand-held feel.
    eye.y += Math.sin(time * 1.3) * .012 * unit;
    look.x += Math.sin(time * .7) * .03 * unit;
    return { eye, look, segment: cuts };
  }

  private eyes = new Map<string, Vector3 | null>();

  /** Eye position of a key (cached: it depends only on the model). */
  private eyeOf(shot: Shot, index: number): Vector3 | null {
    const id = `${shot.id}:${index}`;
    if (this.eyes.has(id)) return this.eyes.get(id)!;
    const key = shot.keys[index], anchor = this.anchor(key.eye.at);
    let eye: Vector3 | null = null;
    if (anchor && key.eye.approach && index > 0) {
      // Walk straight from the previous position towards the anchor; stop in front of it
      // or where furniture is in the way.
      const from = this.eyeOf(shot, index - 1);
      if (from) {
        const unit = this.walk.unit();
        const target = new Vector3(anchor.center.x, from.y, anchor.center.z);
        const path = target.subtract(from), length = path.length();
        const direction = path.normalize();
        const hit = this.scene.pickWithRay(new Ray(from, direction, length), mesh => this.blocks(mesh, anchor), true);
        const free = hit?.hit ? hit.distance - .4 * unit : length;
        eye = from.add(direction.scale(Math.max(0, Math.min(free, length - key.eye.metres * unit))));
      }
    } else if (anchor && key.eye.seeing) {
      // Walk in until the other anchor is in clear view (no wardrobe or wall in front).
      const view = this.anchor(key.eye.seeing);
      eye = this.eyeAt(anchor, key.eye.metres);
      if (view) {
        const unit = this.walk.unit();
        const { reach } = this.spots(anchor);
        // A wide view: the target's centre and 0.8 m to either side must be visible,
        // so no wardrobe or door frame cuts into the picture.
        const clear = (p: Vector3) => {
          const centre = view.center.subtract(p);
          const side = new Vector3(-centre.z, 0, centre.x).normalize().scale(.8 * unit);
          return [view.center, view.center.add(side), view.center.subtract(side)].every(target => {
            const toTarget = target.subtract(p), distance = toTarget.length();
            const hit = this.scene.pickWithRay(new Ray(p, toTarget.normalize(), distance - .2 * unit),
              mesh => this.blocks(mesh, view) && !anchor.meshes.includes(mesh), true);
            return !hit?.hit;
          });
        };
        for (let d = key.eye.metres; d <= reach; d += .3) {
          const p = this.eyeAt(anchor, d);
          if (clear(p)) { eye = p; break; }
        }
      }
    } else if (anchor && key.eye.away) {
      // Beyond the anchor, on its far side from `away` (e.g. a chair at the table facing the TV).
      const away = this.anchor(key.eye.away);
      if (away) {
        const direction = anchor.center.subtract(away.center); direction.y = 0;
        const p = anchor.center.add(direction.normalize().scale(key.eye.metres * this.walk.unit()));
        eye = new Vector3(p.x, this.walk.floorY() + 1.6 * this.walk.unit(), p.z);
      }
    } else if (anchor) eye = this.eyeAt(anchor, key.eye.metres, key.eye.over);
    if (eye && key.eye.height !== undefined) eye.y = this.walk.floorY() + key.eye.height * this.walk.unit();
    this.eyes.set(id, eye);
    return eye;
  }

  private lookOf(key: { look: ShotAnchor; turn?: number; drop?: number }, eye?: Vector3): Vector3 | null {
    const anchor = this.anchor(key.look);
    if (!anchor) return null;
    const look = this.lookAt(anchor);
    if (key.drop) look.y -= key.drop * this.walk.unit();
    if (!key.turn || !eye) return look;
    // Turn the head around the vertical axis (positive: to the right).
    const view = look.subtract(eye), angle = key.turn * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return new Vector3(eye.x + view.x * cos + view.z * sin, look.y, eye.z - view.x * sin + view.z * cos);
  }

  /** Point the orbit camera centres on for a chapter (null: the whole site). */
  focus(framing: Framing): Vector3 | null {
    if (framing.at === 'overview') return null;
    const anchor = this.anchor(framing.at);
    if (!anchor) return null;
    // Outside the flat (courtyard) the anchor's own height; inside, eye level above the floor.
    const y = framing.at.kind === 'courtyard' ? anchor.center.y + .2 * this.walk.unit() : this.walk.floorY() + .9 * this.walk.unit();
    return new Vector3(anchor.center.x, y, anchor.center.z);
  }

  /** Blind entity at the shot's (first) window, found by its panel mesh next to the glass. */
  blindFor(shot: Shot): string | undefined {
    const windowSpec = shot.keys.flatMap(k => [k.look, k.eye.at]).find(a => a.kind === 'window');
    const anchor = windowSpec && this.anchor(windowSpec);
    if (!anchor) return undefined;
    let best: { entityId: string; distance: number } | undefined;
    for (const blind of this.cast.blinds) {
      const panel = blind.id ? this.scene.getMeshByName(`blind_panel_${blind.id}`) ?? this.scene.getMeshByName(`blind_frame_${blind.id}`) : null;
      if (!panel) continue;
      const c = bounds([panel]).center;
      const distance = Math.hypot(c.x - anchor.center.x, c.z - anchor.center.z);
      if (!best || distance < best.distance) best = { entityId: blind.entityId, distance };
    }
    return best && best.distance < 2.5 * this.walk.unit() ? best.entityId : undefined;
  }

  /** Resolves every anchor, standing spot and view of a shot ahead of time (ray casts take ~0.1 s). */
  warm(shot: Shot): void {
    if (!this.playable(shot)) return;
    shot.keys.forEach((key, i) => { this.eyeOf(shot, i); this.lookOf(key); });
  }

  /** True when every anchor the shot needs exists in this model. */
  playable(shot: Shot): boolean {
    return shot.keys.every(k => !!this.anchor(k.eye.at) && !!this.anchor(k.look) && (!k.eye.away || !!this.anchor(k.eye.away)));
  }

  /** Ray casts against the whole model are far too slow per frame: measure each anchor once. */
  private spots(anchor: Anchor): { reach: number; floor: boolean[] } {
    if (anchor.spots) return anchor.spots;
    const unit = this.walk.unit(), max = 6;
    const height = this.walk.floorY() + 1.6 * unit;
    // Never stand behind a wall: a ray at eye height into the room limits the distance.
    const origin = new Vector3(anchor.center.x, height, anchor.center.z).addInPlace(anchor.inward.scale(.15 * unit));
    const hit = this.scene.pickWithRay(new Ray(origin, anchor.inward, max * unit), mesh => this.blocks(mesh, anchor), true);
    const reach = hit?.hit ? Math.max(.35, hit.distance / unit - .25) : max;
    const floor: boolean[] = [];
    for (let dm = 0; dm <= Math.round(reach * 10); dm++) {
      const p = anchor.center.add(anchor.inward.scale(dm / 10 * unit));
      floor.push(this.walk.groundAt(p.x, p.z) !== undefined);
    }
    return anchor.spots = { reach, floor };
  }

  private eyeAt(anchor: Anchor, metres: number, over = false): Vector3 {
    const unit = this.walk.unit();
    const height = this.walk.floorY() + 1.6 * unit;
    if (anchor.inward.lengthSquared() === 0) return new Vector3(anchor.center.x, height, anchor.center.z);
    const { reach, floor } = this.spots(anchor);
    let d = Math.min(metres, reach);
    if (over) {
      const p = anchor.center.add(anchor.inward.scale(d * unit));
      return new Vector3(p.x, height, p.z);
    }
    // Step back from furniture: the nearest spot with floor at or below the wanted distance.
    let dm = Math.round(d * 10);
    while (dm >= 5 && !floor[dm]) dm--;
    // Over furniture (e.g. a desk in front of a screen): stay within the free distance.
    d = dm >= 5 ? Math.min(d, dm / 10 + .05) : Math.min(d, .6);
    const p = anchor.center.add(anchor.inward.scale(d * unit));
    return new Vector3(p.x, height, p.z);
  }

  /** Walls and furniture block the view; glass, the anchor itself and helper meshes do not. */
  private blocks(mesh: AbstractMesh, anchor: Anchor): boolean {
    return mesh.isEnabled() && mesh.isVisible && mesh.visibility > .5 && mesh.getTotalVertices() > 0 && !mesh.metadata?.windowGlass
      && !anchor.meshes.includes(mesh) && !mesh.metadata?.shadowBatch && !!mesh.material && (mesh.material.alpha ?? 1) > .5
      && !!(mesh.layerMask & (this.scene.activeCamera?.layerMask ?? 0x0fffffff));
  }

  private lookAt(anchor: Anchor): Vector3 {
    const unit = this.walk.unit();
    if (!anchor.out) return anchor.center.clone();
    anchor.view ??= this.clearView(anchor);
    return anchor.view.clone();
  }

  /**
   * A point outside, seen through a free part of the glass: curtains, plants or
   * mullions in front of a window must not fill the view. Tries points across the
   * pane (from the usual standing position) and keeps the first unobstructed one.
   */
  private clearView(anchor: Anchor): Vector3 {
    const unit = this.walk.unit();
    const eye = this.eyeAt(anchor, 1.3);
    const side = new Vector3(-anchor.inward.z, 0, anchor.inward.x);
    const outside = (glass: Vector3) => {
      const direction = glass.subtract(eye).normalize();
      return glass.add(direction.scale(12 * unit));
    };
    for (const lateral of [0, .35, -.35, .7, -.7]) {
      for (const up of [-.1, .2, -.35, .45]) {
        const glass = anchor.center.add(side.scale(lateral * unit)).addInPlace(new Vector3(0, up * unit, 0));
        const toGlass = glass.subtract(eye), distance = toGlass.length();
        const hit = this.scene.pickWithRay(new Ray(eye, toGlass.normalize(), distance + .4 * unit), mesh => this.blocks(mesh, anchor), true);
        if (!hit?.hit) return outside(glass);
      }
    }
    // Everything covered: at least look out and slightly down into the park.
    const p = anchor.center.subtract(anchor.inward.scale(12 * unit));
    return new Vector3(p.x, this.walk.floorY() - .8 * unit, p.z);
  }

  private anchor(spec: ShotAnchor): Anchor | null {
    const key = JSON.stringify(spec);
    if (!this.cache.has(key)) this.cache.set(key, this.resolve(spec));
    return this.cache.get(key)!;
  }

  private resolve(spec: ShotAnchor): Anchor | null {
    if (spec.kind === 'pc') return this.screenAnchor(this.pcScreens());
    if (spec.kind === 'tv') return this.screenAnchor(this.tvPlanes().filter(m => !m.isDisposed()));
    if (spec.kind === 'coffee') return this.objectAnchor(this.cast.coffee.map(c => c.objectId));
    if (spec.kind === 'washer' || spec.kind === 'dryer') return this.objectAnchor(this.cast.appliances.filter(a => a.kind === spec.kind).map(a => a.objectId));
    if (spec.kind === 'pcCase') {
      const names = this.cast.pcs.flatMap(pc => pc.device.rgbMaterials ?? []);
      const matches = (name = '') => names.some(n => name === n || name.startsWith(n + '.') || name.startsWith(n + ':'));
      const meshes = this.scene.meshes.filter(m => !m.isDisposed() && m.getTotalVertices() > 0 && matches((m.metadata?.originalMaterial ?? m.material)?.name));
      return meshes.length ? { center: bounds(meshes).center, inward: Vector3.Zero(), out: false, meshes } : null;
    }
    if (spec.kind === 'entrance') return this.entranceAnchor();
    if (spec.kind === 'courtyard') {
      // The vent bench where the courtyard cat lies (exterior metadata; absent without the park).
      const yard = this.scene.metadata?.courtyard as { seats?: Vector3[]; benchCenter?: Vector3 } | undefined;
      const at = yard?.seats?.[0] ?? yard?.benchCenter;
      return at ? { center: at.clone(), inward: Vector3.Zero(), out: false, meshes: [] } : null;
    }
    if (spec.kind === 'home') {
      const b = this.scene.metadata?.weatherBounds as { x: number; z: number } | undefined;
      return b ? { center: new Vector3(b.x, this.walk.floorY() + 1 * this.walk.unit(), b.z), inward: Vector3.Zero(), out: false, meshes: [] } : null;
    }
    if (spec.kind === 'table') {
      // The table top: the largest flat mesh named like a dining table.
      const tops = this.scene.meshes.filter(m => !m.isDisposed() && m.getTotalVertices() > 0 && /esstisch|dining.?table/i.test(m.name));
      if (!tops.length) return null;
      const area = (m: AbstractMesh) => { const e = m.getBoundingInfo().boundingBox.extendSizeWorld; return e.x * e.z; };
      const top = tops.reduce((best, m) => area(m) > area(best) ? m : best);
      return { center: bounds([top]).center, inward: Vector3.Zero(), out: false, meshes: [top] };
    }
    if (spec.kind === 'between') {
      const a = this.anchor(spec.a), b = this.anchor(spec.b);
      return a && b ? { center: Vector3.Lerp(a.center, b.center, spec.share), inward: Vector3.Zero(), out: false, meshes: [] } : null;
    }
    if (spec.kind === 'room') {
      const center = this.roomCenter(spec.room);
      if (center) return { center: new Vector3(center.x, this.walk.floorY() + 1 * this.walk.unit(), center.z), inward: Vector3.Zero(), out: false, meshes: [] };
      // Rooms without findable lamps: the device that stands there.
      const stand: Partial<Record<RoomRole, ShotAnchor>> = { bedroom: { kind: 'pc' }, office: { kind: 'pc' }, kitchen: { kind: 'coffee' }, hall: { kind: 'entrance' }, living: { kind: 'tv' }, dining: { kind: 'tv' } };
      const fallback = stand[spec.room];
      return fallback ? this.anchor(fallback) : null;
    }
    const windows = this.scene.meshes.filter(m => m.metadata?.windowGlass && !m.isDisposed());
    if (!windows.length) return null;
    // The room's lamps locate it; `near` (PC, TV) is the fallback or the only reference.
    const reference = (spec.room ? this.roomCenter(spec.room) : null) ?? (spec.near ? this.anchor({ kind: spec.near } as ShotAnchor)?.center : null);
    if (!reference) return null;
    const distance = (m: AbstractMesh) => { const c = bounds([m]).center; return Math.hypot(c.x - reference.x, c.z - reference.z); };
    const glass = windows.reduce((best, m) => distance(m) < distance(best) ? m : best);
    return this.flatAnchor([glass], true, reference);
  }

  /** Meshes of floorplan objects (by their exported id). */
  private objectMeshes(ids: (string | undefined)[]): AbstractMesh[] {
    const wanted = new Set(ids.filter((id): id is string => !!id));
    if (!wanted.size) return [];
    return this.scene.meshes.filter(m => !m.isDisposed() && m.getTotalVertices() > 0 && wanted.has(floorplanId(m) ?? ''));
  }

  /** A device on a counter or shelf: its front is the side with the longest free view. */
  private objectAnchor(ids: (string | undefined)[]): Anchor | null {
    const meshes = this.objectMeshes(ids);
    if (!meshes.length) return null;
    const { center } = bounds(meshes);
    const unit = this.walk.unit();
    const origin = new Vector3(center.x, this.walk.floorY() + 1.3 * unit, center.z);
    let best: { dir: Vector3; free: number } | null = null;
    for (let i = 0; i < 8; i++) {
      const dir = new Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4));
      const hit = this.scene.pickWithRay(new Ray(origin.add(dir.scale(.2 * unit)), dir, 5 * unit), mesh => this.blocks(mesh, { center, inward: dir, out: false, meshes }), true);
      const free = hit?.hit ? hit.distance : 5 * unit;
      if (!best || free > best.free + .05 * unit) best = { dir, free };
    }
    return { center, inward: best!.dir, out: false, meshes };
  }

  /** Inside the front door, facing into the apartment. */
  private entranceAnchor(): Anchor | null {
    const meshes = this.objectMeshes(this.cast.doors.filter(d => d.kind === 'entrance').map(d => d.objectId));
    if (!meshes.length) return null;
    const { center } = bounds(meshes);
    const towards = this.apartmentCenter().subtract(center);
    towards.y = 0;
    if (towards.lengthSquared() < 1e-6) return null;
    return { center, inward: towards.normalize(), out: false, meshes };
  }

  private pcScreens(): AbstractMesh[] {
    const names = this.cast.pcs.flatMap(pc => pc.device.screenMaterials ?? []);
    // Dedicated PC materials carry a suffix (`SZ_monitor:it:1323`), exports a numbered one.
    const matches = (name = '') => names.some(n => name === n || name.startsWith(n + '.') || name.startsWith(n + ':'));
    return this.scene.meshes.filter(m => !m.isDisposed() && m.getTotalVertices() > 0 && matches((m.metadata?.originalMaterial ?? m.material)?.name));
  }

  private screenAnchor(meshes: AbstractMesh[]): Anchor | null {
    return meshes.length ? this.flatAnchor(meshes, false) : null;
  }

  /** A flat object (glass, screen) with the side that faces into the apartment. */
  private flatAnchor(meshes: AbstractMesh[], out: boolean, reference?: Vector3): Anchor | null {
    const { center } = bounds(meshes);
    const largest = meshes.reduce((a, b) => a.getTotalVertices() >= b.getTotalVertices() ? a : b);
    const normal = flatNormal(largest);
    if (!normal) return null;
    const unit = this.walk.unit();
    const inside = (dir: Vector3) => {
      const p = center.add(dir.scale(1.2 * unit));
      return this.walk.groundAt(p.x, p.z) !== undefined;
    };
    // Windows: the room side has floor, the outside drops to the park. Screens stand in a room
    // (often above a desk), so for them only the free line of sight decides.
    let inward = !out ? null : inside(normal) && !inside(normal.negate()) ? normal
      : inside(normal.negate()) && !inside(normal) ? normal.negate() : null;
    if (!inward) {
      // The side with the longer free view is the front.
      const free = (dir: Vector3) => {
        const origin = new Vector3(center.x, this.walk.floorY() + 1.6 * unit, center.z).addInPlace(dir.scale(.15 * unit));
        const hit = this.scene.pickWithRay(new Ray(origin, dir, 5 * unit), mesh => this.blocks(mesh, { center, inward: dir, out, meshes }), true);
        return hit?.hit ? hit.distance : 5 * unit;
      };
      const a = free(normal), b = free(normal.negate());
      if (Math.abs(a - b) > .3 * unit) inward = a > b ? normal : normal.negate();
      else {
        const towards = (reference ?? this.apartmentCenter()).subtract(center);
        inward = Vector3.Dot(towards, normal) >= 0 ? normal : normal.negate();
      }
    }
    return { center, inward, out, meshes };
  }

  /** Centre of a room from the positions of its lamps (scene lights carry the entity ID in their name). */
  private roomCenter(room: RoomRole): Vector3 | null {
    const ids = this.cast.lights.filter(l => l.room === room).map(l => l.entityId);
    const lights = this.scene.lights.filter(lamp => ids.some(id => lamp.name.includes(id)));
    if (!lights.length) return null;
    const sum = lights.reduce((acc, light) => acc.addInPlace((light as unknown as { getAbsolutePosition(): Vector3 }).getAbsolutePosition()), Vector3.Zero());
    return sum.scale(1 / lights.length);
  }

  private apartmentCenter(): Vector3 {
    const lamps = this.scene.lights.filter(light => 'getAbsolutePosition' in light && light.getClassName() !== 'DirectionalLight' && light.getClassName() !== 'HemisphericLight');
    if (!lamps.length) return Vector3.Zero();
    return lamps.reduce((acc, light) => acc.addInPlace((light as unknown as { getAbsolutePosition(): Vector3 }).getAbsolutePosition()), Vector3.Zero()).scale(1 / lamps.length);
  }
}
