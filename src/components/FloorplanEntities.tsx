import { getConfig } from '../services/configApi';
import FloorplanBindingBackup from './FloorplanBindingBackup';

export default function FloorplanEntities({ onApply, disabled, onStartVisualMatching }: { onApply: () => void; disabled?: boolean; onStartVisualMatching?: (category?: 'light' | 'other') => void }) {
  const manifest = getConfig().model?.floorplan;
  const assigned = manifest?.objects.filter(o => o.entityId).length ?? 0;
  return <div className="settings-section settings-floorplan">
    <div className="settings-section-label">Blender-Floorplan{manifest ? ` · ${manifest.source}` : ''}</div>
    {manifest ? <>
      <p>{manifest.objects.length} Objekte · {assigned} zugeordnet · {manifest.objects.length-assigned} offen</p>
      <p>Ordne Lampen direkt im Live-Plan zu. Das Lampensymbol mit Plus öffnet die Zuordnung für eine einzelne Leuchte.</p>
      {onStartVisualMatching && <button className="settings-action-btn settings-action-primary" disabled={disabled} onClick={()=>onStartVisualMatching('light')}>Visuellen Lampen-Assistenten starten</button>}
      {onStartVisualMatching && manifest.objects.some(o=>o.domain!=='light') && <button className="settings-action-btn" disabled={disabled} onClick={()=>onStartVisualMatching('other')}>Türen, Rollos & Geräte visuell zuordnen</button>}
    </> : <p>In Blender über „Datei → Exportieren → 3Dash Floorplan“ exportieren und die GLB-Datei laden.</p>}
    <FloorplanBindingBackup disabled={disabled} onApply={onApply}/>
    {manifest && <button className="settings-action-btn" disabled={disabled} onClick={() => {
      const url=URL.createObjectURL(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='3dash-zuordnungen.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}>Zuordnungen für Blender exportieren</button>}
  </div>;
}
