import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import { Zap, X } from 'lucide-react';
import type { AppConfig, DisplayConfig, HAState } from '../../types';
import { EnergyFlowLayer, placeConsumers, type EnergyNode } from '../../babylon/EnergyFlowLayer';
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
const PERIODS: EnergyPeriod[] = ['day', 'week', 'month'];

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
  const [period, setPeriod] = useState<EnergyPeriod>('day');
  const [error, setError] = useState(false);
  const layer = useRef<EnergyFlowLayer | null>(null);
  const positions = useRef(new Map<string, Vector3>());
  const labels = useRef<Record<string, HTMLDivElement | null>>({});
  const unit = config.model?.scale ?? 1;

  // Hide the other plan markers while the energy view is open.
  useEffect(() => {
    scene.metadata = { ...scene.metadata, energyView: true };
    return () => { scene.metadata = { ...scene.metadata, energyView: false }; };
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

  const rooms = useMemo(() => {
    const map = new Map<string, { name: string; color: string; watts: number }>();
    for (const r of readings) {
      const node = nodeById.get(r.id); if (!node) continue;
      const room = map.get(node.roomName) ?? { name: node.roomName, color: node.color, watts: 0 };
      room.watts += r.watts; map.set(node.roomName, room);
    }
    return [...map.values()].sort((a, b) => b.watts - a.watts);
  }, [readings, nodeById]);
  const todayTotal = Object.values(today).reduce((sum, v) => sum + v, 0);
  const roomTotal = rooms.reduce((sum, r) => sum + r.watts, 0);

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
                <div><span>{t(`energy.period.${period}`)}</span><strong>{todayTotal.toLocaleString(language, { maximumFractionDigits: todayTotal >= 100 ? 0 : todayTotal >= 10 ? 1 : 2 })} kWh</strong></div>
              </div>
              <div className="energy-periods" role="group" aria-label={t('energy.period')}>
                {PERIODS.map(p => <button key={p} type="button" className={p === period ? 'active' : ''} aria-pressed={p === period} onClick={() => setPeriod(p)}>{t(`energy.period.${p}`)}</button>)}
              </div>
              <div className="energy-rooms" role="img" aria-label={rooms.map(r => `${r.name} ${roomTotal ? Math.round(r.watts / roomTotal * 100) : 0} %`).join(', ')}>
                {rooms.filter(r => r.watts > 0).map(r => <span key={r.name} style={{ flexGrow: r.watts, background: r.color }} title={`${r.name} · ${formatWatts(r.watts, language)}`} />)}
              </div>
              <ul className="energy-legend">
                {rooms.map(r => <li key={r.name}><span className="energy-dot" style={{ background: r.color }} />{r.name}<b>{roomTotal ? Math.round(r.watts / roomTotal * 100) : 0} %</b></li>)}
              </ul>
              <ol className="energy-list">
                {readings.map(r => {
                  const node = nodeById.get(r.id); if (!node) return null;
                  return (
                    <li key={r.id} className={r.watts >= 1 ? '' : 'idle'} title={`${node.roomName} · ${t(`energy.place.${node.source}`)}`}>
                      <span className="energy-dot" style={{ background: node.color }} />
                      <span className="energy-name">{node.name}<small>{node.roomName}{today[r.id] ? ` · ${today[r.id].toLocaleString(language, { maximumFractionDigits: 2 })} kWh` : ''}</small></span>
                      <span className="energy-value">{formatWatts(r.watts, language)}<small>{r.share} %</small></span>
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
