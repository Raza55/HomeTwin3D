import type { HAState } from '../types';

export type HomeStatus = 'home' | 'away' | 'warning' | 'unknown';

const WARNING_CLASSES = new Set(['problem', 'safety', 'smoke', 'gas', 'moisture', 'carbon_monoxide', 'battery', 'tamper']);

/** Semantic HA states only: an open window or a powered-on device is not an alarm. */
function hasWarning(state: HAState): boolean {
  const { entity_id: id, attributes, state: value } = state;
  if (id.startsWith('binary_sensor.')) return value === 'on' && WARNING_CLASSES.has(String(attributes.device_class));
  if (id.startsWith('alert.')) return value === 'on';
  if (id.startsWith('alarm_control_panel.')) return value === 'triggered';
  if (id.startsWith('sensor.') && attributes.device_class === 'battery' && attributes.unit_of_measurement === '%') {
    const level = value.trim() ? Number(value) : NaN;
    return Number.isFinite(level) && level >= 0 && level <= 20;
  }
  return /^(sensor|vacuum)\./.test(id) && ['error', 'fault', 'warning', 'actionrequired'].includes(value.toLowerCase());
}

/** Used before and after updates so clearing the final warning also refreshes the logo. */
export function affectsHomeStatus(state: HAState): boolean {
  return state.entity_id.startsWith('person.') || state.entity_id === 'zone.home' || hasWarning(state);
}

export function summarizeHomeStatus(states: Record<string, HAState>): HomeStatus {
  const values = Object.values(states);
  if (values.some(hasWarning)) return 'warning';
  const people = values.filter(state => state.entity_id.startsWith('person.'));
  if (people.some(person => person.state === 'home')) return 'home';
  const zoneValue = states['zone.home']?.state;
  const count = zoneValue?.trim() ? Number(zoneValue) : NaN;
  if (Number.isFinite(count) && count >= 0) return count > 0 ? 'home' : 'away';
  if (people.length && people.every(person => !['unknown', 'unavailable', ''].includes(person.state))) return 'away';
  return 'unknown';
}
