import { useEffect, useRef, useState } from 'react';
import { Cigarette, Fan, Pencil, X } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { floorplanId } from '../babylon/FloorplanBindings';
import { setMarkerStyle, markerCenterToRef } from '../babylon/MarkerProjection';
import { useLatest, useMapMarkers, useMarkerPlacement } from './useMapMarkers';
import { fanState, statusIndicatorActive } from '../services/fanState';
import { getActiveHAConnection } from '../services/haWebSocket';
import './FanMarkers.css';
import { useConfiguredEntityStates } from '../services/entityStateSignal';

export default function FanMarkers({ scene, config, states, connected, open, onOpen, onAssign, onCommand }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
  open: string | null; onOpen: (id: string | null) => void; onAssign: (id: string) => void;
  onCommand?: (entityId: string, service: string, data?: Record<string, unknown>) => Promise<unknown>;
}) {
  useConfiguredEntityStates(config, o => Boolean(o.domain === 'fan' || o.statusIndicator));
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const panel = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<number | null>(null);
  const objects = config.model?.floorplan?.objects.filter(o => o.domain === 'fan' || o.statusIndicator) ?? [];
  const current = objects.find(o => o.id === open && o.domain === 'fan');
  const state = current ? fanState(states[current.entityId], connected) : null;
  useEffect(() => { setError(''); setDraft(null); }, [open, connected, state?.percentage]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !Object.values(refs.current).some(el => el?.contains(event.target as Node))) onOpen(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpen(null); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [onOpen]);
  const latest = useLatest({ states, connected });
  const markers = useMapMarkers(scene, () => objects.map(o => {
    const fallback = new Vector3(o.position.x, o.position.y, o.position.z).scale(config.model?.scale ?? 1);
    const meshes = scene.meshes.filter(m => floorplanId(m) === o.id && m.getTotalVertices() > 0);
    return {
      id: o.id, element: () => refs.current[o.id], occlude: true, display: 'flex',
      // Long press: fan on / off.
      primaryAction: o.entityId && !o.statusIndicator ? () => {
        const value = fanState(latest.current.states[o.entityId], latest.current.connected), ha = getActiveHAConnection();
        if (!value.available || !ha?.isConnected) return false;
        void ha.callService('fan', value.on ? 'turn_off' : 'turn_on', o.entityId);
        return true;
      } : undefined,
      interactive: !o.statusIndicator,
      stack: { group: 'fan', width: o.statusIndicator ? 100 : 44, height: 54 },
      anchor: (out: Vector3) => markerCenterToRef(meshes, fallback, out),
    };
  }), [config]);
  useMarkerPlacement(scene, markers, open, ({ x, y }) => {
    const element = panel.current; if (!element) return;
    setMarkerStyle(element, 'left', `${Math.max(8, Math.min(window.innerWidth - element.offsetWidth - 8, x + 30))}px`);
    setMarkerStyle(element, 'top', `${Math.max(8, Math.min(window.innerHeight - element.offsetHeight - 8, y - 60))}px`);
  });

  const send = async (service: 'turn_on' | 'turn_off' | 'set_percentage', percentage?: number) => {
    const ha = getActiveHAConnection();
    if (!current || !state?.available || (!onCommand && !ha?.isConnected) || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const data = percentage === undefined ? undefined : { percentage };
      if (onCommand) await onCommand(current.entityId, service, data);
      else await ha!.callService('fan', service, current.entityId, data);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Lüfter konnte nicht gesteuert werden.'); }
    finally { pending.current = false; setBusy(false); setDraft(null); }
  };
  return <>{objects.map(o => {
    if (o.statusIndicator) return statusIndicatorActive(o, states[o.entityId], connected)
      ? <div key={o.id} ref={el => { refs.current[o.id] = el; }} className="fan-map-marker smoke-map-marker" role="status" title={o.label}><Cigarette size={22}/><span>Rauch erkannt</span></div> : null;
    const value = fanState(states[o.entityId], connected);
    return <button key={o.id} ref={el => { refs.current[o.id] = el; }} className={`fan-map-marker ${value.on ? 'is-on' : ''}`}
      title={`${o.label} · ${!o.entityId ? 'Zuordnen' : !value.available ? 'Nicht verfügbar' : value.on ? `${value.percentage ?? '–'} %` : 'Aus'}`}
      aria-label={`${o.label} steuern`} aria-expanded={open === o.id} aria-haspopup="dialog"
      onClick={() => o.entityId ? onOpen(open === o.id ? null : o.id) : onAssign(o.id)}>
      <Fan size={22}/>{value.on && <span>{value.percentage ?? '–'} %</span>}{!o.entityId && <span>+</span>}
    </button>;
  })}{current && state && <section ref={panel} className="fan-popup" role="dialog" aria-label={`${current.label} steuern`}>
    <header><Fan size={20}/><strong>{current.label}</strong><button aria-label="Lüfter zuordnen" onClick={() => { onOpen(null); onAssign(current.id); }}><Pencil size={16}/></button><button aria-label="Lüftersteuerung schließen" onClick={() => onOpen(null)}><X size={18}/></button></header>
    <p>{!state.available ? 'Nicht verfügbar' : state.on ? `An · ${state.percentage ?? '–'} %` : 'Aus'}</p>
    <div className="fan-power"><button disabled={!state.available || busy} aria-pressed={state.on} onClick={() => void send('turn_on')}>An</button><button disabled={!state.available || busy} aria-pressed={state.available && !state.on} onClick={() => void send('turn_off')}>Aus</button></div>
    {state.supportsSpeed && <label>Stärke <output>{draft ?? state.percentage ?? 0} %</output><input aria-label="Lüfterstärke" type="range" min={0} max={100} step={state.step} value={draft ?? state.percentage ?? 0} disabled={busy}
      onChange={e => setDraft(Number(e.target.value))}
      onPointerUp={e => void send('set_percentage', Number(e.currentTarget.value))}
      onPointerCancel={() => setDraft(null)}
      onKeyUp={e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) void send('set_percentage', Number(e.currentTarget.value)); }}/></label>}
    {error && <p role="alert">{error}</p>}
  </section>}</>;
}
