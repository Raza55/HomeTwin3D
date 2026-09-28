import { useState, useEffect, useCallback, useMemo } from 'react';
import ColorWheel, { hslToRgb } from './ColorWheel';
import { miredToKelvin } from '../utils/color';
import type { HAState, LightSceneOption } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import './LightModal.css';

interface Props {
  visible: boolean;
  entityId: string | null;
  label: string;
  state: HAState | null;
  onClose: () => void;
  onToggle: (entityId: string) => void;
  onBrightness: (entityId: string, brightness: number) => void;
  onColorTemp: (entityId: string, colorTempKelvin: number) => void;
  onColor: (entityId: string, color: { r: number; g: number; b: number }, brightness: number, hsColor?: { h: number; s: number }) => void;
  onWhiteChannel: (entityId: string, white: number) => void;
  onEffect: (entityId: string, effect: string) => void;
  onActivateScene: (entityId: string) => void;
  sceneOptions: LightSceneOption[];
  doubleTapEntityId?: string;
  doubleTapState?: HAState | null;
}

const DEFAULT_MIN_KELVIN = 2000;
const DEFAULT_MAX_KELVIN = 6500;
const COLOR_MODES = new Set(['hs', 'rgb', 'rgbw', 'rgbww', 'xy']);
const WHITE_CHANNEL_MODES = new Set(['white', 'rgbw', 'rgbww']);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rgbToHueSat([r, g, b]: [number, number, number]): { h: number; s: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d + 6) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  return { h: Math.round(h), s: Math.round(s) };
}

function supportedModes(state: HAState | null): string[] {
  const modes = state?.attributes.supported_color_modes;
  return Array.isArray(modes)
    ? modes.filter((m): m is string => typeof m === 'string').map((m) => m.toLowerCase())
    : [];
}

function modeSet(modes: string[]): Set<string> {
  return new Set(modes);
}

function hasAnyMode(modes: Set<string>, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (modes.has(candidate)) return true;
  }
  return false;
}

function supportsBrightnessFromModes(modes: string[]): boolean {
  // Home Assistant color modes except onoff/unknown imply a controllable level.
  return modes.some((mode) => mode !== 'onoff' && mode !== 'unknown');
}

function deriveLightSupport(state: HAState | null, modes: string[], effectCount: number) {
  const modesByName = modeSet(modes);
  if (modes.length > 0) {
    return {
      brightness: supportsBrightnessFromModes(modes),
      colorTemp: modesByName.has('color_temp'),
      color: hasAnyMode(modesByName, COLOR_MODES),
      whiteChannel: hasAnyMode(modesByName, WHITE_CHANNEL_MODES),
      effects: effectCount > 0,
    };
  }

  const attrs = state?.attributes;
  const colorMode = typeof attrs?.color_mode === 'string' ? attrs.color_mode.toLowerCase() : '';
  const hasState = !!state && state.state !== 'unavailable' && state.state !== 'unknown';

  // Fallback for older/limited integrations that do not expose supported_color_modes:
  // only show controls that are evidenced by actual HA attributes.
  return {
    brightness: hasState && typeof attrs?.brightness === 'number',
    colorTemp: !!(attrs?.color_temp || attrs?.color_temp_kelvin || colorMode === 'color_temp'),
    color: !!(attrs?.rgb_color || attrs?.hs_color || attrs?.xy_color || COLOR_MODES.has(colorMode)),
    whiteChannel: typeof attrs?.white_value === 'number' || WHITE_CHANNEL_MODES.has(colorMode),
    effects: effectCount > 0,
  };
}

