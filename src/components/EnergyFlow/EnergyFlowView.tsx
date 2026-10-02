import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import { Zap, X } from 'lucide-react';
import type { AppConfig, DisplayConfig, HAState } from '../../types';
import { EnergyFlowLayer, placeConsumers, type EnergyNode } from '../../babylon/EnergyFlowLayer';
import { setSketchTransparency } from '../../babylon/ModelLoader';
import { energyInPeriod, energyShares, loadEnergyConsumers, powerWatts, type EnergyConsumer, type EnergyPeriod } from '../../services/energyFlow';
import { useMapMarkers } from '../useMapMarkers';
import { useLanguage } from '../../contexts/LanguageContext';
import './EnergyFlowView.css';

interface Props {
  scene: Scene;
  config: AppConfig;
  connection: { request(message: Record<string, unknown>): Promise<unknown> } | null;
  /** Latest HA states (all entities, updated in place by the dashboard). */
  states: () => Record<string, HAState>;
  displays: () => { config: DisplayConfig; plane: AbstractMesh }[];
  onClose: () => void;
}

interface Reading { id: string; watts: number; share: number }

const POLL_MS = 2000;
const TODAY_MS = 5 * 60 * 1000;
/** "now": shares of the current power; the periods: shares of the energy used since the start of the day, week or month. */
type EnergyMode = 'now' | EnergyPeriod;
const MODES: EnergyMode[] = ['now', 'day', 'week', 'month', 'quarter', 'half', 'year'];

const formatEnergy = (kwh: number, language: string) => `${kwh.toLocaleString(language, { maximumFractionDigits: kwh >= 100 ? 0 : kwh >= 10 ? 1 : 2 })} kWh`;

const formatWatts = (watts: number, language: string) => watts >= 1000
  ? `${(watts / 1000).toLocaleString(language, { maximumFractionDigits: 2 })} kW`
  : `${Math.round(watts).toLocaleString(language)} W`;

/**
 * Energy view over the sketch model: where the power goes right now. Consumers
 * come from Home Assistant's energy dashboard; each gets a glowing orb and a flow
 * line from the supply, a label, and a row in the panel with its share.
 */
