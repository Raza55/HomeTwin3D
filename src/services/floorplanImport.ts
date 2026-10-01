import { validateIT } from './itState.ts';
import type { AppConfig, FloorplanBinding, FloorplanManifest, FloorplanObject, LightConfig } from '../types';

const domains = new Set(['light', 'cover', 'switch', 'fan', 'vacuum', 'media_player', 'sensor', 'binary_sensor', 'button', 'climate', 'lock']);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function validateManifest(value: unknown): FloorplanManifest {
  const m = value as FloorplanManifest;
  if (!m || m.version !== 1 || m.coordinateSystem !== 'babylon-lh-meters' || typeof m.source !== 'string' || !Array.isArray(m.objects) || m.objects.length > 10000) {
    throw new Error('Ungültiges oder nicht unterstütztes Blender-Manifest.');
  }
  const ids = new Set<string>();
  for (const o of m.objects) {
    if (!o || typeof o.id !== 'string' || !o.id || ids.has(o.id) || typeof o.label !== 'string' || !domains.has(o.domain)
      || typeof o.entityId !== 'string' || (o.entityId && !new RegExp(`^${o.appliance ? '(sensor|binary_sensor|switch|input_boolean)' : o.domain}\\.[a-z0-9_]+$`).test(o.entityId))
      || (o.room !== undefined && typeof o.room !== 'string')
      || (o.lightType !== undefined && !['toggle', 'dimmeable', 'warmCold', 'rgb', 'rgbw', 'remote', 'nanoleafShapes'].includes(o.lightType))
      || !o.position || ![o.position.x, o.position.y, o.position.z, o.rotationY].every(finite)
      || !o.size || ![o.size.width, o.size.height, o.size.depth].every(v => finite(v) && v > 0 && v < 1000)) {
      throw new Error('Ungültiges Blender-Objekt oder doppelte Objektkennung.');
    }
    if (o.appliance && (!['washer','dryer'].includes(o.appliance.kind)
      || (o.appliance.powerThreshold !== undefined && (!finite(o.appliance.powerThreshold) || o.appliance.powerThreshold < 0))
      || (o.appliance.runningStates !== undefined && (!Array.isArray(o.appliance.runningStates) || o.appliance.runningStates.some(s => typeof s !== 'string'))))) throw new Error('Invalid appliance settings');
    if (o.appliance && [o.appliance.remainingEntityId,o.appliance.programEntityId].some(id=>id !== undefined && id !== '' && !/^(sensor|select)\.[a-z0-9_]+$/.test(id))) throw new Error('Invalid appliance detail entity');
    if (o.door && (o.domain !== 'binary_sensor' || !['double', 'single', 'entrance'].includes(o.door.kind) || (o.door.tiltOnly !== undefined && typeof o.door.tiltOnly !== 'boolean') || o.appliance)) throw new Error('Ungültige Tür-Einstellungen.');
    if (o.doorLock && (o.domain !== 'lock' || typeof o.doorLock.doorId !== 'string' || !o.doorLock.doorId || o.door || o.appliance)) throw new Error('Invalid door lock mapping.');
    if (o.statusIndicator && (!['sensor', 'binary_sensor'].includes(o.domain) || o.statusIndicator.kind !== 'smoke'
      || !Array.isArray(o.statusIndicator.activeStates) || !o.statusIndicator.activeStates.length
      || o.statusIndicator.activeStates.some(s => typeof s !== 'string' || !s.trim() || ['unknown', 'unavailable'].includes(s.trim().toLowerCase())))) throw new Error('Ungültige Statusanzeige.');
    if (o.it) validateIT(o.it);
    if (o.coffee) {
      const domains = { statusEntityId: 'sensor', activeProgramEntityId: 'select', remainingEntityId: 'sensor', progressEntityId: 'sensor', remoteStartEntityId: 'binary_sensor', connectivityEntityId: 'binary_sensor', localControlEntityId: 'binary_sensor', stopEntityId: 'button' };
      if (o.domain !== 'switch' || Object.entries(domains).some(([key, domain]) => typeof o.coffee![key as keyof NonNullable<typeof o.coffee>] !== 'string' || !new RegExp(`^${domain}\\.[a-z0-9_]+$`).test(o.coffee![key as keyof NonNullable<typeof o.coffee>]))) throw new Error('Ungültige Kaffeemaschinen-Entitäten.');
    }
    if (o.echo && (o.domain !== 'media_player' || !['dot', 'show'].includes(o.echo.kind))) throw new Error('Ungültiges Echo-Gerät.');
    ids.add(o.id);
    if (o.haAreaId !== undefined && typeof o.haAreaId !== 'string') throw new Error('Ungültige HA-Raumkennung.');
    if (o.lightCalibration && Object.entries(o.lightCalibration).some(([key,v]) => !['lumens','range'].includes(key) || !finite(v) || v <= 0 || v > (key === 'range' ? 100 : 100000))) throw new Error('Ungültige Lichtkalibrierung.');
    if (o.emitters !== undefined) {
      if (!Array.isArray(o.emitters) || o.emitters.length > 32) throw new Error('Ungültige Lichtquellen.');
      for (const e of o.emitters) {
        if (!e || !['point', 'spot'].includes(e.kind) || !e.position || ![e.position.x,e.position.y,e.position.z].every(finite)
          || !finite(e.lumens) || e.lumens <= 0 || e.lumens > 100000 || !finite(e.range) || e.range <= 0 || e.range > 100
          || (e.radius !== undefined && (!finite(e.radius) || e.radius < 0 || e.radius > 5))
          || (e.kind === 'spot' && (!e.direction || ![e.direction.x,e.direction.y,e.direction.z].every(finite)
            || Math.hypot(e.direction.x,e.direction.y,e.direction.z) < .9 || Math.hypot(e.direction.x,e.direction.y,e.direction.z) > 1.1
            || !finite(e.angle) || e.angle < 1 || e.angle >= 180))) throw new Error('Ungültige Position, Richtung oder Lichtleistung.');
      }
    }
  }
  return structuredClone(m);
}

