import type { ShadowWallConfig } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
  walls: ShadowWallConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function ShadowWallList({ walls, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  const t = useTranslation();

  if (walls.length === 0) {
    return (
      <div className="list-empty">
        {t('list.noWalls')}<br />
        <span dangerouslySetInnerHTML={{ __html: t('list.clickAddWall') }} />
      </div>
    );
  }

  return (
    <>
      {walls.map((w, i) => (
        <div
          key={w.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">{'\u{1F9F1}'}</div>
          <div className="light-item-info">
            <div className="light-item-name">{w.label || w.id}</div>
            <div className="light-item-meta">
              {w.size.width.toFixed(1)} x {w.size.height.toFixed(1)} x {w.size.depth.toFixed(1)}
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
