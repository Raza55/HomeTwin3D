import { setMarkerStyle } from '../babylon/MarkerProjection';
import { useMapMarkers, useMarkerPlacement } from './useMapMarkers';
import { useEffect, useRef, useState } from 'react';
import { DoorClosed, DoorOpen, Clock, Pencil, X, CircleHelp, LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { createDoorRigs, doorMarkerAnchor } from '../babylon/DoorAnimation';
import { nextDoorPoseDelay, doorDuration, doorPose, doorStatus, lockStatus } from '../services/doorState';
import './DoorMarkers.css';
import { useConfiguredEntityStates } from '../services/entityStateSignal';

export default function DoorMarkers({ scene, config, states, connected, onAssign }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean; onAssign: (id: string) => void;
}) {
  const stateVersion = useConfiguredEntityStates(config, o => Boolean(o.door || o.doorLock));
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const popup = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const doors = config.model?.floorplan?.objects.filter(o => o.door) ?? [];
  useEffect(() => {
    const currentTime = Date.now();
    if (Math.abs(currentTime - now) > 1000) setNow(currentTime);
    // Only an open popup needs a second-by-second duration display.
    if (open) {
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
    if (!connected) return;
    const delay = nextDoorPoseDelay(doors, states);
    if (delay === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1, delay));
    return () => clearTimeout(timer);
  }, [open, connected, config, stateVersion, now]);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!popup.current?.contains(e.target as Node) && !Object.values(buttons.current).some(b => b?.contains(e.target as Node))) setOpen(null); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', outside);document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside);document.removeEventListener('keydown', escape); };
  }, []);
  const markers = useMapMarkers(scene, () => {
    const rigs = new Map(createDoorRigs(scene).map(r => [r.id, r]));
    return doors.map(o => {
      const rig = rigs.get(o.id), scale = config.model?.scale ?? 1;
      const point = rig ? doorMarkerAnchor(scene, rig) : new Vector3(o.position.x, o.position.y + o.size.height / 2 + .12, o.position.z).scale(scale);
      // The entrance door stays visible through walls.
      return { id: o.id, element: () => buttons.current[o.id], occlude: o.door?.kind !== 'entrance', display: 'grid', anchor: (out: Vector3) => out.copyFrom(point) };
    });
  }, [config]);
  useMarkerPlacement(scene, markers, open, ({ x, y, visible }) => {
    const panel = popup.current; if (!panel) return;
    setMarkerStyle(panel, 'visibility', visible ? 'visible' : 'hidden');
    setMarkerStyle(panel, 'left', `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, x - panel.offsetWidth / 2))}px`);
    setMarkerStyle(panel, 'top', `${Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, y + 22))}px`);
  });
  return <>{doors.map(o => {
    const state = states[o.entityId], pose = connected ? doorPose(state, now, o.door?.kind, o.door?.tiltOnly) : null;
    const lock = config.model?.floorplan?.objects.find(l => l.doorLock?.doorId === o.id);
    const lockState = connected && lock?.entityId ? states[lock.entityId] : undefined;
    const lockLabel = !lock?.entityId ? 'Schloss nicht zugeordnet' : !connected ? 'Schloss nicht verbunden' : lockStatus(lockState);
    const LockIcon = lockState?.state === 'locked' ? LockKeyhole : ['unlocked', 'open'].includes(lockState?.state ?? '') ? LockKeyholeOpen : CircleHelp;
    const entrance = o.door?.kind === 'entrance';
    // An open contact takes precedence over the lock; unknown contacts stay unknown.
    const locked = entrance && pose === 'closed' && lockState?.state === 'locked';
    const status = !o.entityId ? 'Nicht zugeordnet' : !connected ? 'Nicht verbunden'
      : locked ? 'Abgeschlossen' : entrance && pose === 'open' ? 'Offen' : doorStatus(pose, o.door?.tiltOnly);
    const duration = connected && o.entityId && pose ? doorDuration(state, now) : 'Dauer unbekannt';
    const Icon = locked ? LockKeyhole : pose === 'closed' ? DoorClosed : pose ? DoorOpen : CircleHelp;
    return <div key={o.id}>
      <button ref={el => { buttons.current[o.id] = el; }} className={`door-marker ${locked ? 'locked' : pose ?? 'unknown'}`} title={`${o.label} · ${status} · ${duration}${lock ? ' · ' + lockLabel : ''}`} aria-label={`${o.label}: ${status}, ${duration}${lock ? ', ' + lockLabel : ''}`} aria-expanded={open === o.id} aria-haspopup="dialog" onClick={() => setOpen(open === o.id ? null : o.id)}><Icon size={15}/>{lock && !entrance && <LockIcon className="door-lock-badge" size={10}/>}</button>
      {open === o.id && <section ref={popup} className="door-popup" role="dialog" aria-label={`${o.label} Status`}>
        <header><strong>{o.label}</strong><button aria-label="Türstatus schließen" onClick={() => setOpen(null)}><X size={16}/></button></header>
        <p>{status}</p><p className="door-duration"><Clock size={14}/>{duration === 'Dauer unbekannt' ? duration : `Seit ${duration}`}</p>
        <button className="door-reassign" onClick={() => { setOpen(null);onAssign(o.id); }}><Pencil size={14}/>{o.entityId ? 'Neu zuordnen' : 'Kontakt zuordnen'}</button>
        {lock && <><p className="door-duration"><LockIcon size={15}/>{lockLabel}</p><button className="door-reassign" onClick={() => { setOpen(null);onAssign(lock.id); }}><Pencil size={14}/>{lock.entityId ? 'Schloss neu zuordnen' : 'Schloss zuordnen'}</button></>}
      </section>}
    </div>;
  })}</>;
}
