import { installation } from '../services/installationConfig.ts';

const EXAMPLE_LOCATION = {
  label: 'Beispielstandort',
  latitude: 0,
  longitude: 0,
} as const;

/**
 * Read on use, not on import: public builds (add-on) receive the location with
 * the shared installation after this module has loaded.
 */
export const SYSTEM_LOCATION = {
  get label(): string { return installation.location?.label ?? EXAMPLE_LOCATION.label; },
  get latitude(): number { return installation.location?.latitude ?? EXAMPLE_LOCATION.latitude; },
  get longitude(): number { return installation.location?.longitude ?? EXAMPLE_LOCATION.longitude; },
};

export function systemLocationWithNorthOffset(northOffset?: number) {
  return {
    latitude: SYSTEM_LOCATION.latitude,
    longitude: SYSTEM_LOCATION.longitude,
    ...(northOffset !== undefined ? { northOffset } : {}),
  };
}
