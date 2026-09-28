import { useState, useEffect, useCallback, useRef } from 'react';
import type { TourStep } from './tourSteps';
import { useTranslation } from '../../contexts/LanguageContext';
import './GuidedTour.css';

interface Props {
  steps: TourStep[];
  onComplete: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type ArrowDir = 'arrow-top' | 'arrow-bottom' | 'arrow-left' | 'arrow-right';

export default function GuidedTour({ steps, onComplete }: Props) {
  const t = useTranslation();
  const [current, setCurrent] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [keyFulfilled, setKeyFulfilled] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const handleNextRef = useRef<() => void>(() => {});

  const step = steps[current];
  const isInteractive = !!step?.interactive;
  const isPassthrough = !!step?.passthrough;
  const needsKey = !!step?.waitForKey;
  const needsEvent = !!step?.waitForEvent;
  const needsSelector = !!step?.waitForSelector;
  const needsCustomEvent = !!step?.waitForCustomEvent;
  const needsAction = needsKey || needsEvent || needsCustomEvent;
  // Steps with waitForSelector or explicit autoAdvance — no manual Next needed
  const autoAdvance = needsSelector || !!step?.autoAdvance;

  // Reset fulfilled state when step changes + fire onEnterEvent
  useEffect(() => {
    setKeyFulfilled(false);
    if (step?.onEnterEvent) {
      document.dispatchEvent(new Event(step.onEnterEvent));
    }
  }, [current, step?.onEnterEvent]);

  // Listen for DOM events on target element (waitForEvent)
  useEffect(() => {
    if (!needsEvent || !step?.target) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const handler = () => setKeyFulfilled(true);
    el.addEventListener(step.waitForEvent!, handler, { once: true });
    return () => el.removeEventListener(step.waitForEvent!, handler);
  }, [current, needsEvent, step?.target, step?.waitForEvent]);

  // Listen for custom events on document (waitForCustomEvent)
  useEffect(() => {
    if (!needsCustomEvent) return;
    const handler = () => {
      if (step?.autoAdvance) {
        handleNextRef.current();
      } else {
        setKeyFulfilled(true);
      }
    };
    document.addEventListener(step.waitForCustomEvent!, handler, { once: true });
    return () => document.removeEventListener(step.waitForCustomEvent!, handler);
  }, [current, needsCustomEvent, step?.waitForCustomEvent, step?.autoAdvance]);

  // Watch for a CSS selector to appear in the DOM (waitForSelector) — auto-advance
  useEffect(() => {
    if (!needsSelector) return;
    const selector = step.waitForSelector!;

    // Check immediately
    if (document.querySelector(selector)) {
      handleNextRef.current();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        handleNextRef.current();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [current, needsSelector, step?.waitForSelector]);

  // Locate the target element
  const updateRect = useCallback(() => {
    if (!step?.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = step.spotlightPadding ?? 8;
    setTargetRect({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });
  }, [step]);

  useEffect(() => {
    updateRect();
    const timer = setInterval(updateRect, 500);
    window.addEventListener('resize', updateRect);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', updateRect);
    };
  }, [updateRect]);

  const handleNext = useCallback(() => {
    if (current >= steps.length - 1) {
      onComplete();
    } else {
      setCurrent((c) => c + 1);
    }
  }, [current, steps.length, onComplete]);
  handleNextRef.current = handleNext;

  const handleBack = useCallback(() => {
    if (current > 0) setCurrent((c) => c - 1);
  }, [current]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // If this step waits for a specific key, detect it
      if (needsKey && e.key === step.waitForKey && !keyFulfilled) {
        setKeyFulfilled(true);
        // Don't prevent — let the key reach the app (e.g. Space resets camera)
        return;
      }

      if (e.key === 'Escape') { onComplete(); return; }

      // For interactive/passthrough steps, only allow Next via button (not keyboard)
      // unless the action requirement is fulfilled
      if ((isInteractive || isPassthrough) && needsAction && !keyFulfilled) return;

      // Auto-advance steps don't need manual keyboard nav
      if (autoAdvance) return;

      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft') handleBack();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  // Compute tooltip position
  const computeTooltipStyle = (): { style: React.CSSProperties; arrow: ArrowDir | '' } => {
    if (!targetRect) {
      return { style: {}, arrow: '' };
    }

    const gap = 16;
    const tooltipW = 320;
    const tooltipH = 180;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - (targetRect.top + targetRect.height);
    const spaceAbove = targetRect.top;
    const spaceRight = vw - (targetRect.left + targetRect.width);

    if (spaceBelow > tooltipH + gap) {
      return {
        style: {
          top: targetRect.top + targetRect.height + gap,
          left: Math.max(8, Math.min(targetRect.left, vw - tooltipW - 8)),
        },
        arrow: 'arrow-top',
      };
    }
    if (spaceAbove > tooltipH + gap) {
      return {
        style: {
          top: targetRect.top - tooltipH - gap,
          left: Math.max(8, Math.min(targetRect.left, vw - tooltipW - 8)),
        },
        arrow: 'arrow-bottom',
      };
    }
    if (spaceRight > tooltipW + gap) {
      return {
        style: {
          top: Math.max(8, targetRect.top),
          left: targetRect.left + targetRect.width + gap,
        },
        arrow: 'arrow-left',
      };
    }
    return {
      style: {
        top: Math.max(8, targetRect.top),
        left: Math.max(8, targetRect.left - tooltipW - gap),
      },
      arrow: 'arrow-right',
    };
  };

  const { style: tooltipStyle, arrow } = computeTooltipStyle();
  const isCentered = !targetRect;
  const allowsInteraction = isInteractive || isPassthrough;

  // For interactive steps with waitForKey/waitForEvent/waitForCustomEvent, disable Next until fulfilled
  const nextDisabled = allowsInteraction && needsAction && !keyFulfilled;

  return (
    <div className={`tour-overlay${allowsInteraction ? ' interactive' : ''}${isPassthrough ? ' passthrough' : ''}`}>
      {/* Dark background — click to advance (disabled for interactive/passthrough steps) */}
      <div
        className="tour-overlay-bg"
        onClick={allowsInteraction || autoAdvance ? undefined : handleNext}
      />

      {/* Spotlight cutout */}
      {targetRect && !isPassthrough && (
        <div
          className={`tour-spotlight${isInteractive ? ' interactive' : ''}`}
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`tour-tooltip ${arrow}${isCentered ? ' centered' : ''}`}
        style={isCentered ? {} : tooltipStyle}
      >
        <div className="tour-tooltip-title">{t(step.title)}</div>
        <div
          className="tour-tooltip-body"
          dangerouslySetInnerHTML={{ __html: t(step.body) }}
        />
        {needsAction && !keyFulfilled && (
          <div
            className="tour-waiting-hint"
            dangerouslySetInnerHTML={{ __html: needsKey ? t('tour.waitingSpace') : t('tour.tryBeforeContinuing') }}
          />
        )}
        {needsAction && keyFulfilled && (
          <div className="tour-key-done">{t('tour.doneHint')}</div>
        )}
        <div className="tour-tooltip-footer">
          <span className="tour-tooltip-counter">
            {current + 1} / {steps.length}
          </span>
          <div className="tour-tooltip-actions">
            <button className="tour-tooltip-btn" onClick={onComplete}>
              {t('tour.skip')}
            </button>
            {current > 0 && !autoAdvance && (
              <button className="tour-tooltip-btn" onClick={handleBack}>
                {t('common.back')}
              </button>
            )}
            {!autoAdvance && (
              <button
                className={`tour-tooltip-btn primary${nextDisabled ? ' disabled' : ''}`}
                onClick={nextDisabled ? undefined : handleNext}
              >
                {current >= steps.length - 1 ? t('tour.done') : t('tour.next')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
