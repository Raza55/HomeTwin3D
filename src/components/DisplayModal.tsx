import { useState, useEffect, useCallback, useRef } from 'react';
import type { DisplayConfig, HAState, HAHistoryPoint } from '../types';
import { fetchHistory, generateDemoHistory } from '../services/haHistoryApi';
import { useDemoMode } from '../contexts/DemoModeContext';
import { useTranslation } from '../contexts/LanguageContext';
import LucideIcon from './SidePanel/cards/LucideIcon';
import './SidePanel/cards/IndicatorModal.css';

// --- Thermostat gauge helpers (same as IndicatorModal) ---
const ARC_SWEEP = 240;
const ARC_START = 150;
const GAUGE_R = 90;
const GAUGE_CX = 110;
const GAUGE_CY = 110;
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
  let rel = angle - ARC_START;
  if (rel < 0) rel += 360;
  if (rel > ARC_SWEEP) rel = rel > ARC_SWEEP + (360 - ARC_SWEEP) / 2 ? 0 : ARC_SWEEP;
  const pct = rel / ARC_SWEEP;
  const raw = min + pct * (max - min);
  return Math.round(raw * 2) / 2;
}

const PERIODS = ['6h', '12h', '24h', '2d', '7d'] as const;

interface Props {
  display: DisplayConfig | null;
  states: Record<string, HAState>;
  visible: boolean;
  onClose: () => void;
  onSetTemperature: (entityId: string, temperature: number) => void;
  onSetHvacMode: (entityId: string, mode: string) => void;
  onMediaTurnOn: (entityId: string) => void;
  onMediaTurnOff: (entityId: string) => void;
  onMediaPlayPause: (entityId: string) => void;
  onMediaStop: (entityId: string) => void;
  onMediaSetVolume: (entityId: string, volume: number) => void;
  onMediaSelectSource: (entityId: string, source: string) => void;
  onToggle: (entityId: string) => void;
}

