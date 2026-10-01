import type { AppConfig } from '../types';
import { getConfig, writeStoredConfig } from './configApi';
import { getModel, getObjectAsset, replaceAssets, type AssetChanges } from './storageApi';
import { publishableInstallation, storeInstallation, type InstallationConfig } from './installationConfig';
import { generateUUID } from '../utils/uuid';

/**
 * Shared installation: one published version of the configuration (entity
 * assignments, rooms, lights ...), the apartment model and imported objects,
 * served next to the app (`shared/`). Every browser loads the latest version on
 * start and checks for newer ones; browsers with the write PIN publish their
 * changes. Appearance, camera and the Home Assistant connection stay per
 * browser, and the HA token never leaves it.
 *
 * Local copies in localStorage/IndexedDB remain the working storage, so the
 * dashboard also starts offline with the last received version.
 */

/** Read per request (tests serve the store from different addresses). */
const storeBase = () => `${import.meta.env.BASE_URL}shared/`;
const KEYS = {
  enabled: 'shared:enabled',
  pin: 'shared:pin',
  revision: 'shared:revision',
  model: 'shared:modelRevision',
  objects: 'shared:objectRevisions',
  pending: 'shared:pending',
  joined: 'shared:joined',
  change: 'shared:change',
} as const;

export interface SharedState {
  format: 1;
  revision: number;
  updatedAt: string;
  /** Configuration without the per-browser onboarding flag. */
  config: Omit<AppConfig, 'onboarding'>;
  model: { revision: number; size: number } | null;
  objects: Array<{ id: string; format: string; revision: number }>;
  /** Entity mapping and location for public builds (add-on); see installationConfig. */
  installation?: InstallationConfig;
}

interface Pending { config?: boolean; model?: boolean; objects?: string[]; deleted?: string[] }

export type SharedStatus =
  | { kind: 'disabled' }
  | { kind: 'unavailable' }
  | { kind: 'empty' }
  | { kind: 'current'; revision: number }
  | { kind: 'updated'; revision: number }
  | { kind: 'published'; revision: number }
  | { kind: 'conflict'; revision: number }
  | { kind: 'readonly' }
  | { kind: 'error'; message: string };

const read = <T>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw) as T; } catch { return fallback; }
};
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

export function isSharedEnabled(): boolean { return read(KEYS.enabled, true); }
export function setSharedEnabled(enabled: boolean): void { write(KEYS.enabled, enabled); }
export function getSharedPin(): string { return read(KEYS.pin, ''); }
export function setSharedPin(pin: string): void { if (pin) write(KEYS.pin, pin); else localStorage.removeItem(KEYS.pin); }
export function getSharedRevision(): number { return read(KEYS.revision, 0); }
/** True once this browser took its configuration from the shared version (skips model/location onboarding). */
export function joinedSharedInstallation(): boolean { return read(KEYS.joined, false); }
export function hasPendingSharedChanges(): boolean { return Object.keys(read<Pending>(KEYS.pending, {})).length > 0; }

const withPin = (init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers ?? {}), 'X-HomeTwin-Pin': getSharedPin() } });
const objectPath = (id: string, format: string) => `objects/${id}.${format.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

export async function fetchSharedState(timeoutMs = 4000): Promise<SharedState | null | 'unavailable'> {
  try {
    const response = await fetch(`${storeBase()}state.json`, { cache: 'no-cache', signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 404) return null;
    if (!response.ok) return 'unavailable';
    const state = await response.json() as SharedState;
    return state?.format === 1 ? state : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function checkSharedPin(pin: string): Promise<boolean> {
  try {
    const response = await fetch(`${storeBase()}check-pin`, { method: 'POST', headers: { 'X-HomeTwin-Pin': pin }, cache: 'no-store' });
    return response.status === 204;
  } catch {
    return false;
  }
}

// Keep the existing nginx/DAV protocol. Serialize this browser's transfers;
// Web Locks also cover other tabs on the same origin when available (Safari included).
let transferQueue: Promise<unknown> = Promise.resolve();
function transfer<T>(run: () => Promise<T>): Promise<T> {
  const next = transferQueue.then(() => {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('hometwin-shared-transfer', run);
    return run();
  });
  transferQueue = next.catch(() => undefined);
  return next;
}

const changed = () => localStorage.getItem(KEYS.change);
const conflict = (revision: number) => Object.assign(new Error('Shared installation changed during transfer'), { revision });

async function download(path: string): Promise<Blob> {
  // A large apartment GLB can need longer than the small state.json request.
  const response = await fetch(`${storeBase()}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.blob();
}

