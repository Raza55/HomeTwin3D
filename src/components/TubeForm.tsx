import { useState, useEffect, useCallback } from 'react';
import type { TubeConfig, TubeLineConfig, TubeInputUnit, TubeOriginDirection, TubeFlowType, LightPosition } from '../types';
import { generateUUID } from '../utils/uuid';
import { fineSliderRange } from '../utils/editorControls';
import LucideIcon from './SidePanel/cards/LucideIcon';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { useTranslation } from '../contexts/LanguageContext';

export interface TubePreviewInfo {
  config: TubeConfig;
}

interface Props {
  open: boolean;
  editTube: TubeConfig | null;
  position: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (cfg: TubeConfig) => void;
  onClose: () => void;
  onPreviewChange: (info: TubePreviewInfo) => void;
  haEntities?: HAEntityOption[];
  defaultSettings?: { diameter: number; fontSize: number; gap: number; labelHeight: number };
}

const UNIT_OPTIONS: TubeInputUnit[] = ['b', 'kb', 'mb', 'gb', 'tb', 'B', 'kB', 'mB', 'gB', 'tB'];

type FlowPreset = 'network' | 'smartPlug' | 'electricityMeter' | 'waterMeter' | 'gasMeter';

const PRESETS: Record<FlowPreset, { flowType: TubeFlowType; lines: TubeLineConfig[] }> = {
  network: { flowType: 'network', lines: [
    { sensorId: '', color: '#38bdf8', icon: 'Download', inputUnit: 'mb', particles: true, particleDirection: 'inward', particleMaxValue: 1000 },
    { sensorId: '', color: '#22c55e', icon: 'Upload', inputUnit: 'mb', particles: true, particleDirection: 'outward', particleMaxValue: 1000 },
  ] },
  smartPlug: { flowType: 'electricity', lines: [
    { sensorId: '', color: '#facc15', icon: 'Zap', displayUnit: 'W', autoScale: true, precision: 1, particles: true, particleMaxValue: 3000 },
    { sensorId: '', color: '#f59e0b', icon: 'Gauge', displayUnit: 'kWh', autoScale: false, precision: 2 },
    { sensorId: '', color: '#60a5fa', icon: 'Activity', displayUnit: 'V', autoScale: false, precision: 1 },
    { sensorId: '', color: '#a78bfa', icon: 'Cable', displayUnit: 'A', autoScale: false, precision: 2 },
  ] },
  electricityMeter: { flowType: 'electricity', lines: [
    { sensorId: '', color: '#facc15', icon: 'Zap', displayUnit: 'W', autoScale: true, precision: 1, particles: true, particleMaxValue: 10000 },
    { sensorId: '', color: '#f59e0b', icon: 'Gauge', displayUnit: 'kWh', autoScale: false, precision: 2 },
  ] },
  waterMeter: { flowType: 'water', lines: [
    { sensorId: '', color: '#38bdf8', icon: 'Droplets', displayUnit: 'L/min', autoScale: false, precision: 1, particles: true, particleMaxValue: 50 },
    { sensorId: '', color: '#0ea5e9', icon: 'Gauge', displayUnit: 'm³', autoScale: false, precision: 3 },
  ] },
  gasMeter: { flowType: 'gas', lines: [
    { sensorId: '', color: '#fb923c', icon: 'Flame', displayUnit: 'm³/h', autoScale: false, precision: 2, particles: true, particleMaxValue: 10 },
    { sensorId: '', color: '#f59e0b', icon: 'Gauge', displayUnit: 'm³', autoScale: false, precision: 3 },
  ] },
};

function defaultLine(): TubeLineConfig {
  return { sensorId: '', color: '#00aaff' };
}

