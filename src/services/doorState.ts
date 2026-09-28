import type { HAState } from '../types';

export type DoorPose = 'closed' | 'open' | 'tilted';
export const DOOR_TILT_AFTER_MS = 15 * 60 * 1000;

/** last_changed survives reloads and attribute-only updates. Never use last_updated. */
export function doorPose(state: HAState | undefined, now = Date.now(), kind?: string): DoorPose | null {
  if (!state) return null;
  if (state.state === 'off' || state.state === 'closed') return 'closed';
  if (state.state !== 'on' && state.state !== 'open') return null;
  if (kind === 'entrance') return 'open';
  const opened = state.last_changed ? Date.parse(state.last_changed) : NaN;
  return Number.isFinite(opened) && now - opened > DOOR_TILT_AFTER_MS ? 'tilted' : 'open';
}

export function lockStatus(state: HAState | undefined): string {
  return ({ locked: 'Verriegelt', unlocked: 'Entriegelt', locking: 'Wird verriegelt', unlocking: 'Wird entriegelt', jammed: 'Schloss blockiert', open: 'Entriegelt – Falle offen', opening: 'Falle wird geöffnet' } as Record<string, string>)[state?.state ?? ''] ?? 'Schlossstatus unbekannt';
}

export function doorStatus(pose: DoorPose | null): string {
  return pose === 'closed' ? 'Geschlossen' : pose === 'open' ? 'Seitlich offen'
    : pose === 'tilted' ? 'Gekippt (nach 15 Min. angenommen)' : 'Status unbekannt';
}

export function doorDuration(state: HAState | undefined, now = Date.now()): string {
  if (!state || !['on', 'open', 'off', 'closed'].includes(state.state)) return 'Dauer unbekannt';
  const changed = state.last_changed ? Date.parse(state.last_changed) : NaN;
  if (!Number.isFinite(changed) || changed > now) return 'Dauer unbekannt';
  const seconds = Math.floor((now - changed) / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} Tage ${hours % 24} h`;
}
