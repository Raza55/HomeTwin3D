import type { FloorplanObject, HAState } from '../types';

export type VacuumTracking = NonNullable<FloorplanObject['vacuum']>;
/** Robot pose in model coordinates (metres, before model scale); `yaw` is the heading angle in the X/Z plane. */
export interface VacuumPose { x: number; z: number; yaw: number }
/** `atStation`: the robot stands on its charging position (e.g. while the station washes the mop). */
export interface EcovacsPosition { x: number; y: number; a: number; atStation?: boolean }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateVacuumTracking(value: unknown): void {
  const v = value as VacuumTracking;
  if (!v || typeof v !== 'object' || typeof v.positionEntityId !== 'string' || !/^vacuum\.[a-z0-9_]+$/.test(v.positionEntityId)
    || !Array.isArray(v.mapTransform) || v.mapTransform.length !== 6 || !v.mapTransform.every(finite)
    || (v.restYawDeg !== undefined && !finite(v.restYawDeg))) throw new Error('Ungültige Saugroboter-Kartenzuordnung.');
}

/** Robot position from an `ecovacs.raw_get_positions` service response (map millimetres, heading in degrees). */
export function parseEcovacsPosition(response: unknown, entityId: string): EcovacsPosition | null {
  type Raw = { x?: unknown; y?: unknown; a?: unknown; invalid?: unknown };
  const entry = (response as Record<string, unknown> | null)?.[entityId] as { resp?: { body?: { data?: { deebotPos?: Raw; chargePos?: Raw[] } } } } | undefined;
  const data = entry?.resp?.body?.data, pos = data?.deebotPos;
  if (!pos || pos.invalid === 1 || !finite(pos.x) || !finite(pos.y)) return null;
  const { x, y } = pos;
  const atStation = Array.isArray(data?.chargePos) && data.chargePos.some(c => c?.invalid !== 1 && finite(c?.x) && finite(c?.y) && Math.hypot(c.x - x, c.y - y) <= 60);
  return { x, y, a: finite(pos.a) ? pos.a : 0, atStation };
}

/** `mapTransform` [a, b, c, d, e, f]: X = a·x + b·y + c, Z = d·x + e·y + f (map millimetres to model metres). */
export function mapToModel(tracking: VacuumTracking, p: EcovacsPosition): VacuumPose {
  const [a, b, c, d, e, f] = tracking.mapTransform;
  const rad = p.a * Math.PI / 180, dx = Math.cos(rad), dy = Math.sin(rad);
  return { x: a * p.x + b * p.y + c, z: d * p.x + e * p.y + f, yaw: Math.atan2(d * dx + e * dy, a * dx + b * dy) };
}

const ACTIVE = new Set(['cleaning', 'returning']);
const AWAY = new Set(['paused', 'idle', 'error']);

/**
 * Polling interval for the robot; null while docked or unknown (the model shows it at its station).
 * Integrations of one robot report state changes at different times, so the most active one wins.
 */
export function vacuumPollDelay(...states: (HAState | undefined)[]): number | null {
  const delays = states.flatMap(state => !state ? [] : ACTIVE.has(state.state) ? [2500] : AWAY.has(state.state) ? [20000] : []);
  return delays.length ? Math.min(...delays) : null;
}
