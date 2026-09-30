import { useSyncExternalStore } from 'react';

/**
 * Change signal for the plan overlays (markers, door status, IT visuals …).
 * They read the Dashboard's live state map directly; a state change bumps this
 * version so only those overlays re-render, not the whole Dashboard.
 * Several changes within one task coalesce into a single notification.
 */
let version = 0;
let scheduled = false;
const listeners = new Set<() => void>();

export function notifyEntityStates(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    version++;
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getVersion = () => version;

/** Re-render the calling component whenever entity states changed. */
export function useEntityStatesVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