/** Read only the JSON chunk; never decode or copy the (potentially huge) geometry buffer. */
export async function readFloorplanManifest(blob: Blob): Promise<FloorplanManifest | undefined> {
  const header = new DataView(await blob.slice(0, 20).arrayBuffer());
  if (header.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2
    || header.getUint32(8, true) !== blob.size || header.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error('Keine gültige GLB-2.0-Datei. Bitte in Blender als 3Dash GLB exportieren.');
  }
  const size = header.getUint32(12, true);
  if (size > 32 * 1024 * 1024 || size + 20 > blob.size) throw new Error('Ungültiger GLB-JSON-Block.');
  const gltf = JSON.parse(await blob.slice(20, 20 + size).text());
  const raw = gltf.scenes?.[gltf.scene ?? 0]?.extras?.['3dash_manifest'];
  if (raw === undefined) return undefined;
  return validateManifest(typeof raw === 'string' ? JSON.parse(raw) : raw);
}

/** Capture current decisions without dropping objects absent from the current plan. */
export function collectFloorplanBindings(config: AppConfig): FloorplanBinding[] {
  const saved = new Map((config.floorplanBindings ?? []).map(b => [b.id, b]));
  for (const o of config.model?.floorplan?.objects ?? []) {
    const { id, label, domain, entityId, haAreaId, lightCalibration, lightType, appliance, door, doorLock, statusIndicator, echo, coffee, it } = o;
    // A reused ID with a different device domain must never erase the old relationship.
    if (saved.has(id) && saved.get(id)!.domain !== domain) continue;
    saved.set(id, { id, label, domain, entityId, haAreaId, lightCalibration, lightType, appliance, door, doorLock, statusIndicator, echo, coffee, it });
  }
  return structuredClone([...saved.values()]);
}

export function exportFloorplanBindings(config: AppConfig): string {
  return JSON.stringify({ schema: '3dash-bindings', version: 1, bindings: collectFloorplanBindings(config) }, null, 2);
}

export function importFloorplanBindings(config: AppConfig, value: unknown): AppConfig {
  const file = value as { schema?: string; version?: number; bindings?: FloorplanBinding[] };
  if (!file || file.schema !== '3dash-bindings' || file.version !== 1 || !Array.isArray(file.bindings)) throw new Error('Keine gültige 3Dash-Zuordnungsdatei.');
  // Reuse the strict domain, ID, entity and calibration validation; geometry is not stored.
  const checked = validateManifest({ version: 1, source: 'bindings', coordinateSystem: 'babylon-lh-meters',
    objects: file.bindings.map(b => ({ ...b, position: { x: 0, y: 0, z: 0 }, size: { width: 1, height: 1, depth: 1 }, rotationY: 0, emitters: undefined })) });
  const saved = new Map(collectFloorplanBindings(config).map(b => [b.id, b]));
  for (const b of checked.objects) {
    if (saved.has(b.id) && saved.get(b.id)!.domain !== b.domain) throw new Error(`Objektkennung ${b.id} hat einen anderen Gerätetyp.`);
    const { id, label, domain, entityId, haAreaId, lightCalibration, lightType, appliance, door, doorLock, statusIndicator, echo, coffee, it } = b;
    saved.set(id, { id, label, domain, entityId, haAreaId, lightCalibration, lightType, appliance, door, doorLock, statusIndicator, echo, coffee, it });
  }
  const next = { ...config, floorplanBindings: [...saved.values()], model: { ...config.model, floorplan: undefined } };
  return mergeFloorplan(next, config.model?.floorplan);
}

