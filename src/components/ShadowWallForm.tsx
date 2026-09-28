import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { ShadowWallConfig, LightPosition } from '../types';
import { generateUUID } from '../utils/uuid';
import { fineSliderRange } from '../utils/editorControls';
import { FormPanel, AccordionSection } from './FormPanel';
import { useTranslation } from '../contexts/LanguageContext';

export interface WallPreviewInfo {
  size: { width: number; height: number; depth: number };
  rotation?: LightPosition;
}

export interface ShadowWallFormHandle {
  updateSize: (size: { width: number; height: number; depth: number }) => void;
  updateRotation: (rotation: LightPosition) => void;
}

interface Props {
  open: boolean;
  editWall: ShadowWallConfig | null;
  position: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (cfg: ShadowWallConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: WallPreviewInfo) => void;
  placingMode: boolean;
  defaultSize?: { width: number; height: number; depth: number };
}

const ZERO_ROTATION: LightPosition = { x: 0, y: 0, z: 0 };

const ShadowWallForm = forwardRef<ShadowWallFormHandle, Props>(function ShadowWallForm({
  open,
  editWall,
  position,
  onPositionChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  defaultSize = { width: 2, height: 0.03, depth: 2 },
}: Props, ref) {
  const t = useTranslation();
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState(5);
  const [height, setHeight] = useState(0.05);
  const [depth, setDepth] = useState(5);
  const [rotation, setRotation] = useState<LightPosition>(ZERO_ROTATION);

  useImperativeHandle(ref, () => ({
    updateSize: (size) => {
      setWidth(parseFloat(Math.max(0.01, size.width).toFixed(3)));
      setHeight(parseFloat(Math.max(0.01, size.height).toFixed(3)));
      setDepth(parseFloat(Math.max(0.01, size.depth).toFixed(3)));
    },
    updateRotation: (nextRotation) => {
      setRotation({
        x: parseFloat(nextRotation.x.toFixed(1)),
        y: parseFloat(nextRotation.y.toFixed(1)),
        z: parseFloat(nextRotation.z.toFixed(1)),
      });
    },
  }));

  // Init form from editWall
  useEffect(() => {
    if (!open) return;
    if (editWall) {
      setLabel(editWall.label);
      setWidth(editWall.size.width);
      setHeight(editWall.size.height);
      setDepth(editWall.size.depth);
      setRotation(editWall.rotation ?? ZERO_ROTATION);
    } else {
      setLabel('');
      setWidth(defaultSize.width);
      setHeight(defaultSize.height);
      setDepth(defaultSize.depth);
      setRotation(ZERO_ROTATION);
    }
  }, [open, editWall, defaultSize.width, defaultSize.height, defaultSize.depth]);

  // Notify parent of preview changes
  useEffect(() => {
    if (!open) return;
    onPreviewChange({ size: { width, height, depth }, rotation });
  }, [open, width, height, depth, rotation]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleSave = useCallback(() => {
    const cfg: ShadowWallConfig = {
      id: editWall?.id || generateUUID(),
      label: label || 'Wall',
      position,
      size: { width, height, depth },
      rotation,
    };
    onSave(cfg);
  }, [editWall, label, position, width, height, depth, rotation, onSave]);

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? `\u2715 ${t('form.cancelPlacement')}` : `\u{1F4CD} ${t('form.clickModelToPlace')}`}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; {t('form.saveWall')}
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editWall ? t('form.editWall') : t('form.addWall')}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title={t('form.label')} defaultOpen>
        <div className="field-group">
          <input
            type="text"
            className="field-input"
            placeholder={t('placeholder.wallLabel')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title={t('form.size')} defaultOpen>
        {([
          { label: t('form.width'), key: 'width' as const, value: width, set: setWidth, span: 1.5 },
          { label: t('form.height'), key: 'height' as const, value: height, set: setHeight, span: 0.15 },
          { label: t('form.depth'), key: 'depth' as const, value: depth, set: setDepth, span: 1.5 },
        ]).map(({ label: lbl, key, value, set, span }) => {
          const range = fineSliderRange(value, span, 0.01, 20);
          return (
            <div key={key} className="pos-grid">
              <span className="pos-axis" style={{ color: 'var(--muted)' }}>{lbl}</span>
              <input
                type="range"
                className="pos-slider"
                min={range.min}
                max={range.max}
                step={key === 'height' ? 0.005 : 0.01}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="pos-num"
                step={key === 'height' ? 0.005 : 0.01}
                min={0.01}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value) || 0.01)}
              />
            </div>
          );
        })}
      </AccordionSection>

      <AccordionSection title={t('form.orientation')}>
        {([
          { label: 'X', axis: 'x' as const },
          { label: 'Y', axis: 'y' as const },
          { label: 'Z', axis: 'z' as const },
        ]).map(({ label: lbl, axis }) => {
          const range = fineSliderRange(rotation[axis], 45, -180, 180);
          return (
            <div key={axis} className="pos-grid">
              <span className="pos-axis" style={{ color: 'var(--muted)' }}>{lbl}</span>
              <input
                type="range"
                className="pos-slider"
                min={range.min}
                max={range.max}
                step={0.5}
                value={rotation[axis]}
                onChange={(e) => setRotation({ ...rotation, [axis]: parseFloat(e.target.value) })}
              />
              <input
                type="number"
                className="pos-num"
                step={0.5}
                value={rotation[axis]}
                onChange={(e) => setRotation({ ...rotation, [axis]: parseFloat(e.target.value) || 0 })}
              />
            </div>
          );
        })}
      </AccordionSection>

      <AccordionSection title={t('form.position')} defaultOpen>
        <div
          className={`placement-hint${open ? ' visible' : ''}`}
          dangerouslySetInnerHTML={{ __html: t('form.placementHintModel') }}
        />

        {([
          { label: 'X', color: '#f87171', babylonAxis: 'x' as const, span: 2 },
          { label: 'Z', color: '#4ade80', babylonAxis: 'y' as const, span: 0.8 },
          { label: 'Y', color: '#38bdf8', babylonAxis: 'z' as const, span: 2 },
        ]).map(({ label: lbl, color, babylonAxis, span }) => {
          const range = fineSliderRange(position[babylonAxis], span);
          return (
            <div key={babylonAxis} className="pos-grid">
              <span className="pos-axis" style={{ color }}>{lbl}</span>
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
      </AccordionSection>
    </FormPanel>
  );
});

export default ShadowWallForm;
