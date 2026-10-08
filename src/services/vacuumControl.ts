import type { HAState } from '../types';

export interface VacuumSegment { id: string; name: string }
/** A Home Assistant area the robot can clean (`vacuum.clean_area`), named after its map rooms. */
export interface VacuumRoom { areaId: string; name: string }
export type VacuumCommand = 'start' | 'pause' | 'resume' | 'return' | 'stop';

const RANK: Record<string, number> = { cleaning: 5, returning: 4, paused: 3, error: 2, idle: 1, docked: 0 };
const LABEL: Record<string, string> = {
  cleaning: 'Reinigt', returning: 'Fährt zur Station', paused: 'Pausiert', error: 'Fehler', idle: 'Bereit', docked: 'In der Station',
};
const FAN: Record<string, string> = { quiet: 'Leise', normal: 'Normal', standard: 'Normal', strong: 'Stark', max: 'Max', max_plus: 'Max+', turbo: 'Turbo' };

/** One robot behind several integrations reports changes at different times: the most active state wins. */
export function vacuumState(...states: (HAState | undefined)[]): HAState | undefined {
  return states.filter((s): s is HAState => !!s && s.state in RANK).sort((a, b) => RANK[b.state] - RANK[a.state])[0]
    ?? states.find(s => !!s);
}

export function vacuumView(state: HAState | undefined, connected: boolean) {
  const value = connected ? state?.state ?? 'unavailable' : 'unavailable';
  const available = connected && value in RANK;
  const active = value === 'cleaning' || value === 'returning';
  return {
    value, available, active,
    label: LABEL[value] ?? (connected ? 'Nicht erreichbar' : 'Keine Verbindung'),
    canStart: available && !active && value !== 'paused',
    canPause: available && value === 'cleaning',
    canResume: available && value === 'paused',
    canReturn: available && value !== 'docked' && value !== 'returning',
    canStop: available && (active || value === 'paused'),
  };
}

export const fanSpeedLabel = (speed: string) => FAN[speed] ?? speed.replace(/_/g, ' ');

/** Service call for a command; resuming a paused job is `vacuum.start`. */
export function vacuumService(command: VacuumCommand): string {
  return command === 'resume' || command === 'start' ? 'start' : command === 'return' ? 'return_to_base' : command;
}

/**
 * Areas in the robot's own room order (its segments), from the entity's area mapping.
 * An area mapped to several segments takes their joined names; unmapped segments are left out.
 */
export function cleanableRooms(segments: VacuumSegment[], areaMapping: Record<string, string[]> | undefined): VacuumRoom[] {
  if (!areaMapping) return [];
  const rooms = new Map<string, string[]>();
  for (const segment of segments) {
    const areaId = Object.keys(areaMapping).find(area => areaMapping[area]?.includes(segment.id));
    if (areaId) rooms.set(areaId, [...rooms.get(areaId) ?? [], segment.name]);
  }
  return [...rooms].map(([areaId, names]) => ({ areaId, name: names.join(' + ') }));
}
