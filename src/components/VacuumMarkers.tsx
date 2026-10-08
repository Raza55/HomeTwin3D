import { useEffect, useRef, useState } from 'react';
import { CircleDot, House, Pause, Play, Square, X } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, FloorplanObject, HAState } from '../types';
import { floorplanId } from '../babylon/FloorplanBindings';
import { markerCenterToRef, setMarkerStyle } from '../babylon/MarkerProjection';
import { useMapMarkers, useMarkerPlacement } from './useMapMarkers';
import { getActiveHAConnection } from '../services/haWebSocket';
import { useConfiguredEntityStates } from '../services/entityStateSignal';
import { cleanableRooms, fanSpeedLabel, vacuumService, vacuumState, vacuumView, type VacuumCommand, type VacuumRoom, type VacuumSegment } from '../services/vacuumControl';
import './VacuumMarkers.css';

const robotStates = (o: FloorplanObject, states: Record<string, HAState>) =>
  [o.entityId ? states[o.entityId] : undefined, o.vacuum ? states[o.vacuum.positionEntityId] : undefined];

/**
 * Robot vacuum marker (it follows the moving robot) and its popup: rooms to clean,
 * suction power, and pause/resume, return and stop while it works.
 * Rooms are the robot's map segments that are mapped to Home Assistant areas.
 */
