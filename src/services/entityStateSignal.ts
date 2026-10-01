import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { AppConfig } from '../types';
import { coffeeAlertEntityIds } from './coffeeState';
type PlanObject = NonNullable<NonNullable<AppConfig['model']>['floorplan']>['objects'][number];

let version = 0;
let broadcastVersion = 0;
let scheduled = false;
let broadcast = false;
const pending = new Set<string>();
const entityVersions = new Map<string, number>();
const listeners = new Set<() => void>();

/** Coalesce one task's updates; omitted ID refreshes every subscriber. */
export function notifyEntityStates(entityId?: string): void {
  if (entityId) pending.add(entityId); else broadcast = true;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    version++;
    if (broadcast) broadcastVersion = version;
    for (const id of pending) entityVersions.set(id, version);
    pending.clear(); broadcast = false;
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function entityStatesVersion(ids?: readonly string[]): number {
  if (!ids) return version;
  return ids.reduce((latest, id) => Math.max(latest, entityVersions.get(id) ?? 0), broadcastVersion);
}

/** Includes nested sensor/lock/media dependencies in a device configuration. */
export function configuredEntityIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(item)) ids.add(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return [...ids].sort();
}

export function useEntityStatesVersion(ids?: readonly string[]): number {
  const key = ids ? JSON.stringify(ids) : '';
  const stableIds = useMemo(() => key ? JSON.parse(key) as string[] : undefined, [key]);
  const getVersion = useCallback(() => entityStatesVersion(stableIds), [stableIds]);
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/** Cache dependency traversal across state updates. */
export function useConfiguredEntityStates(config: AppConfig, select: (object: PlanObject) => boolean): number {
  // The selector is constant for each caller; config identity changes on edits.
  const ids = useMemo(() => {
    const objects = config.model?.floorplan?.objects.filter(select) ?? [];
    return configuredEntityIds([objects, objects.flatMap(o => o.coffee ? coffeeAlertEntityIds(o.coffee.statusEntityId) : [])]);
  }, [config]);
  return useEntityStatesVersion(ids);
}
