import { useRef, useState } from 'react';
import type { HAState } from '../types';
import type { HALike } from '../services/haWebSocket';
import { HUE_SYNC_AREA, HUE_SYNC_AREA_NAME, HUE_SYNC_MEMBERS, HUE_SYNC_SWITCH, hueSyncScenes } from '../services/hueSync';
import { activateHueSyncScene, commandHueSyncLights, HUE_SYNC_PRESETS, hueSyncZoneActive, hueSyncZoneBlocked, setHueSync } from '../services/hueSyncControls';

interface Props {
  states: Record<string, HAState>; connected: boolean;
  getConnection: () => HALike | null; getStates: () => Record<string, HAState>;
  onContinue: () => void;
}
export default function HueSyncControls({ states, connected, getConnection, getStates, onContinue }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [color, setColor] = useState('#ffb45f');
  const pending = useRef(false);
  const active = hueSyncZoneActive(states), blocked = hueSyncZoneBlocked(states);
  const reachable = HUE_SYNC_MEMBERS.filter(id => states[id] && !['unknown', 'unavailable'].includes(states[id].state)).length;
  const canSync = connected && ['on', 'off'].includes(states[HUE_SYNC_SWITCH]?.state ?? '') && states[HUE_SYNC_AREA]?.state === HUE_SYNC_AREA_NAME;
  const disabled = !connected || blocked || !reachable || busy;
  const run = async (action: (ha: HALike) => Promise<void>) => {
    if (pending.current) return;
    const ha = getConnection();
    if (!ha?.isConnected) { setError('Nicht mit Home Assistant verbunden.'); return; }
    pending.current = true; setBusy(true); setError('');
    try { await action(ha); } catch (e) { setError(e instanceof Error ? e.message : 'Änderung fehlgeschlagen.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const command = (service: 'turn_on' | 'turn_off', data?: Record<string, unknown>) => void run(ha => commandHueSyncLights(ha, getStates, service, data));
  const scenes = hueSyncScenes(states);
  return <section className="hue-sync-controls" aria-label="Sync-Zone steuern">
    <strong>Alle Sync-Lampen</strong>
    <p>{active ? 'Hue Sync läuft und steuert die Farben.' : 'Gemeinsam schalten und gestalten.'}</p>
    <div className="hue-sync-actions">
      <button disabled={!canSync || busy} onClick={() => void run(ha => setHueSync(ha, getStates, !active))}>{active ? 'Sync stoppen' : 'Sync starten'}</button>
      {active && <button disabled={busy} onClick={onContinue}>Weiterlaufen lassen</button>}
    </div>
    {!active && <>
      {blocked && <p>Sync-Status nicht verfügbar. Gruppensteuerung wartet auf Home Assistant.</p>}
      {!canSync && !blocked && <p>Für den Sync-Start an der Sync-Box die passende Zone auswählen.</p>}
      <div className="hue-sync-actions"><button disabled={disabled} onClick={() => command('turn_on')}>Alle einschalten</button><button disabled={disabled} onClick={() => command('turn_off')}>Alle ausschalten</button></div>
      <span className="hue-sync-caption">Licht-Presets</span>
      <div className="hue-sync-presets">{HUE_SYNC_PRESETS.map(p => <button key={p.name} disabled={disabled} onClick={() => command('turn_on', { rgb_color: [...p.color], brightness: p.brightness })}>{p.name}</button>)}</div>
      <div className="light-quick-colors" aria-label="Farbe für alle Sync-Lampen">
        {[['Warm', '#ffb45f'], ['Rot', '#ff5050'], ['Grün', '#63de9a'], ['Blau', '#709eff'], ['Violett', '#c58aff']].map(([name, hex]) => <button key={hex} title={name} aria-label={`Alle Sync-Lampen: ${name}`} style={{ background: hex }} disabled={disabled} onClick={() => { setColor(hex); command('turn_on', { rgb_color: [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) }); }} />)}
        <input type="color" aria-label="Eigene Farbe für alle Sync-Lampen" value={color} disabled={disabled} onChange={e => { const hex = e.target.value; setColor(hex); command('turn_on', { rgb_color: [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) }); }} />
      </div>
      {!!scenes.length && <label className="hue-sync-scenes">HA-Szenen der Sync-Zone<select aria-label="HA-Szene für Sync-Zone" value="" disabled={disabled} onChange={e => { const id = e.target.value; if (id) void run(ha => activateHueSyncScene(ha, getStates, id)); }}><option value="">Szene auswählen …</option>{scenes.map(s => <option key={s.entity_id} value={s.entity_id}>{s.attributes.friendly_name ?? s.entity_id}</option>)}</select></label>}
      {reachable < HUE_SYNC_MEMBERS.length && <p>{reachable} von {HUE_SYNC_MEMBERS.length} Lampen erreichbar; nur diese werden geschaltet.</p>}
    </>}
    {busy && <p role="status">Wird übernommen …</p>}
    {error && <p className="light-quick-error" role="alert">{error}</p>}
  </section>;
}
