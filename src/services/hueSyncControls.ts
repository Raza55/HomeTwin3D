import type { HAState } from '../types';
import type { HALike } from './haWebSocket';
import { HUE_SYNC_SWITCH, HUE_SYNC_AREA, HUE_SYNC_AREA_NAME, HUE_SYNC_MEMBERS, hueSyncScenes } from './hueSync.ts';

export const HUE_SYNC_PRESETS = [
  { name: 'Entspannen', color: [255, 180, 95], brightness: 100 },
  { name: 'Lesen', color: [255, 225, 185], brightness: 230 },
  { name: 'Kino', color: [100, 130, 255], brightness: 55 },
  { name: 'Abendrot', color: [255, 90, 110], brightness: 140 },
] as const;

type States = Record<string, HAState>;
type Connection = Pick<HALike, 'isConnected' | 'callService'>;
export function hueSyncZoneActive(states: States): boolean {
  return states[HUE_SYNC_SWITCH]?.state === 'on' && states[HUE_SYNC_AREA]?.state === HUE_SYNC_AREA_NAME;
}
export function hueSyncZoneBlocked(states: States): boolean {
  // Unknown sync status must not allow a light command to silently interrupt streaming.
  return !['on', 'off'].includes(states[HUE_SYNC_SWITCH]?.state ?? '')
    || (states[HUE_SYNC_SWITCH]?.state === 'on'
      && (!states[HUE_SYNC_AREA] || ['unknown', 'unavailable'].includes(states[HUE_SYNC_AREA].state)))
    || hueSyncZoneActive(states);
}
export async function setHueSync(ha: Connection, getStates: () => States, enabled: boolean): Promise<void> {
  const states = getStates();
  if (!ha.isConnected || !['on', 'off'].includes(states[HUE_SYNC_SWITCH]?.state ?? '')) throw new Error('Hue Sync ist nicht erreichbar.');
  if (states[HUE_SYNC_AREA]?.state !== HUE_SYNC_AREA_NAME) throw new Error('An der Sync-Box ist eine andere oder keine Sync-Zone ausgewählt.');
  await ha.callService('switch', enabled ? 'turn_on' : 'turn_off', HUE_SYNC_SWITCH);
  // Wait for real HA acknowledgement (the integration polls the box), not synthetic state.
  const deadline = Date.now() + 12000;
  while (getStates()[HUE_SYNC_SWITCH]?.state !== (enabled ? 'on' : 'off')) {
    if (!ha.isConnected || Date.now() >= deadline) throw new Error('Sync-Status noch nicht bestätigt. Bitte erneut prüfen.');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
export async function commandHueSyncLights(ha: Connection, getStates: () => States, service: 'turn_on' | 'turn_off', data?: Record<string, unknown>): Promise<void> {
  const states = getStates();
  if (!ha.isConnected) throw new Error('Nicht mit Home Assistant verbunden.');
  if (hueSyncZoneBlocked(states)) throw new Error('Bitte zuerst Hue Sync stoppen und die Bestätigung abwarten.');
  const targets = HUE_SYNC_MEMBERS.filter(id => states[id] && !['unknown', 'unavailable'].includes(states[id].state));
  if (!targets.length) throw new Error('Keine Sync-Lampen erreichbar.');
  const results = await Promise.allSettled(targets.map(id => ha.callService('light', service, id, data)));
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed) throw new Error(`${failed} von ${targets.length} Lampen konnten nicht geändert werden.`);
}
export async function activateHueSyncScene(ha: Connection, getStates: () => States, entityId: string): Promise<void> {
  if (!ha.isConnected || hueSyncZoneBlocked(getStates())) throw new Error('Bitte zuerst Hue Sync stoppen.');
  if (!hueSyncScenes(getStates()).some(s => s.entity_id === entityId)) throw new Error('Diese Szene gehört nicht ausschließlich zur Sync-Zone.');
  await ha.callService('scene', 'turn_on', entityId);
}
