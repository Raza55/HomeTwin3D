import {
  Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, Vector3, type AbstractMesh, type Observer, type Scene,
} from '@babylonjs/core';
import type { AppConfig, DisplayConfig, FloorplanObject, RoomConfig } from '../types';
import { floorplanId } from './FloorplanBindings';
import { deviceKinds, isSupplyName, matchScore, type EnergyConsumer, type EnergyRegistry } from '../services/energyFlow';

/** How a consumer found its place (shown for feedback). */
export type EnergyPlacementSource = 'override' | 'blind' | 'object' | 'model' | 'room' | 'home';

export interface EnergyNode {
  id: string;
  name: string;
  roomName: string;
  color: string;
  position: Vector3;
  source: EnergyPlacementSource;
}

/** Room colours: distinct, readable on the light sketch model and in dark mode. */
const ROOM_COLORS = ['#0ea5e9', '#f43f5e', '#f59e0b', '#22c55e', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#6366f1'];

const centerOf = (meshes: AbstractMesh[]): Vector3 | null => {
  if (!meshes.length) return null;
  let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, box.minimumWorld); max = Vector3.Maximize(max, box.maximumWorld);
  }
  return min.add(max).scale(.5);
};

/**
 * Places every consumer: a saved override, the blind it drives (same HA device),
 * a floorplan object or display with a matching label, a model part with a
 * matching name, or a spot around its room's centre.
 */
