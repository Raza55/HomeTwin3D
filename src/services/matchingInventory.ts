import type { HAState, LightType } from '../types';
import { getActiveHAConnection } from './haWebSocket';
import type { MatchEntity } from './floorplanMatching';

export interface MatchingInventory { entities: MatchEntity[]; lightTypes: Record<string, LightType>; note: string }
export async function loadMatchingInventory(): Promise<MatchingInventory> {
  const ha = getActiveHAConnection();
  if (!ha?.isConnected) throw new Error('Bitte Home Assistant verbinden und erneut laden.');
  const raw = await ha.request({ type: 'get_states' });
  // The demo connection answers every request with an empty object.
  if (!Array.isArray(raw)) throw new Error('Diese Verbindung liefert keine Entity-Liste (z. B. im Demo-Modus). Bitte im Live-Modus zuordnen.');
  const states = raw as HAState[];
  const registry = await Promise.allSettled([
    ha.request({ type: 'config/area_registry/list' }), ha.request({ type: 'config/device_registry/list' }), ha.request({ type: 'config/entity_registry/list' }),
  ]);
  const list = <T,>(i: number): T[] => registry[i].status === 'fulfilled' && Array.isArray(registry[i].value) ? registry[i].value as T[] : [];
  const areas = list<{ area_id: string; name: string }>(0);
  const devices = new Map(list<{ id: string; area_id?: string; name?: string; name_by_user?: string }>(1).map(d => [d.id, d]));
  const registered = new Map(list<{ entity_id: string; area_id?: string; device_id?: string; disabled_by?: string; platform?: string }>(2).map(e => [e.entity_id, e]));
  const lightTypes: Record<string, LightType> = {};
  for (const s of states.filter(s => s.entity_id.startsWith('light.'))) {
    const modes = s.attributes.supported_color_modes ?? [];
    const rgb = modes.some(m => ['rgb', 'rgbw', 'rgbww', 'xy', 'hs'].includes(m));
    lightTypes[s.entity_id] = rgb ? (modes.includes('color_temp') || modes.includes('rgbww') ? 'rgbw' : 'rgb') : modes.includes('color_temp') ? 'warmCold' : modes.includes('brightness') ? 'dimmeable' : 'toggle';
  }
  return { lightTypes, note: registry.some(r => r.status === 'rejected') ? 'Raumregister teilweise nicht verfügbar. Vorschläge nutzen die verfügbaren Angaben.' : '',
    entities: states.map(s => {
      const entry = registered.get(s.entity_id), device = devices.get(entry?.device_id ?? '');
      const areaId = entry?.area_id || device?.area_id;
      return { entity_id: s.entity_id, friendly_name: s.attributes.friendly_name, deviceClass: s.attributes.device_class as string | undefined, areaId, areaName: areas.find(a => a.area_id === areaId)?.name,
        deviceName: device?.name_by_user || device?.name, disabled: !!entry?.disabled_by,
        group: entry?.platform === 'group' || Array.isArray((s.attributes as Record<string, unknown>).entity_id) };
    }),
  };
}
