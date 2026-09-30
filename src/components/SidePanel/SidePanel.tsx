import { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, PencilRuler, Plus, Settings } from 'lucide-react';
import type { SidePanelConfig, SidePanelCard, HAState, CardLayout } from '../../types';
import type { HALike } from '../../services/haWebSocket';
import { useTranslation } from '../../contexts/LanguageContext';
import CardGrid from './CardGrid';
import './SidePanel.css';

interface Props {
  config: SidePanelConfig | undefined;
  ha: HALike | null;
  cardStates: Record<string, HAState>;
  onSettingsOpen?: () => void;
  /** Enter the card layout mode (used by the empty state). */
  onStartEdit?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Current panel size in px (width on desktop, height on mobile). */
  panelSize: number;
  /** Called while dragging the resize handle. */
  onPanelResize: (size: number) => void;
  editMode?: boolean;
  onEditDone?: () => void;
  onLayoutChange?: (layouts: Record<string, CardLayout>) => void;
  onSetTemperature?: (entityId: string, temperature: number) => void;
  onSetHvacMode?: (entityId: string, mode: string) => void;
  onCardEdit?: (card: SidePanelCard) => void;
  onCardDelete?: (cardId: string) => void;
  onCardAdd?: () => void;
  onExitSimulation?: () => void;
}

const PANEL_PADDING = 24; // 12px each side

export default function SidePanel({ config, ha, cardStates, onSettingsOpen, onStartEdit, collapsed=false, onToggleCollapsed, panelSize, onPanelResize, editMode, onEditDone, onLayoutChange, onSetTemperature, onSetHvacMode, onCardEdit, onCardDelete, onCardAdd, onExitSimulation }: Props) {
  const t = useTranslation();
  const navigate = useNavigate();
  const gridWidth = panelSize - PANEL_PADDING;
  const dragging = useRef(false);
  const moved = useRef(false);

  // Detect mobile layout (matches CSS media query)
  const isMobile = useCallback(() => window.matchMedia('(max-width: 768px)').matches, []);

  // Drag handling — works for both mouse and touch
  const onDragStart = useCallback((startX: number, startY: number) => {
    dragging.current = true;
    moved.current = false;
    const startSize = panelSize;
    const mobile = isMobile();

    const onMove = (clientX: number, clientY: number) => {
      if (!dragging.current) return;
      if(Math.abs(clientX-startX)+Math.abs(clientY-startY)<5)return;
      moved.current=true;
      if (mobile) {
        // Dragging up = larger panel (startY is at bottom edge going up)
        const newSize = startSize + (startY - clientY);
        onPanelResize(Math.max(120, Math.min(newSize, window.innerHeight * 0.7)));
      } else {
        // Dragging right = larger panel
        const newSize = startSize + (clientX - startX);
        onPanelResize(Math.max(350, Math.min(newSize, window.innerWidth * 0.5)));
      }
    };

    const onEnd = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', onEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.body.style.cursor = mobile ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelSize, onPanelResize, isMobile]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onDragStart(e.clientX, e.clientY);
  }, [onDragStart]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [onDragStart]);

  const hasCards = !!config && config.cards.length > 0;

  return (
    <div className={`side-panel${collapsed?' side-panel--collapsed':''}`} style={{ width: `${collapsed?0:panelSize}px` }}>
      <div className="side-panel-inner" style={collapsed?{visibility:'hidden',padding:0}:undefined}>
        <div className="side-panel-content">
          {hasCards && (
            <CardGrid
              config={config}
              ha={ha}
              cardStates={cardStates}
              width={gridWidth}
              editMode={editMode}
              onLayoutChange={editMode ? onLayoutChange : undefined}
              onSetTemperature={onSetTemperature}
              onSetHvacMode={onSetHvacMode}
              onCardEdit={onCardEdit}
              onCardDelete={onCardDelete}
            />
          )}
          {!hasCards && !editMode && (
            <div className="side-panel-empty">
              <LayoutTemplate size={28} strokeWidth={1.4} aria-hidden="true" />
              <strong>{t('cards.emptyTitle')}</strong>
              <span>{t('cards.emptyBody')}</span>
              {onStartEdit && (
                <button type="button" className="side-panel-btn primary" onClick={onStartEdit}>
                  <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
                  {t('cards.addCard')}
                </button>
              )}
            </div>
          )}
          {editMode && (
            <div className="side-panel-edit-actions">
              <button type="button" className="side-panel-btn dashed" onClick={onCardAdd}>
                <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
                {t('cards.addCard')}
              </button>
              <button type="button" className="side-panel-btn solid" onClick={onEditDone}>
                {t('cards.done')}
              </button>
            </div>
          )}
        </div>
        {!editMode && (
          <div className="side-panel-footer">
            {onExitSimulation && (
              <button type="button" className="side-panel-btn warn wide" onClick={onExitSimulation}>
                {t('cards.exitSimulation')}
              </button>
            )}
            <button type="button" className="side-panel-btn" onClick={() => navigate('/editor')}>
              <PencilRuler size={16} strokeWidth={1.7} aria-hidden="true" />
              <span>{t('cards.editor')}</span>
            </button>
            {onSettingsOpen && (
              <button type="button" className="side-panel-btn side-panel-settings-btn" onClick={onSettingsOpen}>
                <Settings size={16} strokeWidth={1.7} aria-hidden="true" />
                <span>{t('cards.settings')}</span>
              </button>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="side-panel-handle"
        aria-label={collapsed?t('cards.panelOpen'):t('cards.panelClose')}
        aria-expanded={!collapsed}
        title={collapsed?t('cards.panelOpen'):t('cards.panelHandleHint')}
        onClick={e=>{if(e.detail===0||!moved.current)onToggleCollapsed?.();}}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <span className="side-panel-handle-bar">{collapsed?'›':'‹'}</span>
      </button>
    </div>
  );
}
