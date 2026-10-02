/**
 * Energy data for the day demo: an energy dashboard as Home Assistant would
 * report it (consumers, registry, statistics), built from the devices the model
 * actually contains. The amounts are typical rounded values of a real flat
 * (a week: the PC far ahead, then desk, washing machine, fridge …); lamp groups
 * per room follow the demo's lights live.
 */
import type { AppConfig, HAState } from '../../types';
import { deviceKinds } from '../energyFlow';
import { roomRole, type RoomRole } from './cast';

type Lang = 'de' | 'en';
interface Device { kind: string; de: string; en: string; week: number; watts: number }

const DEVICES: Device[] = [
  { kind: 'pc', de: 'PC', en: 'PC', week: 40, watts: 64 },
  { kind: 'desk', de: 'Schreibtisch', en: 'Desk', week: 5.8, watts: 14 },
  { kind: 'washer', de: 'Waschmaschine', en: 'Washing machine', week: 5.1, watts: .4 },
  { kind: 'fridge', de: 'Kühlschrank', en: 'Fridge', week: 4.6, watts: 74 },
  { kind: 'dryer', de: 'Trockner', en: 'Dryer', week: 3.4, watts: .3 },
  { kind: 'tv', de: 'Fernseher', en: 'TV', week: 3.2, watts: 96 },
  { kind: 'nas', de: 'NAS', en: 'NAS', week: 3.1, watts: 19 },
  { kind: 'coffee', de: 'Kaffeemaschine', en: 'Coffee machine', week: 1.1, watts: 1.5 },
];
const LIGHT_ROOMS: { role: RoomRole; de: string; en: string; week: number }[] = [
  { role: 'living', de: 'Licht Wohnzimmer', en: 'Lights living room', week: 2.6 },
  { role: 'kitchen', de: 'Licht Küche', en: 'Lights kitchen', week: 1.2 },
  { role: 'dining', de: 'Licht Essbereich', en: 'Lights dining', week: .8 },
  { role: 'bedroom', de: 'Licht Schlafzimmer', en: 'Lights bedroom', week: .7 },
  { role: 'office', de: 'Licht Büro', en: 'Lights office', week: .6 },
  { role: 'hall', de: 'Licht Flur', en: 'Lights hall', week: .5 },
  { role: 'bath', de: 'Licht Bad', en: 'Lights bathroom', week: .4 },
];
/** Synthetic sensor ids of the demo (assembled: not real entities of any installation). */
const sensor = (name: string) => ['sensor', `demo_${name}`].join('.');
/** Watts of a lamp at full brightness (estimated, like PowerCalc) and while off (standby). */
const LAMP_WATTS = 8, LAMP_STANDBY = .4;

export interface DemoEnergy {
  /** Answers the energy view's Home Assistant requests (prefs, registry, statistics). */
  request(message: Record<string, unknown>): unknown;
  /** Current power of every consumer, as sensor states (lamp groups from the lights' states). */
  powerStates(states: (entityId: string) => HAState | undefined): { entityId: string; watts: number }[];
}

export function buildDemoEnergy(config: AppConfig, lights: { entityId: string; room: RoomRole }[], lang: Lang): DemoEnergy {
  const objects = config.model?.floorplan?.objects ?? [];
  // HA areas of the floorplan objects; objects without one get an area named after their room.
  const areaOf = (o: { haAreaId?: string; room?: string }) => o.haAreaId || (o.room ? `demo_${o.room.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_')}` : undefined);
  const areas = new Map<string, string>();
  for (const o of objects) { const id = areaOf(o); if (id && !areas.has(id)) areas.set(id, o.room || id); }
  const areaOfRole = (role: RoomRole) => [...areas].find(([, name]) => roomRole(name) === role)?.[0];

  const items: { id: string; power: string; device: string; name: string; area?: string; week: number; watts: number; lamps?: string[] }[] = [];
  for (const d of DEVICES) {
    // Only what the model contains (found by its label, as the energy view places it).
    const object = objects.find(o => deviceKinds(`${o.label} ${o.id}`).has(d.kind));
    if (!object) continue;
    items.push({ id: sensor(`${d.kind}_energy`), power: sensor(`${d.kind}_power`), device: `demo-${d.kind}`, name: d[lang], area: areaOf(object), week: d.week, watts: d.watts });
  }
  for (const room of LIGHT_ROOMS) {
    const lamps = lights.filter(l => l.room === room.role).map(l => l.entityId);
    if (!lamps.length) continue;
    items.push({ id: sensor(`light_${room.role}_energy`), power: sensor(`light_${room.role}_power`), device: '', name: room[lang], area: areaOfRole(room.role), week: room.week, watts: 0, lamps });
  }

  const statistics = (message: Record<string, unknown>) => {
    // The energy of the requested period: the weekly amount spread evenly over the days.
    const start = new Date(String(message.start_time ?? '')).getTime();
    const days = Number.isFinite(start) ? Math.max(.05, (Date.now() - start) / 86_400_000) : 1;
    const ids = new Set((message.statistic_ids as string[] | undefined) ?? []);
    return Object.fromEntries(items.filter(i => ids.has(i.id)).map(i => [i.id, [{ change: Math.round(i.week / 7 * days * 100) / 100 }]]));
  };

  return {
    request(message) {
      switch (message.type) {
        case 'energy/get_prefs': return { device_consumption: items.map(i => ({ stat_consumption: i.id, stat_rate: i.power, name: i.name })) };
        case 'config/entity_registry/list':
          return items.flatMap(i => [
            { entity_id: i.id, device_id: i.device || null, area_id: i.device ? null : i.area ?? null, platform: i.lamps ? 'powercalc' : 'demo' },
            { entity_id: i.power, device_id: i.device || null, area_id: i.device ? null : i.area ?? null, platform: i.lamps ? 'powercalc' : 'demo' },
          ]);
        case 'config/device_registry/list': return items.filter(i => i.device).map(i => ({ id: i.device, name: i.name, name_by_user: null, area_id: i.area ?? null }));
        case 'config/area_registry/list': return [...areas].map(([area_id, name]) => ({ area_id, name }));
        case 'recorder/statistics_during_period': return statistics(message);
        default: return {};
      }
    },
    powerStates(state) {
      return items.map(i => {
        if (!i.lamps) return { entityId: i.power, watts: i.watts };
        const watts = i.lamps.reduce((sum, id) => {
          const s = state(id);
          if (s?.state !== 'on') return sum + LAMP_STANDBY;
          const brightness = Number(s.attributes.brightness ?? 255) / 255;
          return sum + LAMP_STANDBY + LAMP_WATTS * brightness;
        }, 0);
        return { entityId: i.power, watts: Math.round(watts * 10) / 10 };
      });
    },
  };
}
