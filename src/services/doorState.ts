import type { HAState } from '../types';

export type DoorPose = 'closed' | 'open' | 'tilted';
export const DOOR_TILT_AFTER_MS = 15 * 60 * 1000;

/**
 * last_changed survives reloads and attribute-only updates. Never use last_updated.
 * A tilt-only sash (furniture in front) is tilted whenever its contact is open.
 */
export function doorPose(state: HAState | undefined, now = Date.now(), kind?: string, tiltOnly = false): DoorPose | null {
  if (!state) return null;
  if (state.state === 'off' || state.state === 'closed') return 'closed';
  if (state.state !== 'on' && state.state !== 'open') return null;
  if (kind === 'entrance') return 'open';
  if (tiltOnly) return 'tilted';
  const opened = state.last_changed ? Date.parse(state.last_changed) : NaN;
  return Number.isFinite(opened) && now - opened > DOOR_TILT_AFTER_MS ? 'tilted' : 'open';
}

export function lockStatus(state: HAState | undefined): string {
  return ({ locked: 'Verriegelt', unlocked: 'Entriegelt', locking: 'Wird verriegelt', unlocking: 'Wird entriegelt', jammed: 'Schloss blockiert', open: 'Entriegelt – Falle offen', opening: 'Falle wird geöffnet' } as Record<string, string>)[state?.state ?? ''] ?? 'Schlossstatus unbekannt';
}

export function doorStatus(pose: DoorPose | null, tiltOnly = false): string {
  return pose === 'closed' ? 'Geschlossen' : pose === 'open' ? 'Seitlich offen'
    : pose === 'tilted' ? tiltOnly ? 'Gekippt' : 'Gekippt (nach 15 Min. angenommen)' : 'Status unbekannt';
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

/** Next time a contact's inferred pose can change; closed/entrance doors need no timer. */
export function nextDoorPoseDelay(doors: readonly { entityId: string; door?: { kind?: string; tiltOnly?: boolean } }[], states: Record<string, HAState>, now = Date.now()): number | null {
  let delay = Infinity;
  for (const door of doors) {
    const state = states[door.entityId];
    if (door.door?.kind === 'entrance' || door.door?.tiltOnly || !state || !['on', 'open'].includes(state.state)) continue;
    const deadline = Date.parse(state.last_changed ?? '') + DOOR_TILT_AFTER_MS + 1;
    if (Number.isFinite(deadline) && deadline > now) delay = Math.min(delay, deadline - now);
  }
  return Number.isFinite(delay) ? delay : null;
}
