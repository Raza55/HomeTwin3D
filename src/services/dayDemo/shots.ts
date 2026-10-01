/**
 * Camera direction for the day demo's first-person shots: finds windows, the
 * PC monitor and the TV in the loaded model and turns a shot (see story.ts)
 * into an eye position and a look-at point for every moment.
 */
import { Ray, Vector3, VertexBuffer, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { DayDemoCast, RoomRole } from './cast';
import type { Shot, ShotAnchor } from './story';

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

  /** Eye and look-at point for a shot at virtual time `virtual`; null when its anchors are missing. */
  pose(shot: Shot, virtual: number): { eye: Vector3; look: Vector3; segment: number } | null {
    const f = Math.max(0, Math.min(.9999, (virtual - shot.from) / (shot.to - shot.from)));
    const index = shot.segments.findIndex(s => f >= s.span[0] && f < s.span[1]);
    const segment = shot.segments[index];
    const anchor = segment && this.anchor(segment.at);
    if (!segment || !anchor) return null;
    const t = (f - segment.span[0]) / (segment.span[1] - segment.span[0]);
    let eye = this.eyeAt(anchor, segment.eye[0] + (segment.eye[1] - segment.eye[0]) * ease(t));
    let look = this.lookAt(anchor);
    const pan = segment.pan && this.anchor(segment.pan.to);
    if (segment.pan && pan && t > segment.pan.from) {
      const u = ease((t - segment.pan.from) / (1 - segment.pan.from));
      eye = Vector3.Lerp(eye, this.eyeAt(pan, segment.pan.eye), u);
      // Turn the view direction rather than sliding the look-at point.
      const from = look.subtract(eye).normalize(), to = this.lookAt(pan).subtract(eye).normalize();
      look = eye.add(Vector3.Lerp(from, to, u).normalize().scale(4 * this.walk.unit()));
    }
    // A slight breathing sway keeps the hand-held feel.
    const unit = this.walk.unit(), time = performance.now() / 1000;
    eye.y += Math.sin(time * 1.3) * .012 * unit;
    look.x += Math.sin(time * .7) * .03 * unit;
    return { eye, look, segment: index };
  }

  /** Blind entity at the shot's (first) window, found by its panel mesh next to the glass. */
  blindFor(shot: Shot): string | undefined {
    const windowSpec = shot.segments.flatMap(s => [s.at, s.pan?.to]).find(a => a?.kind === 'window');
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

  /** True when every anchor the shot needs exists in this model. */
  playable(shot: Shot): boolean {
    return shot.segments.every(s => !!this.anchor(s.at));
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

  private eyeAt(anchor: Anchor, metres: number): Vector3 {
    const unit = this.walk.unit();
    const height = this.walk.floorY() + 1.6 * unit;
    const { reach, floor } = this.spots(anchor);
    let d = Math.min(metres, reach);
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
    const windows = this.scene.meshes.filter(m => m.metadata?.windowGlass && !m.isDisposed());
    if (!windows.length) return null;
    // The room's lamps locate it; `near` (PC, TV) is the fallback or the only reference.
    const reference = (spec.room ? this.roomCenter(spec.room) : null) ?? (spec.near ? this.anchor({ kind: spec.near })?.center : null);
    if (!reference) return null;
    const distance = (m: AbstractMesh) => { const c = bounds([m]).center; return Math.hypot(c.x - reference.x, c.z - reference.z); };
    const glass = windows.reduce((best, m) => distance(m) < distance(best) ? m : best);
    return this.flatAnchor([glass], true, reference);
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
