import { useEffect, useRef, useState } from 'react';
import { HAConnection, getActiveHAConnection, setActiveHAConnection, type HAConnectionStatus } from '../../services/haWebSocket';
import { getSetting } from '../../services/settingsStore';
import { setHomeStatusRegistry } from '../../services/homeStatus';
import type { HAState } from '../../types';

/** A lightweight owner for the start page and its calendar; never starts a 3D scene. */
export function useMobileConnection(simulation: boolean) {
  const [status, setStatus] = useState<HAConnectionStatus>('disconnected');
  const [states, setStates] = useState<Record<string, HAState>>({});
  const [ready, setReady] = useState(false);
  const connection = useRef<HAConnection | null>(null);
  const settings = getSetting('connection');
  const configured = !simulation && settings.mode === 'live' && !!settings.haSettings.url && !!settings.haSettings.token;
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    const conn = new HAConnection(settings.haSettings, {
      onStatusChanged: next => {
        if (!alive) return;
        setStatus(next);
        if (next !== 'connected') { setReady(false); setStates({}); }
        else void conn.request({ type: 'config/entity_registry/list' }).then(result => {
          if (alive && Array.isArray(result)) { setHomeStatusRegistry(result); setStates(previous => ({ ...previous })); }
        }).catch(() => { /* Registry access is optional for non-admin HA users. */ });
      },
      onInitialStates: list => {
        if (alive) { setStates(Object.fromEntries(list.map(state => [state.entity_id, state]))); setReady(true); }
      },
      onStateChanged: (id, state) => { if (alive) setStates(previous => ({ ...previous, [id]: state })); },
    });
    connection.current = conn;
    setActiveHAConnection(conn);
    conn.connect();
    const resume = () => { if (!document.hidden) conn.forceReconnect(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      if (getActiveHAConnection() === conn) setActiveHAConnection(null);
      connection.current = null;
      conn.dispose();
    };
    // Settings are edited outside this route; remounting reads the new connection.
  }, [configured]);
  return { status, states, ready, configured, reconnect: () => connection.current?.forceReconnect() };
}
