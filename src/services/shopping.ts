import type { HALike } from './haWebSocket';
import { matchesShoppingSearch } from './shoppingPresets.ts';

export interface ShoppingItem { uid: string; summary: string; status: 'needs_action' | 'completed' }
export interface ShoppingList { id: string; name: string; features: number; available: boolean }
export interface Purchase { name: string; count: number; last: number }
export const LOCAL_LIST = 'local';
export const itemKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

/** Commas between digits belong to quantities (1,5 l), not separators. */
export function parseShoppingInput(text: string): string[] {
  const seen = new Set<string>();
  return text.split(/(?<!\d),|,(?!\d)|[;\n]+/u).map(s => s.trim().replace(/\s+/g, ' '))
    .filter(s => { const key = itemKey(s); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

export function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
export function readItems(key: string): ShoppingItem[] {
  const value = readStored<unknown>(key, []);
  return Array.isArray(value) ? value.filter((i): i is ShoppingItem => !!i && typeof i.uid === 'string' && typeof i.summary === 'string' && ['needs_action', 'completed'].includes(i.status)) : [];
}
export function readPurchases(key: string): Purchase[] {
  const value = readStored<unknown>(key, []);
  return Array.isArray(value) ? value.filter((i): i is Purchase => !!i && typeof i.name === 'string' && Number.isFinite(i.count) && i.count > 0 && Number.isFinite(i.last)) : [];
}
export function learnPurchase(history: Purchase[], name: string, now = Date.now()): Purchase[] {
  const old = history.find(p => itemKey(p.name) === itemKey(name));
  return [{ name, count: (old?.count ?? 0) + 1, last: now }, ...history.filter(p => itemKey(p.name) !== itemKey(name))].slice(0, 200);
}
export function shoppingSuggestions(history: Purchase[], items: ShoppingItem[], query: string, defaults: string[]): string[] {
  const open = new Set(items.filter(i => i.status === 'needs_action').map(i => itemKey(i.summary)));
  const candidates = [...history].sort((a, b) => b.count - a.count || b.last - a.last).map(p => p.name);
  candidates.push(...items.filter(i => i.status === 'completed').map(i => i.summary), ...defaults);
  const seen = new Set<string>();
  return candidates.filter(name => {
    const key = itemKey(name);
    if (seen.has(key) || open.has(key) || !matchesShoppingSearch(name, query)) return false;
    seen.add(key); return true;
  }).slice(0, 8);
}

export async function fetchShoppingLists(conn: HALike): Promise<ShoppingList[]> {
  const states = await conn.request({ type: 'get_states' }) as { entity_id: string; state: string; attributes?: { friendly_name?: string; supported_features?: number } }[];
  if (!Array.isArray(states)) throw new Error('Invalid states');
  return states.filter(s => s.entity_id.startsWith('todo.')).map(s => ({
    id: s.entity_id, name: s.attributes?.friendly_name ?? s.entity_id,
    features: s.attributes?.supported_features ?? 0, available: !['unavailable', 'unknown'].includes(s.state),
  }));
}
export async function fetchShoppingItems(conn: HALike, entity: string): Promise<ShoppingItem[]> {
  const result = await conn.request({ type: 'call_service', domain: 'todo', service: 'get_items', target: { entity_id: entity }, return_response: true }) as { response?: Record<string, { items?: ShoppingItem[] }> };
  const items = result?.response?.[entity]?.items;
  if (!Array.isArray(items) || items.some(i => !i || typeof i.uid !== 'string' || typeof i.summary !== 'string' || !['needs_action', 'completed'].includes(i.status))) throw new Error('Invalid list response');
  return items;
}
export async function addShoppingItem(conn: HALike, entity: string, name: string, items: ShoppingItem[], canUpdate: boolean): Promise<void> {
  if (items.some(i => i.status === 'needs_action' && itemKey(i.summary) === itemKey(name))) return;
  const done = items.find(i => i.status === 'completed' && itemKey(i.summary) === itemKey(name));
  if (done && canUpdate) await conn.callService('todo', 'update_item', entity, { item: done.uid, status: 'needs_action' });
  else await conn.callService('todo', 'add_item', entity, { item: name });
}
