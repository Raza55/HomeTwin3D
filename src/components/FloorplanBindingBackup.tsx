import { useRef, useState } from 'react';
import { getConfig, updateConfig } from '../services/configApi';
import { collectFloorplanBindings, exportFloorplanBindings, importFloorplanBindings } from '../services/floorplanImport';

export default function FloorplanBindingBackup({ disabled, onApply }: { disabled?: boolean; onApply: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const count = collectFloorplanBindings(getConfig()).length;
  return <div style={{ margin: '12px 0' }}>
    <p>{count} Objektbeziehungen separat gespeichert. Beim erneuten Planimport werden sie über die Blender-Objektkennung wiederhergestellt – auch für zwischenzeitlich entfernte Objekte.</p>
    <button className="settings-action-btn" disabled={disabled || !count} onClick={() => {
      const url = URL.createObjectURL(new Blob([exportFloorplanBindings(getConfig())], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = '3dash-bindings.json'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Alle Zuordnungen sichern</button>
    <button className="settings-action-btn" disabled={disabled} onClick={() => input.current?.click()}>Zuordnungsdatei laden</button>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('Zuordnungsdatei ist zu groß (maximal 5 MB).');
        const next = importFloorplanBindings(getConfig(), JSON.parse(await file.text()));
        updateConfig(next); setError(''); setMessage('Zuordnungen geladen und auf passende Planobjekte angewendet.'); onApply();
      } catch (e) { setError(e instanceof Error ? e.message : 'Import fehlgeschlagen.'); setMessage(''); }
    }} />
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
