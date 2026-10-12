import { useEffect, useRef, useState } from 'react';
import type { ApplianceConfig, HAState } from '../types';
import { getActiveHAConnection } from '../services/haWebSocket';
import { applianceControlOffline, programOptions, rankPrograms, readProgramUsage, recordProgramStart, resolveApplianceControls, type ApplianceRegistryEntry } from '../services/applianceControls';
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
  const program = states[controls.program ?? ''];
  const options = rankPrograms(programOptions(program), readProgramUsage(controls.program ?? entityId));
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
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select></label>
    <p className="appliance-control-hint">Häufig hier gestartete Programme zuerst; Zählung in diesem Browser.</p>
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
