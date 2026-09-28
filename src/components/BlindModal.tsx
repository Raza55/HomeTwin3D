import { useEffect, useState, useCallback } from 'react';
import type { HAState } from '../types';
import { getCoverPosition } from '../babylon/BlindMeshFactory';
import { useTranslation } from '../contexts/LanguageContext';
import './LightModal.css';

interface Props {
  visible: boolean;
  entityId: string | null;
  label: string;
  state: HAState | null;
  onClose: () => void;
  onOpenCover: (entityId: string) => void;
  onCloseCover: (entityId: string) => void;
  onStopCover: (entityId: string) => void;
  onSetPosition: (entityId: string, position: number) => void;
}

export default function BlindModal({
  visible,
  entityId,
  label,
  state,
  onClose,
  onOpenCover,
  onCloseCover,
  onStopCover,
  onSetPosition,
}: Props) {
  const t = useTranslation();
  const [position, setPosition] = useState(0);

  useEffect(() => {
    setPosition(getCoverPosition(state));
  }, [state, entityId]);

  const handleSetPosition = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = parseInt(e.target.value, 10);
      setPosition(next);
      if (entityId) onSetPosition(entityId, next);
    },
    [entityId, onSetPosition],
  );

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="light-modal">
        <div className="modal-header">
          <div className="modal-title">
            <div className="modal-bulb-icon">&#9646;</div>
            <div>
              <div className="modal-entity-name">{label}</div>
              <div className="modal-entity-id">{entityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &#10005;
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-slider-wrap">
            <div className="slider-header">
              <span className="modal-label">{t('modal.position')}</span>
              <span className="slider-value">{position}%</span>
            </div>
            <input
              type="range"
              className="modal-slider brightness"
              min={0}
              max={100}
              value={position}
              onChange={handleSetPosition}
            />
          </div>

          <div className="modal-row" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => entityId && onOpenCover(entityId)}
            >
              {t('common.open')}
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => entityId && onStopCover(entityId)}
            >
              {t('common.stop')}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => entityId && onCloseCover(entityId)}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
