/**
 * Energy flow: the consumers of Home Assistant's energy dashboard
 * (`energy/get_prefs` → device_consumption), each with its live power sensor
 * and its area. Nothing is configured in the board: the list, names, rooms and
 * power sensors are read from Home Assistant at runtime.
 */
import type { HAState } from '../types';

export interface EnergyConsumer {
  /** The energy statistic (kWh) from the energy dashboard. */
  id: string;
  name: string;
  /** Live power sensor (W): the dashboard's `stat_rate`, else a power sensor of the same device. */
  powerEntityId?: string;
  deviceId?: string;
  areaId?: string;
  /** Parent meter this consumer is part of (energy dashboard `included_in_stat`). */
  includedIn?: string;
}

interface Prefs { device_consumption?: { stat_consumption: string; stat_rate?: string; name?: string; included_in_stat?: string }[] }
interface EntityEntry { entity_id: string; device_id?: string | null; area_id?: string | null; name?: string | null; original_name?: string | null; disabled_by?: string | null }
interface DeviceEntry { id: string; area_id?: string | null; name?: string | null; name_by_user?: string | null }

export interface EnergyRegistry {
  entities: EntityEntry[];
  devices: DeviceEntry[];
  areas: { area_id: string; name: string }[];
}

interface Requester { request(message: Record<string, unknown>): Promise<unknown> }

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

/** Reads the energy dashboard and the registries (read-only). Empty without an energy dashboard. */
export async function loadEnergyConsumers(ha: Requester, states: Record<string, HAState>): Promise<{ consumers: EnergyConsumer[]; registry: EnergyRegistry }> {
  const [prefs, entities, devices, areas] = await Promise.all([
    ha.request({ type: 'energy/get_prefs' }).catch(() => ({})),
    ha.request({ type: 'config/entity_registry/list' }).catch(() => []),
    ha.request({ type: 'config/device_registry/list' }).catch(() => []),
    ha.request({ type: 'config/area_registry/list' }).catch(() => []),
  ]);
  const registry: EnergyRegistry = { entities: asArray(entities), devices: asArray(devices), areas: asArray(areas) };
  return { consumers: resolveConsumers((prefs ?? {}) as Prefs, registry, states), registry };
}

/** Energy dashboard entries → consumers with name, area and live power sensor. */
export function resolveConsumers(prefs: Prefs, registry: EnergyRegistry, states: Record<string, HAState>): EnergyConsumer[] {
  const entityById = new Map(registry.entities.map(e => [e.entity_id, e]));
  const deviceById = new Map(registry.devices.map(d => [d.id, d]));
  const byDevice = new Map<string, EntityEntry[]>();
  for (const entity of registry.entities) if (entity.device_id && !entity.disabled_by) byDevice.set(entity.device_id, [...(byDevice.get(entity.device_id) ?? []), entity]);
  const raw = (prefs.device_consumption ?? []).filter(d => typeof d.stat_consumption === 'string' && d.stat_consumption);
  const consumers = raw.map(entry => {
    const entity = entityById.get(entry.stat_consumption);
    const device = entity?.device_id ? deviceById.get(entity.device_id) : undefined;
    const friendly = states[entry.stat_consumption]?.attributes.friendly_name;
    const name = entry.name || device?.name_by_user || device?.name || (typeof friendly === 'string' ? friendly : '') || entry.stat_consumption.split('.')[1];
    return {
      id: entry.stat_consumption,
      name,
      powerEntityId: entry.stat_rate || powerSensorOf(entry.stat_consumption, entity?.device_id ? byDevice.get(entity.device_id) ?? [] : [], states),
      deviceId: entity?.device_id || undefined,
      areaId: entity?.area_id || device?.area_id || undefined,
      includedIn: entry.included_in_stat || undefined,
    };
  });
  const names = cleanNames(consumers.map(c => c.name));
  return consumers.map((c, i) => ({ ...c, name: names[i] }));
}

const isPowerState = (state: HAState | undefined) => {
  if (!state) return false;
  const unit = String(state.attributes.unit_of_measurement ?? '');
  return state.attributes.device_class === 'power' || unit === 'W' || unit === 'kW';
};

