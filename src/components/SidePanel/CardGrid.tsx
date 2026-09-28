import { useState, useEffect } from 'react';
import { GridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { SidePanelConfig, SidePanelCard, HAState, CardLayout, IndicatorCard } from '../../types';
import type { HALike } from '../../services/haWebSocket';
import ScriptCardView from './cards/ScriptCardView';
import IndicatorCardView from './cards/IndicatorCardView';
import GraphCardView from './cards/GraphCardView';
import IndicatorModal from './cards/IndicatorModal';
import { useTranslation } from '../../contexts/LanguageContext';
import '../SidePanel/CardPropertiesPanel.css';

interface Props {
  config: SidePanelConfig;
  ha: HALike | null;
  cardStates: Record<string, HAState>;
  width: number;
  height?: number;
  editMode?: boolean;
  onLayoutChange?: (layouts: Record<string, CardLayout>) => void;
  onSetTemperature?: (entityId: string, temperature: number) => void;
  onSetHvacMode?: (entityId: string, mode: string) => void;
  onCardEdit?: (card: SidePanelCard) => void;
  onCardDelete?: (cardId: string) => void;
}

const MOBILE_QUERY = '(max-width: 768px)';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return mobile;
}

export default function CardGrid({ config, ha, cardStates, width, editMode, onLayoutChange, onSetTemperature, onSetHvacMode, onCardEdit, onCardDelete }: Props) {
  const isMobile = useIsMobile();
  const t = useTranslation();
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorCard | null>(null);

  const renderCardContent = (card: typeof config.cards[number]) => {
    switch (card.type) {
      case 'script':
        return <ScriptCardView card={card} ha={ha} />;
      case 'indicator':
        return (
          <div onClick={() => !editMode && setSelectedIndicator(card)} style={{ cursor: editMode ? undefined : 'pointer', width: '100%', height: '100%' }}>
            <IndicatorCardView card={card} state={cardStates[card.entityId]} />
          </div>
        );
      case 'graph':
        return <GraphCardView card={card} />;
    }
  };

  const renderCard = (card: typeof config.cards[number]) => (
    <>
      {renderCardContent(card)}
      {editMode && (
        <div className="card-edit-overlay">
          <button
            className="card-edit-btn card-edit-btn-delete"
            onClick={e => { e.stopPropagation(); onCardDelete?.(card.id); }}
            title={t('cards.deleteCardTitle')}
          >&#x2715;</button>
          <button
            className="card-edit-btn card-edit-btn-edit"
            onClick={e => { e.stopPropagation(); onCardEdit?.(card); }}
            title={t('cards.editCardTitle')}
          >&#x270E;</button>
        </div>
      )}
    </>
  );

  const cols = config.columns ?? 4;
  const rowHeight = config.rowHeight ?? 80;
  const MARGIN = 8;

  const layout = config.cards.map(card => ({
    i: card.id,
    x: card.layout.x,
    y: card.layout.y,
    w: card.layout.w,
    h: card.layout.h,
    minW: 1,
    minH: 1,
  }));

  const handleLayoutChange = (newLayout: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
    if (!onLayoutChange) return;
    const layouts: Record<string, CardLayout> = {};
    for (const item of newLayout) {
      layouts[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
    }
    onLayoutChange(layouts);
  };

  const modal = selectedIndicator && (
    <IndicatorModal
      card={selectedIndicator}
      state={cardStates[selectedIndicator.entityId]}
      climateState={selectedIndicator.climateEntityId ? cardStates[selectedIndicator.climateEntityId] : undefined}
      visible
      onClose={() => setSelectedIndicator(null)}
      onSetTemperature={onSetTemperature ?? (() => {})}
      onSetHvacMode={onSetHvacMode ?? (() => {})}
    />
  );

  // Mobile without edit mode: CSS grid matching configured columns
  if (isMobile && !editMode) {
    return (
      <>
        <div
          className="side-panel-auto-grid"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: rowHeight }}
        >
          {config.cards.map(card => (
            <div
              key={card.id}
              className="side-panel-auto-grid-item"
              style={{
                position: 'relative',
                gridColumn: `span ${Math.min(card.layout.w, cols)}`,
                gridRow: `span ${card.layout.h}`,
              }}
            >
              {renderCard(card)}
            </div>
          ))}
        </div>
        {modal}
      </>
    );
  }

  // Desktop or mobile edit mode: GridLayout
  return (
    <>
      <GridLayout
        className="side-panel-grid"
        layout={layout}
        width={width}
        gridConfig={{
          cols,
          rowHeight,
          margin: [8, 8] as const,
          containerPadding: [0, 0] as const,
          maxRows: Infinity,
        }}
        dragConfig={{ enabled: !!editMode, bounded: false }}
        resizeConfig={{ enabled: !!editMode, handles: ['se'] }}
        onLayoutChange={handleLayoutChange}
      >
        {config.cards.map(card => (
          <div key={card.id} style={{ position: 'relative' }}>
            {renderCard(card)}
          </div>
        ))}
      </GridLayout>
      {modal}
    </>
  );
}