/** Store a received version locally. The onboarding flag stays this browser's own. */
async function apply(state: SharedState): Promise<void> {
  const stamp = changed();
  const known = read<Record<string, number>>(KEYS.objects, {});
  const next: Record<string, number> = {};
  const changes: AssetChanges = { objects: new Map(), deleted: [] };
  if (state.model && (state.model.revision !== read(KEYS.model, 0) || !(await getModel()))) {
    changes.model = await download('model.glb');
    if (changes.model.size !== state.model.size) throw new Error('Incomplete shared model');
  }
  for (const object of state.objects) {
    if (known[object.id] !== object.revision || !(await getObjectAsset(object.id))) {
      changes.objects.set(object.id, await download(objectPath(object.id, object.format)));
    }
    next[object.id] = object.revision;
  }
  changes.deleted = Object.keys(known).filter(id => !(id in next));
  // No local writes until every download has succeeded and the manifest is still current.
  const latest = await fetchSharedState();
  if (!latest || latest === 'unavailable') throw new Error('Shared installation unavailable');
  if (latest.revision !== state.revision || latest.updatedAt !== state.updatedAt || changed() !== stamp) throw conflict(latest.revision);
  const backup: AssetChanges = { objects: new Map(), deleted: [] };
  if (changes.model !== undefined) backup.model = await getModel();
  for (const id of new Set([...changes.objects.keys(), ...changes.deleted])) {
    const blob = await getObjectAsset(id);
    if (blob) backup.objects.set(id, blob); else backup.deleted.push(id);
  }
  const storageKeys = ['config', 'hometwin:installation', KEYS.model, KEYS.objects, KEYS.revision, KEYS.joined];
  const before = storageKeys.map(key => [key, localStorage.getItem(key)] as const);
  await replaceAssets(changes);
  try {
    if (changed() !== stamp) throw conflict(state.revision);
    if (state.model) write(KEYS.model, state.model.revision);
    if (state.installation) storeInstallation(state.installation);
    write(KEYS.objects, next);
    const local = getConfig();
    writeStoredConfig({ ...state.config, onboarding: local.onboarding ?? { completed: false } } as AppConfig);
    write(KEYS.revision, state.revision);
    write(KEYS.joined, true);
  } catch (error) {
    await replaceAssets(backup);
    // Edits made while the IndexedDB transaction was running must survive rollback.
    if (changed() === stamp) {
      // Restore the module's live installation before restoring its raw storage value.
      storeInstallation(JSON.parse(before.find(([key]) => key === 'hometwin:installation')?.[1] ?? '{}'));
      for (const [key, value] of before) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      }
    }
    throw error;
  }
}

/**
 * Take a newer published version, unless this browser has unpublished changes
 * of its own (those are published first, see publishShared).
 */
export function syncFromShared(timeoutMs = 4000): Promise<SharedStatus> {
  return transfer(() => syncFromSharedNow(timeoutMs));
}

async function syncFromSharedNow(timeoutMs: number): Promise<SharedStatus> {
  if (!isSharedEnabled()) return { kind: 'disabled' };
  const state = await fetchSharedState(timeoutMs);
  if (state === 'unavailable') return { kind: 'unavailable' };
  if (state === null) return { kind: 'empty' };
  if (state.revision === getSharedRevision()) return { kind: 'current', revision: state.revision };
  if (hasPendingSharedChanges() && getSharedPin()) return { kind: 'conflict', revision: state.revision };
  try {
    await apply(state);
    localStorage.removeItem(KEYS.pending);
    return { kind: 'updated', revision: state.revision };
  } catch (error) {
    if (typeof (error as { revision?: number }).revision === 'number') return { kind: 'conflict', revision: (error as { revision: number }).revision };
    return { kind: 'error', message: String((error as Error)?.message ?? error) };
  }
}

let publishTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(status: SharedStatus) => void>();
export function onSharedStatus(listener: (status: SharedStatus) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const notify = (status: SharedStatus) => listeners.forEach(listener => listener(status));

/** Called by configApi whenever the local configuration, model or objects change. */
export function markSharedChange(part: 'config' | 'model' | { object: string } | { deleted: string }): void {
  if (!isSharedEnabled() || !getSharedPin()) return;
  const pending = read<Pending>(KEYS.pending, {});
  if (part === 'config') pending.config = true;
  else if (part === 'model') pending.model = true;
  else if ('object' in part) pending.objects = [...new Set([...(pending.objects ?? []), part.object])];
  else pending.deleted = [...new Set([...(pending.deleted ?? []), part.deleted])];
  write(KEYS.pending, pending);
  write(KEYS.change, generateUUID());
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(() => {
    publishTimer = null;
    void transfer(() => hasPendingSharedChanges() ? publishSharedNow(false) : Promise.resolve({ kind: 'current', revision: getSharedRevision() } as SharedStatus)).then(notify);
  }, 1500);
}

/**
 * Publish this browser's version. Files first, state.json last, so readers
 * never see a state that points at missing files. `force` publishes the whole
 * local version even if someone else published in the meantime.
 */
export function publishShared(force = false): Promise<SharedStatus> {
  return transfer(() => publishSharedNow(force));
}

async function publishSharedNow(force: boolean): Promise<SharedStatus> {
  if (!isSharedEnabled()) return { kind: 'disabled' };
  if (!getSharedPin()) return { kind: 'readonly' };
  const current = await fetchSharedState();
  if (current === 'unavailable') return { kind: 'unavailable' };
  const base = current?.revision ?? 0;
  if (current && base !== getSharedRevision() && !force) return { kind: 'conflict', revision: base };
  const pending: Pending = force || !current
    ? { config: true, model: true, objects: (getConfig().model?.importedObjects ?? []).map(o => o.id) }
    : read<Pending>(KEYS.pending, {});
  const stamp = changed();
  const revision = base + 1;
  const put = async (file: string, body: Blob | string, type: string) => {
    const response = await fetch(`${storeBase()}${file}`, withPin({ method: 'PUT', body, headers: { 'Content-Type': type }, signal: AbortSignal.timeout(120_000) }));
    if (response.status === 403) throw Object.assign(new Error('PIN'), { readonly: true });
    if (!response.ok) throw new Error(`${file} ${response.status}`);
  };
  try {
    const config = getConfig();
    let model = current?.model ?? null;
    if (pending.model) {
      const blob = await getModel();
      if (blob) { await put('model.glb', blob, 'model/gltf-binary'); model = { revision, size: blob.size }; }
    }
    const previous = new Map((current?.objects ?? []).map(o => [o.id, o]));
    const objects: SharedState['objects'] = [];
    for (const object of config.model?.importedObjects ?? []) {
      let revisionOf = previous.get(object.id)?.revision;
      if (pending.objects?.includes(object.id) || revisionOf === undefined) {
        const blob = await getObjectAsset(object.id);
        if (!blob) continue;
        await put(objectPath(object.id, object.format), blob, 'application/octet-stream');
        revisionOf = revision;
      }
      objects.push({ id: object.id, format: object.format, revision: revisionOf });
    }
    const { onboarding: _onboarding, ...shared } = config;
    const installation = publishableInstallation() ?? current?.installation;
    const state: SharedState = { format: 1, revision, updatedAt: new Date().toISOString(), config: shared, model, objects, ...(installation ? { installation } : {}) };
    await put('state.json', JSON.stringify(state), 'application/json');
    // Old object files are removed after the new state no longer references them.
    for (const [id, object] of previous) {
      if (!objects.some(o => o.id === id)) await fetch(`${storeBase()}${objectPath(id, object.format)}`, withPin({ method: 'DELETE' })).catch(() => undefined);
    }
    write(KEYS.revision, revision);
    if (model) write(KEYS.model, model.revision);
    write(KEYS.objects, Object.fromEntries(objects.map(o => [o.id, o.revision])));
    if (changed() === stamp) localStorage.removeItem(KEYS.pending);
    return { kind: 'published', revision };
  } catch (error) {
    if ((error as { readonly?: boolean }).readonly) return { kind: 'readonly' };
    return { kind: 'error', message: String((error as Error)?.message ?? error) };
  }
}

/**
 * Check for newer versions while the dashboard is open and reload once nobody
 * interacts, so wall tablets follow the latest version on their own.
 */
export function watchSharedUpdates(intervalMs = 60_000, quietMs = 20_000): () => void {
  let lastInput = Date.now();
  const onInput = () => { lastInput = Date.now(); };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  events.forEach(type => window.addEventListener(type, onInput, { passive: true, capture: true }));
  let waiting = false;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const check = async () => {
    if (stopped || waiting || document.hidden || !isSharedEnabled()) return;
    const state = await fetchSharedState();
    if (!state || state === 'unavailable' || state.revision === getSharedRevision()) return;
    if (hasPendingSharedChanges() && getSharedPin()) { notify({ kind: 'conflict', revision: state.revision }); return; }
    if (stopped || waiting) return;
    waiting = true;
    const tryReload = async () => {
      if (stopped) return;
      if (Date.now() - lastInput < quietMs || document.hidden) { retryTimer = setTimeout(tryReload, 5000); return; }
      const status = await syncFromShared();
      if (!stopped && status.kind === 'updated') window.location.reload();
      waiting = false;
    };
    void tryReload();
  };
  const timer = window.setInterval(check, intervalMs);
  const onVisible = () => { if (!document.hidden) void check(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    events.forEach(type => window.removeEventListener(type, onInput, { capture: true }));
  };
}

/** Drop this browser's unpublished changes and take the published version. */
export async function loadLatestShared(): Promise<SharedStatus> {
  return transfer(() => {
    localStorage.removeItem(KEYS.pending);
    localStorage.removeItem(KEYS.revision);
    return syncFromSharedNow(4000);
  });
}

/**
 * App start: take the newest version before the first render, then publish
 * anything this browser still owes (pending edits, or the first version when the
 * shared store is still empty and this browser is fully set up).
 */
export async function startSharedInstallation(): Promise<SharedStatus> {
  const status = await syncFromShared();
  const setUp = getConfig().onboarding?.completed ?? false;
  if (getSharedPin() && setUp && ((status.kind === 'empty') || (status.kind === 'current' && hasPendingSharedChanges()))) {
    void publishShared().then(notify);
  }
  return status;
}
