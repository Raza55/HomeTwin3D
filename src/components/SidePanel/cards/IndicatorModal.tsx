import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { IndicatorCard, HAState, HAHistoryPoint } from '../../../types';
import { fetchHistory, generateDemoHistory } from '../../../services/haHistoryApi';
import { useDemoMode } from '../../../contexts/DemoModeContext';
import { useTranslation } from '../../../contexts/LanguageContext';
import LucideIcon from './LucideIcon';
import './IndicatorModal.css';

// --- Thermostat gauge helpers ---
const ARC_SWEEP = 240; // degrees of the horseshoe arc
const ARC_START = 150; // start angle (bottom-left, measured from 3-o'clock)
const GAUGE_R = 90;    // radius of the arc
const GAUGE_CX = 110;  // center x
const GAUGE_CY = 110;  // center y
const GAUGE_STROKE = 16;

function tempToAngle(temp: number, min: number, max: number): number {
  const pct = Math.max(0, Math.min(1, (temp - min) / (max - min)));
  return ARC_START + pct * ARC_SWEEP;
}

function angleToPoint(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: GAUGE_CX + r * Math.cos(rad), y: GAUGE_CY + r * Math.sin(rad) };
}

function describeArc(startAngle: number, endAngle: number, r: number): string {
  const start = angleToPoint(startAngle, r);
  const end = angleToPoint(endAngle, r);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function pointerToTemp(clientX: number, clientY: number, svgEl: SVGSVGElement, min: number, max: number): number {
  const rect = svgEl.getBoundingClientRect();
  const scaleX = 220 / rect.width;
  const scaleY = 220 / rect.height;
  const px = (clientX - rect.left) * scaleX;
  const py = (clientY - rect.top) * scaleY;
  let angle = (Math.atan2(py - GAUGE_CY, px - GAUGE_CX) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  // Clamp to arc range
  let rel = angle - ARC_START;
  if (rel < 0) rel += 360;
  if (rel > ARC_SWEEP) rel = rel > ARC_SWEEP + (360 - ARC_SWEEP) / 2 ? 0 : ARC_SWEEP;
  const pct = rel / ARC_SWEEP;
  const raw = min + pct * (max - min);
  return Math.round(raw * 2) / 2; // snap to 0.5
}

const PERIODS = ['6h', '12h', '24h', '2d', '7d'] as const;

interface Props {
  card: IndicatorCard;
  state: HAState | undefined;
  climateState: HAState | undefined;
  visible: boolean;
  onClose: () => void;
  onSetTemperature: (entityId: string, temperature: number) => void;
  onSetHvacMode: (entityId: string, mode: string) => void;
}

export default function IndicatorModal({
  card,
  state,
  climateState,
  visible,
  onClose,
  onSetTemperature,
  onSetHvacMode,
}: Props) {
  const { demoMode } = useDemoMode();
  const t = useTranslation();
  const [period, setPeriod] = useState<string>('24h');
  const [points, setPoints] = useState<HAHistoryPoint[]>([]);
  const [error, setError] = useState(false);
  const [targetTemp, setTargetTemp] = useState(20);
  const [hvacMode, setHvacMode] = useState('off');

  // Fetch history when visible or period changes
  useEffect(() => {
    if (!visible) return;

    if (demoMode) {
      setPoints(generateDemoHistory(period));
      setError(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchHistory(card.entityId, period);
        if (!cancelled) { setPoints(data); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [card.entityId, period, visible, demoMode]);

  // Sync climate state
  useEffect(() => {
    if (!climateState) return;
    const t = climateState.attributes.temperature;
    if (typeof t === 'number') setTargetTemp(t);
    // HA climate entities store the hvac mode in .state (e.g. "heat", "off")
    const m = climateState.state;
    if (m) setHvacMode(m);
  }, [climateState]);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();

  const setTempLocal = useCallback((val: number) => {
    const clamped = Math.max(
      (climateState?.attributes.min_temp as number) ?? 7,
      Math.min(val, (climateState?.attributes.max_temp as number) ?? 30),
    );
    setTargetTemp(clamped);
    // Debounce the API call — only send after 500ms of no changes
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      if (card.climateEntityId) onSetTemperature(card.climateEntityId, clamped);
    }, 500);
  }, [card.climateEntityId, onSetTemperature, climateState]);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(commitTimer.current), []);

  const handleHvacMode = useCallback((mode: string) => {
    setHvacMode(mode);
    if (card.climateEntityId) onSetHvacMode(card.climateEntityId, mode);
  }, [card.climateEntityId, onSetHvacMode]);

  const onPointerDown = useCallback(() => { dragging.current = true; }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !svgRef.current) return;
    const minT = (climateState?.attributes.min_temp as number) ?? 7;
    const maxT = (climateState?.attributes.max_temp as number) ?? 30;
    setTempLocal(pointerToTemp(e.clientX, e.clientY, svgRef.current, minT, maxT));
  }, [climateState, setTempLocal]);
  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  // Graph rendering
  const numericPoints = points
    .map(p => ({ value: parseFloat(p.state), time: new Date(p.last_changed).getTime() }))
    .filter(p => !isNaN(p.value));

  const renderGraph = () => {
    if (error) return <span className="im-graph-msg">{t('modal.failedToLoad')}</span>;
    if (numericPoints.length < 2) return <span className="im-graph-msg">{t('common.loading')}</span>;

    const values = numericPoints.map(p => p.value);
    const times = numericPoints.map(p => p.time);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const valRange = maxVal - minVal || 1;
    const timeRange = maxTime - minTime || 1;

    const padX = 40;
    const padY = 20;
    const w = 400;
    const h = 160;
    const graphW = w - padX - 10;
    const graphH = h - padY * 2;

    const polylinePoints = numericPoints
      .map(p => {
        const x = padX + ((p.time - minTime) / timeRange) * graphW;
        const y = padY + graphH - ((p.value - minVal) / valRange) * graphH;
        return `${x},${y}`;
      })
      .join(' ');

    // Time axis labels
    const startDate = new Date(minTime);
    const endDate = new Date(maxTime);
    const fmt = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        <line x1={padX} y1={padY} x2={padX} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        <line x1={padX} y1={h - padY} x2={w - 10} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        <line x1={padX} y1={padY + graphH / 2} x2={w - 10} y2={padY + graphH / 2} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="4 4" />

        {/* Y labels */}
        <text x={padX - 4} y={padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{maxVal.toFixed(1)}</text>
        <text x={padX - 4} y={h - padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{minVal.toFixed(1)}</text>

        {/* X labels */}
        <text x={padX} y={h - 4} textAnchor="start" fill="var(--muted)" fontSize="7">{fmt(startDate)}</text>
        <text x={w - 10} y={h - 4} textAnchor="end" fill="var(--muted)" fontSize="7">{fmt(endDate)}</text>

        {/* Data */}
        <polyline points={polylinePoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  };

  const rawValue = state?.state ?? '--';
  const numValue = parseFloat(rawValue);
  const display = isNaN(numValue) ? rawValue : numValue.toFixed(card.precision ?? 0);

  const minTemp = (climateState?.attributes.min_temp as number) ?? 7;
  const maxTemp = (climateState?.attributes.max_temp as number) ?? 30;
  const rawCurrent = climateState?.attributes.current_temperature;
  const currentTemp = typeof rawCurrent === 'number' ? rawCurrent : (isNaN(numValue) ? 0 : numValue);
  const isOff = hvacMode === 'off';

  // Determine status text
  const hvacAction = climateState?.attributes.hvac_action as string | undefined;
  const climateStatusKey = isOff ? 'off' : (hvacAction === 'heating' ? 'heating' : 'idle');
  const climateStatus = t(`modal.${climateStatusKey}`);

  // Arc geometry — 3 segments: dimmed orange (start→min(current,target)), bright orange (current→target), gray (max(current,target)→end)
  const targetAngle = tempToAngle(targetTemp, minTemp, maxTemp);
  const currentAngle = tempToAngle(currentTemp, minTemp, maxTemp);
  const handlePos = angleToPoint(targetAngle, GAUGE_R);
  const currentDotPos = angleToPoint(currentAngle, GAUGE_R);
  const arcEnd = ARC_START + ARC_SWEEP;

  // Dimmed orange: start → min(current, target) — stops at whichever is lower
  const dimEnd = Math.min(currentAngle, targetAngle);
  const dimArcPath = !isOff && dimEnd > ARC_START ? describeArc(ARC_START, dimEnd, GAUGE_R) : '';
  // Bright orange: current → target (only if target > current)
  const brightArcPath = !isOff && targetAngle > currentAngle ? describeArc(currentAngle, targetAngle, GAUGE_R) : '';
  // Gray: full arc as background behind everything
  const grayArcPath = describeArc(ARC_START, arcEnd, GAUGE_R);

  // Split target temp for display inside gauge
  const wholePart = Math.floor(targetTemp);
  const decimalPart = (targetTemp % 1).toFixed(1).slice(1); // ".5" or ".0" etc.

  return createPortal(
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="indicator-modal">
        {/* Header */}
        <div className="im-header">
          <div className="im-title">
            {card.icon && (
              <div className="im-icon">
                <LucideIcon name={card.icon} size={18} strokeWidth={1.5} />
              </div>
            )}
            <div>
              <div className="im-name">{card.title}</div>
              <div className="im-value-inline">{display}{card.unit && <span className="im-unit">{card.unit}</span>}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&#10005;</button>
        </div>

        <div className="im-body">
          {/* Graph */}
          <div className="im-section">
            <span className="im-label">{t('modal.history')}</span>
            <div className="im-graph">{renderGraph()}</div>
            <div className="im-periods">
              {PERIODS.map(p => (
                <button
                  key={p}
                  className={`im-period-btn${period === p ? ' active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Climate controls */}
          {card.climateEntityId && (
            <div className="im-section">
              <div className="im-gauge-wrap">
                <svg
                  ref={svgRef}
                  viewBox="0 0 220 200"
                  className="im-gauge-svg"
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                >
                  <defs>
                    <radialGradient id="gaugeGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
                      <stop offset="60%" stopColor="#f97316" stopOpacity="0.06" />
                      <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Center glow — only when actively heating */}
                  {climateStatusKey === 'heating' && (
                    <circle cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R + GAUGE_STROKE} fill="url(#gaugeGlow)" />
                  )}

                  {/* Gray background track (full arc, behind everything) */}
                  <path d={grayArcPath} fill="none" stroke="var(--border2)" strokeWidth={GAUGE_STROKE} strokeLinecap="round" />

                  {/* Dimmed orange: start → min(current, target) */}
                  {dimArcPath && (
                    <path d={dimArcPath} fill="none" stroke="#f97316" strokeWidth={GAUGE_STROKE} strokeLinecap="round" opacity={0.35} />
                  )}

                  {/* Bright orange: current → target */}
                  {brightArcPath && (
                    <path d={brightArcPath} fill="none" stroke="#f97316" strokeWidth={GAUGE_STROKE} strokeLinecap="round" />
                  )}

                  {/* Current temp dot */}
                  <circle cx={currentDotPos.x} cy={currentDotPos.y} r={4} fill={isOff ? 'var(--muted)' : 'var(--text)'} />

                  {/* Target handle (draggable) */}
                  {!isOff && (
                    <circle
                      cx={handlePos.x}
                      cy={handlePos.y}
                      r={10}
                      fill="#fff"
                      className="im-gauge-handle"
                      onPointerDown={onPointerDown}
                    />
                  )}

                  {/* Center text */}
                  <text
                    x={GAUGE_CX}
                    y={isOff ? GAUGE_CY + 5 : GAUGE_CY - 28}
                    textAnchor="middle"
                    className={`im-gauge-status ${climateStatusKey}`}
                  >
                    {climateStatus}
                  </text>

                  {!isOff && (
                    <g className="im-gauge-temp-group" transform={`translate(-12, 0)`}>
                      <text x={GAUGE_CX} y={GAUGE_CY + 15} textAnchor="middle">
                        <tspan className="im-gauge-temp-whole">{wholePart}</tspan>
                      </text>
                      <text x={GAUGE_CX + 24} y={GAUGE_CY - 2} textAnchor="start" className="im-gauge-temp-unit">°C</text>
                      <text x={GAUGE_CX + 24} y={GAUGE_CY + 15} textAnchor="start" className="im-gauge-temp-decimal">{decimalPart}</text>
                    </g>
                  )}
                </svg>

              </div>

              {/* Mode toggle */}
              <div className="im-mode-toggle-wrap">
                <button
                  className={`im-mode-side${isOff ? ' active' : ''}`}
                  onClick={() => handleHvacMode('off')}
                >
                  <LucideIcon name="Snowflake" size={16} strokeWidth={1.5} />
                </button>
                <button
                  className={`im-mode-side heat${!isOff ? ' active' : ''}`}
                  onClick={() => handleHvacMode('heat')}
                >
                  <LucideIcon name="Flame" size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
