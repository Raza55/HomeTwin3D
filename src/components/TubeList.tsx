import type { TubeConfig } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
  tubes: TubeConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function TubeList({ tubes, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  const t = useTranslation();
  const dirLabels: Record<string, string> = {
    left: `\u2190 ${t('common.left')}`,
    right: `\u2192 ${t('common.right')}`,
    top: `\u2191 ${t('common.top')}`,
    bottom: `\u2193 ${t('common.bottom')}`,
  };
  const typeSymbols: Record<string, string> = { network: '⇄', electricity: '⚡', water: '≈', gas: '∿', custom: '┃' };

  if (tubes.length === 0) {
    return (
      <div className="list-empty">
        {t('list.noTubes')}<br />
        <span dangerouslySetInnerHTML={{ __html: t('list.clickAddTube') }} />
      </div>
    );
  }

  return (
    <>
      {tubes.map((tube, i) => (
        <div
          key={tube.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon" style={{ color: tube.lines[0]?.color || '#888' }}>
            {typeSymbols[tube.flowType ?? 'network']}
          </div>
          <div className="light-item-info">
            <div className="light-item-name">{tube.label || tube.id}</div>
            <div className="light-item-meta">
              {t(`flows.type.${tube.flowType ?? 'network'}`)} &middot; {dirLabels[tube.originDirection] || tube.originDirection} &middot; {tube.lines.length} {tube.lines.length === 1 ? t('list.line') : t('list.lines')}
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
