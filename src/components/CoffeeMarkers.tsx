import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Coffee, Pencil, X } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { floorplanId } from '../babylon/FloorplanBindings';
import { setMarkerStyle, markerCenterToRef } from '../babylon/MarkerProjection';
import { useLatest, useMapMarkers, useMarkerPlacement } from './useMapMarkers';
import { coffeeState, coffeeProgram } from '../services/coffeeState';
import { getActiveHAConnection } from '../services/haWebSocket';
import './CoffeeMarkers.css';
import { useEntityStatesVersion } from '../services/entityStateSignal';

export default function CoffeeMarkers({ scene, config, states, connected, open, onOpen, onAssign, onCommand }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
  open: string | null; onOpen: (id: string | null) => void; onAssign: (id: string) => void;
  onCommand?: (domain: string, service: string, entityId: string, data?: Record<string, unknown>) => Promise<unknown>;
}) {
  useEntityStatesVersion(); // re-render on state changes (see entityStateSignal)
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const panel = useRef<HTMLElement>(null), pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState(''), [now, setNow] = useState(Date.now());
  const objects = config.model?.floorplan?.objects.filter(o => o.coffee) ?? [];
  const current = objects.find(o => o.id === open);
  const value = current ? coffeeState(current, states, connected, now) : null;
  const anyRunning = objects.some(o => coffeeState(o, states, connected, now).running);
  useEffect(() => { setError(''); setSelected(''); }, [open]);
  useEffect(() => {
    setNow(Date.now());
    if (!anyRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [anyRunning]);
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
      id: o.id, element: () => refs.current[o.id], occlude: false, display: 'flex',
      // Long press: power on / off, never while a program runs.
      primaryAction: o.entityId ? () => {
        const value = coffeeState(o, latest.current.states, latest.current.connected, Date.now()), ha = getActiveHAConnection();
        if (!value.canPower || value.inProgress || !ha?.isConnected) return false;
        void ha.callService('switch', value.on ? 'turn_off' : 'turn_on', o.entityId);
        return true;
      } : undefined,
      stack: { group: 'coffee', width: 140, height: 72 },
      anchor: (out: Vector3) => markerCenterToRef(meshes, fallback, out),
    };
  }), [config]);
  useMarkerPlacement(scene, markers, open, ({ x, y }) => {
    const element = panel.current; if (!element) return;
    setMarkerStyle(element, 'left', `${Math.max(8, Math.min(window.innerWidth - element.offsetWidth - 8, x + 90))}px`);
    setMarkerStyle(element, 'top', `${Math.max(8, Math.min(window.innerHeight - element.offsetHeight - 8, y - 60))}px`);
  });

  const send = async (action: 'on' | 'off' | 'start' | 'stop') => {
    const ha = getActiveHAConnection();
    if (!current || !value || pending.current || (!onCommand && !ha?.isConnected)) return;
    const c = current.coffee!;
    if ((action === 'on' || action === 'off') && (!value.canPower || value.inProgress)) return;
    if (action === 'start' && (!value.canStart || !value.options.includes(selected))) return;
    if (action === 'stop' && !value.canStop) return;
    const domain = action === 'start' ? 'select' : action === 'stop' ? 'button' : 'switch';
    const service = action === 'start' ? 'select_option' : action === 'stop' ? 'press' : action === 'on' ? 'turn_on' : 'turn_off';
    const entityId = action === 'start' ? c.activeProgramEntityId : action === 'stop' ? c.stopEntityId : current.entityId;
    const data = action === 'start' ? { option: selected } : undefined;
    pending.current = true; setBusy(true); setError('');
    try {
      if (onCommand) await onCommand(domain, service, entityId, data);
      else await ha!.callService(domain, service, entityId, data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Befehl fehlgeschlagen.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <>{objects.map(o => {
    const state = coffeeState(o, states, connected, now);
    const time = state.remaining ? `Noch ${state.remaining}` : state.elapsed ? `Seit ${state.elapsed}` : '';
    return <button key={o.id} ref={el => { refs.current[o.id] = el; }}
      className={`coffee-marker ${state.running ? 'is-running' : ''} ${state.inProgress && !state.running ? 'needs-attention' : ''} ${state.alerts.length ? 'needs-service' : ''}`}
      title={[o.label, state.label, ...state.alerts].join(' · ')} aria-label={`${o.label} steuern${state.alerts.length ? ` · ${state.alerts.join(', ')}` : ''}`} aria-expanded={open === o.id} aria-haspopup="dialog"
      onClick={() => o.entityId ? onOpen(open === o.id ? null : o.id) : onAssign(o.id)}>
      <Coffee size={20}/>{!o.entityId && <span>+</span>}
      {state.alerts.length > 0 && <span className="coffee-alert-badge" aria-hidden="true">!</span>}
      {state.inProgress ? <span className="coffee-caption">{state.program || state.label}{time && <small>{time}</small>}</span>
        : state.alerts.length > 0 && <span className="coffee-caption coffee-caption-alert">{state.alerts.join(' · ')}</span>}
    </button>;
  })}{current && value && <section ref={panel} className="coffee-popup" role="dialog" aria-label={`${current.label} steuern`}>
    <header><Coffee size={20}/><strong>{current.label}</strong><button aria-label="Kaffeemaschine zuordnen" onClick={() => { onOpen(null); onAssign(current.id); }}><Pencil size={16}/></button><button aria-label="Kaffeesteuerung schließen" onClick={() => onOpen(null)}><X size={18}/></button></header>
    <small>Siemens TI9558X1DE · {current.room}</small>
    <p className={value.running ? 'coffee-running' : ''} role="status">{value.label}</p>
    {value.alerts.length > 0 && <ul className="coffee-alerts" role="alert">{value.alerts.map(alert => <li key={alert}><AlertTriangle size={15}/>{alert}</li>)}</ul>}
    {value.inProgress && <dl><dt>Programm</dt><dd>{value.program || 'Nicht gemeldet'}</dd>
      <dt>Restzeit</dt><dd>{value.remaining || 'Nicht gemeldet'}</dd>
      {value.elapsed && <><dt>Läuft seit</dt><dd>{value.elapsed}</dd></>}
    </dl>}
    {value.progress !== null && <label className="coffee-progress">Fortschritt {Math.round(value.progress)} %<progress max={100} value={value.progress}/></label>}
    <div className="coffee-actions"><button disabled={busy || !value.canPower || value.inProgress || value.on} onClick={() => void send('on')}>Einschalten</button><button disabled={busy || !value.canPower || value.inProgress || !value.on} onClick={() => void send('off')}>Ausschalten</button></div>
    {!value.inProgress && <><label className="coffee-program">Getränk<select aria-label="Kaffeeprogramm" value={value.options.includes(selected) ? selected : ''} disabled={busy || !value.available || !value.options.length} onChange={e => setSelected(e.target.value)}>
      <option value="">Programm wählen</option>{value.options.map(option => <option key={option} value={option}>{coffeeProgram(option)}</option>)}
    </select></label><button className="coffee-start" disabled={busy || !value.canStart || !value.options.includes(selected)} onClick={() => void send('start')}>Getränk starten</button>
    {value.startHint && <p className="coffee-hint">{value.startHint}</p>}</>}
    {value.inProgress && <button className="coffee-stop" disabled={busy || !value.canStop} onClick={() => void send('stop')}>Programm stoppen</button>}
    {busy && <p role="status">Befehl wird gesendet …</p>}{error && <p role="alert">{error}</p>}
  </section>}</>;
}
