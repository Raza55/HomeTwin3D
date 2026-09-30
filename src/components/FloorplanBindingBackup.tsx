import { useRef, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { getConfig, updateConfig } from '../services/configApi';
import { collectFloorplanBindings, exportFloorplanBindings, importFloorplanBindings } from '../services/floorplanImport';

export default function FloorplanBindingBackup({ disabled, onApply }: { disabled?: boolean; onApply: () => void }) {
  const t = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const count = collectFloorplanBindings(getConfig()).length;
  return <div className="settings-backup-block">
    <p className="settings-note">{t('floorplan.bindingsStored', { count })}</p>
    <div className="settings-actions">
    <button type="button" className="settings-btn" disabled={disabled || !count} onClick={() => {
      const url = URL.createObjectURL(new Blob([exportFloorplanBindings(getConfig())], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'hometwin-bindings.json'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>{t('floorplan.saveBindings')}</button>
    <button type="button" className="settings-btn" disabled={disabled} onClick={() => input.current?.click()}>{t('floorplan.loadBindings')}</button>
    </div>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error(t('floorplan.fileTooLarge'));
        const next = importFloorplanBindings(getConfig(), JSON.parse(await file.text()));
        updateConfig(next); setError(''); setMessage(t('floorplan.bindingsLoaded')); onApply();
      } catch (e) { setError(e instanceof Error ? e.message : t('common.failed')); setMessage(''); }
    }} />
    {message && <p className="settings-inline-feedback success" role="status">{message}</p>}
    {error && <p className="settings-inline-feedback error" role="alert">{error}</p>}
  </div>;
}
