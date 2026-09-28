import { installation } from '../services/installationConfig.ts';
export const SYSTEM_LOCATION = installation.location ?? {
  label: 'Beispielstandort',
  latitude: 0,
  longitude: 0,
} as const;

export function systemLocationWithNorthOffset(northOffset?: number) {
  return {
    latitude: SYSTEM_LOCATION.latitude,
    longitude: SYSTEM_LOCATION.longitude,
    ...(northOffset !== undefined ? { northOffset } : {}),
  };
}