/** Graph section for a single sensor source. */
function SensorGraph({ entityId, label, unit, precision }: {
  entityId: string;
  label?: string;
  unit?: string;
  precision?: number;
}) {
  const { demoMode } = useDemoMode();
  const t = useTranslation();
  const [period, setPeriod] = useState<string>('24h');
  const [points, setPoints] = useState<HAHistoryPoint[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demoMode) {
      setPoints(generateDemoHistory(period));
      setError(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchHistory(entityId, period);
        if (!cancelled) { setPoints(data); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [entityId, period, demoMode]);

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

    const fmt = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="xMidYMid meet">
        <line x1={padX} y1={padY} x2={padX} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        <line x1={padX} y1={h - padY} x2={w - 10} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        <line x1={padX} y1={padY + graphH / 2} x2={w - 10} y2={padY + graphH / 2} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="4 4" />
        <text x={padX - 4} y={padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{maxVal.toFixed(precision ?? 1)}</text>
        <text x={padX - 4} y={h - padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{minVal.toFixed(precision ?? 1)}</text>
        <text x={padX} y={h - 4} textAnchor="start" fill="var(--muted)" fontSize="7">{fmt(new Date(minTime))}</text>
        <text x={w - 10} y={h - 4} textAnchor="end" fill="var(--muted)" fontSize="7">{fmt(new Date(maxTime))}</text>
        <polyline points={polylinePoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  };

  const displayLabel = label || entityId.split('.').pop()?.replace(/_/g, ' ') || entityId;

  return (
    <div className="im-section">
      <span className="im-label">{displayLabel}{unit ? ` (${unit})` : ''}</span>
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
  );
}

/** Climate gauge section for a climate entity. */
function ClimateGauge({ entityId, climateState, onSetTemperature, onSetHvacMode }: {
  entityId: string;
  climateState: HAState | undefined;
  onSetTemperature: (entityId: string, temperature: number) => void;
  onSetHvacMode: (entityId: string, mode: string) => void;
}) {
  const t = useTranslation();
  const [targetTemp, setTargetTemp] = useState(20);
  const [hvacMode, setHvacMode] = useState('off');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!climateState) return;
    const t = climateState.attributes.temperature;
    if (typeof t === 'number') setTargetTemp(t);
    const m = climateState.state;
    if (m) setHvacMode(m);
  }, [climateState]);

  const setTempLocal = useCallback((val: number) => {
    const clamped = Math.max(
      (climateState?.attributes.min_temp as number) ?? 7,
      Math.min(val, (climateState?.attributes.max_temp as number) ?? 30),
    );
    setTargetTemp(clamped);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      onSetTemperature(entityId, clamped);
    }, 500);
  }, [entityId, onSetTemperature, climateState]);

  useEffect(() => () => clearTimeout(commitTimer.current), []);

  const handleHvacMode = useCallback((mode: string) => {
    setHvacMode(mode);
    onSetHvacMode(entityId, mode);
  }, [entityId, onSetHvacMode]);

  const onPointerDown = useCallback(() => { dragging.current = true; }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !svgRef.current) return;
    const minT = (climateState?.attributes.min_temp as number) ?? 7;
    const maxT = (climateState?.attributes.max_temp as number) ?? 30;
    setTempLocal(pointerToTemp(e.clientX, e.clientY, svgRef.current, minT, maxT));
  }, [climateState, setTempLocal]);
  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  const minTemp = (climateState?.attributes.min_temp as number) ?? 7;
  const maxTemp = (climateState?.attributes.max_temp as number) ?? 30;
  const rawCurrent = climateState?.attributes.current_temperature;
  const currentTemp = typeof rawCurrent === 'number' ? rawCurrent : 0;
  const isOff = hvacMode === 'off';

  const hvacAction = climateState?.attributes.hvac_action as string | undefined;
  const climateStatusKey = isOff ? 'off' : (hvacAction === 'heating' ? 'heating' : 'idle');
  const climateStatus = t(`modal.${climateStatusKey}`);

  const targetAngle = tempToAngle(targetTemp, minTemp, maxTemp);
  const currentAngle = tempToAngle(currentTemp, minTemp, maxTemp);
  const handlePos = angleToPoint(targetAngle, GAUGE_R);
  const currentDotPos = angleToPoint(currentAngle, GAUGE_R);
  const arcEnd = ARC_START + ARC_SWEEP;

  const dimEnd = Math.min(currentAngle, targetAngle);
  const dimArcPath = !isOff && dimEnd > ARC_START ? describeArc(ARC_START, dimEnd, GAUGE_R) : '';
  const brightArcPath = !isOff && targetAngle > currentAngle ? describeArc(currentAngle, targetAngle, GAUGE_R) : '';
  const grayArcPath = describeArc(ARC_START, arcEnd, GAUGE_R);

  const wholePart = Math.floor(targetTemp);
  const decimalPart = (targetTemp % 1).toFixed(1).slice(1);

  return (
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

          {climateStatusKey === 'heating' && (
            <circle cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R + GAUGE_STROKE} fill="url(#gaugeGlow)" />
          )}

          <path d={grayArcPath} fill="none" stroke="var(--border2)" strokeWidth={GAUGE_STROKE} strokeLinecap="round" />

          {dimArcPath && (
            <path d={dimArcPath} fill="none" stroke="#f97316" strokeWidth={GAUGE_STROKE} strokeLinecap="round" opacity={0.35} />
          )}

          {brightArcPath && (
            <path d={brightArcPath} fill="none" stroke="#f97316" strokeWidth={GAUGE_STROKE} strokeLinecap="round" />
          )}

          <circle cx={currentDotPos.x} cy={currentDotPos.y} r={4} fill={isOff ? 'var(--muted)' : 'var(--text)'} />

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

          <text
            x={GAUGE_CX}
            y={isOff ? GAUGE_CY + 5 : GAUGE_CY - 28}
            textAnchor="middle"
            className={`im-gauge-status ${climateStatusKey}`}
          >
            {climateStatus}
          </text>

          {!isOff && (
            <g className="im-gauge-temp-group" transform="translate(-12, 0)">
              <text x={GAUGE_CX} y={GAUGE_CY + 15} textAnchor="middle">
                <tspan className="im-gauge-temp-whole">{wholePart}</tspan>
              </text>
              <text x={GAUGE_CX + 24} y={GAUGE_CY - 2} textAnchor="start" className="im-gauge-temp-unit">°C</text>
              <text x={GAUGE_CX + 24} y={GAUGE_CY + 15} textAnchor="start" className="im-gauge-temp-decimal">{decimalPart}</text>
            </g>
          )}
        </svg>
      </div>

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
  );
}