/** Reimport follows stable Blender IDs, including relationships from older/removed plans. */
export function mergeFloorplan(config: AppConfig, manifest?: FloorplanManifest): AppConfig {
  const previous = new Map(collectFloorplanBindings(config).map(o => [o.id, o]));
  const next = manifest ? structuredClone(manifest) : undefined;
  next?.objects.forEach(o => {
    const old = previous.get(o.id);
    if (!old) return;
    if (old.domain !== o.domain) { o.entityId = ''; return; }
    o.entityId = old.entityId; o.haAreaId = old.haAreaId; o.lightCalibration = old.lightCalibration;
    o.lightType = old.lightType ?? o.lightType;
    o.appliance = old.appliance ?? o.appliance;
    o.coffee = old.coffee ?? o.coffee;
    if (old.it) {
      const modelDevices = o.it?.devices;
      o.it = { ...old.it, devices: old.it.devices.map(device => {
        const model = modelDevices?.find(d => d.id === device.id);
        // Bindings belong to the user; material names belong to the new geometry.
        return model ? { ...device, screenMaterials: model.screenMaterials, rgbMaterials: model.rgbMaterials } : device;
      }) };
    }
    if (o.emitters?.length && o.lightCalibration) {
      const total = o.emitters.reduce((sum,e) => sum+e.lumens,0);
      o.emitters = o.emitters.map(e => ({ ...e, lumens: o.lightCalibration!.lumens ? e.lumens * o.lightCalibration!.lumens / total : e.lumens, range: o.lightCalibration!.range ?? e.range }));
    }
  });
  return applyFloorplanMappings(config, next);
}

export function applyFloorplanMappings(config: AppConfig, manifest?: FloorplanManifest): AppConfig {
  if (manifest) validateManifest(manifest);
  const next = structuredClone(config);
  next.floorplanBindings = collectFloorplanBindings(config);
  next.lights = next.lights.filter(o => !o.floorplanIds?.length);
  next.blinds = (next.blinds ?? []).filter(o => !o.floorplanIds?.length);
  next.smartDevices = (next.smartDevices ?? []).filter(o => !o.floorplanIds?.length);
  next.displays = (next.displays ?? []).filter(o => !o.floorplanIds?.length);
  next.model = { ...next.model, floorplan: manifest };
  next.floorplanBindings = collectFloorplanBindings(next);
  const byEntity = new Map<string, FloorplanObject[]>();
  for (const o of manifest?.objects ?? []) {
    if (o.entityId) byEntity.set(o.entityId, [...(byEntity.get(o.entityId) ?? []), o]);
  }
  for (const [entityId, objects] of byEntity) {
    const o = objects[0];
    if (o.domain === 'cover' && objects.length > 1) throw new Error(`Rollo-Entity ${entityId} ist mehrfach zugeordnet. Bitte einzelne Cover verwenden.`);
    const common = { entityId, label: o.label, position: o.position, floorplanIds: objects.map(x => x.id) };
    // A manually placed control for this entity remains authoritative.
    if (o.domain === 'light' && !next.lights.some(l => l.entityId === entityId)) {
      const old = config.lights.find(l => l.floorplanIds?.some(id => common.floorplanIds.includes(id)));
      const light: LightConfig = { ...old, ...common, type: o.lightType ?? old?.type ?? 'toggle', shape: 'sphere', size: { diameter: 0.08 },
        emitters: objects.flatMap(x => x.emitters ?? []),
        fixtureStyle: 'none', interaction: { touchZone: true, showIcon: true },
        parts: objects.length > 1 ? objects.map(x => ({ position: x.position, shape: 'sphere', size: { diameter: 0.08 } })) : undefined };
      next.lights.push(light);
    } else if (o.domain === 'cover' && !next.blinds.some(b => b.entityId === entityId)) {
      next.blinds.push({ ...common, id: `blender:${o.id}`, size: o.size, rotationY: o.rotationY });
    } else if (o.door || o.doorLock || o.statusIndicator || o.it) {
      // Contact-only visualisation is handled by DoorMarkers, with no device commands.
      continue;
    } else if (o.appliance) {
      next.smartDevices.push({ ...common, id: `blender:${o.id}`, group: 'cleaning', type: 'generic', action: 'none', appliance: o.appliance });
    } else if (['sensor', 'binary_sensor', 'climate'].includes(o.domain)) {
      if (!next.displays.some(d => d.sources.some(s => s.entityId === entityId))) next.displays.push({
        id: `blender:${o.id}`, label: o.label, floorplanIds: common.floorplanIds,
        sources: [{ entityId }], position: { ...o.position, z: o.position.z + .02 }, normal: { x: 0, y: 0, z: 1 },
        width: Math.max(.35, o.size.width), height: Math.max(.15, o.size.height), clickable: true,
      });
    } else if (o.domain !== 'light' && o.domain !== 'cover' && !next.smartDevices.some(d => d.entityId === entityId)) {
      next.smartDevices.push({ ...common, id: `blender:${o.id}`, group: 'other',
        type: o.domain === 'vacuum' ? 'vacuum' : o.domain === 'fan' ? 'fan' : o.domain === 'media_player' ? 'speaker' : 'generic',
        action: o.domain === 'vacuum' ? 'start' : o.domain === 'button' ? 'press' : ['switch', 'fan', 'media_player'].includes(o.domain) ? 'toggle' : 'none' });
    }
  }
  return next;
}