export default function TubeForm({
  open,
  editTube,
  position,
  onPositionChange,
  onSave,
  onClose,
  onPreviewChange,
  haEntities = [],
  defaultSettings = { diameter: 0.05, fontSize: 36, gap: 0.16, labelHeight: 0.2 },
}: Props) {
  const t = useTranslation();
  const [label, setLabel] = useState('');
  const [flowType, setFlowType] = useState<TubeFlowType>('network');
  const [originDirection, setOriginDirection] = useState<TubeOriginDirection>('left');
  const [diameter, setDiameter] = useState(0.08);
  const [fontSize, setFontSize] = useState(48);
  const [gap, setGap] = useState(0.25);
  const [labelPosition, setLabelPosition] = useState(0.95);
  const [labelHeight, setLabelHeight] = useState(0.3);
  const [lines, setLines] = useState<TubeLineConfig[]>([defaultLine()]);
  const directionOptions: { value: TubeOriginDirection; label: string }[] = [
    { value: 'left', label: `\u2190 ${t('common.left')}` },
    { value: 'right', label: `\u2192 ${t('common.right')}` },
    { value: 'top', label: `\u2191 ${t('common.top')}` },
    { value: 'bottom', label: `\u2193 ${t('common.bottom')}` },
  ];
  const presetUnits = [
    { value: '', label: t('form.networkSpeed') },
    { value: 'W', label: t('form.watts') },
    { value: 'kW', label: 'Kilowatt (kW)' },
    { value: 'kWh', label: 'Kilowattstunden (kWh)' },
    { value: 'MWh', label: 'Megawattstunden (MWh)' },
    { value: 'L', label: t('form.litres') },
    { value: 'L/min', label: t('form.litresMin') },
    { value: 'm³', label: t('form.cubicMeters') },
    { value: 'm³/h', label: t('form.cubicMetersH') },
    { value: '°C', label: t('form.celsius') },
    { value: '%', label: t('form.percent') },
    { value: 'A', label: t('form.amps') },
    { value: 'V', label: t('form.volts') },
    { value: 'Wh', label: t('form.wattHours') },
    { value: 'Pa', label: t('form.pascals') },
    { value: 'custom', label: t('form.custom') },
  ];

  // Init form from editTube
  useEffect(() => {
    if (!open) return;
    if (editTube) {
      setLabel(editTube.label);
      setFlowType(editTube.flowType ?? 'network');
      setOriginDirection(editTube.originDirection);
      setDiameter(editTube.diameter);
      setFontSize(editTube.fontSize);
      setGap(editTube.gap);
      setLabelPosition(editTube.labelPosition ?? 0.95);
      setLabelHeight(editTube.labelHeight ?? 0.3);
      setLines(editTube.lines.length > 0 ? editTube.lines.map(l => ({ ...l })) : [defaultLine()]);
    } else {
      setLabel('');
      setFlowType('network');
      setOriginDirection('left');
      setDiameter(defaultSettings.diameter);
      setFontSize(defaultSettings.fontSize);
      setGap(defaultSettings.gap);
      setLabelPosition(0.95);
      setLabelHeight(defaultSettings.labelHeight);
      setLines([defaultLine()]);
    }
  }, [open, editTube, defaultSettings.diameter, defaultSettings.fontSize, defaultSettings.gap, defaultSettings.labelHeight]);

  // Build a config snapshot for preview
  const buildConfig = useCallback((): TubeConfig => ({
    id: editTube?.id || '__preview__',
    label,
    flowType,
    originDirection,
    diameter,
    fontSize,
    gap,
    endX: position.x,
    endZ: position.z,
    labelPosition,
    labelHeight,
    lines,
  }), [editTube, label, flowType, originDirection, diameter, fontSize, gap, position, labelPosition, labelHeight, lines]);

  // Notify parent of preview changes
  useEffect(() => {
    if (!open) return;
    onPreviewChange({ config: buildConfig() });
  }, [open, label, flowType, originDirection, diameter, fontSize, gap, labelPosition, labelHeight, lines, position]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = useCallback((preset: FlowPreset) => {
    const next = PRESETS[preset];
    setFlowType(next.flowType);
    setLines(next.lines.map(line => ({ ...line })));
    if (!label.trim()) setLabel(t(`flows.preset.${preset}`));
  }, [label, t]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleLineChange = useCallback((idx: number, field: keyof TubeLineConfig, value: string | boolean) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'icon') return { ...l, icon: (value as string) || undefined };
      if (field === 'displayUnit') return { ...l, displayUnit: (value as string) || undefined };
      if (field === 'precision')
        return { ...l, precision: parseInt(value as string, 10) };
      if (field === 'particleSpeed' || field === 'particleMaxValue')
        return { ...l, [field]: parseFloat(value as string) || undefined };
      return { ...l, [field]: value };
    }));
  }, []);

  const addLine = useCallback(() => {
    setLines(prev => [...prev, { sensorId: '', color: prev.length % 2 === 0 ? '#00aaff' : '#22c55e' }]);
  }, []);

  const removeLine = useCallback((idx: number) => {
    setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }, []);

  const handleSave = useCallback(() => {
    const cfg: TubeConfig = {
      id: editTube?.id || generateUUID(),
      label: label || t('flows.type.custom'),
      flowType,
      originDirection,
      diameter,
      fontSize,
      gap,
      endX: position.x,
      endZ: position.z,
      labelPosition,
      labelHeight,
      lines,
    };
    onSave(cfg);
  }, [editTube, label, flowType, originDirection, diameter, fontSize, gap, position, labelPosition, labelHeight, lines, onSave, t]);

  const footer = (
    <>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; {t('form.saveTube')}
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editTube ? t('form.editTube') : t('form.addTube')}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title={t('form.label')} defaultOpen>
        <div className="field-group">
          <input
            type="text"
            className="field-input"
            placeholder={t('placeholder.tubeLabel')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title={t('form.originDirection')} defaultOpen>
        <div className="field-group">
          <select
            className="field-input"
            value={originDirection}
            onChange={(e) => setOriginDirection(e.target.value as TubeOriginDirection)}
          >
            {directionOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </AccordionSection>

      <AccordionSection title={t('form.tubeSettings')}>
        {([
          { label: t('form.diameter'), value: diameter, set: setDiameter, min: 0.01, max: 0.5, step: 0.005, span: 0.06 },
          { label: t('form.gap'), value: gap, set: setGap, min: 0.05, max: 2, step: 0.01, span: 0.2 },
          { label: t('form.fontSize'), value: fontSize, set: setFontSize, min: 12, max: 120, step: 1, span: 14 },
        ] as const).map(({ label: lbl, value, set, min, max, step, span }) => {
          const range = fineSliderRange(value, span, min, max);
          return (
            <div key={lbl} className="tube-slider-group">
              <span className="tube-slider-label">{lbl}</span>
              <div className="tube-slider-row">
                <input
                  type="range"
                  className="pos-slider"
                  min={range.min}
                  max={range.max}
                  step={step}
                  value={value}
                  onChange={(e) => set(parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  className="pos-num"
                  step={step}
                  min={min}
                  value={value}
                  onChange={(e) => set(parseFloat(e.target.value) || min)}
                />
              </div>
            </div>
          );
        })}
      </AccordionSection>

      <AccordionSection title={t('flows.category')} defaultOpen>
        <div className="field-group">
          <select className="field-input" value={flowType} onChange={(e) => setFlowType(e.target.value as TubeFlowType)}>
            {(['network', 'electricity', 'water', 'gas', 'custom'] as TubeFlowType[]).map(type => (
              <option key={type} value={type}>{t(`flows.type.${type}`)}</option>
            ))}
          </select>
        </div>
        <div className="tube-preset-grid">
          {(['network', 'smartPlug', 'electricityMeter', 'waterMeter', 'gasMeter'] as FlowPreset[]).map(preset => (
            <button key={preset} type="button" className="btn-inline" onClick={() => applyPreset(preset)}>
              {t(`flows.preset.${preset}`)}
            </button>
          ))}
        </div>
        <div className="form-hint">{t('flows.presetHint')}</div>
      </AccordionSection>

      <AccordionSection title={t('form.labelPositioning')}>
        {([
          { label: t('form.position'), value: labelPosition, set: setLabelPosition, min: 0, max: 1, step: 0.01, span: 0.25 },
          { label: t('form.height'), value: labelHeight, set: setLabelHeight, min: 0, max: 3, step: 0.01, span: 0.3 },
        ] as const).map(({ label: lbl, value, set, min, max, step, span }) => {
          const range = fineSliderRange(value, span, min, max);
          return (
            <div key={lbl} className="tube-slider-group">
              <span className="tube-slider-label">{lbl}</span>
              <div className="tube-slider-row">
                <input
                  type="range"
                  className="pos-slider"
                  min={range.min}
                  max={range.max}
                  step={step}
                  value={value}
                  onChange={(e) => set(parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  className="pos-num"
                  step={step}
                  min={min}
                  value={value}
                  onChange={(e) => set(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          );
        })}
      </AccordionSection>

      <AccordionSection title={t('form.endpointPosition')} defaultOpen>
        <div className="placement-hint visible">
          {t('form.dragGizmoHint')}
        </div>
        {([
          { label: 'X', color: '#f87171', axis: 'x' as const },
          { label: 'Y', color: '#38bdf8', axis: 'z' as const },
        ]).map(({ label: lbl, color, axis }) => {
          const range = fineSliderRange(position[axis], 2);
          return (
            <div key={axis} className="pos-grid">
              <span className="pos-axis" style={{ color }}>{lbl}</span>
              <input
                type="range"
                className="pos-slider"
                min={range.min}
                max={range.max}
                step={0.01}
                value={position[axis]}
                onChange={(e) => handlePosChange(axis, parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="pos-num"
                step={0.01}
                value={position[axis]}
                onChange={(e) => handlePosChange(axis, parseFloat(e.target.value) || 0)}
              />
            </div>
          );
        })}
      </AccordionSection>

      <AccordionSection title={t('form.sensorLines')} defaultOpen>
        <button className="btn-inline" onClick={addLine} style={{ fontSize: '0.85em', alignSelf: 'flex-start' }}>
          {t('form.addLine')}
        </button>
        {lines.map((line, i) => (
          <div key={i} className="tube-line-row" style={{ flexWrap: 'wrap' }}>
            <input
              type="color"
              className="tube-line-color"
              value={line.color}
              onChange={(e) => handleLineChange(i, 'color', e.target.value)}
              title={t('form.lineColorTitle')}
            />
            <div className="tube-line-sensor" style={{ flex: 1 }}>
              <EntityPicker
                value={line.sensorId}
                onChange={(v) => handleLineChange(i, 'sensorId', v)}
                onSelect={(ent) => { if (i === 0 && !label.trim() && ent.friendly_name) setLabel(ent.friendly_name); }}
                placeholder="sensor.entity_id"
                entities={haEntities}
                className="field-input"
              />
            </div>
            {lines.length > 1 && (
              <button
                className="tube-line-remove"
                onClick={() => removeLine(i)}
                title={t('form.removeLineTitle')}
              >
                &times;
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <input
                type="text"
                className="field-input"
                style={{ flex: 1 }}
                placeholder={t('placeholder.iconWifi')}
                value={line.icon ?? ''}
                onChange={(e) => handleLineChange(i, 'icon', e.target.value || '')}
              />
              {line.icon && (
                <LucideIcon
                  name={line.icon}
                  size={16}
                  color={line.color}
                  style={{ flexShrink: 0 }}
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.unit')}</span>
              <select
                className="field-input"
                style={{ flex: 1 }}
                value={
                  !line.displayUnit ? ''
                    : presetUnits.some(p => p.value === line.displayUnit) ? line.displayUnit
                    : 'custom'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'custom') {
                    handleLineChange(i, 'displayUnit', 'unit');
                  } else {
                    handleLineChange(i, 'displayUnit', v);
                  }
                }}
                title={t('form.unit3dLabelTitle')}
              >
                {presetUnits.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            {line.displayUnit && !presetUnits.some(p => p.value === line.displayUnit && p.value !== 'custom') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.customUnit')}</span>
                <input
                  type="text"
                  className="field-input"
                  style={{ flex: 1 }}
                  placeholder={t('placeholder.customUnit')}
                  value={line.displayUnit ?? ''}
                  onChange={(e) => handleLineChange(i, 'displayUnit', e.target.value || '')}
                />
              </div>
            )}
            {line.displayUnit && (
              <label className="tube-option-check">
                <input
                  type="checkbox"
                  checked={line.autoScale ?? true}
                  onChange={(e) => handleLineChange(i, 'autoScale', e.target.checked)}
                />
                {t('flows.autoScale')}
              </label>
            )}
            {!line.displayUnit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.input')}</span>
                <select
                  className="field-input"
                  style={{ flex: 1 }}
                  value={line.inputUnit ?? 'b'}
                  onChange={(e) => handleLineChange(i, 'inputUnit', e.target.value)}
                  title={t('form.sensorReportsTitle')}
                >
                  {UNIT_OPTIONS.map(u => (
                    <option key={u} value={u}>{u}/s</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.display')}</span>
                <select
                  className="field-input"
                  style={{ flex: 1 }}
                  value={line.displayBytes ? 'bytes' : 'bits'}
                  onChange={(e) => handleLineChange(i, 'displayBytes', e.target.value === 'bytes')}
                  title={t('form.unit3dLabelTitle')}
                >
                  <option value="bits">bits</option>
                  <option value="bytes">bytes</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.decimals')}</span>
              <input
                type="range"
                className="pos-slider"
                style={{ flex: 1 }}
                min={0}
                max={4}
                step={1}
                value={line.precision ?? 1}
                onChange={(e) => handleLineChange(i, 'precision', e.target.value)}
              />
              <input
                type="number"
                className="pos-num"
                style={{ width: 45 }}
                min={0}
                max={4}
                step={1}
                value={line.precision ?? 1}
                onChange={(e) => handleLineChange(i, 'precision', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75em', opacity: 0.6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!line.particles}
                  onChange={(e) => handleLineChange(i, 'particles', e.target.checked)}
                />
                {t('form.particles')}
              </label>
              {line.particles && (
                <>
                  <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.direction')}</span>
                  <select
                    className="field-input"
                    style={{ flex: 1 }}
                    value={line.particleDirection ?? 'inward'}
                    onChange={(e) => handleLineChange(i, 'particleDirection', e.target.value)}
                    title={t('form.particleDirectionTitle')}
                  >
                    <option value="inward">{t('form.inward')}</option>
                    <option value="outward">{t('form.outward')}</option>
                  </select>
                </>
              )}
            </div>
            {line.particles && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.speed')}</span>
                <input
                  type="range"
                  className="pos-slider"
                  style={{ flex: 1 }}
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={line.particleSpeed ?? 1}
                  onChange={(e) => handleLineChange(i, 'particleSpeed', e.target.value)}
                />
                <input
                  type="number"
                  className="pos-num"
                  style={{ width: 50 }}
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={line.particleSpeed ?? 1}
                  onChange={(e) => handleLineChange(i, 'particleSpeed', e.target.value)}
                />
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>{t('form.maxValue')}</span>
                <input
                  type="number"
                  className="pos-num"
                  style={{ width: 70 }}
                  min={1}
                  step={1}
                  value={line.particleMaxValue ?? 1000}
                  onChange={(e) => handleLineChange(i, 'particleMaxValue', e.target.value)}
                  title={t('form.particleMaxTitle')}
                />
              </div>
            )}
          </div>
        ))}
      </AccordionSection>
    </FormPanel>
  );
}