function isScreenKind(display: DisplayConfig): boolean {
  return !!display.kind && display.kind !== 'info';
}

function getScreenSource(display: DisplayConfig): string | null {
  if (display.kind === 'tv' || display.kind === 'console') {
    return display.sources.find((src) => src.entityId.startsWith('media_player.'))?.entityId
      ?? display.sources[0]?.entityId
      ?? null;
  }
  return display.sources[0]?.entityId ?? null;
}

function screenKindLabelKey(kind: DisplayConfig['kind']): string {
  if (kind === 'tv') return 'form.tvDisplay';
  if (kind === 'pc') return 'form.pcDisplay';
  if (kind === 'console') return 'form.consoleDisplay';
  if (kind === 'qnap') return 'form.qnapDisplay';
  return 'form.infoDisplay';
}

function canToggleDomain(entityId: string): boolean {
  const domain = entityId.split('.')[0];
  return ['switch', 'input_boolean', 'light', 'fan'].includes(domain);
}

function TVControls({
  entityId,
  state,
  onTurnOn,
  onTurnOff,
  onPlayPause,
  onStop,
  onSetVolume,
  onSelectSource,
}: {
  entityId: string;
  state: HAState | undefined;
  onTurnOn: (entityId: string) => void;
  onTurnOff: (entityId: string) => void;
  onPlayPause: (entityId: string) => void;
  onStop: (entityId: string) => void;
  onSetVolume: (entityId: string, volume: number) => void;
  onSelectSource: (entityId: string, source: string) => void;
}) {
  const t = useTranslation();
  const attrs = state?.attributes ?? {};
  const currentState = state?.state ?? 'unknown';
  const isOff = currentState === 'off' || currentState === 'unavailable' || currentState === 'unknown';
  const title = String(attrs.media_title ?? attrs.media_series_title ?? '').trim();
  const app = String(attrs.app_name ?? attrs.source ?? '').trim();
  const source = String(attrs.source ?? '').trim();
  const sourceList = Array.isArray(attrs.source_list)
    ? attrs.source_list.filter((item): item is string => typeof item === 'string')
    : [];
  const volume = typeof attrs.volume_level === 'number' ? attrs.volume_level : 0;

  return (
    <div className="im-section tv-control">
      <div className={`tv-screen-preview${isOff ? ' off' : ' on'}`}>
        <div className="tv-screen-state">{currentState.toUpperCase()}</div>
        <div className="tv-screen-title">{isOff ? t('modal.tvOff') : (title || app || entityId)}</div>
        {!isOff && <div className="tv-screen-subtitle">{[app, source].filter(Boolean).join(' | ')}</div>}
      </div>

      <div className="tv-control-grid">
        <button className="im-period-btn" onClick={() => isOff ? onTurnOn(entityId) : onTurnOff(entityId)}>
          {isOff ? t('modal.turnOn') : t('modal.turnOff')}
        </button>
        <button className="im-period-btn" disabled={isOff} onClick={() => onPlayPause(entityId)}>
          {t('modal.playPause')}
        </button>
        <button className="im-period-btn" disabled={isOff} onClick={() => onStop(entityId)}>
          {t('common.stop')}
        </button>
      </div>

      <div className="field-group">
        <label className="im-label">{t('modal.volume')} {Math.round(volume * 100)}%</label>
        <input
          type="range"
          className="pos-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          disabled={isOff}
          onChange={(e) => onSetVolume(entityId, parseFloat(e.target.value))}
        />
      </div>

      {sourceList.length > 0 && (
        <div className="field-group">
          <label className="im-label">{t('modal.source')}</label>
          <select
            className="field-select"
            value={source}
            disabled={isOff}
            onChange={(e) => onSelectSource(entityId, e.target.value)}
          >
            {sourceList.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function ScreenStatusControls({
  display,
  entityId,
  state,
  onToggle,
}: {
  display: DisplayConfig;
  entityId: string;
  state: HAState | undefined;
  onToggle: (entityId: string) => void;
}) {
  const t = useTranslation();
  const attrs = state?.attributes ?? {};
  const currentState = state?.state ?? 'unknown';
  const isOff = currentState === 'off' || currentState === 'unavailable' || currentState === 'unknown';
  const title = String(attrs.friendly_name ?? display.label ?? entityId).trim();
  const secondary = [entityId, t(screenKindLabelKey(display.kind))].filter(Boolean).join(' | ');
  const toggleable = canToggleDomain(entityId);

  return (
    <div className="im-section tv-control">
      <div className={`tv-screen-preview${isOff ? ' off' : ' on'}`}>
        <div className="tv-screen-state">{currentState.toUpperCase()}</div>
        <div className="tv-screen-title">{title}</div>
        <div className="tv-screen-subtitle">{secondary}</div>
      </div>

      {toggleable && (
        <div className="tv-control-grid">
          <button className="im-period-btn" onClick={() => onToggle(entityId)}>
            {isOff ? t('modal.turnOn') : t('modal.turnOff')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DisplayModal({
  display,
  states,
  visible,
  onClose,
  onSetTemperature,
  onSetHvacMode,
  onMediaTurnOn,
  onMediaTurnOff,
  onMediaPlayPause,
  onMediaStop,
  onMediaSetVolume,
  onMediaSelectSource,
  onToggle,
}: Props) {
  if (!display) return null;

  const screenEntityId = isScreenKind(display) ? getScreenSource(display) : null;
  const screenDomain = screenEntityId?.split('.')[0];
  const mediaEntityId = screenEntityId && screenDomain === 'media_player' ? screenEntityId : null;

  // Determine which sections to show per source
  const sections = display.sources.map((src) => {
    const domain = src.entityId.split('.')[0];
    return { src, domain };
  });

  // Collect unique climate entity IDs
  const climateIds = [...new Set(sections.filter(s => s.domain === 'climate').map(s => s.src.entityId))];
  // Sensor-like domains that have numeric history
  const sensorDomains = new Set(['sensor', 'number', 'counter', 'input_number']);
  const sensorSources = sections.filter(s => sensorDomains.has(s.domain));

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="indicator-modal">
        {/* Header */}
        <div className="im-header">
          <div className="im-title">
            <div>
              <div className="im-name">{display.label}</div>
              <div className="im-value-inline">
                {screenEntityId
                  ? `${states[screenEntityId]?.state ?? '--'}${states[screenEntityId]?.attributes?.source ? ` | ${String(states[screenEntityId].attributes.source)}` : ''}`
                  : display.sources.map((src) => {
                    const ha = states[src.entityId];
                    const val = ha?.state ?? '--';
                    const num = parseFloat(val);
                    const formatted = isNaN(num) ? val : num.toFixed(src.precision ?? 0);
                    return `${src.label ? src.label + ' ' : ''}${formatted}${src.unit ?? ''}`;
                  }).join('  ')}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&#10005;</button>
        </div>

        <div className="im-body">
          {mediaEntityId && (
            <TVControls
              entityId={mediaEntityId}
              state={states[mediaEntityId]}
              onTurnOn={onMediaTurnOn}
              onTurnOff={onMediaTurnOff}
              onPlayPause={onMediaPlayPause}
              onStop={onMediaStop}
              onSetVolume={onMediaSetVolume}
              onSelectSource={onMediaSelectSource}
            />
          )}

          {screenEntityId && !mediaEntityId && (
            <ScreenStatusControls
              display={display}
              entityId={screenEntityId}
              state={states[screenEntityId]}
              onToggle={onToggle}
            />
          )}

          {!screenEntityId && (
            <>
          {/* Sensor graphs */}
          {sensorSources.map(({ src }) => (
            <SensorGraph
              key={src.entityId}
              entityId={src.entityId}
              label={src.label}
              unit={src.unit}
              precision={src.precision}
            />
          ))}

          {/* Climate gauges */}
          {climateIds.map((entityId) => (
            <ClimateGauge
              key={entityId}
              entityId={entityId}
              climateState={states[entityId]}
              onSetTemperature={onSetTemperature}
              onSetHvacMode={onSetHvacMode}
            />
          ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
