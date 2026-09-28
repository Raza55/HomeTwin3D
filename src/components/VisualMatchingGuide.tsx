import EchoIcon from './EchoIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArcRotateCamera, Color3, Matrix, Mesh, Vector3, type Scene } from '@babylonjs/core';
import { Check, Coffee, Fan, Cigarette, DoorOpen, LockKeyhole, Lightbulb, X } from 'lucide-react';
import type { AppConfig, FloorplanObject } from '../types';
import { floorplanId } from '../babylon/FloorplanBindings';
import { assignmentOwners, saveFloorplanAssignment } from '../services/floorplanReassignment';
import { isDoorContact, suggestFloorplanMatches } from '../services/floorplanMatching';
import { loadMatchingInventory, type MatchingInventory } from '../services/matchingInventory';
import EntityPicker from './EntityPicker';
import './VisualMatchingGuide.css';

export default function VisualMatchingGuide({ scene, initialConfig, onSave, onClose, objectId, objectIds, category = 'light', loadInventory = loadMatchingInventory }: {
  scene: Scene; initialConfig: AppConfig; onSave: (config: AppConfig) => void; onClose: () => void;
  objectIds?: string[]; objectId?: string; category?: 'light' | 'other';
  loadInventory?: () => Promise<MatchingInventory>;
}) {
  const [config, setConfig] = useState(() => structuredClone(initialConfig));
  const allLights = useMemo(() => (initialConfig.model?.floorplan?.objects ?? []).filter(o => !o.it).filter(o => objectIds ? objectIds.includes(o.id) : objectId ? o.id===objectId : category==='light' ? o.domain==='light' : o.domain!=='light')
    .sort((a,b) => (a.room ?? '').localeCompare(b.room ?? '', 'de') || a.label.localeCompare(b.label, 'de', { numeric: true })), [initialConfig, objectId, objectIds, category]);
  const [queue, setQueue] = useState(() => allLights.map(o => o.id));
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState<Record<string, 'confirmed' | 'skipped' | 'unassigned'>>({});
  const [inventory, setInventory] = useState<MatchingInventory>({ entities: [], lightTypes: {}, note: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [showAssigned, setShowAssigned] = useState(false);
  const [remainingEntityId,setRemainingEntityId] = useState('');
  const [programEntityId,setProgramEntityId] = useState('');
  const [runningStates,setRunningStates] = useState('');
  const [powerThreshold,setPowerThreshold] = useState(5);
  const [calibration,setCalibration] = useState<{lumens?:number;range?:number}>({});
  const marker = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const current = config.model?.floorplan?.objects.find(o => o.id === queue[index]);
  const done = index >= queue.length;
  const confirmed = Object.values(reviewed).filter(v => v !== 'skipped').length;
  const skipped = allLights.filter(o => reviewed[o.id] === 'skipped');
  const owners = useMemo(() => assignmentOwners(config, current?.id ?? ''), [config, current?.id]);
  const used = new Set(owners.map(o => o.entityId));
  const proposals = useMemo(() => current ? suggestFloorplanMatches(
    config.model!.floorplan!.objects.map(o => showAssigned || o.id === current.id ? { ...o, entityId: '' } : o), inventory.entities, config.rooms,
  ).get(current.id)?.filter(p => (showAssigned || !owners.some(o => o.entityId === p.entity.entity_id) || p.entity.entity_id === current.entityId) && (p.score >= 25 || p.entity.entity_id === current.entityId)) ?? [] : [], [config, current, inventory, showAssigned, owners]);
  const options = inventory.entities.filter(e => (current?.door ? isDoorContact(e) : current?.appliance ? /^(sensor|binary_sensor|switch|input_boolean)\./.test(e.entity_id) : e.entity_id.startsWith(`${current?.domain ?? 'light'}.`)) && !e.group && !e.disabled);
  const visibleOptions = options.filter(e => showAssigned || !used.has(e.entity_id) || e.entity_id === current?.entityId);
  const selectedEntity = visibleOptions.find(e => e.entity_id === selected);
  const shared = owners.filter(o => selected && o.entityId === selected);
  useEffect(() => { setShowAssigned(false); }, [current?.id]);
  const reload = async () => {
    const serial = ++request.current; setLoading(true); setError('');
    try { const result = await loadInventory(); if (serial === request.current) setInventory(result); }
    catch (e) { if (serial === request.current) setError(e instanceof Error ? e.message : 'Entities konnten nicht geladen werden.'); }
    finally { if (serial === request.current) setLoading(false); }
  };
  useEffect(() => { void reload(); return () => { request.current++; }; }, [loadInventory]);
  useEffect(() => { setSelected(current?.entityId || ''); setCalibration(current?.lightCalibration ?? {}); setRunningStates(current?.appliance?.runningStates?.join(', ') ?? 'on, running, run, washing, drying, spinning, rinsing, active, in_progress'); setPowerThreshold(current?.appliance?.powerThreshold ?? 5); setRemainingEntityId(current?.appliance?.remainingEntityId ?? ''); setProgramEntityId(current?.appliance?.programEntityId ?? ''); setError(''); }, [current?.id]);

  // Preserve the user's view when leaving the walkthrough.
  useEffect(() => {
    const camera = scene.activeCamera;
    if (!(camera instanceof ArcRotateCamera)) return;
    const saved = { target: camera.target.clone(), alpha: camera.alpha, beta: camera.beta, radius: camera.radius };
    return () => { if (!camera.isDisposed()) { camera.setTarget(saved.target); camera.alpha = saved.alpha; camera.beta = saved.beta; camera.radius = saved.radius; } };
  }, [scene]);
  const focusObject = (object: FloorplanObject) => {
    const targets = scene.meshes.filter(m => floorplanId(m) === (object.doorLock?.doorId ?? object.id) && m.getTotalVertices() > 0);
    const center = targets.length ? targets.reduce((sum,m) => sum.add(m.getBoundingInfo().boundingBox.centerWorld), Vector3.Zero()).scale(1/targets.length)
      : new Vector3(object.position.x, object.position.y, object.position.z).scale(config.model?.scale ?? 1);
    const camera = scene.activeCamera;
    if (camera instanceof ArcRotateCamera) {
      scene.stopAnimation(camera); camera.setTarget(center); camera.radius = Math.max(camera.lowerRadiusLimit ?? 0, Math.min(camera.upperRadiusLimit ?? Infinity, 6 * (config.model?.scale ?? 1)));
      camera.beta = Math.min(camera.upperBetaLimit ?? 1.2, Math.max(camera.lowerBetaLimit ?? .2, .65));
      camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = camera.inertialPanningX = camera.inertialPanningY = 0;
    }
    return { center, targets };
  };
  useEffect(() => {
    if (!current) return;
    const { center, targets } = focusObject(current);
    const original = targets.filter((m): m is Mesh => m instanceof Mesh).map(mesh => ({ mesh, renderOverlay: mesh.renderOverlay, overlayColor: mesh.overlayColor.clone(), overlayAlpha: mesh.overlayAlpha }));
    original.forEach(({ mesh }) => { mesh.renderOverlay = true; mesh.overlayColor = Color3.FromHexString('#56e2cf'); mesh.overlayAlpha = .65; });
    const observer = scene.onAfterRenderObservable.add(() => {
      const element = marker.current, camera = scene.activeCamera, canvas = scene.getEngine().getRenderingCanvas();
      if (!element || !camera || !canvas) return;
      const engine = scene.getEngine(), rect = canvas.getBoundingClientRect();
      const p = Vector3.Project(center, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      element.style.left = `${rect.left + p.x/engine.getRenderWidth()*rect.width}px`;
      element.style.top = `${rect.top + p.y/engine.getRenderHeight()*rect.height}px`;
      element.style.visibility = p.z < 0 || p.z > 1 ? 'hidden' : 'visible';
    });
    return () => { scene.onAfterRenderObservable.remove(observer); original.forEach(({mesh, ...saved}) => { if (!mesh.isDisposed()) Object.assign(mesh, saved); }); };
  }, [scene, current?.id]);

  const advance = (decision: 'confirmed' | 'skipped' | 'unassigned') => {
    if (!current) return;
    try {
      if (decision !== 'skipped') {
        if (decision === 'confirmed' && !selectedEntity) throw new Error('Bitte eine passende Entity aus den Vorschlägen oder der Suche wählen.');
        const entityId = decision === 'unassigned' ? '' : selected;
        const manifest = { ...config.model!.floorplan!, objects: config.model!.floorplan!.objects.map(o => o.id === current.id ? {
          ...o, appliance: o.appliance ? {...o.appliance,runningStates:runningStates.split(',').map(s=>s.trim()).filter(Boolean),powerThreshold,remainingEntityId,programEntityId} : undefined, entityId, haAreaId: entityId ? selectedEntity?.areaId ?? o.haAreaId : o.haAreaId,
          lightType: inventory.lightTypes[entityId] ?? o.lightType,
          lightCalibration: o.domain==='light' ? calibration : o.lightCalibration,
          emitters: o.emitters?.map(e=>({...e,lumens:calibration.lumens ? e.lumens*calibration.lumens/o.emitters!.reduce((sum,e)=>sum+e.lumens,0) : e.lumens,range:calibration.range ?? e.range})),
        } : o) };
        const next = saveFloorplanAssignment(config, manifest, current.id, showAssigned); onSave(next); setConfig(next);
      }
      setReviewed(r => ({ ...r, [current.id]: decision })); setIndex(i => i+1); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'); }
  };
  return <>
    {!done && <div ref={marker} className="matching-target" aria-hidden="true">{current?.coffee ? <Coffee size={24}/> : current?.echo ? <EchoIcon kind={current.echo.kind} size={24}/> : current?.domain === 'fan' ? <Fan size={26}/> : current?.statusIndicator ? <Cigarette size={26}/> : current?.doorLock ? <LockKeyhole size={26}/> : current?.door ? <DoorOpen size={26}/> : <Lightbulb size={26}/>}<span>{index+1}</span></div>}
    <section className="visual-matching" role="dialog" aria-modal="false" aria-label={category === 'light' ? 'Visueller Lampen-Assistent' : 'Visueller Geräte-Assistent'}>
      <header><span><Lightbulb size={18}/> {category==='light'?'Lampen':'Geräte'} zuordnen</span><button aria-label="Assistent schließen" onClick={onClose}><X size={18}/></button></header>
      <progress aria-label="Durchgang" max={queue.length || 1} value={index}/>
      {done ? <div className="matching-complete">
        <Check size={32}/><h2>Durchgang abgeschlossen</h2>
        <p>{confirmed} von {allLights.length} {category==='light'?'Lampen':'Geräten'} geprüft · {skipped.length} übersprungen.</p>
        <p>Bestätigte Zuordnungen sind separat gespeichert und bleiben beim Planimport erhalten.</p>
        {!!skipped.length && <button onClick={() => { setQueue(skipped.map(o => o.id)); setIndex(0); }}>Übersprungene Objekte prüfen</button>}
        <button className="matching-primary" onClick={onClose}>Zur Live-Ansicht</button>
      </div> : current && <>
        <div className="matching-heading" aria-live="polite"><small>{current.domain==='light'?'Lampe':'Gerät'} {index+1} / {queue.length} · {current.room || 'Raum nicht angegeben'}</small><h2>{current.label}</h2>
          <p>{current.entityId ? `Bisher: ${current.entityId}` : 'Dieses Objekt ist noch nicht zugeordnet.'}</p></div>
        <button className="matching-locate" onClick={() => focusObject(current)}>Objekt im Plan zentrieren</button>
        <div className="matching-proposals">
          <h3>Welche Entity gehört zu diesem Objekt?</h3>
          {loading ? <p role="status">HA-Räume und Lampen werden geladen …</p> : proposals.length ? proposals.slice(0,3).map((p,i) => <button key={p.entity.entity_id} className={selected === p.entity.entity_id ? 'selected' : ''} aria-pressed={selected === p.entity.entity_id} onClick={() => setSelected(p.entity.entity_id)}>
            <strong>{p.entity.entity_id === current.entityId ? 'Bisher: ' : i === 0 ? 'Vorschlag: ' : ''}{p.entity.friendly_name || p.entity.entity_id}</strong><small>{p.entity.areaName || 'Kein HA-Raum'} · {p.score}/100</small><small>{p.reasons.join(' · ')}</small>
          </button>) : <p>Kein eindeutiger Vorschlag. Wähle eine Entity oder überspringe dieses Objekt.</p>}
        </div>
        <label className="matching-assigned-filter"><input type="checkbox" checked={showAssigned} onChange={e => { setShowAssigned(e.target.checked); if (!e.target.checked && used.has(selected) && selected !== current.entityId) setSelected(current.entityId || ''); }} />Bereits zugeordnete Entities anzeigen</label>
        <label>Entity auswählen<EntityPicker value={selected} onChange={setSelected} entities={visibleOptions.map(e => ({ ...e, friendly_name: used.has(e.entity_id) ? `${e.friendly_name || e.entity_id} · zugeordnet: ${owners.filter(o => o.entityId === e.entity_id).map(o => o.label).join(', ')}` : e.friendly_name }))} placeholder={`${current.domain}.… oder Gerätename suchen`}/></label>
        {current.echo && <p className="matching-note">Echo {current.echo.kind === 'show' ? 'Show' : 'Dot'} zuordnen. Das kleine Symbol zeigt den Medienstatus; per Klick öffnest du Wiedergabe und Lautstärke.</p>}
        {current.coffee && <p className="matching-note">Einschalter der Kaffeemaschine zuordnen. Grün zeigt laufenden Bezug; das Popup bietet Programm, Zeit und Start/Stopp.</p>}
        {current.domain === 'fan' && <p className="matching-note">Lüfter zuordnen. Ein Klick öffnet Ein/Aus und Stärke. Im Plan zeigt das Lüftungssymbol bei laufendem Gerät die aktuelle Stärke in Prozent.</p>}
        {current.statusIndicator && <p className="matching-note">Reine Statusanzeige: Das Rauchsymbol erscheint nur bei {current.statusIndicator.activeStates.join(', ')}. Es werden keine Gerätebefehle gesendet.</p>}
        {current.door && <div className="matching-note">
          <strong>Tür-/Fensterkontakt zuordnen</strong>
          <p>{current.door.kind === 'double' ? 'Bei geöffnetem Kontakt bewegt sich der rechte Flügel nach innen; der linke bleibt geschlossen.' : current.door.kind === 'entrance' ? 'Die Haustür öffnet von innen gesehen nach innen rechts.' : 'Die Balkontür öffnet nach innen links.'}</p>
          <p>{current.door.kind === 'entrance' ? 'Die Haustür bleibt seitlich offen, solange der Kontakt geöffnet ist. Es gibt keine Kippstellung. Türkontakt und Schloss werden unabhängig angezeigt.' : 'Bis einschließlich 15 Minuten: seitlich offen. Danach: gekippt. Die Kippstellung ist eine Annahme anhand der Öffnungsdauer, kein gemessener Kippzustand. „Geschlossen“ schließt sofort.'} Es werden keine Gerätebefehle gesendet.</p>
        </div>}
        {current.doorLock && <p className="matching-note">Schloss-Entity zuordnen. Verriegelt und entriegelt werden unabhängig vom Türkontakt angezeigt. Es werden keine Schließ- oder Öffnungsbefehle gesendet.</p>}
        {current.appliance && <details open><summary>Betriebsanzeige</summary>
          <p>Status- oder Binärsensor wählen. Bei einem Leistungssensor wird die Watt-Schwelle verwendet. Es werden keine Gerätebefehle gesendet.</p>
          <label>Aktive Statuswerte (mit Komma trennen)<input value={runningStates} onChange={e=>setRunningStates(e.target.value)}/></label>
          <label>Leistung über (Watt)<input type="number" min="0" value={powerThreshold} onChange={e=>setPowerThreshold(Math.max(0,Number(e.target.value)))}/></label>
          <label>Restzeit (optional)<EntityPicker value={remainingEntityId} onChange={setRemainingEntityId} entities={inventory.entities.filter(e=>e.entity_id.startsWith('sensor.'))} placeholder="Restzeit-Sensor"/></label>
          <label>Programm (optional)<EntityPicker value={programEntityId} onChange={setProgramEntityId} entities={inventory.entities.filter(e=>/^(sensor|select)\./.test(e.entity_id))} placeholder="Programm-Entity"/></label>
        </details>}
        {!!shared.length && <p className="matching-note">Bereits zugeordnet: {shared.map(o => o.label).join(', ')}. {selected === current.entityId ? 'Die bestehende gemeinsame Zuordnung bleibt erhalten.' : 'Beim Bestätigen wird die Entity dort entfernt und diesem Objekt zugeordnet.'}</p>}
        {!!current.emitters?.length && <details style={{marginTop:10}}><summary>Licht kalibrieren</summary>
          <label>Lichtstrom (Lumen)<input type="number" min="1" max="100000" value={calibration.lumens ?? Math.round(current.emitters.reduce((sum,e)=>sum+e.lumens,0))} onChange={e=>{const v=Number(e.target.value);if(v>0&&v<=100000)setCalibration(c=>({...c,lumens:v}));}}/></label>
          <label>Reichweite (Meter)<input type="number" min="0.1" max="100" step="0.1" value={calibration.range ?? current.emitters[0].range} onChange={e=>{const v=Number(e.target.value);if(v>0&&v<=100)setCalibration(c=>({...c,range:v}));}}/></label>
        </details>}
        {inventory.note && <p className="matching-note">{inventory.note}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="matching-actions"><button className="matching-primary" disabled={loading || !selectedEntity} onClick={() => advance('confirmed')}>Bestätigen & weiter</button><button onClick={() => advance('skipped')}>Überspringen</button></div>
        <div className="matching-secondary"><button disabled={index === 0} onClick={() => setIndex(i => i-1)}>Zurück</button><button onClick={() => advance('unassigned')}>Ohne Entity speichern</button><button disabled={loading} onClick={() => void reload()}>HA neu laden</button></div>
        <footer>Jede Bestätigung wird gespeichert. Du kannst jederzeit schließen.</footer>
      </>}
    </section>
  </>;
}