export default function EnergyFlowView({ scene, config, connection, states, displays, onClose }: Props) {
  const { t, language } = useLanguage();
  const [consumers, setConsumers] = useState<EnergyConsumer[] | null>(null);
  const [nodes, setNodes] = useState<EnergyNode[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<EnergyMode>('now');
  const period: EnergyPeriod = mode === 'now' ? 'day' : mode;
  const live = mode === 'now';
  const [error, setError] = useState(false);
  const layer = useRef<EnergyFlowLayer | null>(null);
  const positions = useRef(new Map<string, Vector3>());
  const labels = useRef<Record<string, HTMLDivElement | null>>({});
  const unit = config.model?.scale ?? 1;

  // Hide the other plan markers and make the model see-through while the energy view is open.
  useEffect(() => {
    scene.metadata = { ...scene.metadata, energyView: true };
    setSketchTransparency(scene, .45);
    return () => { scene.metadata = { ...scene.metadata, energyView: false }; setSketchTransparency(scene, 1); };
  }, [scene]);

  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    loadEnergyConsumers(connection, states()).then(({ consumers: list, registry }) => {
      if (cancelled) return;
      setConsumers(list);
      if (!list.length) return;
      const placed = placeConsumers(scene, config, list, registry, displays());
      layer.current ??= new EnergyFlowLayer(scene, unit);
      layer.current.setNodes(placed.nodes, placed.hub);
      positions.current = new Map(placed.nodes.map(n => [n.id, n.position.clone()]));
      positions.current.set('hub', placed.hub.clone());
      setNodes(placed.nodes);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [scene, config, connection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { layer.current?.dispose(); layer.current = null; }, []);

  // Live power: every 2 s from the dashboard's states (no extra subscription).
  useEffect(() => {
    if (!consumers?.length) return;
    const poll = () => {
      const current = states();
      const { total: sum, items } = energyShares(consumers, c => c.powerEntityId ? powerWatts(current[c.powerEntityId]) : 0);
      layer.current?.update(new Map(items.map(i => [i.consumer.id, { watts: i.watts, share: i.share }])));
      // Rounded for the labels: their raster only redraws when the text changes.
      setReadings(items.map(i => ({ id: i.consumer.id, watts: i.watts < 10 ? Math.round(i.watts * 10) / 10 : Math.round(i.watts), share: Math.round(i.share * 100) })));
      setTotal(Math.round(sum));
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [consumers, states]);

  // Energy per consumer since the start of the day, week or month (recorder statistics), refreshed every 5 minutes.
  useEffect(() => {
    if (!connection || !consumers?.length) return;
    let cancelled = false;
    setToday({});
    const load = () => energyInPeriod(connection, consumers.map(c => c.id), period).then(values => { if (!cancelled) setToday(values); });
    void load();
    const timer = setInterval(load, TODAY_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connection, consumers, period]);

  const byId = useMemo(() => new Map(readings.map(r => [r.id, r])), [readings]);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  useMapMarkers(scene, () => [
    { id: 'energy:hub', element: () => labels.current.hub, anchor: (out: Vector3) => out.copyFrom(positions.current.get('hub') ?? Vector3.Zero()), display: 'flex', interactive: false, energy: true, offset: { x: 0, y: -22 }, stack: { group: 'energy', width: 140, height: 26 } },
    ...nodes.map(node => ({
      id: `energy:${node.id}`, element: () => labels.current[node.id], interactive: false, energy: true, display: 'flex',
      anchor: (out: Vector3) => out.copyFrom(positions.current.get(node.id) ?? node.position),
      offset: { x: 0, y: -24 }, stack: { group: 'energy', width: 150, height: 26 },
    })),
  ], [nodes]);

  const todayTotal = Object.values(today).reduce((sum, v) => sum + v, 0);
  // Rows, shares and room bar follow the chosen view: current power, or the energy of the period.
  const rows = useMemo(() => readings.map(r => {
    const energy = today[r.id] ?? 0;
    return { id: r.id, watts: r.watts, energy, value: live ? r.watts : energy, share: live ? r.share : todayTotal > 0 ? Math.round(energy / todayTotal * 100) : 0 };
  }).sort((a, b) => b.value - a.value), [readings, today, live, todayTotal]);
  const rooms = useMemo(() => {
    const map = new Map<string, { name: string; color: string; value: number }>();
    for (const r of rows) {
      const node = nodeById.get(r.id); if (!node) continue;
      const room = map.get(node.roomName) ?? { name: node.roomName, color: node.color, value: 0 };
      room.value += r.value; map.set(node.roomName, room);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [rows, nodeById]);
  const roomTotal = rooms.reduce((sum, r) => sum + r.value, 0);
  const format = (value: number) => live ? formatWatts(value, language) : formatEnergy(value, language);

  return (
    <>
      {/* Label sources for the marker layer (rasterised, parked off screen). */}
      <div className="energy-labels" aria-hidden>
        <div ref={el => { labels.current.hub = el; }} className="energy-label hub"><Zap size={12} />{t('energy.supply')} · {formatWatts(total, language)}</div>
        {nodes.map(node => {
          const r = byId.get(node.id);
          const active = !!r && r.watts >= 1;
          return (
            <div key={node.id} ref={el => { labels.current[node.id] = el; }} className={`energy-label${active ? '' : ' idle'}`} style={{ ['--energy-color' as string]: node.color }}>
              <span className="energy-dot" />{node.name}<b>{r ? formatWatts(r.watts, language) : '–'}</b>{active && r!.share > 0 && <small>{r!.share} %</small>}
            </div>
          );
        })}
      </div>

      <aside className="energy-panel" aria-label={t('energy.title')}>
        <header>
          <Zap size={18} aria-hidden />
          <div><strong>{t('energy.title')}</strong><small>{t('energy.subtitle')}</small></div>
          <button type="button" className="energy-close" onClick={onClose} aria-label={t('energy.close')} title={t('energy.close')}><X size={16} /></button>
        </header>
        {error ? <p className="energy-empty">{t('energy.error')}</p>
          : consumers === null ? <p className="energy-empty">{t('energy.loading')}</p>
            : !consumers.length ? <p className="energy-empty">{t('energy.none')}</p> : <>
              <div className="energy-totals">
                <div><span>{t('energy.now')}</span><strong>{formatWatts(total, language)}</strong></div>
                <div><span>{t(`energy.since.${period}`)}</span><strong>{formatEnergy(todayTotal, language)}</strong></div>
              </div>
              <div className="energy-periods" role="group" aria-label={t('energy.period')}>
                {MODES.map(m => <button key={m} type="button" className={m === mode ? 'active' : ''} aria-pressed={m === mode} onClick={() => setMode(m)}>{t(`energy.period.${m}`)}</button>)}
              </div>
              <div className="energy-rooms" role="img" aria-label={rooms.map(r => `${r.name} ${roomTotal ? Math.round(r.value / roomTotal * 100) : 0} %`).join(', ')}>
                {rooms.filter(r => r.value > 0).map(r => <span key={r.name} style={{ flexGrow: r.value, background: r.color }} title={`${r.name} · ${format(r.value)}`} />)}
              </div>
              <ul className="energy-legend">
                {rooms.map(r => <li key={r.name}><span className="energy-dot" style={{ background: r.color }} />{r.name}<b>{roomTotal ? Math.round(r.value / roomTotal * 100) : 0} %</b></li>)}
              </ul>
              <ol className="energy-list">
                {rows.map(r => {
                  const node = nodeById.get(r.id); if (!node) return null;
                  // The other measure as a note: the period's energy in the live view, the current power otherwise.
                  const note = live ? (r.energy ? ` · ${formatEnergy(r.energy, language)} ${t('energy.since.day').toLowerCase()}` : '') : ` · ${t('energy.now').toLowerCase()} ${formatWatts(r.watts, language)}`;
                  return (
                    <li key={r.id} className={r.value > (live ? 1 : 0) ? '' : 'idle'} title={`${node.roomName} · ${t(`energy.place.${node.source}`)}`}>
                      <span className="energy-dot" style={{ background: node.color }} />
                      <span className="energy-name">{node.name}<small>{node.roomName}{note}</small></span>
                      <span className="energy-value">{format(r.value)}<small>{r.share} %</small></span>
                      <span className="energy-bar"><span style={{ width: `${r.share}%`, background: node.color }} /></span>
                    </li>
                  );
                })}
              </ol>
            </>}
      </aside>
    </>
  );
}
