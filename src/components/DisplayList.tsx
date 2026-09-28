import type { DisplayConfig } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

const DISPLAY_KIND_ICONS: Record<string, string> = {
  info: '\u{1F4CA}',
  tv: '\u{1F4FA}',
  pc: '\u{1F5A5}\uFE0F',
  console: '\u{1F3AE}',
  qnap: '\u{1F5C4}\uFE0F',
};

function displayKindLabelKey(kind: DisplayConfig['kind']): string {
  if (kind === 'tv') return 'form.tvDisplay';
  if (kind === 'pc') return 'form.pcDisplay';
  if (kind === 'console') return 'form.consoleDisplay';
  if (kind === 'qnap') return 'form.qnapDisplay';
  return 'form.infoDisplay';
}

interface Props {
  displays: DisplayConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function DisplayList({ displays, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  const t = useTranslation();

  if (displays.length === 0) {
    return (
      <div className="list-empty">
        {t('list.noDisplays')}<br />
        <span dangerouslySetInnerHTML={{ __html: t('list.clickAddDisplay') }} />
      </div>
    );
  }

  return (
    <>
      {displays.map((d, i) => (
        <div
          key={d.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">{DISPLAY_KIND_ICONS[d.kind ?? 'info'] ?? DISPLAY_KIND_ICONS.info}</div>
          <div className="light-item-info">
            <div className="light-item-name">{d.label || d.id}</div>
            <div className="light-item-meta">
              {d.kind && d.kind !== 'info'
                ? `${t(displayKindLabelKey(d.kind))} · ${d.sources[0]?.entityId || t('list.noSources')}`
                : d.sources.map((s) => s.entityId).join(', ') || t('list.noSources')}
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
