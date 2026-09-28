import type { LightPosition } from '../types';
import { fineSliderRange } from '../utils/editorControls';

interface SliderNumberRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  span: number;
  min?: number;
  max?: number;
  fallback?: number;
  color?: string;
  title?: string;
}

export function SliderNumberRow({
  label,
  value,
  onChange,
  step,
  span,
  min,
  max,
  fallback,
  color = 'var(--muted)',
  title,
}: SliderNumberRowProps) {
  const safeValue = Number.isFinite(value) ? value : fallback ?? 0;
  const range = fineSliderRange(safeValue, span, min, max);
  const parse = (raw: string) => {
    const next = parseFloat(raw);
    onChange(Number.isFinite(next) ? next : fallback ?? safeValue);
  };

  return (
    <div className="pos-grid" title={title}>
      <span className="pos-axis" style={{ color }}>{label}</span>
      <input
        type="range"
        className="pos-slider"
        min={range.min}
        max={range.max}
        step={step}
        value={safeValue}
        onChange={(e) => parse(e.target.value)}
      />
      <input
        type="number"
        className="pos-num"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => parse(e.target.value)}
      />
    </div>
  );
}

interface VectorSliderFieldsProps {
  label: string;
  value: LightPosition;
  onChange: (value: LightPosition) => void;
  step: number;
  span: number;
  min?: number;
  max?: number;
  axisLabels?: Partial<Record<keyof LightPosition, string>>;
  axisColors?: Partial<Record<keyof LightPosition, string>>;
  hideLabel?: boolean;
}

export function VectorSliderFields({
  label,
  value,
  onChange,
  step,
  span,
  min,
  max,
  axisLabels,
  axisColors,
  hideLabel = false,
}: VectorSliderFieldsProps) {
  const update = (axis: keyof LightPosition, next: number) => {
    onChange({ ...value, [axis]: next });
  };

  return (
    <div className="field-group">
      {!hideLabel && <label className="field-label">{label}</label>}
      {(['x', 'y', 'z'] as const).map((axis) => (
        <SliderNumberRow
          key={axis}
          label={axisLabels?.[axis] ?? axis.toUpperCase()}
          value={value[axis]}
          onChange={(next) => update(axis, next)}
          min={min}
          max={max}
          step={step}
          span={span}
          fallback={min !== undefined && min > 0 ? 1 : 0}
          color={axisColors?.[axis]}
        />
      ))}
    </div>
  );
}
