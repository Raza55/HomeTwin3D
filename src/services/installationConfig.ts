/**
 * Installation values: which real entities stand in for the example entity IDs
 * in the source, and the location for sun and weather.
 *
 * Private local builds bake them in (`.private/installation.json`). Public
 * builds (Home Assistant add-on, Node tests) contain none: there they arrive
 * with the shared installation (see sharedStore) and are kept in this browser,
 * so the public code and repository never hold private values.
 */
export interface InstallationConfig {
  entities?: Record<string, string>;
  location?: { label: string; latitude: number; longitude: number };
  mediaProxyTarget?: string;
  /** Who built this installation's board (shown in the day demo's intro). */
  author?: string;
}
declare const __HOMETWIN_INSTALLATION__: InstallationConfig;

const STORAGE_KEY = 'hometwin:installation';
const built: InstallationConfig = typeof __HOMETWIN_INSTALLATION__ === 'undefined' ? {} : __HOMETWIN_INSTALLATION__;
const hasValues = (value: InstallationConfig) => !!(value.entities && Object.keys(value.entities).length) || !!value.location || !!value.author;

function stored(): InstallationConfig {
  try {
    return typeof localStorage === 'undefined' ? {} : sanitizeInstallation(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

/** Effective values: baked-in ones win, otherwise those received with the shared installation. */
export const installation: InstallationConfig = hasValues(built) ? built : stored();

export function installationEntity(example: string): string {
  return installation.entities?.[example] ?? example;
}

/** Only well-formed entity mappings and a plausible location are accepted from the shared store. */
export function sanitizeInstallation(value: unknown): InstallationConfig {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const result: InstallationConfig = {};
  const entityId = /^[a-z_]+\.[a-z0-9_]+$/;
  if (input.entities && typeof input.entities === 'object') {
    const entities = Object.entries(input.entities as Record<string, unknown>)
      .filter(([example, real]) => entityId.test(example) && typeof real === 'string' && entityId.test(real));
    if (entities.length) result.entities = Object.fromEntries(entities) as Record<string, string>;
  }
  const location = input.location as Record<string, unknown> | undefined;
  if (location && typeof location.label === 'string' && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    && Math.abs(location.latitude as number) <= 90 && Math.abs(location.longitude as number) <= 180) {
    result.location = { label: location.label.slice(0, 80), latitude: location.latitude as number, longitude: location.longitude as number };
  }
  if (typeof input.author === 'string' && input.author.trim()) result.author = input.author.trim().slice(0, 80);
  return result;
}

/** Values to publish with the shared installation (no LAN addresses: the media proxy target stays local). */
export function publishableInstallation(): InstallationConfig | undefined {
  const { entities, location, author } = installation;
  return hasValues({ entities, location, author }) ? { ...(entities ? { entities } : {}), ...(location ? { location } : {}), ...(author ? { author } : {}) } : undefined;
}

/**
 * Keeps values received with the shared installation. Takes effect for modules
 * evaluated afterwards (main.tsx loads the app after the first sync); a later
 * change reloads the page through the shared update watcher.
 */
export function storeInstallation(value: unknown): boolean {
  const next = sanitizeInstallation(value);
  if (typeof localStorage === 'undefined') return false;
  const before = localStorage.getItem(STORAGE_KEY);
  const serialized = JSON.stringify(next);
  if (before === serialized) return false;
  localStorage.setItem(STORAGE_KEY, serialized);
  if (!hasValues(built)) {
    delete installation.entities; delete installation.location; delete installation.author;
    Object.assign(installation, next);
  }
  return true;
}