export default function VacuumMarkers({ scene, config, states, connected, open, onOpen }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
  open: string | null; onOpen: (id: string | null) => void;
}) {
  useConfiguredEntityStates(config, o => o.domain === 'vacuum');
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const panel = useRef<HTMLElement>(null), pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [rooms, setRooms] = useState<VacuumRoom[] | null>(null), [selected, setSelected] = useState<string[]>([]);
  const objects = config.model?.floorplan?.objects.filter(o => o.domain === 'vacuum' && o.entityId) ?? [];
  const current = objects.find(o => o.id === open);
  const state = current ? vacuumState(...robotStates(current, states)) : undefined;
  const view = vacuumView(state, connected);
  // Suction power lives on whichever integration reports a speed list.
  const fanState = current && robotStates(current, states).find(s => Array.isArray(s?.attributes.fan_speed_list));

  useEffect(() => {
    setError(''); setSelected([]); setRooms(null);
    const ha = getActiveHAConnection();
    if (!current || !ha) return;
    let cancelled = false;
    void Promise.all([
      ha.request({ type: 'vacuum/get_segments', entity_id: current.entityId }),
      ha.request({ type: 'config/entity_registry/get', entity_id: current.entityId }),
    ]).then(([segments, entry]) => {
      const list = (segments as { segments?: VacuumSegment[] } | undefined)?.segments ?? [];
      const mapping = (entry as { options?: { vacuum?: { area_mapping?: Record<string, string[]> } } } | undefined)?.options?.vacuum?.area_mapping;
      if (!cancelled) setRooms(cleanableRooms(list, mapping));
    }).catch(() => { if (!cancelled) setRooms([]); });
    return () => { cancelled = true; };
  }, [open, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !Object.values(refs.current).some(el => el?.contains(event.target as Node))) onOpen(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpen(null); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [onOpen]);

  const markers = useMapMarkers(scene, () => objects.map(o => {
    const fallback = new Vector3(o.position.x, o.position.y, o.position.z).scale(config.model?.scale ?? 1);
    const meshes = scene.meshes.filter(m => floorplanId(m) === o.id && m.getTotalVertices() > 0);
    return {
      id: o.id, element: () => refs.current[o.id], occlude: false, display: 'flex',
      offset: { x: 0, y: -30 },
      // Re-evaluated every frame, so the marker travels with the robot.
      anchor: (out: Vector3) => markerCenterToRef(meshes, fallback, out),
    };
  }), [config]);
  useMarkerPlacement(scene, markers, open, ({ x, y }) => {
    const element = panel.current; if (!element) return;
    setMarkerStyle(element, 'left', `${Math.max(8, Math.min(window.innerWidth - element.offsetWidth - 8, x + 30))}px`);
    setMarkerStyle(element, 'top', `${Math.max(8, Math.min(window.innerHeight - element.offsetHeight - 8, y - 60))}px`);
  });

  const call = async (service: string, entityId: string, data?: Record<string, unknown>) => {
    const ha = getActiveHAConnection();
    if (pending.current || !ha?.isConnected) return;
    pending.current = true; setBusy(true); setError('');
    try { await ha.callService('vacuum', service, entityId, data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Befehl fehlgeschlagen.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const command = (c: VacuumCommand) => current && void call(vacuumService(c), current.entityId);
  const cleanRooms = () => current && selected.length && void call('clean_area', current.entityId, { cleaning_area_id: selected });
  const toggleRoom = (areaId: string) => setSelected(list => list.includes(areaId) ? list.filter(id => id !== areaId) : [...list, areaId]);

  return <>{objects.map(o => {
    const v = vacuumView(vacuumState(...robotStates(o, states)), connected);
    return <button key={o.id} ref={el => { refs.current[o.id] = el; }}
      className={`vacuum-marker ${v.active ? 'is-active' : ''} ${v.value === 'paused' || v.value === 'error' ? 'needs-attention' : ''}`}
      title={`${o.label} · ${v.label}`} aria-label={`${o.label} steuern · ${v.label}`} aria-expanded={open === o.id} aria-haspopup="dialog"
      onClick={() => onOpen(open === o.id ? null : o.id)}>
      <CircleDot size={18}/>{(v.active || v.value === 'paused') && <span className="vacuum-caption">{v.label}</span>}
    </button>;
  })}{current && <section ref={panel} className="vacuum-popup" role="dialog" aria-label={`${current.label} steuern`}>
    <header><CircleDot size={20}/><strong>{current.label}</strong><button aria-label="Saugrobotersteuerung schließen" onClick={() => onOpen(null)}><X size={18}/></button></header>
    <p className={view.active ? 'vacuum-running' : ''} role="status">{view.label}</p>
    {(view.active || view.value === 'paused') && <div className="vacuum-actions">
      {view.canPause && <button disabled={busy} onClick={() => command('pause')}><Pause size={16}/>Pause</button>}
      {view.canResume && <button disabled={busy} onClick={() => command('resume')}><Play size={16}/>Fortsetzen</button>}
      <button disabled={busy || !view.canReturn} onClick={() => command('return')}><House size={16}/>Zur Station</button>
      <button disabled={busy || !view.canStop} onClick={() => command('stop')}><Square size={14}/>Stopp</button>
    </div>}
    {!view.active && view.value !== 'paused' && <>
      <fieldset className="vacuum-rooms" disabled={busy || !view.canStart}>
        <legend>Räume</legend>
        {rooms === null ? <small>Räume werden geladen …</small>
          : rooms.length ? rooms.map(room => <button key={room.areaId} aria-pressed={selected.includes(room.areaId)} onClick={() => toggleRoom(room.areaId)}>{room.name}</button>)
          : <small>Keine Räume zugeordnet. In Home Assistant beim Saugroboter die Räume den Bereichen zuordnen.</small>}
      </fieldset>
      <button className="vacuum-start" disabled={busy || !view.canStart || !selected.length} onClick={cleanRooms}>
        {selected.length ? `${selected.length === 1 ? '1 Raum' : `${selected.length} Räume`} reinigen` : 'Räume wählen'}</button>
      <button className="vacuum-all" disabled={busy || !view.canStart} onClick={() => command('start')}>Ganze Wohnung reinigen</button>
      {view.value !== 'docked' && <button className="vacuum-all" disabled={busy || !view.canReturn} onClick={() => command('return')}><House size={16}/>Zur Station</button>}
    </>}
    {fanState && <label className="vacuum-fan">Saugkraft<select aria-label="Saugkraft" disabled={busy || !view.available}
      value={String(fanState.attributes.fan_speed ?? '')} onChange={e => void call('set_fan_speed', fanState.entity_id, { fan_speed: e.target.value })}>
      {(fanState.attributes.fan_speed_list as string[]).map(speed => <option key={speed} value={speed}>{fanSpeedLabel(speed)}</option>)}
    </select></label>}
    {busy && <p role="status">Befehl wird gesendet …</p>}{error && <p role="alert">{error}</p>}
  </section>}</>;
}
