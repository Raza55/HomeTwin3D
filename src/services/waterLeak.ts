import { installationEntity } from './installationConfig.ts';
import type { HAState } from '../types';

export const WATER_LEAK_SENSORS = [
  { entityId: installationEntity('binary_sensor.laundry_water_leak'), location: 'Waschmaschine', anchor: 'washer' },
  { entityId: installationEntity('binary_sensor.kitchen_water_leak'), location: 'Spüle', anchor: 'sink' },
] as const;

export function waterLeakActive(state: HAState | undefined, connected: boolean): boolean {
  return connected && state?.state === 'on';
}

export function isWaterLeakEntity(entityId: string): boolean {
  return WATER_LEAK_SENSORS.some(sensor => sensor.entityId === entityId);
}
