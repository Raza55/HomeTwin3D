import { useEffect, useRef, useState } from 'react';
import type { ApplianceConfig, HAState } from '../types';
import { getActiveHAConnection } from '../services/haWebSocket';
import { applianceControlOffline, countProgramStarts, mergeProgramStarts, programLabel, programOptions, programStartsFromHistory, rankPrograms, readProgramUsage, recordProgramStart, resolveApplianceControls, type ApplianceRegistryEntry } from '../services/applianceControls';
import { applianceRunning } from '../babylon/ApplianceAnimation';
import { fetchHistory } from '../services/haHistoryApi';
import { useEntityStatesVersion, watchEntityStates } from '../services/entityStateSignal';

export default function ApplianceControls({ appliance, entityId, states, connected, running }: {
  appliance: ApplianceConfig; entityId: string; states: Record<string, HAState>; connected: boolean; running: boolean;
}) {
  const [registry, setRegistry] = useState<ApplianceRegistryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [feedback, setFeedback] = useState('');
  const [pendingProgram, setPendingProgram] = useState('');
  const controls = resolveApplianceControls(appliance, entityId, registry);
  const ids = Object.values(controls).filter((id): id is string => !!id);
  const key = JSON.stringify(ids);
  useEntityStatesVersion(ids);
  useEffect(() => watchEntityStates(JSON.parse(key)), [key]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setRegistry([]);
    if (connected) void getActiveHAConnection()?.request({ type: 'config/entity_registry/list' }).then(result => {
      if (!cancelled && Array.isArray(result)) setRegistry(result);
    }).catch(() => { if (!cancelled) setFeedback('Automatische Zuordnung nicht verfügbar. Bitte über den Stift zuordnen.'); });
    return () => { cancelled = true; };
  }, [connected, entityId]);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const program = states[controls.program ?? ''];
  // Starts at the machine count too: derived from the recorder, browser starts as fallback.
  useEffect(() => {
    let cancelled = false;
    const programId = controls.program;
    if (!connected || !programId || !entityId) return;
    const unit = states[entityId]?.attributes.unit_of_measurement;
    const isRunning = (state: string) => applianceRunning(appliance, { entity_id: entityId, state, attributes: unit ? { unit_of_measurement: unit } : {}, last_changed: '' });
    void Promise.all([fetchHistory(programId, '30d'), fetchHistory(entityId, '30d')]).then(([programs, runs]) => {
      if (!cancelled) setUsage(countProgramStarts(mergeProgramStarts(programId, programStartsFromHistory(programs, runs, isRunning))));
    }).catch(() => { /* Ranking falls back to starts from this browser. */ });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, controls.program, entityId, running]);
  const fromHistory = !!usage && Object.keys(usage).length > 0;
  const counts = fromHistory ? usage! : readProgramUsage(controls.program ?? entityId);
  const options = rankPrograms(programOptions(program), counts);
  const presets = options.filter(option => (counts[option] ?? 0) > 0).slice(0, 4);
  const offline = applianceControlOffline(controls, states, connected);
  // Buttons report "unknown" until first use; this is not unavailability.
  const available = (id?: string) => !!id && !!states[id] && states[id].state !== 'unavailable';
  useEffect(() => {
    if (!pendingProgram) return;
    if (program?.state === pendingProgram) { setPendingProgram(''); return; }
    const timer = window.setTimeout(() => { setPendingProgram(''); setFeedback('Programmauswahl wurde vom Gerät noch nicht bestätigt. Bitte Zustand prüfen.'); }, 15000);
    return () => clearTimeout(timer);
  }, [pendingProgram, program?.state]);

  async function command(kind: 'program' | 'start' | 'stop', option?: string) {
    const target = controls[kind];
    const connection = getActiveHAConnection();
    if (lock.current || offline || !target || !connection?.isConnected || !available(target)) return;
    if (kind === 'program' && (!option || !options.includes(option) || running)) return;
    if (kind === 'start' && (running || pendingProgram)) return;
    lock.current = true; setBusy(true); setFeedback('');
    if (kind === 'program') setPendingProgram(option!);
    try {
      await connection.callService(kind === 'program' ? 'select' : 'button', kind === 'program' ? 'select_option' : 'press', target, kind === 'program' ? { option } : undefined);
      if (kind === 'start' && controls.program && options.includes(program?.state ?? '')) recordProgramStart(controls.program, program!.state);
      if (mounted.current) setFeedback(kind === 'start' ? 'Startbefehl gesendet.' : kind === 'stop' ? 'Stopp-/Reset-Befehl gesendet.' : 'Programmauswahl gesendet.');
    } catch {
      if (mounted.current) { setPendingProgram(''); setFeedback('Befehl fehlgeschlagen. Verbindung und Fernsteuerung am Gerät prüfen.'); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className="appliance-controls">
    <label>Programm<select aria-label="Waschprogramm auswählen" value={pendingProgram || (options.includes(program?.state ?? '') ? program!.state : '')}
      disabled={busy || !!pendingProgram || offline || running || !available(controls.program) || !options.length}
      onChange={event => void command('program', event.target.value)}>
      <option value="" disabled>{options.length ? 'Programm wählen' : 'Keine Programmauswahl verfügbar'}</option>
      {options.map(option => <option key={option} value={option}>{programLabel(option)}{counts[option] > 0 ? ` (${counts[option]}×)` : ''}</option>)}
    </select></label>
    {presets.length > 0 && <div className="appliance-presets" role="group" aria-label="Häufige Programme">
      {presets.map(option => <button key={option} aria-pressed={(pendingProgram || program?.state) === option} title={option}
        disabled={busy || !!pendingProgram || offline || running || !available(controls.program)}
        onClick={() => void command('program', option)}>{programLabel(option)}</button>)}
    </div>}
    <p className="appliance-control-hint">{fromHistory ? 'Sortiert nach Häufigkeit laut HA Verlauf, auch Starts am Gerät.' : 'Häufig hier gestartete Programme zuerst; Zählung in diesem Browser.'}</p>
    <div className="appliance-control-actions">
      <button disabled={busy || !!pendingProgram || offline || running || !available(controls.start)} onClick={() => void command('start')}>Start</button>
      <button disabled={busy || offline || !available(controls.stop)} onClick={() => void command('stop')}>Stopp / Reset</button>
    </div>
    {offline && <p role="status">Waschmaschine nicht verbunden.</p>}
    {controls.remote && <p className="appliance-control-hint">Fernsteuerung: {states[controls.remote]?.state ?? 'Unbekannt'}</p>}
    {(!controls.program || !controls.start || !controls.stop) && <p className="appliance-control-hint">Fehlende Steuerung über den Stift zuordnen.</p>}
    {feedback && <p role="status">{feedback}</p>}
  </div>;
}
