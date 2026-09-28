import { useState } from 'react';
import { getConfig, updateConfig } from '../services/configApi';
import { applyFloorplanMappings } from '../services/floorplanImport';
import type { FloorplanObject, LightConfig } from '../types';

/** Includes unassigned fixtures: these have no entry in config.lights yet. */
export default function BlenderLightSettings({ onSave }: { onSave: (lights: LightConfig[]) => void }) {
  const [objects, setObjects] = useState(() => getConfig().model?.floorplan?.objects.filter(o => o.domain === 'light') ?? []);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (!objects.length) return null;
  const change = (id: string, key: 'lumens' | 'range', value: number) => {
    setSaved(false);
    setObjects(prev => prev.map(o => o.id === id ? { ...o, lightCalibration: { ...o.lightCalibration, [key]: value } } : o));
  };
  const save = () => {
    try {
      const config = getConfig();
      if (!config.model?.floorplan) throw new Error('Das Blender-Modell ist nicht mehr geladen.');
      const edits = new Map(objects.map(o => [o.id, o]));
      const manifest = structuredClone(config.model.floorplan);
      manifest.objects = manifest.objects.map((o): FloorplanObject => {
        const edit = edits.get(o.id);
        if (!edit?.emitters?.length) return o;
        const calibration = edit.lightCalibration ?? {};
        if (Object.entries(calibration).some(([k, v]) => !Number.isFinite(v) || v <= 0 || v > (k === 'lumens' ? 100000 : 100))) throw new Error('Bitte gültige Lichtwerte eintragen (1–100000 lm, bis 100 m).');
        const total = o.emitters!.reduce((sum, e) => sum + e.lumens, 0);
        return { ...o, lightCalibration: calibration, emitters: o.emitters!.map(e => ({ ...e,
          lumens: calibration.lumens === undefined ? e.lumens : e.lumens * calibration.lumens / total,
          range: calibration.range ?? e.range,
        })) };
      });
      const next = applyFloorplanMappings(config, manifest);
      updateConfig({ model: next.model, floorplanBindings: next.floorplanBindings, lights: next.lights });
      setObjects(manifest.objects.filter(o => o.domain === 'light'));
      setError(''); setSaved(true); onSave(next.lights);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return <details className="blender-light-settings">
    <summary>Blender-Lichtquellen · {objects.length} Leuchten · {objects.reduce((n, o) => n + (o.emitters?.length ?? 0), 0)} Quellen</summary>
    <p>Werte aus dem geladenen Modell, einschließlich noch nicht zugeordneter Leuchten. Kalibrierungen bleiben beim erneuten Import erhalten.</p>
    {objects.map(o => <details key={o.id}>
      <summary>{o.label} · {o.room ?? 'Ohne Raum'}</summary>
      <p>{o.entityId || 'Noch keine HA-Entity zugeordnet'}</p>
      {o.emitters?.length ? <>
        <label>Lichtstrom gesamt (lm)<input type="number" min="1" max="100000" value={o.lightCalibration?.lumens ?? o.emitters.reduce((n, e) => n + e.lumens, 0)} onChange={e => change(o.id, 'lumens', e.target.valueAsNumber)} /></label>
        <label>Reichweite (m)<input type="number" min="0.1" max="100" step="0.1" placeholder="Je Quelle" value={o.lightCalibration?.range ?? (o.emitters.every(e => e.range === o.emitters![0].range) ? o.emitters[0].range : '')} onChange={e => change(o.id, 'range', e.target.valueAsNumber)} /></label>
        {o.emitters.map((e, i) => <p key={i}>{i + 1}. {e.kind === 'spot' ? 'Spot' : 'Punktlicht'} · {Math.round(e.lumens)} lm · {e.range} m{e.kind === 'spot' ? ` · ${e.angle ?? 100}°` : ''}<br />
          Position (m): {Object.values(e.position).map(v => v.toFixed(2)).join(' / ')}
          {e.direction && <><br />Richtung: {Object.values(e.direction).map(v => v.toFixed(2)).join(' / ')}</>}
        </p>)}
      </> : <p>Keine Lichtquellen im Modell hinterlegt.</p>}
    </details>)}
    <button className="btn btn-primary" onClick={save}>Lichtwerte speichern</button>
    {saved && <p role="status">Lichtwerte gespeichert.</p>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
