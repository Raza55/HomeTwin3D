import type { BlindConfig } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
  blinds: BlindConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function BlindList({ blinds, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  const t = useTranslation();

  if (blinds.length === 0) {
    return (
      <div className="list-empty">
        {t('list.noBlinds')}<br />
        <span dangerouslySetInnerHTML={{ __html: t('list.clickAddBlind') }} />
      </div>
    );
  }

  return (
    <>
      {blinds.map((blind, i) => (
        <div
          key={blind.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">&#9646;</div>
          <div className="light-item-info">
            <div className="light-item-name">{blind.label || blind.entityId}</div>
            <div className="light-item-meta">
              {blind.entityId} &middot; {blind.size.width.toFixed(1)} x {blind.size.height.toFixed(1)} &middot; {blind.slats ?? 10} {t('list.slats')}
            </div>
          </div>
          <button
            className="light-item-dup"
            title={t('common.duplicate')}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(i);
            }}
          >
            &#x29C9;
          </button>
          <button
            className="light-item-del"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(i);
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </>
  );
}
