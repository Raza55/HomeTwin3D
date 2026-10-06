/**
 * Day demo cast: which configured devices play which part in the story.
 * Rooms come from labels, entity IDs, floorplan rooms and room zones, so the
 * demo works with any installation (and quietly skips what is missing).
 */
import type { AppConfig, DisplayConfig, FloorplanObject, ITDevice, LightType, RoomConfig } from '../../types';
import { tvMediaRoute, type TVMediaRoute } from '../tvMedia.ts';

export type RoomRole = 'bedroom' | 'bath' | 'kitchen' | 'dining' | 'living' | 'hall' | 'office' | 'outdoor' | 'other';

const ROOM_PATTERNS: [RoomRole, RegExp][] = [
  ['outdoor', /balkon|terrass|patio|garten|garden|balcon|au(ß|ss)en|outdoor|loggia|hof\b|courtyard/],
  ['bath', /\bbad|badezimmer|bath|\bwc\b|toilet|dusch|shower|g(ä|ae)ste-?wc/],
  ['kitchen', /k(ü|ue)che|kitchen|\bkoch|herd|sp(ü|ue)le|sink|dunstabzug|hood/],
  ['dining', /esszimmer|esstisch|essbereich|dining|\bess\b|table/],
  ['office', /b(ü|ue)ro|office|arbeitszimmer|schreibtisch|\bdesk|studio|gaming|\bpc\b|computer/],
  ['bedroom', /schlaf|bedroom|\bbed\b|\bbett|nachttisch|master/],
  ['hall', /flur|diele|\bhall|korridor|corridor|eingang|entrance|garderobe|treppe|stair/],
  ['living', /wohn|living|sofa|couch|lounge|\btv\b|fernseh|hue ?play|gradient|stehlampe/],
];

export function roomRole(...texts: (string | undefined)[]): RoomRole {
  const text = texts.filter(Boolean).join(' ').toLowerCase().replace(/[_.]/g, ' ');
  for (const [role, pattern] of ROOM_PATTERNS) if (pattern.test(text)) return role;
  return 'other';
}

export interface CastLight {
  entityId: string; label: string; type: LightType; room: RoomRole;
  dim: boolean; temp: boolean; color: boolean;
}
export interface CastCoffee { entityId: string; ids: NonNullable<FloorplanObject['coffee']>; objectId?: string }
export interface CastPC { device: ITDevice; room: RoomRole; /** Floorplan object that hosts the PC. */ objectId: string }
export interface CastDoor { entityId: string; kind: 'entrance' | 'balcony' | 'window' | 'other'; label: string; objectId?: string }
export interface CastAppliance {
  entityId: string; kind: 'washer' | 'dryer'; runningState?: string; power: boolean; remainingEntityId?: string; objectId?: string;
  /** Sensor on the appliance's panel display (when it has no remaining-time sensor): the demo counts down there. */
  displayEntityId?: string;
}
export interface CastEntity { entityId: string; label: string; room: RoomRole; /** Blind config id (its meshes are named after it). */ id?: string }

export interface DayDemoCast {
  lights: CastLight[];
  blinds: CastEntity[];
  tvRoutes: TVMediaRoute[];
  /** Plain media players behind TV displays without a routed receiver. */
  tvPlayers: string[];
  pcs: CastPC[];
  coffee: CastCoffee[];
  echos: CastEntity[];
  doors: CastDoor[];
  locks: string[];
  fans: CastEntity[];
  vacuums: string[];
  appliances: CastAppliance[];
}

type XZ = { x: number; z: number };

