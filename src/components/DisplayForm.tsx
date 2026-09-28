import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { DisplayAnimation, DisplayCondition, DisplayConfig, DisplayKind, DisplaySource, LightPosition, TextAlign } from '../types';
import { generateUUID } from '../utils/uuid';
import { fineSliderRange } from '../utils/editorControls';
import LucideIcon from './SidePanel/cards/LucideIcon';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { useTranslation } from '../contexts/LanguageContext';

const ANIMATION_OPTIONS: DisplayAnimation[] = ['spin', 'pulse', 'glow', 'bounce', 'flash'];

function AnimationPicker({
  value,
  onChange,
}: {
  value?: DisplayAnimation;
  onChange: (v: DisplayAnimation | undefined) => void;
}) {
  const t = useTranslation();
  const enabled = !!value;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? 'pulse' : undefined)}
        />
        {t('form.animate')}
      </label>
      {enabled && (
        <select
          className="field-select"
          style={{ fontSize: 11, padding: '2px 4px', width: 'auto' }}
          value={value}
          onChange={(e) => onChange(e.target.value as DisplayAnimation)}
        >
          {ANIMATION_OPTIONS.map((a) => (
            <option key={a} value={a}>{t(`animation.${a}`)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export interface DisplayPreviewInfo {
  kind: DisplayKind;
  sources: DisplaySource[];
  width: number;
  height: number;
  textAlign: TextAlign;
  opacity: number;
  mirrorH: boolean;
  mirrorV: boolean;
  backgroundColor: string;
}

export interface DisplayFormHandle {
  updateSize: (width: number, height: number) => void;
}

interface Props {
  open: boolean;
  editDisplay: DisplayConfig | null;
  position: LightPosition;
  normal: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onNormalChange: (normal: LightPosition) => void;
  onSave: (config: DisplayConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: DisplayPreviewInfo) => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
  defaultSize?: { width: number; height: number };
}

const DEFAULT_SOURCE: DisplaySource = {
  entityId: '',
  unit: '',
  precision: 1,
  color: '#38bdf8',
  fontSize: 64,
  fontWeight: 'bold',
};

const DEFAULT_TV_SOURCE: DisplaySource = {
  entityId: '',
  label: '',
  color: '#e2e8f0',
  fontSize: 42,
  fontWeight: 'bold',
};
const SCREEN_KINDS: DisplayKind[] = ['tv', 'pc', 'console', 'qnap'];
const DISPLAY_KIND_OPTIONS: DisplayKind[] = ['info', ...SCREEN_KINDS];

function isScreenKind(kind: DisplayKind): boolean {
  return kind !== 'info';
}

function displayKindLabelKey(kind: DisplayKind): string {
  if (kind === 'tv') return 'form.tvDisplay';
  if (kind === 'pc') return 'form.pcDisplay';
  if (kind === 'console') return 'form.consoleDisplay';
  if (kind === 'qnap') return 'form.qnapDisplay';
  return 'form.infoDisplay';
}

function defaultScreenLabel(kind: DisplayKind): string {
  if (kind === 'tv') return 'TV';
  if (kind === 'pc') return 'PC';
  if (kind === 'console') return 'Console';
  if (kind === 'qnap') return 'QNAP';
  return 'Display';
}

function screenPlaceholder(kind: DisplayKind): string {
  if (kind === 'tv') return 'media_player.living_room_tv';
  if (kind === 'pc') return 'switch.gaming_pc';
  if (kind === 'console') return 'media_player.playstation_5';
  if (kind === 'qnap') return 'sensor.qnap_status';
  return 'sensor.temperature';
}

function screenBackground(kind: DisplayKind): string {
  if (kind === 'pc') return '#020617';
  if (kind === 'console') return '#070312';
  if (kind === 'qnap') return '#04130f';
  return '#05070b';
}

const DisplayForm = forwardRef<DisplayFormHandle, Props>(function DisplayForm({
  open,
  editDisplay,
  position,
  normal,
  onPositionChange,
  onNormalChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  haEntities = [],
  defaultSize = { width: 0.5, height: 0.28 },
}: Props, ref) {
  const t = useTranslation();
  const [displayKind, setDisplayKind] = useState<DisplayKind>('info');
  const [label, setLabel] = useState('');
  const [sources, setSources] = useState<DisplaySource[]>([{ ...DEFAULT_SOURCE }]);
  const [textAlign, setTextAlign] = useState<TextAlign>('center');
  const [opacity, setOpacity] = useState(0.95);
  const [mirrorH, setMirrorH] = useState(false);
  const [mirrorV, setMirrorV] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('transparent');
  const [bgEnabled, setBgEnabled] = useState(false);
  const [clickable, setClickable] = useState(false);
  const [animation, setAnimation] = useState<DisplayAnimation | undefined>();
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useImperativeHandle(ref, () => ({
    updateSize: (nextWidth: number, nextHeight: number) => {
      setWidth(parseFloat(Math.max(0, nextWidth).toFixed(3)));
      setHeight(parseFloat(Math.max(0, nextHeight).toFixed(3)));
    },
  }));

  useEffect(() => {
    if (editDisplay) {
      const kind = editDisplay.kind ?? 'info';
      setDisplayKind(kind);
      setLabel(editDisplay.label || '');
      const srcs = editDisplay.sources.length > 0
        ? editDisplay.sources.map((s) => ({
            ...s,
            color: s.color ?? editDisplay.color ?? '#38bdf8',
            fontSize: s.fontSize ?? editDisplay.fontSize ?? 64,
            fontWeight: s.fontWeight ?? editDisplay.fontWeight ?? 'bold' as const,
          }))
        : [{ ...DEFAULT_SOURCE }];
      setSources(srcs);
      setTextAlign(editDisplay.textAlign ?? 'center');
      setOpacity(editDisplay.opacity ?? 0.95);
      setMirrorH(editDisplay.mirrorH ?? false);
      setMirrorV(editDisplay.mirrorV ?? false);
      const bg = editDisplay.backgroundColor ?? 'transparent';
      setBackgroundColor(bg === 'transparent' ? '#1a1a2e' : bg);
      setBgEnabled(bg !== 'transparent');
      setClickable(editDisplay.clickable ?? false);
      setAnimation(editDisplay.animation);
      setWidth(editDisplay.width || defaultSize.width);
      setHeight(editDisplay.height || defaultSize.height);
    } else {
      setDisplayKind('info');
      setLabel('');
      setSources([{ ...DEFAULT_SOURCE }]);
      setTextAlign('center');
      setOpacity(0.95);
      setMirrorH(false);
      setMirrorV(false);
      setBackgroundColor('#1a1a2e');
      setBgEnabled(false);
      setClickable(false);
      setAnimation(undefined);
      setWidth(defaultSize.width);
      setHeight(defaultSize.height);
    }
  }, [editDisplay, open, defaultSize.width, defaultSize.height]);

  // Fire preview on every change
  useEffect(() => {
    if (!open) return;
    onPreviewChange({ kind: displayKind, sources, width, height, textAlign, opacity, mirrorH, mirrorV, backgroundColor: bgEnabled ? backgroundColor : 'transparent' });
  }, [displayKind, sources, width, height, textAlign, opacity, mirrorH, mirrorV, bgEnabled, backgroundColor, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKindChange = useCallback((kind: DisplayKind) => {
    setDisplayKind(kind);
    if (isScreenKind(kind)) {
      setSources((prev) => [{ ...DEFAULT_TV_SOURCE, entityId: prev[0]?.entityId ?? '', label: prev[0]?.label ?? '' }]);
      setTextAlign('center');
      setBgEnabled(true);
      setBackgroundColor(screenBackground(kind));
      setClickable(true);
      setAnimation(undefined);
    } else {
      setSources((prev) => prev.length ? prev : [{ ...DEFAULT_SOURCE }]);
    }
  }, []);

  const updateSource = useCallback((idx: number, patch: Partial<DisplaySource>) => {
    setSources((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const removeSource = useCallback((idx: number) => {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addSource = useCallback(() => {
    setSources((prev) => [...prev, { ...DEFAULT_SOURCE }]);
  }, []);

  const handleSave = useCallback(() => {
    const validSources = sources
      .filter((s) => s.entityId.trim())
      .map((s) => {
        const validConds = s.conditions?.filter((c) => c.state.trim());
        return { ...s, conditions: validConds?.length ? validConds : undefined };
      });
    if (validSources.length === 0) {
      alert(t('common.requiredDataSource'));
      return;
    }

    onSave({
      id: editDisplay?.id || generateUUID(),
      label: label.trim() || validSources[0].entityId.split('.').pop()?.replace(/_/g, ' ') || defaultScreenLabel(displayKind),
      kind: displayKind !== 'info' ? displayKind : undefined,
      sources: validSources,
      position,
      normal,
      width,
      height,
      textAlign: textAlign !== 'center' ? textAlign : undefined,
      opacity,
      backgroundColor: isScreenKind(displayKind) ? screenBackground(displayKind) : (bgEnabled ? backgroundColor : undefined),
      mirrorH: mirrorH || undefined,
      mirrorV: mirrorV || undefined,
      clickable: isScreenKind(displayKind) ? true : (clickable || undefined),
      animation: isScreenKind(displayKind) ? undefined : animation,
    });
  }, [displayKind, label, sources, position, normal, width, height, textAlign, opacity, mirrorH, mirrorV, bgEnabled, backgroundColor, clickable, animation, editDisplay, onSave, t]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: value });
    },
    [position, onPositionChange],
  );

  const handleNormalChange = useCallback(
    (axis: keyof LightPosition, value: number) => {
      const next = { ...normal, [axis]: value };
      const length = Math.hypot(next.x, next.y, next.z);
      if (length < 0.001) {
        onNormalChange({ x: 0, y: 0, z: 1 });
        return;
      }
      onNormalChange({
        x: parseFloat((next.x / length).toFixed(4)),
        y: parseFloat((next.y / length).toFixed(4)),
        z: parseFloat((next.z / length).toFixed(4)),
      });
    },
    [normal, onNormalChange],
  );

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? `\u2715 ${t('form.cancelPlacement')}` : `\u{1F4CD} ${t('form.clickWallToPlace')}`}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; {t('form.saveDisplay')}
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editDisplay ? t('form.editDisplay') : t('form.addDisplay')}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title={t('form.identity')} defaultOpen>
        <div className="field-group">
          <label className="field-label">{t('form.displayType')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
            {DISPLAY_KIND_OPTIONS.map((kind) => (
              <button
                key={kind}
                className="btn btn-ghost"
                style={{
                  padding: '7px 0',
                  borderColor: displayKind === kind ? 'var(--accent)' : undefined,
                  color: displayKind === kind ? 'var(--accent)' : undefined,
                }}
                onClick={() => handleKindChange(kind)}
              >
                {t(displayKindLabelKey(kind))}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">{t('form.label')}</label>
          <input
            type="text"
            className="field-input"
            placeholder={t('placeholder.displayLabel')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title={t('form.dataSources')} defaultOpen>
        {isScreenKind(displayKind) ? (
          <div className="field-group">
            <label className="field-label">{t(displayKind === 'tv' ? 'form.mediaPlayerEntityId' : 'form.screenEntityId')}</label>
            <EntityPicker
              value={sources[0]?.entityId ?? ''}
              onChange={(v) => setSources([{ ...(sources[0] ?? DEFAULT_TV_SOURCE), entityId: v }])}
              onSelect={(e) => { if (!label.trim() && e.friendly_name) setLabel(e.friendly_name); }}
              placeholder={screenPlaceholder(displayKind)}
              entities={haEntities}
              className="field-input"
            />
          </div>
        ) : sources.map((src, i) => (
          <div key={i} style={{ marginBottom: 12, padding: '8px 0', borderBottom: i < sources.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div className="field-group">
              <label className="field-label">{t('form.entityId')}</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ flex: 1 }}>
                  <EntityPicker
                    value={src.entityId}
                    onChange={(v) => updateSource(i, { entityId: v })}
                    onSelect={(e) => { if (i === 0 && !label.trim() && e.friendly_name) setLabel(e.friendly_name); }}
                    placeholder="sensor.temperature"
                    entities={haEntities}
                    className="field-input"
                  />
                </div>
                {sources.length > 1 && (
                  <button
                    className="light-item-del"
                    style={{ flexShrink: 0, width: 28, height: 28 }}
                    onClick={() => removeSource(i)}
                  >&times;</button>
                )}
              </div>
            </div>
            <div className="row3">
              <div className="field-group">
                <label className="field-label">{t('form.label')}</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder={t('placeholder.displayShortLabel')}
                  value={src.label || ''}
                  onChange={(e) => updateSource(i, { label: e.target.value || undefined })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">{t('form.unit')}</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="°C"
                  value={src.unit || ''}
                  onChange={(e) => updateSource(i, { unit: e.target.value || undefined })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">{t('form.decimals')}</label>
                <input
                  type="number"
                  className="field-input"
                  min={0}
                  max={4}
                  value={src.precision ?? 1}
                  onChange={(e) => updateSource(i, { precision: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Per-source style */}
            <div className="row3" style={{ marginTop: 8 }}>
              <div className="field-group">
                <label className="field-label">{t('modal.color')}</label>
                <input
                  type="color"
                  className="field-input"
                  value={src.color ?? '#38bdf8'}
                  onChange={(e) => updateSource(i, { color: e.target.value })}
                  style={{ height: 28, padding: 2 }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">{t('form.size')}</label>
                <input
                  type="number"
                  className="field-input"
                  min={16}
                  max={200}
                  value={src.fontSize ?? 64}
                  onChange={(e) => updateSource(i, { fontSize: parseInt(e.target.value) || 64 })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">{t('form.fontWeight')}</label>
                <select
                  className="field-select"
                  value={src.fontWeight ?? 'bold'}
                  onChange={(e) => updateSource(i, { fontWeight: e.target.value as 'normal' | 'bold' })}
                >
                  <option value="normal">{t('common.normal')}</option>
                  <option value="bold">{t('common.bold')}</option>
                </select>
              </div>
            </div>

            {/* Conditional styling rules */}
            <div style={{ marginTop: 8 }}>
              <label className="field-label" style={{ marginBottom: 4, display: 'block' }}>
                {t('form.conditions')}
                <span style={{ opacity: 0.5, fontWeight: 'normal' }}>{t('form.conditionsHint')}</span>
              </label>
              {(src.conditions ?? []).map((cond, ci) => (
                <div key={ci} style={{ marginBottom: 6, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                    <input
                      type="text"
                      className="field-input"
                      style={{ width: 90 }}
                      placeholder={t('form.attributePlaceholder')}
                      title={t('form.attributeTitle')}
                      value={cond.attribute ?? ''}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], attribute: e.target.value || undefined };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <span style={{ opacity: 0.4, fontSize: 11 }}>=</span>
                    <input
                      type="text"
                      className="field-input"
                      style={{ width: 70 }}
                      placeholder={t('form.valuePlaceholder')}
                      value={cond.state}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], state: e.target.value };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <button
                      className="light-item-del"
                      style={{ flexShrink: 0, width: 22, height: 22, fontSize: 12, marginLeft: 'auto' }}
                      onClick={() => {
                        const updated = (src.conditions ?? []).filter((_, j) => j !== ci);
                        updateSource(i, { conditions: updated.length ? updated : undefined });
                      }}
                    >&times;</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="color"
                      className="field-input"
                      style={{ width: 32, height: 28, padding: 2 }}
                      title={t('form.textColorTitle')}
                      value={cond.color ?? src.color ?? '#38bdf8'}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], color: e.target.value };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="text"
                        className="field-input"
                        style={{ flex: 1 }}
                        placeholder={t('form.iconPlaceholder')}
                        value={cond.icon ?? ''}
                        onChange={(e) => {
                          const updated = [...(src.conditions ?? [])];
                          updated[ci] = { ...updated[ci], icon: e.target.value || undefined };
                          updateSource(i, { conditions: updated });
                        }}
                      />
                      {cond.icon && (
                        <LucideIcon
                          name={cond.icon}
                          size={16}
                          color={cond.color ?? src.color ?? '#38bdf8'}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                    </div>
                    <span style={{ opacity: 0.3, fontSize: 9 }}>{t('common.or')}</span>
                    <input
                      type="text"
                      className="field-input"
                      style={{ flex: 1 }}
                      placeholder={t('form.labelPlaceholder')}
                      value={cond.label ?? ''}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], label: e.target.value || undefined };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <input
                      type="color"
                      className="field-input"
                      style={{ width: 32, height: 28, padding: 2 }}
                      title={t('form.backgroundColorTitle')}
                      value={cond.backgroundColor ?? '#1a1a2e'}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], backgroundColor: e.target.value };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <AnimationPicker
                      value={cond.animation}
                      onChange={(v) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], animation: v };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                  </div>
                </div>
              ))}
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 11, padding: '4px 0' }}
                onClick={() => {
                  const updated: DisplayCondition[] = [...(src.conditions ?? []), { state: '', color: '#38bdf8' }];
                  updateSource(i, { conditions: updated });
                }}
              >
                {t('form.addCondition')}
              </button>
            </div>
          </div>
        ))}
        {displayKind === 'info' && (
          <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 8 }} onClick={addSource}>
            {t('form.addSource')}
          </button>
        )}
      </AccordionSection>

      <AccordionSection title={t('form.size')} defaultOpen>
        {([
          { label: t('form.width'), key: 'width' as const, value: width, set: setWidth, span: 0.45 },
          { label: t('form.height'), key: 'height' as const, value: height, set: setHeight, span: 0.3 },
        ]).map(({ label: lbl, key, value, set, span }) => {
          const range = fineSliderRange(value, span, 0.05, 8);
          return (
            <div key={key} className="pos-grid">
              <span className="pos-axis" style={{ color: 'var(--muted)' }}>{lbl}</span>
              <input
                type="range"
                className="pos-slider"
                min={range.min}
                max={range.max}
                step={0.01}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="pos-num"
                step={0.01}
                min={0.05}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value) || 0.05)}
              />
            </div>
          );
        })}
      </AccordionSection>

      <AccordionSection title={t('form.orientation')}>
        {([
          { label: 'X', axis: 'x' as const, value: normal.x },
          { label: 'Z', axis: 'y' as const, value: normal.y },
          { label: 'Y', axis: 'z' as const, value: normal.z },
        ]).map(({ label: lbl, axis, value }) => (
          <div key={axis} className="pos-grid">
            <span className="pos-axis" style={{ color: 'var(--muted)' }}>{lbl}</span>
            <input
              type="range"
              className="pos-slider"
              min={-1}
              max={1}
              step={0.01}
              value={value}
              onChange={(e) => handleNormalChange(axis, parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="pos-num"
              step={0.01}
              min={-1}
              max={1}
              value={value}
              onChange={(e) => handleNormalChange(axis, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </AccordionSection>

      <AccordionSection title={t('form.displaySettings')}>
        {displayKind === 'info' && (
          <div className="field-group">
            <label className="field-label">{t('form.textAlign')}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
                <button
                  key={a}
                  className="btn btn-ghost"
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: 10,
                    borderColor: textAlign === a ? 'var(--accent)' : undefined,
                    color: textAlign === a ? 'var(--accent)' : undefined,
                  }}
                  onClick={() => setTextAlign(a)}
                >
                  {t(a === 'left' ? 'common.left' : a === 'right' ? 'common.right' : 'common.centre')}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field-group">
          <label className="field-label">{t('form.opacity', { value: Math.round(opacity * 100) })}</label>
          <input
            type="range"
            className="pos-slider"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
          />
        </div>
        {displayKind === 'info' && (
        <div className="field-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={bgEnabled} onChange={(e) => setBgEnabled(e.target.checked)} />
            {t('form.backgroundPanel')}
          </label>
          {bgEnabled && (
            <input
              type="color"
              className="field-input"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              style={{ height: 28, padding: 2, marginTop: 4 }}
            />
          )}
        </div>
        )}
        <div className="field-group">
          <label className="field-label">{t('form.mirror')}</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={mirrorH} onChange={(e) => setMirrorH(e.target.checked)} />
              {t('form.horizontal')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={mirrorV} onChange={(e) => setMirrorV(e.target.checked)} />
              {t('form.vertical')}
            </label>
          </div>
        </div>
        {displayKind === 'info' && (
        <div className="field-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={clickable} onChange={(e) => setClickable(e.target.checked)} />
            {t('form.clickable')}
          </label>
        </div>
        )}
        {displayKind === 'info' && (
        <div className="field-group">
          <label className="field-label">{t('form.animation')}</label>
          <AnimationPicker value={animation} onChange={setAnimation} />
        </div>
        )}
      </AccordionSection>

      <AccordionSection title={t('form.position')} defaultOpen>
        <div
          className={`placement-hint${open ? ' visible' : ''}`}
          dangerouslySetInnerHTML={{ __html: t('form.placementHintWall') }}
        />

        {([
          { label: 'X', color: '#f87171', babylonAxis: 'x' as const, span: 2 },
          { label: 'Z', color: '#4ade80', babylonAxis: 'y' as const, span: 0.8 },
          { label: 'Y', color: '#38bdf8', babylonAxis: 'z' as const, span: 2 },
        ]).map(({ label: axLabel, color: axColor, babylonAxis, span }) => {
          const range = fineSliderRange(position[babylonAxis], span);
          return (
            <div key={babylonAxis} className="pos-grid">
              <span className="pos-axis" style={{ color: axColor }}>{axLabel}</span>
              <input
                type="range"
                className="pos-slider"
                min={range.min}
                max={range.max}
                step={0.01}
                value={position[babylonAxis]}
                onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="pos-num"
                step={0.01}
                value={position[babylonAxis]}
                onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value) || 0)}
              />
            </div>
          );
        })}

        <div style={{ marginTop: 8 }}>
          <span className="field-label">{t('form.surfaceNormal')}</span>
          <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'var(--font-mono, monospace)', marginTop: 4 }}>
            nx: {normal.x.toFixed(3)} &nbsp; ny: {normal.y.toFixed(3)} &nbsp; nz: {normal.z.toFixed(3)}
          </div>
        </div>
      </AccordionSection>
    </FormPanel>
  );
});

export default DisplayForm;
