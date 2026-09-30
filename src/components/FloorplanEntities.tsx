import { useTranslation } from '../contexts/LanguageContext';
import { getConfig } from '../services/configApi';
import FloorplanBindingBackup from './FloorplanBindingBackup';

export default function FloorplanEntities({ onApply, disabled, onStartVisualMatching }: { onApply: () => void; disabled?: boolean; onStartVisualMatching?: (category?: 'light' | 'other') => void }) {
  const t = useTranslation();
  const manifest = getConfig().model?.floorplan;
  const total = manifest?.objects.length ?? 0;
  const assigned = manifest?.objects.filter(o => o.entityId).length ?? 0;
  return <div className="settings-floorplan">
    {manifest ? <>
      <div className="settings-stats">
        <span><strong>{total}</strong>{t('floorplan.objects')}</span>
        <span className="ok"><strong>{assigned}</strong>{t('floorplan.assigned')}</span>
        <span className={total - assigned ? 'warn' : ''}><strong>{total - assigned}</strong>{t('floorplan.open')}</span>
      </div>
      <p className="settings-note">{t('floorplan.matchHint')}</p>
      {onStartVisualMatching && <div className="settings-actions">
        <button type="button" className="settings-btn primary" disabled={disabled} onClick={() => onStartVisualMatching('light')}>{t('floorplan.matchLights')}</button>
        {manifest.objects.some(o => o.domain !== 'light') && <button type="button" className="settings-btn" disabled={disabled} onClick={() => onStartVisualMatching('other')}>{t('floorplan.matchOther')}</button>}
      </div>}
    </> : <p className="settings-note">{t('floorplan.noManifest')}</p>}
    <details className="settings-details">
      <summary>{t('floorplan.backupTitle')}</summary>
      <FloorplanBindingBackup disabled={disabled} onApply={onApply} />
      {manifest && <button type="button" className="settings-btn" disabled={disabled} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'hometwin-zuordnungen.json'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>{t('floorplan.exportForBlender')}</button>}
    </details>
  </div>;
}
