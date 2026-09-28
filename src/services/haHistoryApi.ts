import type { HAHistoryPoint } from '../types';
import { getActiveHAConnection, type HALike } from './haWebSocket';

// Connection-scoped result and in-flight request caches.
interface HistoryCache {
  data: Map<string, { data: HAHistoryPoint[]; ts: number }>;
  pending: Map<string, Promise<HAHistoryPoint[]>>;
}
// Requests/results from different HA servers must never share a cache entry.
const caches = new WeakMap<HALike, HistoryCache>();
const CACHE_TTL = 60_000; // 60s

function parsePeriod(period: string): number {
  const match = period.match(/^(\d+)(h|d|w)$/);
  if (!match) return 24 * 3600 * 1000;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'h') return val * 3600 * 1000;
  if (unit === 'd') return val * 24 * 3600 * 1000;
  if (unit === 'w') return val * 7 * 24 * 3600 * 1000;
  return 24 * 3600 * 1000;
}

export async function fetchHistory(entityId: string, period: string): Promise<HAHistoryPoint[]> {
  const conn = getActiveHAConnection();
  if (!conn) throw new Error('HA not connected');
  let cache = caches.get(conn);
  if (!cache) {
    cache = { data: new Map(), pending: new Map() };
    caches.set(conn, cache);
  }
  const cacheKey = `${entityId}:${period}`;
  const cached = cache.data.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!conn.isConnected) throw new Error('HA not connected');
  const existing = cache.pending.get(cacheKey);
  if (existing) return existing;

  const startTime = new Date(Date.now() - parsePeriod(period)).toISOString();
  const endTime = new Date().toISOString();

  const request = Promise.resolve().then(async () => {
    const result = await conn.request({
      type: 'history/history_during_period',
      start_time: startTime,
      end_time: endTime,
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
    }) as Record<string, Array<{ s: string; lu: number }>>;

    // WS minimal_response returns { entity_id: [{ s: state, lu: last_updated_ts }] }
    const raw = result[entityId] ?? [];
    const points: HAHistoryPoint[] = raw.map((r) => ({
      state: r.s,
      last_changed: new Date(r.lu * 1000).toISOString(),
    }));

    const now = Date.now();
    for (const [key, value] of cache.data) if (now - value.ts >= CACHE_TTL) cache.data.delete(key);
    cache.data.set(cacheKey, { data: points, ts: now });
    if (cache.data.size > 128) cache.data.delete(cache.data.keys().next().value!);
    return points;
  }).finally(() => cache.pending.delete(cacheKey));
  cache.pending.set(cacheKey, request);
  return request;
}

/** Generate synthetic temperature history for demo mode (sine wave 19-23 °C). */
export function generateDemoHistory(period: string): HAHistoryPoint[] {
  const match = period.match(/^(\d+)([hdw])$/);
  const hours = match
    ? { h: 1, d: 24, w: 168 }[match[2] as 'h' | 'd' | 'w']! * parseInt(match[1])
    : 24;

  const now = Date.now();
  const points: HAHistoryPoint[] = [];
  const count = Math.min(hours * 6, 200);

  for (let i = 0; i <= count; i++) {
    const t = now - (count - i) * (hours * 3600000) / count;
    const value = 21 + 2 * Math.sin((2 * Math.PI * (t / 3600000 - 6)) / 24);
    points.push({
      state: value.toFixed(1),
      last_changed: new Date(t).toISOString(),
    });
  }
  return points;
}