function insidePolygon(point: XZ, polygon: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Room whose floor zone contains the point (model coordinates). */
export function roomAt(rooms: RoomConfig[] | undefined, point: XZ): RoomConfig | undefined {
  for (const room of rooms ?? []) {
    const { anchor, zone } = room;
    const angle = -(zone.rotationY ?? 0) * Math.PI / 180;
    const dx = point.x - anchor.x, dz = point.z - anchor.z;
    const local = { x: dx * Math.cos(angle) - dz * Math.sin(angle), z: dx * Math.sin(angle) + dz * Math.cos(angle) };
    const hit = zone.points && zone.points.length >= 3
      ? insidePolygon(local, zone.points)
      : Math.abs(local.x) <= zone.width / 2 && Math.abs(local.z) <= zone.depth / 2;
    if (hit) return room;
  }
  return undefined;
}

const domainOf = (entityId: string) => entityId.split('.')[0];

export function buildCast(config: AppConfig, extraDisplays: DisplayConfig[] = []): DayDemoCast {
  const objects = config.model?.floorplan?.objects ?? [];
  const byId = new Map(objects.map(o => [o.id, o]));
  const objectRoom = (o: FloorplanObject) => roomRole(o.room, o.label, o.entityId,
    roomAt(config.rooms, o.position)?.name);

  const lights: CastLight[] = [];
  for (const light of config.lights ?? []) {
    if (!light.entityId?.startsWith('light.') || light.type === 'remote') continue;
    const planObjects = (light.floorplanIds ?? []).map(id => byId.get(id)).filter((o): o is FloorplanObject => !!o);
    const zone = roomAt(config.rooms, (planObjects[0] ?? light).position);
    const room = roomRole(light.label, light.entityId, zone?.name, ...planObjects.map(o => `${o.room ?? ''} ${o.label}`));
    lights.push({
      entityId: light.entityId, label: light.label || light.entityId, type: light.type, room,
      dim: light.type !== 'toggle',
      temp: ['warmCold', 'rgbw', 'rgb', 'nanoleafShapes'].includes(light.type),
      color: ['rgb', 'rgbw', 'nanoleafShapes'].includes(light.type),
    });
  }

  const blinds = new Map<string, CastEntity>();
  for (const blind of config.blinds ?? []) {
    const plan = (blind.floorplanIds ?? []).map(id => byId.get(id)).find(Boolean);
    blinds.set(blind.entityId, { id: blind.id, entityId: blind.entityId, label: blind.label, room: roomRole(blind.label, blind.entityId, plan?.room, roomAt(config.rooms, blind.position)?.name) });
  }
  for (const o of objects) if (o.domain === 'cover' && o.entityId && !blinds.has(o.entityId)) {
    blinds.set(o.entityId, { entityId: o.entityId, label: o.label, room: objectRoom(o) });
  }

  const tvRoutes: TVMediaRoute[] = [];
  const tvPlayers: string[] = [];
  for (const display of [...(config.displays ?? []), ...extraDisplays]) {
    if (display.kind !== 'tv') continue;
    const route = tvMediaRoute(display);
    if (route) {
      if (!tvRoutes.some(r => r.television === route.television)) tvRoutes.push(route);
    } else {
      const player = display.sources.find(s => s.entityId.startsWith('media_player.'))?.entityId;
      if (player && !tvPlayers.includes(player)) tvPlayers.push(player);
    }
  }

  const pcs: CastPC[] = [];
  const coffee: CastCoffee[] = [];
  const echos: CastEntity[] = [];
  const doors: CastDoor[] = [];
  const locks = new Set<string>();
  const fans = new Map<string, CastEntity>();
  const vacuums = new Set<string>();
  const appliances = new Map<string, CastAppliance>();

  for (const o of objects) {
    if (o.it) for (const device of o.it.devices) {
      if (device.kind === 'pc' && device.statusEntityId) pcs.push({ device, room: objectRoom(o), objectId: o.id });
    }
    if (o.coffee && o.entityId) coffee.push({ entityId: o.entityId, ids: o.coffee, objectId: o.id });
    if (o.echo && o.entityId) echos.push({ entityId: o.entityId, label: o.label, room: objectRoom(o) });
    if (o.door && o.entityId) {
      const text = `${o.label} ${o.room ?? ''} ${o.entityId}`.toLowerCase();
      const kind = o.door.kind === 'entrance' ? 'entrance' : /balkon|balcon|terrass|patio|garten/.test(text) || objectRoom(o) === 'outdoor' ? 'balcony'
        : /fenster|window/.test(text) ? 'window' : 'other';
      doors.push({ entityId: o.entityId, kind, label: o.label, objectId: o.id });
    }
    if (o.doorLock && o.entityId) locks.add(o.entityId);
    if (o.domain === 'lock' && o.entityId) locks.add(o.entityId);
    if (o.domain === 'fan' && o.entityId) fans.set(o.entityId, { entityId: o.entityId, label: o.label, room: objectRoom(o) });
    if (o.domain === 'vacuum' && o.entityId) vacuums.add(o.entityId);
    if (o.appliance && o.entityId) appliances.set(o.entityId, {
      objectId: o.id, entityId: o.entityId, kind: o.appliance.kind, runningState: o.appliance.runningStates?.[0],
      power: domainOf(o.entityId) === 'sensor' && (o.appliance.powerThreshold !== undefined || /power|leistung|watt/.test(o.entityId)),
      remainingEntityId: o.appliance.remainingEntityId,
    });
  }
  // Doors without a balcony hint still serve as "the balcony door" when there is no better one.
  if (!doors.some(d => d.kind === 'balcony')) {
    const other = doors.find(d => d.kind === 'other');
    if (other) other.kind = 'balcony';
  }

  for (const device of config.smartDevices ?? []) {
    if (!device.entityId) continue;
    const room = roomRole(device.label, device.entityId, roomAt(config.rooms, device.position)?.name);
    if (device.type === 'vacuum' || domainOf(device.entityId) === 'vacuum') vacuums.add(device.entityId);
    else if (device.type === 'fan' || domainOf(device.entityId) === 'fan') fans.set(device.entityId, { entityId: device.entityId, label: device.label, room });
    if (device.appliance && !appliances.has(device.entityId)) appliances.set(device.entityId, {
      entityId: device.entityId, kind: device.appliance.kind, runningState: device.appliance.runningStates?.[0],
      power: domainOf(device.entityId) === 'sensor' && device.appliance.powerThreshold !== undefined, remainingEntityId: device.appliance.remainingEntityId,
    });
  }
  // Panel displays named after the appliance ("… Trockner Display").
  for (const appliance of appliances.values()) {
    if (appliance.remainingEntityId) continue;
    const name = appliance.kind === 'washer' ? /wasch|washer/i : /trock|dryer/i;
    const display = (config.displays ?? []).find(d => !d.kind && name.test(d.label) && d.sources?.[0]?.entityId);
    if (display) appliance.displayEntityId = display.sources[0].entityId;
  }
  for (const light of config.lights ?? []) {
    if (light.doubleTapEntityId?.startsWith('fan.') && !fans.has(light.doubleTapEntityId)) {
      fans.set(light.doubleTapEntityId, { entityId: light.doubleTapEntityId, label: light.label, room: roomRole(light.label, light.entityId) });
    }
  }

  return {
    lights, blinds: [...blinds.values()], tvRoutes, tvPlayers, pcs, coffee, echos, doors,
    locks: [...locks], fans: [...fans.values()], vacuums: [...vacuums], appliances: [...appliances.values()],
  };
}

/** Every entity the demo may write, for seeding and for "what does this installation offer". */
export function castSummary(cast: DayDemoCast): Record<string, number> {
  return {
    lights: cast.lights.length, blinds: cast.blinds.length, tv: cast.tvRoutes.length + cast.tvPlayers.length,
    pc: cast.pcs.length, coffee: cast.coffee.length, echo: cast.echos.length, doors: cast.doors.length,
    locks: cast.locks.length, fans: cast.fans.length, vacuums: cast.vacuums.length, appliances: cast.appliances.length,
  };
}
