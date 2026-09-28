import { useState, useRef, useCallback } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import type { ScriptCard } from '../../../types';
import type { HALike } from '../../../services/haWebSocket';
import LucideIcon from './LucideIcon';

type FeedbackState = 'idle' | 'loading' | 'success' | 'error';

/** Delay (ms) before a single-tap fires (to wait for possible double-tap). */
const DOUBLE_TAP_DELAY = 300;
/** Duration (ms) a pointer must be held to trigger a long-press. */
const LONG_PRESS_DELAY = 500;

interface Props {
  card: ScriptCard;
  ha: HALike | null;
}

export default function ScriptCardView({ card, ha }: Props) {
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>();
  const tapTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const tapCount = useRef(0);
  const longPressFired = useRef(false);

  const callEntity = useCallback(async (entityId: string) => {
    if (!ha || feedback === 'loading') return;
    clearTimeout(feedbackTimer.current);
    setFeedback('loading');
    const domain = entityId.split('.')[0];
    try {
      await ha.callService(domain, 'turn_on', entityId);
      setFeedback('success');
    } catch {
      setFeedback('error');
    }
    feedbackTimer.current = setTimeout(() => setFeedback('idle'), 1500);
  }, [ha, feedback]);

  const handleTap = useCallback(() => {
    callEntity(card.entityId);
  }, [card.entityId, callEntity]);

  const handleDoubleTap = useCallback(() => {
    if (card.doublePressEntityId) {
      callEntity(card.doublePressEntityId);
    } else {
      handleTap();
    }
  }, [card.doublePressEntityId, callEntity, handleTap]);

  const handleLongPress = useCallback(() => {
    if (card.longPressEntityId) {
      callEntity(card.longPressEntityId);
    }
  }, [card.longPressEntityId, callEntity]);

  /* ── Pointer events for combined gesture detection ── */

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressFired.current = false;

    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      handleLongPress();
    }, LONG_PRESS_DELAY);
  }, [handleLongPress]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    clearTimeout(longPressTimer.current);

    // If long-press already fired, skip tap handling
    if (longPressFired.current) return;

    tapCount.current += 1;

    if (tapCount.current === 1) {
      // Wait to see if a second tap arrives
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
        handleTap();
      }, DOUBLE_TAP_DELAY);
    } else if (tapCount.current >= 2) {
      clearTimeout(tapTimer.current);
      tapCount.current = 0;
      handleDoubleTap();
    }
  }, [handleTap, handleDoubleTap]);

  const handlePointerCancel = useCallback(() => {
    clearTimeout(longPressTimer.current);
    clearTimeout(tapTimer.current);
    tapCount.current = 0;
  }, []);

  const renderIcon = () => {
    const size = 22;
    const stroke = 1.5;
    switch (feedback) {
      case 'loading':
        return <Loader2 size={size} strokeWidth={stroke} className="script-card-spinner" />;
      case 'success':
        return <Check size={size} strokeWidth={stroke} className="script-card-check" />;
      case 'error':
        return <X size={size} strokeWidth={stroke} className="script-card-error" />;
      default:
        return card.icon ? <LucideIcon name={card.icon} size={size} strokeWidth={stroke} /> : null;
    }
  };

  return (
    <button
      className="script-card"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      disabled={!ha || feedback === 'loading'}
    >
      {renderIcon()}
      {card.showTitle !== false && <span className="script-card-label">{card.title}</span>}
    </button>
  );
}
