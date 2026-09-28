import type { HAState } from '../types';

export interface BatteryRegistryEntry { entity_id: string; device_id?: string | null; disabled_by?: string | null; }
export function isBatteryState(state: HAState): boolean {
  return state.attributes.device_class === 'battery' && /^(sensor|binary_sensor)\./.test(state.entity_id);
}

/** Match by HA device identity, never by similar names or room membership. */
export function batteryWarnings(entityId: string, registry: BatteryRegistryEntry[], states: Record<string, HAState>, connected: boolean): string[] {
  if (!connected) return [];
  const deviceId = registry.find(entry => entry.entity_id === entityId && !entry.disabled_by)?.device_id;
  if (!deviceId) return [];
  return registry.filter(entry => entry.device_id === deviceId && !entry.disabled_by).flatMap(entry => {
    const state = states[entry.entity_id];
    if (!state || !isBatteryState(state)) return [];
    if (entry.entity_id.startsWith('binary_sensor.')) return state.state === 'on' ? ['Batterie schwach'] : [];
    const value = state.state.trim() === '' ? NaN : Number(state.state);
    return state.attributes.unit_of_measurement === '%' && Number.isFinite(value) && value >= 0 && value <= 20
      ? [`Batterie schwach (${value} %)`] : [];
  });
}