export function placeConsumers(scene: Scene, config: AppConfig, consumers: EnergyConsumer[], registry: EnergyRegistry, displays: { config: DisplayConfig; plane: AbstractMesh }[]): { nodes: EnergyNode[]; hub: Vector3 } {
  const scale = config.model?.scale ?? 1;
  const meshes = scene.meshes.filter(m => !m.isDisposed() && m.getTotalVertices() > 0 && !m.name.startsWith('energy-'));
  const all = centerOf(meshes) ?? Vector3.Zero();
  // The apartment's floor (it may sit on an upper storey): the lowest point of its floorplan objects (doors, appliances).
  const bound = meshes.filter(m => !!floorplanId(m));
  const floorY = (bound.length ? bound : meshes).reduce((low, m) => Math.min(low, m.getBoundingInfo().boundingBox.minimumWorld.y), Infinity);
  const floor = Number.isFinite(floorY) ? floorY : 0;
  const areaName = new Map(registry.areas.map(a => [a.area_id, a.name]));
  const rooms = config.rooms ?? [];
  const roomOf = (consumer: EnergyConsumer): RoomConfig | undefined => consumer.areaId ? rooms.find(r => r.haAreaIds.includes(consumer.areaId!)) : undefined;
  const anchorOf = (room: RoomConfig) => new Vector3(room.anchor.x * scale, floor + .9 * scale, room.anchor.z * scale);
  const roomColor = new Map<string, string>();
  const colorFor = (name: string) => {
    if (!roomColor.has(name)) roomColor.set(name, ROOM_COLORS[roomColor.size % ROOM_COLORS.length]);
    return roomColor.get(name)!;
  };

  // Labelled candidates: floorplan objects (by their meshes) and screens.
  const byFloorplan = new Map<string, AbstractMesh[]>();
  for (const mesh of meshes) { const id = floorplanId(mesh); if (id) byFloorplan.set(id, [...(byFloorplan.get(id) ?? []), mesh]); }
  // Device types from the board's own configuration: TVs, PCs, NAS, appliances, coffee machine.
  const objectKinds = (o: FloorplanObject) => {
    const kinds = deviceKinds(o.label);
    if (o.appliance) kinds.add(o.appliance.kind);
    if (o.coffee) kinds.add('coffee');
    if (o.it) { if (o.it.kind === 'pc') kinds.add('pc'); for (const device of o.it.devices) kinds.add(device.kind); }
    return kinds;
  };
  const objects = [
    ...(config.model?.floorplan?.objects ?? []).map(o => ({ label: o.label, area: o.haAreaId, kinds: objectKinds(o), center: centerOf(byFloorplan.get(o.id) ?? []) })),
    ...displays.map(d => ({ label: d.config.label, area: undefined as string | undefined, kinds: new Set([...deviceKinds(d.config.label), ...(d.config.kind === 'tv' ? ['tv'] : d.config.kind === 'pc' ? ['pc'] : [])]), center: d.plane.getAbsolutePosition().clone() })),
  ].filter((o): o is { label: string; area: string | undefined; kinds: Set<string>; center: Vector3 } => !!o.center);
  // Model parts by name (one entry per base name, e.g. "Toaster_Gehaeuse.001" → "Toaster Gehaeuse").
  const parts = new Map<string, AbstractMesh[]>();
  for (const mesh of meshes) {
    const base = mesh.name.replace(/[._:]\d+$/, '').replace(/_primitive\d+$/, '');
    if (base.length >= 4) parts.set(base, [...(parts.get(base) ?? []), mesh]);
  }
  // Without rooms in the board: an area's centre from the floorplan objects assigned to it.
  const areaAnchor = (areaId: string | undefined): Vector3 | null => {
    if (!areaId) return null;
    const objectsThere = (config.model?.floorplan?.objects ?? []).filter(o => o.haAreaId === areaId);
    const center = centerOf(objectsThere.flatMap(o => byFloorplan.get(o.id) ?? []));
    return center ? new Vector3(center.x, floor + .9 * scale, center.z) : null;
  };
  const blindPanel = (entityId: string) => {
    const blind = config.blinds?.find(b => b.entityId === entityId);
    return blind ? scene.getMeshByName(`blind_panel_${blind.id}`) ?? scene.getMeshByName(`blind_frame_${blind.id}`) : null;
  };

  const used = new Map<string, number>();
  const nodes = consumers.map(consumer => {
    const room = roomOf(consumer);
    const roomName = room?.name ?? (consumer.areaId ? areaName.get(consumer.areaId) : undefined) ?? '—';
    const anchor = room ? anchorOf(room) : areaAnchor(consumer.areaId);
    const near = (point: Vector3) => anchor ? Vector3.Distance(point, anchor) : 0;
    let position: Vector3 | null = null, source: EnergyPlacementSource = 'home';
    const override = config.energyPlacement?.[consumer.id];
    if (override) { position = new Vector3(override.x, override.y, override.z); source = 'override'; }
    if (!position && consumer.deviceId) {
      const motorOf = registry.entities.find(e => e.device_id === consumer.deviceId && e.entity_id.startsWith('cover.'));
      const panel = motorOf ? blindPanel(motorOf.entity_id) : null;
      if (panel) { position = centerOf([panel]); source = 'blind'; }
    }
    if (!position) {
      // Same device type (a TV plug at the TV, the PC plug at the PC), else the best label fit;
      // the object in (or nearest to) the consumer's area wins.
      const kinds = deviceKinds(consumer.name);
      const scored = objects.map(o => {
        const kind = [...kinds].some(k => o.kinds.has(k)) ? 10 : 0;
        const label = matchScore(consumer.name, o.label);
        // Only objects in (or close to) the consumer's area: a "kids' room PC desk" plug is not the PC in the bedroom.
        const close = !anchor || (o.area && o.area === consumer.areaId) || near(o.center) < 5 * scale;
        return { o, score: kind + (label >= 5 ? label : 0) + (o.area && o.area === consumer.areaId ? 3 : 0) - (anchor ? near(o.center) / scale * .4 : 0), fits: (kind > 0 || label >= 5) && close };
      }).filter(s => s.fits);
      scored.sort((a, b) => b.score - a.score);
      if (scored[0]) { position = scored[0].o.center.clone(); source = 'object'; }
    }
    if (!position) {
      const scored = [...parts].map(([name, list]) => ({ center: centerOf(list)!, score: matchScore(consumer.name, name.replace(/_/g, ' ')) })).filter(s => s.score >= 5);
      // Only parts in the consumer's room (or close to it) count when the room is known.
      const fitting = anchor ? scored.filter(s => near(s.center) < 4.5 * scale) : scored;
      fitting.sort((a, b) => b.score - a.score || near(a.center) - near(b.center));
      if (fitting[0]) { position = fitting[0].center.clone(); source = 'model'; }
    }
    if (!position && anchor) {
      const index = used.get(roomName) ?? 0; used.set(roomName, index + 1);
      const angle = index * 2.39996, radius = (.45 + .25 * Math.sqrt(index)) * scale;
      position = anchor.add(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      source = 'room';
    }
    if (!position) {
      const index = used.get('') ?? 0; used.set('', index + 1);
      position = new Vector3(all.x + index * .4 * scale, floor + .9 * scale, all.z);
    }
    return { id: consumer.id, name: consumer.name, roomName, color: colorFor(roomName), position, source };
  });

  // Two consumers at one device (e.g. two TV plugs): side by side instead of on top of each other.
  nodes.forEach((node, i) => {
    let k = 0;
    while (nodes.slice(0, i).some(other => Vector3.Distance(other.position, node.position) < .25 * scale) && k < 8) {
      k++;
      node.position = node.position.add(new Vector3(Math.cos(k * 2.4) * .3 * scale, 0, Math.sin(k * 2.4) * .3 * scale));
    }
  });

  // Supply: a hand-placed point, the main switch / meter consumer, else the front door, else the middle of the home.
  const entrance = (config.model?.floorplan?.objects ?? []).find(o => o.door?.kind === 'entrance');
  const door = entrance ? centerOf(byFloorplan.get(entrance.id) ?? []) : null;
  const supply = nodes.find(n => isSupplyName(n.name));
  const placed = config.energyPlacement?.hub;
  const hub = placed ? new Vector3(placed.x, placed.y, placed.z)
    : supply ? new Vector3(supply.position.x, Math.max(floor + .25 * scale, supply.position.y - .35 * scale), supply.position.z)
      : door ? new Vector3(door.x, floor + .25 * scale, door.z) : new Vector3(all.x, floor + .25 * scale, all.z);
  return { nodes, hub };
}

interface Flow { node: EnergyNode; tube: Mesh; orb: Mesh; halo: Mesh; dash: DynamicTexture; material: StandardMaterial; orbMaterial: StandardMaterial; length: number; watts: number; share: number; path: Vector3[] }

/**
 * The energy view in the sketch model: an orb per consumer (size = share of the
 * current total) and an animated line from the supply to it (thickness and speed
 * follow the power).
 */
export class EnergyFlowLayer {
  private flows: Flow[] = [];
  private hubOrb: Mesh | null = null;
  private haloTexture: DynamicTexture;
  private observer: Observer<Scene> | null;
  private start = performance.now();

  constructor(private scene: Scene, private unit: number) {
    this.haloTexture = new DynamicTexture('energy-halo', { width: 64, height: 64 }, scene, false);
    const halo = this.haloTexture.getContext() as unknown as CanvasRenderingContext2D;
    const gradient = halo.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.85)'); gradient.addColorStop(.35, 'rgba(255,255,255,.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    halo.fillStyle = gradient; halo.fillRect(0, 0, 64, 64);
    this.haloTexture.hasAlpha = true; this.haloTexture.update();
    let last = performance.now();
    this.observer = scene.onBeforeRenderObservable.add(() => {
      const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
      const time = (now - this.start) / 1000;
      let moving = false;
      for (const flow of this.flows) {
        if (flow.watts < 1) continue;
        moving = true;
        flow.dash.uOffset -= dt * (.35 + 2.2 * Math.sqrt(flow.share));
        const pulse = 1 + .08 * Math.sin(time * (2 + 4 * flow.share) + flow.length);
        flow.halo.scaling.setAll(3 * pulse);
      }
      scene.metadata = { ...scene.metadata, energyAnimating: moving };
    });
  }

  /** Rebuilds the meshes for a new set of consumers. */
  setNodes(nodes: EnergyNode[], hub: Vector3): void {
    this.clear();
    const u = this.unit;
    this.hubOrb = MeshBuilder.CreateSphere('energy-hub', { diameter: .26 * u, segments: 12 }, this.scene);
    this.hubOrb.position.copyFrom(hub);
    const hubMaterial = new StandardMaterial('energy-hub-mat', this.scene);
    hubMaterial.disableLighting = true; hubMaterial.emissiveColor = new Color3(1, 1, 1);
    this.hubOrb.material = hubMaterial; this.hubOrb.isPickable = false;
    for (const node of nodes) {
      const color = Color3.FromHexString(node.color);
      const path = this.arc(hub, node.position);
      const length = path.reduce((sum, p, i) => i ? sum + Vector3.Distance(p, path[i - 1]) : 0, 0);
      const tube = MeshBuilder.CreateTube(`energy-flow-${node.id}`, { path, radius: .006 * u, tessellation: 6, updatable: true }, this.scene);
      // Own texture per line: each scrolls at its consumer's speed (a clone would come without its image).
      const dash = this.dash(`energy-dash-${node.id}`);
      dash.uScale = Math.max(1, length / u * 3);
      const material = new StandardMaterial(`energy-flow-mat-${node.id}`, this.scene);
      // Colour from the room, the moving pulse only in the transparency.
      material.disableLighting = true; material.emissiveColor = color; material.diffuseColor = Color3.Black();
      material.opacityTexture = dash; material.alpha = .9; material.backFaceCulling = false;
      tube.material = material; tube.isPickable = false;
      const orb = MeshBuilder.CreateSphere(`energy-orb-${node.id}`, { diameter: 1, segments: 12 }, this.scene);
      orb.position.copyFrom(node.position);
      const orbMaterial = new StandardMaterial(`energy-orb-mat-${node.id}`, this.scene);
      orbMaterial.disableLighting = true; orbMaterial.emissiveColor = color;
      orb.material = orbMaterial; orb.isPickable = false;
      const halo = MeshBuilder.CreatePlane(`energy-halo-${node.id}`, { size: 1 }, this.scene);
      halo.parent = orb; halo.billboardMode = Mesh.BILLBOARDMODE_ALL; halo.isPickable = false;
      const haloMaterial = new StandardMaterial(`energy-halo-mat-${node.id}`, this.scene);
      haloMaterial.disableLighting = true; haloMaterial.emissiveColor = color; haloMaterial.opacityTexture = this.haloTexture;
      haloMaterial.alphaMode = 1; // additive glow
      halo.material = haloMaterial;
      for (const mesh of [tube, orb, halo]) mesh.metadata = { ...mesh.metadata, energyFlow: true };
      this.flows.push({ node, tube, orb, halo, dash, material, orbMaterial, length, watts: 0, share: 0, path });
      this.applySize(this.flows[this.flows.length - 1]);
    }
  }

  /** New power readings: orb size, line thickness and brightness follow each consumer's share. */
  update(readings: Map<string, { watts: number; share: number }>): void {
    for (const flow of this.flows) {
      const reading = readings.get(flow.node.id) ?? { watts: 0, share: 0 };
      const changed = Math.abs(reading.share - flow.share) > .005 || (reading.watts >= 1) !== (flow.watts >= 1);
      flow.watts = reading.watts; flow.share = reading.share;
      if (changed) this.applySize(flow);
    }
  }

  private applySize(flow: Flow): void {
    const u = this.unit, on = flow.watts >= 1, s = Math.sqrt(flow.share);
    const radius = on ? (.014 + .05 * s) * u : .006 * u;
    MeshBuilder.CreateTube(flow.tube.name, { path: flow.path, radius, tessellation: 6, instance: flow.tube });
    flow.material.alpha = on ? .7 + .3 * s : .3;
    const diameter = on ? (.16 + .4 * s) * u : .08 * u;
    flow.orb.scaling.setAll(diameter);
    flow.orbMaterial.alpha = on ? 1 : .45;
    flow.halo.setEnabled(on);
    (flow.halo.material as StandardMaterial).alpha = .5 + .5 * s;
    // The halo plane lives in the orb's space: three times the orb.
    flow.halo.scaling.setAll(3);
  }

  /** A bright pulse on a faint line: scrolling it makes the power travel. */
  private dash(name: string): DynamicTexture {
    const texture = new DynamicTexture(name, { width: 64, height: 4 }, this.scene, false);
    const context = texture.getContext() as unknown as CanvasRenderingContext2D;
    const stripe = context.createLinearGradient(0, 0, 64, 0);
    stripe.addColorStop(0, 'rgba(255,255,255,.25)'); stripe.addColorStop(.55, 'rgba(255,255,255,1)'); stripe.addColorStop(.7, 'rgba(255,255,255,.25)'); stripe.addColorStop(1, 'rgba(255,255,255,.25)');
    context.fillStyle = stripe; context.fillRect(0, 0, 64, 4);
    texture.hasAlpha = true; texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.update();
    return texture;
  }

  /** A curve from the supply up over the rooms and down to the consumer. */
  private arc(from: Vector3, to: Vector3): Vector3[] {
    const mid = Vector3.Lerp(from, to, .5);
    // A flat arc over the furniture: reads as a flow map from above.
    const lift = Math.min(1 * this.unit, .3 * this.unit + Vector3.Distance(from, to) * .08);
    mid.y = Math.max(from.y, to.y) + lift;
    const points: Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      points.push(new Vector3(a * from.x + b * mid.x + c * to.x, a * from.y + b * mid.y + c * to.y, a * from.z + b * mid.z + c * to.z));
    }
    return points;
  }

  private clear(): void {
    for (const flow of this.flows) {
      flow.halo.material?.dispose(); flow.halo.dispose();
      flow.orb.dispose(); flow.orbMaterial.dispose();
      flow.tube.dispose(); flow.material.dispose(); flow.dash.dispose();
    }
    this.flows = [];
    if (this.hubOrb) { this.hubOrb.material?.dispose(); this.hubOrb.dispose(); this.hubOrb = null; }
  }

  dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    this.clear();
    this.haloTexture.dispose();
    this.scene.metadata = { ...this.scene.metadata, energyAnimating: false };
  }
}
