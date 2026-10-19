import { useEffect, useRef, useState } from 'react';
import { HAConnection } from '../../services/haWebSocket';
import { getSetting } from '../../services/settingsStore';
import { LOCAL_LIST, addShoppingItem, fetchShoppingItems, fetchShoppingLists, itemKey, learnPurchase, parseShoppingInput, readItems, readPurchases, readStored, type ShoppingItem, type ShoppingList } from '../../services/shopping';

export function useShopping(demo: boolean, de: boolean) {
  const [list, setList] = useState(() => { const v = readStored<unknown>('shopping.selected', LOCAL_LIST); return typeof v === 'string' ? v : LOCAL_LIST; });
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [connected, setConnected] = useState(false);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [history, setHistory] = useState(() => readPurchases('shopping.history.' + list));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const conn = useRef<HAConnection | null>(null);
  const locked = useRef(false);
  const epoch = useRef(0);
  const local = list === LOCAL_LIST;
  const cacheKey = 'shopping.items.' + list;
  const info = lists.find(l => l.id === list);
  const writable = local || connected && loaded && !!info?.available;
  const canAdd = writable && (local || !!((info?.features ?? 0) & 1));
  const canUpdate = writable && (local || !!((info?.features ?? 0) & 4));

  useEffect(() => {
    const settings = getSetting('connection');
    if (demo || settings.mode === 'demo' || !settings.haSettings.url || !settings.haSettings.token) return;
    let alive = true;
    const connection = new HAConnection(settings.haSettings, { onStatusChanged: status => {
      if (!alive) return;
      setConnected(status === 'connected');
      if (status === 'connected') setTick(n => n + 1);
    } });
    conn.current = connection; connection.connect();
    const resume = () => { if (!document.hidden && !locked.current) connection.forceReconnect(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { alive = false; conn.current = null; document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); connection.dispose(); };
  }, [demo]);

  useEffect(() => {
    const generation = ++epoch.current;
    let running = false;
    setItems(readItems(cacheKey)); setHistory(readPurchases('shopping.history.' + list));
    setLoaded(local);
    const load = async () => {
      const c = conn.current;
      if (!c?.isConnected || running || locked.current) return;
      running = true;
      try {
        const available = await fetchShoppingLists(c);
        if (epoch.current !== generation) return;
        setLists(available);
        if (!local) {
          if (!available.some(l => l.id === list && l.available)) throw new Error('Unavailable');
          const next = await fetchShoppingItems(c, list);
          if (epoch.current !== generation || locked.current) return;
          setItems(next); setLoaded(true);
          try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* online list still works */ }
        }
      } catch {
        if (epoch.current === generation && !local) { setLoaded(false); setError(de ? 'Liste nicht erreichbar. Gespeicherter Stand – bitte aktualisieren.' : 'List unavailable. Showing saved items — please refresh.'); }
      } finally { running = false; }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 15000);
    const focus = () => { if (local) setItems(readItems(cacheKey)); else void load(); };
    window.addEventListener('focus', focus); window.addEventListener('storage', focus); document.addEventListener('visibilitychange', focus);
    return () => { ++epoch.current; clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('storage', focus); document.removeEventListener('visibilitychange', focus); };
  }, [list, tick, connected, local, cacheKey, de]);

  function select(id: string) {
    if (locked.current) return;
    ++epoch.current; setLoaded(false); setItems([]); setError(''); setList(id);
    try { localStorage.setItem('shopping.selected', JSON.stringify(id)); } catch { /* selection is usable for this visit */ }
  }
  async function mutate(action: (c: HAConnection | null, current: ShoppingItem[]) => Promise<ShoppingItem[] | null>): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(''); ++epoch.current;
    try {
      const current = local ? readItems(cacheKey) : items;
      const next = await action(conn.current, current);
      if (next) { localStorage.setItem(cacheKey, JSON.stringify(next)); setItems(next); }
      return true;
    } catch {
      setError(de ? 'Nicht bestätigt. Bitte aktualisieren und prüfen, bevor du es erneut versuchst.' : 'Not confirmed. Refresh and check before trying again.');
      return false;
    } finally { locked.current = false; setBusy(false); setTick(n => n + 1); }
  }
  async function add(text: string) {
    if (!canAdd) return false;
    return mutate(async (c, current) => {
      let next = [...current];
      let learned = readPurchases('shopping.history.' + list);
      for (const name of parseShoppingInput(text)) {
        if (next.some(i => i.status === 'needs_action' && itemKey(i.summary) === itemKey(name))) continue;
        if (!local) { if (!c?.isConnected) throw new Error('Offline'); await addShoppingItem(c, list, name, next, canUpdate); }
        const done = next.find(i => i.status === 'completed' && itemKey(i.summary) === itemKey(name));
        if (done && (local || canUpdate)) next = next.map(i => i.uid === done.uid ? { ...i, status: 'needs_action' } : i);
        else next.push({ uid: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, summary: name, status: 'needs_action' });
        // Persist learning only after a successful operation; it is device-local.
        learned = learnPurchase(learned, name);
        if (local) { localStorage.setItem(cacheKey, JSON.stringify(next)); setItems(next); }
        try { localStorage.setItem('shopping.history.' + list, JSON.stringify(learned)); setHistory(learned); } catch { /* optional history */ }
      }
      return local ? next : null;
    });
  }
  async function toggle(item: ShoppingItem) {
    if (!canUpdate) return;
    await mutate(async (c, current) => {
      const status = item.status === 'completed' ? 'needs_action' : 'completed';
      if (!local) { if (!c?.isConnected) throw new Error('Offline'); await c.callService('todo', 'update_item', list, { item: item.uid, status }); return null; }
      return current.map(i => i.uid === item.uid ? { ...i, status } : i);
    });
  }
  async function refresh() {
    await mutate(async c => {
      if (!local) { if (!c?.isConnected) throw new Error('Offline'); await c.callService('homeassistant', 'update_entity', list); }
      return null;
    });
  }
  return { list, lists, items, history, local, connected, loaded, busy, error, canAdd, canUpdate, select, add, toggle, refresh };
}
