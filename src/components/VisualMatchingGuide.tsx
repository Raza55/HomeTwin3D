import EchoIcon from './EchoIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArcRotateCamera, Color3, Matrix, Mesh, Vector3, type Scene } from '@babylonjs/core';
import { Check, Coffee, Fan, Cigarette, DoorOpen, LockKeyhole, Lightbulb, Crosshair, X } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
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
  const t = useTranslation();
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
  const [finishedEntityId,setFinishedEntityId] = useState('');
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
    catch (e) { if (serial === request.current) setError(e instanceof Error ? e.message : t('matching.loadFailed')); }
    finally { if (serial === request.current) setLoading(false); }
  };
  useEffect(() => { void reload(); return () => { request.current++; }; }, [loadInventory]);
  useEffect(() => { setSelected(current?.entityId || ''); setCalibration(current?.lightCalibration ?? {}); setRunningStates(current?.appliance?.runningStates?.join(', ') ?? 'on, running, run, washing, drying, spinning, rinsing, active, in_progress'); setPowerThreshold(current?.appliance?.powerThreshold ?? 5); setRemainingEntityId(current?.appliance?.remainingEntityId ?? ''); setProgramEntityId(current?.appliance?.programEntityId ?? ''); setFinishedEntityId(current?.appliance?.finishedEntityId ?? ''); setError(''); }, [current?.id]);

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
        if (decision === 'confirmed' && !selectedEntity) throw new Error(t('matching.chooseEntity'));
        const entityId = decision === 'unassigned' ? '' : selected;
        const manifest = { ...config.model!.floorplan!, objects: config.model!.floorplan!.objects.map(o => o.id === current.id ? {
          ...o, appliance: o.appliance ? {...o.appliance,runningStates:runningStates.split(',').map(s=>s.trim()).filter(Boolean),powerThreshold,remainingEntityId,programEntityId,finishedEntityId} : undefined, entityId, haAreaId: entityId ? selectedEntity?.areaId ?? o.haAreaId : o.haAreaId,
          lightType: inventory.lightTypes[entityId] ?? o.lightType,
          lightCalibration: o.domain==='light' ? calibration : o.lightCalibration,
          emitters: o.emitters?.map(e=>({...e,lumens:calibration.lumens ? e.lumens*calibration.lumens/o.emitters!.reduce((sum,e)=>sum+e.lumens,0) : e.lumens,range:calibration.range ?? e.range})),
        } : o) };
        const next = saveFloorplanAssignment(config, manifest, current.id, showAssigned); onSave(next); setConfig(next);
      }
      setReviewed(r => ({ ...r, [current.id]: decision })); setIndex(i => i+1); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : t('matching.saveFailed')); }
  };
  const objectIcon = (object: FloorplanObject | undefined, size: number) => object?.coffee ? <Coffee size={size}/> : object?.echo ? <EchoIcon kind={object.echo.kind} size={size}/> : object?.domain === 'fan' ? <Fan size={size}/> : object?.statusIndicator ? <Cigarette size={size}/> : object?.doorLock ? <LockKeyhole size={size}/> : object?.door ? <DoorOpen size={size}/> : <Lightbulb size={size}/>;
  const kind = category === 'light' ? 'lights' : 'devices';
  // One short line per device type; the long door behaviour sits behind "more".
  const note = current?.echo ? t('matching.note.echo', { kind: current.echo.kind === 'show' ? 'Show' : 'Dot' })
    : current?.coffee ? t('matching.note.coffee')
      : current?.domain === 'fan' ? t('matching.note.fan')
        : current?.statusIndicator ? t('matching.note.status', { states: current.statusIndicator.activeStates.join(', ') })
          : current?.doorLock ? t('matching.note.lock')
            : current?.door ? t('matching.note.door') : '';
  return <>
    {!done && <div ref={marker} className="matching-target" aria-hidden="true">{objectIcon(current, 26)}<span>{index+1}</span></div>}
    <section className="visual-matching" role="dialog" aria-modal="false" aria-label={t(`matching.title.${kind}`)}>
      <header>
        <span className="matching-title"><span className="matching-title-icon">{objectIcon(done ? undefined : current, 18)}</span>{t(`matching.title.${kind}`)}</span>
        <button className="matching-icon-btn" aria-label={t('matching.close')} onClick={onClose}><X size={18}/></button>
      </header>
      <div className="matching-progress">
        <progress aria-label={t('matching.progress')} max={queue.length || 1} value={index}/>
        <small>{Math.min(index + 1, queue.length)} / {queue.length}</small>
      </div>
      {done ? <div className="matching-complete">
        <Check size={32}/><h2>{t('matching.doneTitle')}</h2>
        <p>{t(`matching.doneSummary.${kind}`, { confirmed, total: allLights.length, skipped: skipped.length })}</p>
        <p>{t('matching.doneKept')}</p>
        {!!skipped.length && <button onClick={() => { setQueue(skipped.map(o => o.id)); setIndex(0); }}>{t('matching.reviewSkipped')}</button>}
        <button className="matching-primary" onClick={onClose}>{t('matching.backToLive')}</button>
      </div> : current && <>
        <div className="matching-heading" aria-live="polite">
          <small>{current.room || t('matching.noRoom')}</small>
          <h2>{current.label}</h2>
          <p>{current.entityId ? t('matching.currently', { entity: current.entityId }) : t('matching.unassigned')}</p>
        </div>
        <button className="matching-locate" onClick={() => focusObject(current)}><Crosshair size={15}/>{t('matching.locate')}</button>
        <div className="matching-proposals">
          <h3>{t('matching.question')}</h3>
          {loading ? <p role="status">{t('matching.loading')}</p> : proposals.length ? proposals.slice(0,3).map((p,i) => <button key={p.entity.entity_id} className={selected === p.entity.entity_id ? 'selected' : ''} aria-pressed={selected === p.entity.entity_id} onClick={() => setSelected(p.entity.entity_id)}>
            <strong>{p.entity.entity_id === current.entityId ? `${t('matching.currentPrefix')} ` : i === 0 ? `${t('matching.suggestionPrefix')} ` : ''}{p.entity.friendly_name || p.entity.entity_id}</strong><small>{p.entity.areaName || t('matching.noHaRoom')} · {p.score}/100</small><small>{p.reasons.join(' · ')}</small>
          </button>) : <p>{t('matching.noSuggestion')}</p>}
        </div>
        <label className="matching-field">{t('matching.search')}<EntityPicker value={selected} onChange={setSelected} entities={visibleOptions.map(e => ({ ...e, friendly_name: used.has(e.entity_id) ? `${e.friendly_name || e.entity_id} · ${t('matching.usedBy', { labels: owners.filter(o => o.entityId === e.entity_id).map(o => o.label).join(', ') })}` : e.friendly_name }))} placeholder={t('matching.searchPlaceholder', { domain: current.domain })}/></label>
        <label className="matching-assigned-filter"><input type="checkbox" checked={showAssigned} onChange={e => { setShowAssigned(e.target.checked); if (!e.target.checked && used.has(selected) && selected !== current.entityId) setSelected(current.entityId || ''); }} />{t('matching.showAssigned')}</label>
        {note && <p className="matching-note">{note}</p>}
        {current.door && <details className="matching-details"><summary>{t('matching.more')}</summary>
          <p>{current.door.kind === 'double' ? t('matching.door.double') : current.door.kind === 'entrance' ? t('matching.door.entrance') : t('matching.door.balcony')}</p>
          <p>{current.door.kind === 'entrance' ? t('matching.door.entranceTilt') : t('matching.door.tilt')}</p>
        </details>}
        {current.appliance && <details className="matching-details" open><summary>{t('matching.appliance.title')}</summary>
          <p>{t('matching.appliance.hint')}</p>
          <label className="matching-field">{t('matching.appliance.states')}<input value={runningStates} onChange={e=>setRunningStates(e.target.value)}/></label>
          <label className="matching-field">{t('matching.appliance.power')}<input type="number" min="0" value={powerThreshold} onChange={e=>setPowerThreshold(Math.max(0,Number(e.target.value)))}/></label>
          <label className="matching-field">{t('matching.appliance.remaining')}<EntityPicker value={remainingEntityId} onChange={setRemainingEntityId} entities={inventory.entities.filter(e=>e.entity_id.startsWith('sensor.'))} placeholder={t('matching.appliance.remainingPlaceholder')}/></label>
          <label className="matching-field">{t('matching.appliance.program')}<EntityPicker value={programEntityId} onChange={setProgramEntityId} entities={inventory.entities.filter(e=>/^(sensor|select)\./.test(e.entity_id))} placeholder={t('matching.appliance.programPlaceholder')}/></label>
          <label className="matching-field">{t('matching.appliance.finished')}<EntityPicker value={finishedEntityId} onChange={setFinishedEntityId} entities={inventory.entities.filter(e=>/^(input_boolean|binary_sensor)\./.test(e.entity_id))} placeholder={t('matching.appliance.finishedPlaceholder')}/></label>
        </details>}
        {!!shared.length && <p className="matching-note warn">{t('matching.sharedWith', { labels: shared.map(o => o.label).join(', ') })} {selected === current.entityId ? t('matching.sharedKeep') : t('matching.sharedMove')}</p>}
        {!!current.emitters?.length && <details className="matching-details"><summary>{t('matching.calibrate')}</summary>
          <label className="matching-field">{t('matching.lumens')}<input type="number" min="1" max="100000" value={calibration.lumens ?? Math.round(current.emitters.reduce((sum,e)=>sum+e.lumens,0))} onChange={e=>{const v=Number(e.target.value);if(v>0&&v<=100000)setCalibration(c=>({...c,lumens:v}));}}/></label>
          <label className="matching-field">{t('matching.range')}<input type="number" min="0.1" max="100" step="0.1" value={calibration.range ?? current.emitters[0].range} onChange={e=>{const v=Number(e.target.value);if(v>0&&v<=100)setCalibration(c=>({...c,range:v}));}}/></label>
        </details>}
        {inventory.note && <p className="matching-note">{inventory.note}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="matching-actions"><button className="matching-primary" disabled={loading || !selectedEntity} onClick={() => advance('confirmed')}>{t('matching.confirm')}</button><button onClick={() => advance('skipped')}>{t('matching.skip')}</button></div>
        <div className="matching-secondary"><button disabled={index === 0} onClick={() => setIndex(i => i-1)}>{t('common.back')}</button><button onClick={() => advance('unassigned')}>{t('matching.saveWithout')}</button><button disabled={loading} onClick={() => void reload()}>{t('matching.reload')}</button></div>
        <footer>{t('matching.footer')}</footer>
      </>}
    </section>
  </>;
}
