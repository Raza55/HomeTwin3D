import type { HARoomEntity } from '../services/haAreaRegistry';

export type RoomEntityGroup = 'safety' | 'controls' | 'climate' | 'media' | 'status' | 'other';

export interface RankedRoomEntity extends HARoomEntity {
  priority: number;
  group: RoomEntityGroup;
}

const SAFETY_DEVICE_CLASSES = new Set(['smoke', 'gas', 'moisture', 'carbon_monoxide', 'problem']);
const STATUS_DEVICE_CLASSES = new Set([
  'door', 'window', 'opening', 'motion', 'occupancy', 'presence',
  'temperature', 'humidity', 'aqi', 'carbon_dioxide', 'volatile_organic_compounds',
]);

function classify(entity: HARoomEntity): { group: RoomEntityGroup; score: number } {
  const deviceClass = String(entity.attributes.device_class ?? '');
  if (entity.domain === 'alarm_control_panel' || entity.domain === 'lock' || SAFETY_DEVICE_CLASSES.has(deviceClass)) {
    return { group: 'safety', score: 100 };
  }
  if (entity.domain === 'light' || entity.domain === 'cover') {
    return { group: 'controls', score: 88 };
  }
  if (entity.domain === 'climate' || entity.domain === 'fan' || entity.domain === 'humidifier') {
    return { group: 'climate', score: 82 };
  }
  if (entity.domain === 'media_player' || entity.domain === 'vacuum') {
    return { group: 'media', score: 72 };
  }
  if (STATUS_DEVICE_CLASSES.has(deviceClass)) {
    return { group: 'status', score: 62 };
  }
  if (entity.domain === 'switch') {
    return { group: 'controls', score: 55 };
  }
  if (entity.domain === 'scene') {
    return { group: 'controls', score: 42 };
  }
  if (entity.domain === 'sensor') {
    return { group: 'status', score: 36 };
  }
  return { group: 'other', score: 20 };
}

export function rankRoomEntities(entities: HARoomEntity[], placedEntityIds: ReadonlySet<string>): RankedRoomEntity[] {
  return entities
    .filter((entity) => !entity.disabled && !entity.hidden)
    .filter((entity) => !entity.entity_category)
    .filter((entity) => !['button', 'update'].includes(entity.domain))
    .map((entity) => {
      const classification = classify(entity);
      let priority = classification.score;
      if (placedEntityIds.has(entity.entity_id)) priority += 30;
      if (entity.state === 'unavailable' || entity.state === 'unknown') priority -= 25;
      return { ...entity, ...classification, priority };
    })
    .sort((a, b) => (
      b.priority - a.priority
      || (a.friendly_name || a.entity_id).localeCompare(b.friendly_name || b.entity_id)
    ));
}
