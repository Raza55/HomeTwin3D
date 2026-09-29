import type { AppConfig } from '../types';
import { getConfig, writeStoredConfig } from './configApi';
import { deleteObjectAsset, getModel, getObjectAsset, saveModel, saveObjectAsset } from './storageApi';

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

const BASE = `${import.meta.env.BASE_URL}shared/`;
const KEYS = {
  enabled: 'shared:enabled',
  pin: 'shared:pin',
  revision: 'shared:revision',
  model: 'shared:modelRevision',
  objects: 'shared:objectRevisions',
  pending: 'shared:pending',
  joined: 'shared:joined',
} as const;

export interface SharedState {
  format: 1;
  revision: number;
  updatedAt: string;
  /** Configuration without the per-browser onboarding flag. */
  config: Omit<AppConfig, 'onboarding'>;
  model: { revision: number; size: number } | null;
  objects: Array<{ id: string; format: string; revision: number }>;
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
    const response = await fetch(`${BASE}state.json`, { cache: 'no-cache', signal: AbortSignal.timeout(timeoutMs) });
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
    const response = await fetch(`${BASE}check-pin`, { method: 'POST', headers: { 'X-HomeTwin-Pin': pin }, cache: 'no-store' });
    return response.status === 204;
  } catch {
    return false;
  }
}

let applying = false;

/** Store a received version locally. The onboarding flag stays this browser's own. */
async function apply(state: SharedState): Promise<void> {
  applying = true;
  try {
    if (state.model && state.model.revision !== read(KEYS.model, 0)) {
      const response = await fetch(`${BASE}model.glb`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`model ${response.status}`);
      await saveModel(await response.blob());
      write(KEYS.model, state.model.revision);
    }
    const known = read<Record<string, number>>(KEYS.objects, {});
    const next: Record<string, number> = {};
    for (const object of state.objects) {
      if (known[object.id] !== object.revision || !(await getObjectAsset(object.id))) {
        const response = await fetch(`${BASE}${objectPath(object.id, object.format)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`object ${response.status}`);
        await saveObjectAsset(object.id, await response.blob());
      }
      next[object.id] = object.revision;
    }
    for (const id of Object.keys(known)) if (!(id in next)) await deleteObjectAsset(id);
    write(KEYS.objects, next);
    const local = getConfig();
    writeStoredConfig({ ...state.config, onboarding: local.onboarding ?? { completed: false } } as AppConfig);
    write(KEYS.revision, state.revision);
    write(KEYS.joined, true);
  } finally {
    applying = false;
  }
}

/**
 * Take a newer published version, unless this browser has unpublished changes
 * of its own (those are published first, see publishShared).
 */
export async function syncFromShared(timeoutMs = 4000): Promise<SharedStatus> {
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
  if (applying || !isSharedEnabled() || !getSharedPin()) return;
  const pending = read<Pending>(KEYS.pending, {});
  if (part === 'config') pending.config = true;
  else if (part === 'model') pending.model = true;
  else if ('object' in part) pending.objects = [...new Set([...(pending.objects ?? []), part.object])];
  else pending.deleted = [...new Set([...(pending.deleted ?? []), part.deleted])];
  write(KEYS.pending, pending);
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(() => { void publishShared().then(notify); }, 1500);
}

/**
 * Publish this browser's version. Files first, state.json last, so readers
 * never see a state that points at missing files. `force` publishes the whole
 * local version even if someone else published in the meantime.
 */
export async function publishShared(force = false): Promise<SharedStatus> {
  if (!isSharedEnabled()) return { kind: 'disabled' };
  if (!getSharedPin()) return { kind: 'readonly' };
  const current = await fetchSharedState();
  if (current === 'unavailable') return { kind: 'unavailable' };
  const base = current?.revision ?? 0;
  if (current && base !== getSharedRevision() && !force) return { kind: 'conflict', revision: base };
  const pending: Pending = force || !current
    ? { config: true, model: true, objects: (getConfig().model?.importedObjects ?? []).map(o => o.id) }
    : read<Pending>(KEYS.pending, {});
  const revision = base + 1;
  const put = async (file: string, body: Blob | string, type: string) => {
    const response = await fetch(`${BASE}${file}`, withPin({ method: 'PUT', body, headers: { 'Content-Type': type } }));
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
    const state: SharedState = { format: 1, revision, updatedAt: new Date().toISOString(), config: shared, model, objects };
    await put('state.json', JSON.stringify(state), 'application/json');
    // Old object files are removed after the new state no longer references them.
    for (const [id, object] of previous) {
      if (!objects.some(o => o.id === id)) await fetch(`${BASE}${objectPath(id, object.format)}`, withPin({ method: 'DELETE' })).catch(() => undefined);
    }
    write(KEYS.revision, revision);
    if (model) write(KEYS.model, model.revision);
    write(KEYS.objects, Object.fromEntries(objects.map(o => [o.id, o.revision])));
    localStorage.removeItem(KEYS.pending);
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
  const check = async () => {
    if (document.hidden || !isSharedEnabled()) return;
    const state = await fetchSharedState();
    if (!state || state === 'unavailable' || state.revision === getSharedRevision()) return;
    if (hasPendingSharedChanges() && getSharedPin()) { notify({ kind: 'conflict', revision: state.revision }); return; }
    if (waiting) return;
    waiting = true;
    const tryReload = async () => {
      if (Date.now() - lastInput < quietMs || document.hidden) { setTimeout(tryReload, 5000); return; }
      const status = await syncFromShared();
      if (status.kind === 'updated') window.location.reload();
      waiting = false;
    };
    void tryReload();
  };
  const timer = window.setInterval(check, intervalMs);
  const onVisible = () => { if (!document.hidden) void check(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    events.forEach(type => window.removeEventListener(type, onInput, { capture: true }));
  };
}

/** Drop this browser's unpublished changes and take the published version. */
export async function loadLatestShared(): Promise<SharedStatus> {
  localStorage.removeItem(KEYS.pending);
  localStorage.removeItem(KEYS.revision);
  return syncFromShared();
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
