import { useEffect, useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import EchoIcon from './EchoIcon';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { floorplanId } from '../babylon/FloorplanBindings';
import { setMarkerStyle, markerCenterToRef } from '../babylon/MarkerProjection';
import { useLatest, useMapMarkers, useMarkerPlacement } from './useMapMarkers';
import { echoState, type EchoService } from '../services/echoState';
import { getActiveHAConnection } from '../services/haWebSocket';
import './EchoMarkers.css';

export default function EchoMarkers({ scene, config, states, connected, open, onOpen, onAssign, onCommand }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
  open: string | null; onOpen: (id: string | null) => void; onAssign: (id: string) => void;
  onCommand?: (entityId: string, service: string, data?: Record<string, unknown>) => Promise<unknown>;
}) {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const panel = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<number | null>(null);
  const objects = config.model?.floorplan?.objects.filter(o => o.echo) ?? [];
  const current = objects.find(o => o.id === open && o.echo);
  const state = current ? echoState(states[current.entityId], connected) : null;
  useEffect(() => { setError(''); setDraft(null); }, [open, connected, state?.volume]);
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
      // Long press: play / pause.
      primaryAction: o.entityId ? () => {
        const value = echoState(latest.current.states[o.entityId], latest.current.connected), ha = getActiveHAConnection();
        const service = value.active ? 'media_pause' : 'media_play';
        if (!value.available || !value.supports(service) || !ha?.isConnected) return false;
        void ha.callService('media_player', service, o.entityId);
        return true;
      } : undefined,
      stack: { group: 'echo', width: 28, height: 28 },
      anchor: (out: Vector3) => markerCenterToRef(meshes, fallback, out),
    };
  }), [config]);
  useMarkerPlacement(scene, markers, open, ({ x, y }) => {
    const element = panel.current; if (!element) return;
    setMarkerStyle(element, 'left', `${Math.max(8, Math.min(window.innerWidth - element.offsetWidth - 8, x + 30))}px`);
    setMarkerStyle(element, 'top', `${Math.max(8, Math.min(window.innerHeight - element.offsetHeight - 8, y - 60))}px`);
  });

  const send = async (service: EchoService, data?: Record<string, unknown>) => {
    const ha = getActiveHAConnection();
    if (!current || !state?.supports(service) || (!onCommand && !ha?.isConnected) || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (onCommand) await onCommand(current.entityId, service, data);
      else await ha!.callService('media_player', service, current.entityId, data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Echo konnte nicht gesteuert werden.'); }
    finally { pending.current = false; setBusy(false); setDraft(null); }
  };
  return <>{objects.map(o => {
    const value = echoState(states[o.entityId], connected);
    return <button key={o.id} ref={el => { refs.current[o.id] = el; }}
      className={`echo-map-marker ${!o.entityId ? 'is-unassigned' : !value.available ? 'is-unavailable' : value.active ? 'is-active' : value.value === 'paused' ? 'is-paused' : ''}`}
      title={`${o.label} · ${!o.entityId ? 'Zuordnen' : value.label}${value.muted ? ' · Stumm' : ''}`}
      aria-label={`${o.label} · ${!o.entityId ? 'Zuordnen' : value.label}`} aria-expanded={open === o.id} aria-haspopup="dialog"
      onClick={() => o.entityId ? onOpen(open === o.id ? null : o.id) : onAssign(o.id)}>
      <EchoIcon kind={o.echo!.kind}/>{!o.entityId && <span className="echo-badge">+</span>}
      {o.entityId && (value.active || value.value === 'paused' || value.muted) && <span className="echo-badge">{value.muted ? '×' : value.value === 'paused' ? 'Ⅱ' : '▶'}</span>}
    </button>;
  })}{current && state && <section ref={panel} className="echo-popup" role="dialog" aria-label={`${current.label} steuern`}>
    <header><EchoIcon kind={current.echo!.kind} size={20}/><strong>{current.label}</strong><button aria-label="Echo zuordnen" onClick={() => { onOpen(null); onAssign(current.id); }}><Pencil size={15}/></button><button aria-label="Echo-Steuerung schließen" onClick={() => onOpen(null)}><X size={18}/></button></header>
    <p role="status">{state.label}{state.muted ? ' · Stumm' : ''}</p>
    {state.title && <p className="echo-title">{state.title}</p>}
    <div className="echo-actions">{([
      ['turn_on', 'An'], ['turn_off', 'Aus'], ['media_play', 'Abspielen'], ['media_pause', 'Pause'],
      ['media_stop', 'Stopp'], ['media_previous_track', 'Zurück'], ['media_next_track', 'Weiter'],
    ] as const).filter(([service]) => state.supports(service)).map(([service, label]) => <button key={service} disabled={busy} onClick={() => void send(service)}>{label}</button>)}</div>
    {state.supports('volume_set') && <label>Lautstärke <output>{draft ?? state.volume ?? '–'} %</output><input aria-label="Echo-Lautstärke" type="range" min={0} max={100} step={1} value={draft ?? state.volume ?? 0} disabled={busy}
      onChange={e => setDraft(Number(e.target.value))} onPointerCancel={() => setDraft(null)}
      onPointerUp={e => void send('volume_set', { volume_level: Number(e.currentTarget.value) / 100 })}
      onKeyUp={e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) void send('volume_set', { volume_level: Number(e.currentTarget.value) / 100 }); }}/></label>}
    {state.supports('volume_mute') && <button className="echo-mute" disabled={busy} aria-pressed={state.muted} onClick={() => void send('volume_mute', { is_volume_muted: !state.muted })}>{state.muted ? 'Ton an' : 'Stumm'}</button>}
    {error && <p role="alert">{error}</p>}
  </section>}</>;
}
