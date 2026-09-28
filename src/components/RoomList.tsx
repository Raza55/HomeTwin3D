import { House, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { RoomConfig } from '../types';
import type { HAAreaRegistryEntry } from '../services/haAreaRegistry';
import { useTranslation } from '../contexts/LanguageContext';
import './RoomEditor.css';

interface Props {
  rooms: RoomConfig[];
  areas: HAAreaRegistryEntry[];
  selectedIdx: number | null;
  syncStatus: 'idle' | 'loading' | 'ready' | 'error';
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAddArea: (area: HAAreaRegistryEntry) => void;
  onSync: () => void;
}

export default function RoomList({ rooms, areas, selectedIdx, syncStatus, onSelect, onDelete, onAddArea, onSync }: Props) {
  const t = useTranslation();
  const linkedAreaIds = new Set(rooms.flatMap((room) => room.haAreaIds));
  const availableAreas = areas.filter((area) => !linkedAreaIds.has(area.area_id));

  return (
    <>
      <div className="room-sync-bar">
        <div>
          <div className="room-sync-title">{t('rooms.haAreas')}</div>
          <div className={`room-sync-status ${syncStatus}`}>{t(`rooms.sync.${syncStatus}`)}</div>
        </div>
        <button
          className="room-icon-btn"
          onClick={onSync}
          disabled={syncStatus === 'loading'}
          title={t('rooms.syncNow')}
          aria-label={t('rooms.syncNow')}
        >
          <RefreshCw size={15} className={syncStatus === 'loading' ? 'spinning' : ''} aria-hidden="true" />
        </button>
      </div>

      {rooms.length > 0 && (
        <div className="room-list-section">
          <div className="smart-device-group-title">{t('rooms.configured')} ({rooms.length})</div>
          {rooms.map((room, index) => (
            <div
              key={room.id}
              className={`light-item${selectedIdx === index ? ' selected' : ''}`}
              onClick={() => onSelect(index)}
            >
              <div className="light-item-icon"><House size={16} aria-hidden="true" /></div>
              <div className="light-item-info">
                <div className="light-item-name">{room.name}</div>
                <div className="light-item-meta">{t('rooms.entitiesCount', { count: room.primaryEntityIds.length })}</div>
              </div>
              <button
                className="light-item-del"
                title={t('common.delete')}
                aria-label={t('common.delete')}
                onClick={(event) => { event.stopPropagation(); onDelete(index); }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {availableAreas.length > 0 && (
        <div className="room-list-section">
          <div className="smart-device-group-title">{t('rooms.available')} ({availableAreas.length})</div>
          {availableAreas.map((area) => (
            <button key={area.area_id} className="room-area-row" onClick={() => onAddArea(area)}>
              <House size={15} aria-hidden="true" />
              <span>{area.name}</span>
              <Plus size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {!rooms.length && !availableAreas.length && syncStatus !== 'loading' && (
        <div className="list-empty">{t('rooms.empty')}</div>
      )}
    </>
  );
}