/** A power sensor next to the energy sensor: same device, else the same name with "power". */
function powerSensorOf(energyId: string, siblings: EntityEntry[], states: Record<string, HAState>): string | undefined {
  const sibling = siblings.find(e => e.entity_id.startsWith('sensor.') && isPowerState(states[e.entity_id]));
  if (sibling) return sibling.entity_id;
  for (const guess of [energyId.replace(/_(energy|energie|consumption|verbrauch)(_\w+)?$/, '_power'), energyId.replace(/energy/, 'power')]) {
    if (guess !== energyId && isPowerState(states[guess])) return guess;
  }
  return undefined;
}

/**
 * Readable names: drops words every few consumer share (a plug brand like "mPowerPlug")
 * and units/suffixes, splits glued words ("WohnzimmerRolloLinks").
 */
export function cleanNames(names: string[]): string[] {
  const words = names.map(name => name
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, '$1 $2')
    .split(/\s+/).filter(Boolean));
  const count = new Map<string, number>();
  for (const list of words) for (const word of new Set(list.map(w => w.toLowerCase()))) count.set(word, (count.get(word) ?? 0) + 1);
  const common = (word: string) => names.length >= 4 && (count.get(word.toLowerCase()) ?? 0) >= names.length * .4;
  return words.map((list, i) => {
    const kept = list.filter(w => !/^(energy|energie|verbrauch|consumption|kwh|power|leistung)$/i.test(w) && !common(w));
    const text = (kept.length ? kept : list).join(' ').trim();
    return text ? text[0].toUpperCase() + text.slice(1) : names[i];
  });
}

/** Watts from a power sensor state (kW converted, unknown/negative → 0). */
export function powerWatts(state: HAState | undefined): number {
  if (!state) return 0;
  const value = parseFloat(state.state);
  if (!Number.isFinite(value) || value < 0) return 0;
  return String(state.attributes.unit_of_measurement ?? '') === 'kW' ? value * 1000 : value;
}

export interface EnergyShare { consumer: EnergyConsumer; watts: number; share: number }

/**
 * Current shares of the measured total, largest first. Consumers measured inside a
 * parent meter (`included_in_stat`) are not counted twice.
 */
export function energyShares(consumers: EnergyConsumer[], watts: (consumer: EnergyConsumer) => number): { total: number; items: EnergyShare[] } {
  const ids = new Set(consumers.map(c => c.id));
  const items = consumers.map(consumer => ({ consumer, watts: watts(consumer), share: 0 }));
  const total = items.reduce((sum, item) => sum + (item.consumer.includedIn && ids.has(item.consumer.includedIn) ? 0 : item.watts), 0);
  for (const item of items) item.share = total > 0 ? item.watts / total : 0;
  return { total, items: items.sort((a, b) => b.watts - a.watts) };
}

/** Today's energy per statistic (kWh) from the recorder's daily statistics. */
export async function energyToday(ha: Requester, ids: string[], now = new Date()): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = await ha.request({
    type: 'recorder/statistics_during_period', start_time: midnight.toISOString(), statistic_ids: ids,
    period: 'day', types: ['change'], units: { energy: 'kWh' },
  }).catch(() => ({})) as Record<string, { change?: number | null }[]>;
  const today: Record<string, number> = {};
  for (const id of ids) today[id] = (result?.[id] ?? []).reduce((sum, row) => sum + (Number(row.change) || 0), 0);
  return today;
}

/** Normalised words of a label for matching devices to model objects ("Kaffeemaschine" ~ "Kaffeemachine"). */
export function matchWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/).filter(w => w.length >= 3);
}

/**
 * How well a consumer name fits a model label: the longest shared word start
 * (≥ 5 letters) or a whole word of ≥ 4 letters contained in the other. 0 = no fit.
 */
export function matchScore(name: string, label: string): number {
  const a = matchWords(name), b = matchWords(label);
  let best = 0;
  for (const x of a) for (const y of b) {
    let prefix = 0;
    while (prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix++;
    if (prefix >= 5) best = Math.max(best, prefix);
    else if (x.length >= 4 && y.includes(x)) best = Math.max(best, x.length);
    else if (y.length >= 4 && x.includes(y)) best = Math.max(best, y.length);
  }
  return best;
}