export default function LightModal({
  visible,
  entityId,
  label,
  state,
  onClose,
  onToggle,
  onBrightness,
  onColorTemp,
  onColor,
  onWhiteChannel,
  onEffect,
  onActivateScene,
  sceneOptions,
  doubleTapEntityId,
  doubleTapState,
}: Props) {
  const t = useTranslation();
  const [brightness, setBrightness] = useState(255);
  const [colorTempKelvin, setColorTempKelvin] = useState(3000);
  const [whiteValue, setWhiteValue] = useState(0);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [whiteKelvin, setWhiteKelvin] = useState(4000);
  const [effect, setEffect] = useState('');
  const [isOn, setIsOn] = useState(false);
  const [dtIsOn, setDtIsOn] = useState(false);

  const modes = useMemo(() => supportedModes(state), [state]);
  const effectList = useMemo(() => {
    const list = state?.attributes.effect_list;
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
  }, [state]);

  const minKelvin = clamp(toNumber(state?.attributes.min_color_temp_kelvin) ?? DEFAULT_MIN_KELVIN, 1000, 10000);
  const maxKelvin = clamp(toNumber(state?.attributes.max_color_temp_kelvin) ?? DEFAULT_MAX_KELVIN, minKelvin, 12000);

  // Sync state when modal opens or state changes
  useEffect(() => {
    if (!state) return;
    setIsOn(state.state === 'on');
    const a = state.attributes;
    if (a.brightness !== undefined) setBrightness(clamp(a.brightness, 1, 255));
    const kelvin = toNumber(a.color_temp_kelvin) ?? (a.color_temp !== undefined ? miredToKelvin(a.color_temp) : null);
    if (kelvin) {
      const nextKelvin = clamp(kelvin, minKelvin, maxKelvin);
      setColorTempKelvin(nextKelvin);
      setWhiteKelvin(nextKelvin);
    }
    if (a.hs_color) {
      setHue(Math.round(a.hs_color[0]));
      setSaturation(Math.round(a.hs_color[1]));
    } else if (a.rgb_color) {
      const next = rgbToHueSat(a.rgb_color);
      setHue(next.h);
      setSaturation(next.s);
    }
    if (a.white_value !== undefined) setWhiteValue(clamp(a.white_value, 0, 255));
    if (typeof a.effect === 'string') setEffect(a.effect);
  }, [state, entityId, minKelvin, maxKelvin]);

  useEffect(() => {
    setDtIsOn(doubleTapState?.state === 'on');
  }, [doubleTapState]);

  const handleDoubleTapToggle = useCallback(() => {
    if (!doubleTapEntityId) return;
    onToggle(doubleTapEntityId);
    setDtIsOn((prev) => !prev);
  }, [doubleTapEntityId, onToggle]);

  const handleToggle = useCallback(() => {
    if (!entityId) return;
    onToggle(entityId);
    setIsOn((prev) => !prev);
  }, [entityId, onToggle]);

  const handleBrightness = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      setBrightness(val);
      if (entityId) onBrightness(entityId, val);
    },
    [entityId, onBrightness],
  );

  const handleTemp = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      setColorTempKelvin(val);
      setWhiteKelvin(val);
      if (entityId) onColorTemp(entityId, val);
    },
    [entityId, onColorTemp],
  );

  const handleWhite = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      setWhiteValue(val);
      if (entityId) onWhiteChannel(entityId, val);
    },
    [entityId, onWhiteChannel],
  );

  const handleHueChange = useCallback(
    (h: number) => {
      setHue(h);
      if (!entityId) return;
      const rgb = hslToRgb(h);
      onColor(entityId, rgb, brightness, { h, s: saturation });
    },
    [entityId, brightness, saturation, onColor],
  );

  const handleSaturation = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = parseInt(e.target.value);
      setSaturation(next);
      if (!entityId) return;
      const rgb = hslToRgb(hue);
      onColor(entityId, rgb, brightness, { h: hue, s: next });
    },
    [entityId, hue, brightness, onColor],
  );

  const handleWhiteKelvin = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const k = parseInt(e.target.value);
      setWhiteKelvin(k);
      if (!entityId) return;
      onColorTemp(entityId, k);
    },
    [entityId, onColorTemp],
  );

  const handleEffect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value;
      setEffect(next);
      if (entityId && next) onEffect(entityId, next);
    },
    [entityId, onEffect],
  );

  const handleScene = useCallback(
    (sceneId: string) => {
      onActivateScene(sceneId);
    },
    [onActivateScene],
  );

  const support = deriveLightSupport(state, modes, effectList.length);
  const showBrightness = support.brightness;
  const showTemp = support.colorTemp;
  const showColor = support.color;
  const showWhite = support.whiteChannel;
  const showEffects = support.effects;

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="light-modal">
        <div className="modal-header">
          <div className="modal-title">
            <div
              className="modal-bulb-icon"
              style={{
                background: isOn ? 'rgba(251,191,36,0.15)' : 'transparent',
                borderColor: isOn ? '#fbbf24' : '#334155',
              }}
            >
              &#128161;
            </div>
            <div>
              <div className="modal-entity-name">{label}</div>
              <div className="modal-entity-id">{entityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &#10005;
          </button>
        </div>

        <div className="modal-body">
          {/* Toggle */}
          <div className="modal-row">
            <span className="modal-label">{t('modal.power')}</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={isOn} onChange={handleToggle} />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </div>

          {/* Double-tap entity toggle */}
          {doubleTapEntityId && (
            <div className="modal-row">
              <span className="modal-label">{doubleTapEntityId.split('.')[1]?.replace(/_/g, ' ') || doubleTapEntityId}</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={dtIsOn} onChange={handleDoubleTapToggle} />
                <div className="toggle-track" />
                <div className="toggle-thumb" />
              </label>
            </div>
          )}

          {/* Brightness */}
          {showBrightness && (
            <div className="modal-slider-wrap">
              <div className="slider-header">
                <span className="modal-label">{t('modal.brightness')}</span>
                <span className="slider-value">
                  {Math.round((brightness / 255) * 100)}%
                </span>
              </div>
              <input
                type="range"
                className="modal-slider brightness"
                min={1}
                max={255}
                value={brightness}
                onChange={handleBrightness}
              />
            </div>
          )}

          {/* Color temp */}
          {showTemp && (
            <div className="modal-slider-wrap">
              <div className="slider-header">
                <span className="modal-label">{t('modal.temperature')}</span>
                <span className="slider-value">
                  {colorTempKelvin}K
                </span>
              </div>
              <input
                type="range"
                className="modal-slider warmcold"
                min={minKelvin}
                max={maxKelvin}
                value={colorTempKelvin}
                onChange={handleTemp}
              />
            </div>
          )}

          {/* Hue ring */}
          {showColor && (
            <div className="color-section">
              <span className="modal-label">{t('modal.color')}</span>
              <div className="hue-ring-wrap">
                <ColorWheel hue={hue} onChange={handleHueChange} />
              </div>
              <div className="modal-slider-wrap">
                <div className="slider-header">
                  <span className="modal-label">{t('modal.saturation')}</span>
                  <span className="slider-value">{saturation}%</span>
                </div>
                <input
                  type="range"
                  className="modal-slider saturation"
                  min={0}
                  max={100}
                  value={saturation}
                  onChange={handleSaturation}
                />
              </div>
              <div className="modal-slider-wrap">
                <div className="slider-header">
                  <span className="modal-label">{t('modal.whiteTone')}</span>
                  <span className="slider-value">{whiteKelvin}K</span>
                </div>
                <input
                  type="range"
                  className="modal-slider warmcold"
                  min={minKelvin}
                  max={maxKelvin}
                  value={whiteKelvin}
                  onChange={handleWhiteKelvin}
                />
              </div>
            </div>
          )}

          {/* White channel */}
          {showWhite && (
            <div className="modal-slider-wrap">
              <span className="modal-label">{t('modal.whiteChannel')}</span>
              <div className="slider-header">
                <span className="modal-label" style={{ opacity: 0 }}>
                  &zwnj;
                </span>
                <span className="slider-value">
                  {Math.round((whiteValue / 255) * 100)}%
                </span>
              </div>
              <input
                type="range"
                className="modal-slider white"
                min={0}
                max={255}
                value={whiteValue}
                onChange={handleWhite}
              />
            </div>
          )}

          {showEffects && (
            <div className="modal-slider-wrap">
              <span className="modal-label">{t('modal.effect')}</span>
              <select className="modal-select" value={effect} onChange={handleEffect}>
                <option value="">{t('common.none')}</option>
                {effectList.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          )}

          {sceneOptions.length > 0 && (
            <div className="scene-section">
              <span className="modal-label">{t('modal.scenes')}</span>
              <div className="scene-chip-grid">
                {sceneOptions.map((scene) => (
                  <button
                    key={scene.entityId}
                    className="scene-chip"
                    type="button"
                    title={`${t('modal.activateScene')}: ${scene.entityId}`}
                    onClick={() => handleScene(scene.entityId)}
                  >
                    {scene.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
