// Modified for HomeTwin3D: project repository link. See ORIGIN.md.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Palette, Box, Wrench, ChevronLeft, ChevronRight, X,
  LayoutTemplate, Compass, Github, Upload, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { haSocketUrl, type HAConnectionStatus } from '../services/haWebSocket';
import type { HASettings } from '../types';
import SharedInstallationSettings from './SharedInstallationSettings';
import { getConfig, getModelBlob, resetConfig, updateConfig, exportBackup, importBackup, uploadModel, restoreModel } from '../services/configApi';
import { clearSettings, getSetting, getSettings, updateSettings, DEFAULT_CAMERA_SENSITIVITY, type CameraSensitivity } from '../services/settingsStore';
import { MODEL_SCALE_MAX, MODEL_SCALE_MIN, normalizeModelScale } from '../babylon/SceneScale';
import { useDemoMode } from '../contexts/DemoModeContext';
import { useCameraControls, type CameraControlsFlags } from '../contexts/CameraControlsContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  useTheme,
  BG_DARK, BG_LIGHT,
  PRIMARY_ACCENTS,
  PANEL_BG_DARK, PANEL_BG_LIGHT,
} from '../contexts/ThemeContext';
import './SettingsModal.css';
import FloorplanEntities from './FloorplanEntities';
import { detectKiosk, type KioskSetting } from '../services/kioskMode';

declare const __HOMETWIN_BUILD__: string;

type Section = 'main' | 'connection' | 'appearance' | 'view' | 'setup';

interface Props {
  open: boolean;
  onClose: () => void;

  /* Sun preview */
  sliderValue: number;
  scrubberTime: string;
  sunLiveMode: boolean;
  onSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLiveClick: () => void;

  /* North offset */
  northOffset: number;
  onNorthOffsetChange: (degrees: number) => void;

  /* Edges */
  edgeWidth: number;
  onEdgeWidthChange: (width: number) => void;
  edgeMode: 'classic' | 'enhanced';
  onEdgeModeChange: (mode: 'classic' | 'enhanced') => void;

  groundGrid: boolean;
  onGroundGridChange: (enabled: boolean) => void;
  weatherEnabled: boolean;
  onWeatherEnabledChange: (enabled: boolean) => void;
  /** Minimum outdoor (park) brightness in percent. */
  parkMinBrightness: number;
  onParkMinBrightnessChange: (percent: number) => void;
  cameraSensitivity: CameraSensitivity;
  onCameraSensitivityChange: (patch: Partial<CameraSensitivity>) => void;
  perspective: boolean;
  onPerspectiveChange: (enabled: boolean) => void;

  /* Shadow resolution (set together as one quality level) */
  sunShadowRes: number;
  onSunShadowResChange: (res: number) => void;
  pointShadowRes: number;
  onPointShadowResChange: (res: number) => void;

  /* Sketch look (only without textures; textures switch in the toolbar) */
  showTextures: boolean;
  sketchColor: string;
  onSketchColorChange: (color: string) => void;
  sketchSpecular: number;
  onSketchSpecularChange: (value: number) => void;

  onEditGrid: () => void;
  onChangeHomeView: () => void;
  onStartTour: () => void;

  haSettings: HASettings;
  onHASettingsSave: (settings: HASettings) => void;
  haStatus: HAConnectionStatus;

  modelStatus: string;
  modelStatusColor?: string;
  onReloadModel: () => void;
  onStartVisualMatching?: (category?: 'light' | 'other') => void;
}

const SECTIONS: { key: Exclude<Section, 'main'>; labelKey: string; hintKey: string; icon: typeof Server }[] = [
  { key: 'connection', labelKey: 'settings.connection', hintKey: 'settings.connectionHint', icon: Server },
  { key: 'appearance', labelKey: 'settings.appearance', hintKey: 'settings.appearanceHint', icon: Palette },
  { key: 'view', labelKey: 'settings.view3d', hintKey: 'settings.view3dHint', icon: Box },
  { key: 'setup', labelKey: 'settings.setup', hintKey: 'settings.setupHint', icon: Wrench },
];

/** Shadow quality levels: sun and lamp shadow map sizes set together. */
const SHADOW_LEVELS = [
  { key: 'off', sun: 0, point: 0 },
  { key: 'low', sun: 512, point: 256 },
  { key: 'medium', sun: 1024, point: 512 },
  { key: 'high', sun: 2048, point: 1024 },
] as const;

function shadowLevelOf(sun: number): (typeof SHADOW_LEVELS)[number]['key'] {
  if (sun <= 0) return 'off';
  let best: (typeof SHADOW_LEVELS)[number] = SHADOW_LEVELS[1];
  for (const level of SHADOW_LEVELS) if (level.sun > 0 && Math.abs(level.sun - sun) < Math.abs(best.sun - sun)) best = level;
  return best.key;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── small building blocks ── */

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3 className="settings-group-title">{title}</h3>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}

/** Label left, control right; `stacked` puts wide controls below the label. */
function Row({ label, hint, children, stacked, htmlFor }: { label: string; hint?: string; children: ReactNode; stacked?: boolean; htmlFor?: string }) {
  return (
    <div className={`settings-row${stacked ? ' stacked' : ''}`}>
      <div className="settings-row-text">
        {htmlFor ? <label className="settings-row-label" htmlFor={htmlFor}>{label}</label> : <span className="settings-row-label">{label}</span>}
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className="settings-switch" onClick={() => onChange(!checked)}>
      <span className="settings-switch-knob" />
    </button>
  );
}

function Segmented<T extends string | number>({ value, options, onChange, label, tone }: {
  value: T; options: { value: T; label: string }[]; onChange: (next: T) => void; label: string; tone?: (v: T) => string | undefined;
}) {
  return (
    <div className="settings-segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button key={String(option.value)} type="button" aria-pressed={value === option.value}
          className={`settings-segment${value === option.value ? ` active ${tone?.(option.value) ?? ''}` : ''}`}
          onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ colors, value, onChange, label }: { colors: { hex: string; label: string }[]; value: string; onChange: (hex: string) => void; label: string }) {
  return (
    <div className="settings-swatch-row" role="group" aria-label={label}>
      {colors.map(({ hex, label: name }) => (
        <button key={hex} type="button" className={`settings-swatch${value === hex ? ' active' : ''}`}
          style={{ background: hex }} title={name} aria-label={name} aria-pressed={value === hex}
          onClick={() => onChange(hex)} />
      ))}
    </div>
  );
}

export default function SettingsModal({
  open, onClose,
  sliderValue, scrubberTime, sunLiveMode, onSliderChange, onLiveClick,
  northOffset, onNorthOffsetChange,
  edgeWidth, onEdgeWidthChange, edgeMode, onEdgeModeChange,
  groundGrid, onGroundGridChange, weatherEnabled, onWeatherEnabledChange, perspective, onPerspectiveChange,
  parkMinBrightness, onParkMinBrightnessChange, cameraSensitivity, onCameraSensitivityChange,
  sunShadowRes, onSunShadowResChange, onPointShadowResChange,
  showTextures, sketchColor, onSketchColorChange, sketchSpecular, onSketchSpecularChange,
  onEditGrid, onChangeHomeView, onStartTour,
  haSettings, onHASettingsSave, haStatus,
  modelStatus, modelStatusColor, onReloadModel, onStartVisualMatching,
}: Props) {
  const navigate = useNavigate();
  const titleId = useId();
  const { demoMode, setDemoMode } = useDemoMode();
  const { desktop, mobile, toggleDesktop, toggleMobile } = useCameraControls();
  const { theme, resolved, setTheme, refreshAppearance } = useTheme();
  const { language, languages, setLanguage, t } = useLanguage();

  const [section, setSection] = useState<Section>('main');
  const [confirmReset, setConfirmReset] = useState(false);
  const [haUrl, setHaUrl] = useState(haSettings.url);
  const [haPort, setHaPort] = useState(haSettings.port);
  const [haToken, setHaToken] = useState(haSettings.token);
  const [haSaveStatus, setHaSaveStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const importInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [modelReplaceStatus, setModelReplaceStatus] = useState<'idle' | 'applying' | 'restoring' | 'success' | 'error'>('idle');
  const [selectedModelFile, setSelectedModelFile] = useState<File | null>(null);
  const [modelScaleValue, setModelScaleValue] = useState('1');
  const [modelScaleStatus, setModelScaleStatus] = useState<'idle' | 'applying' | 'success' | 'error'>('idle');
  const previousModelRef = useRef<Blob | null>(null);
  const previousFullConfigRef = useRef<ReturnType<typeof getConfig> | null>(null);
  const modelReloadSeenRef = useRef(false);
  const scaleReloadSeenRef = useRef(false);
  const [homeViewReset, setHomeViewReset] = useState<'idle' | 'done'>('idle');
  const bodyRef = useRef<HTMLDivElement>(null);

  // Appearance state
  const [bgColor, setBgColor] = useState(() => getSettings().appearance.bgColor);
  const [primaryAccent, setPrimaryAccent] = useState(() => getSettings().appearance.primaryAccent);
  const [panelOpacity, setPanelOpacity] = useState(() => getSettings().appearance.panelOpacity);
  const [panelBgColor, setPanelBgColor] = useState(() => getSettings().appearance.panelBgColor);
  const [hudVisible, setHudVisible] = useState(() => getSettings().appearance.hudVisible);
  const [kioskMode, setKioskMode] = useState<KioskSetting>(() => getSettings().appearance.kioskMode ?? 'auto');

  const updateAppearance = useCallback((patch: Record<string, unknown>) => {
    updateSettings('appearance', patch as any);
    refreshAppearance();
  }, [refreshAppearance]);

  // When theme (dark/light) changes, map colors by index to the new palette
  useEffect(() => {
    const fromBg = resolved === 'dark' ? BG_LIGHT : BG_DARK;
    const toBg = resolved === 'dark' ? BG_DARK : BG_LIGHT;
    const fromPanel = resolved === 'dark' ? PANEL_BG_LIGHT : PANEL_BG_DARK;
    const toPanel = resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT;

    const bgIdx = Math.max(0, fromBg.findIndex(c => c.hex === bgColor));
    const panelIdx = Math.max(0, fromPanel.findIndex(c => c.hex === panelBgColor));
    const newBg = toBg[bgIdx]?.hex ?? toBg[0].hex;
    const newPanel = toPanel[panelIdx]?.hex ?? toPanel[0].hex;

    setBgColor(newBg);
    setPanelBgColor(newPanel);
    updateSettings('appearance', { bgColor: newBg, panelBgColor: newPanel });
  }, [resolved]);

  // Reset to main page when modal opens
  useEffect(() => {
    if (!open) return;
    setSection('main');
    setConfirmReset(false);
    setModelScaleValue(String(normalizeModelScale(getConfig().model?.scale)));
    setModelReplaceStatus('idle');
    setSelectedModelFile(null);
    setModelScaleStatus('idle');
  }, [open]);

  // Each page starts at the top.
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [section]);

  useEffect(() => {
    if (modelReplaceStatus === 'applying' || modelReplaceStatus === 'restoring') {
      if (modelStatus === 'loading') {
        modelReloadSeenRef.current = true;
        return;
      }
      if (!modelReloadSeenRef.current) return;

      if (modelStatus === 'ready') {
        if (modelReplaceStatus === 'restoring') {
          setModelReplaceStatus('error');
        } else {
          setModelReplaceStatus('success');
          setSelectedModelFile(null);
        }
        modelReloadSeenRef.current = false;
      } else if (modelStatus === 'failed' && modelReplaceStatus === 'applying') {
        const restorePreviousModel = async () => {
          setModelReplaceStatus('restoring');
          modelReloadSeenRef.current = false;
          try {
            if (previousFullConfigRef.current) await restoreModel(previousModelRef.current, previousFullConfigRef.current);
            onReloadModel();
          } catch {
            setModelReplaceStatus('error');
          }
        };
        void restorePreviousModel();
      } else if (modelStatus === 'failed' && modelReplaceStatus === 'restoring') {
        setModelReplaceStatus('error');
        modelReloadSeenRef.current = false;
      }
    }
  }, [modelReplaceStatus, modelStatus, onReloadModel]);

  useEffect(() => {
    if (modelScaleStatus !== 'applying') return;
    if (modelStatus === 'loading') {
      scaleReloadSeenRef.current = true;
      return;
    }
    if (!scaleReloadSeenRef.current) return;
    setModelScaleStatus(modelStatus === 'ready' ? 'success' : 'error');
    scaleReloadSeenRef.current = false;
  }, [modelScaleStatus, modelStatus]);

  useEffect(() => {
    setHaUrl(haSettings.url);
    setHaPort(haSettings.port);
    setHaToken(haSettings.token);
  }, [haSettings.url, haSettings.port, haSettings.token]);

  const handleHASave = useCallback(() => {
    if (!haUrl || !haToken) return;
    setHaSaveStatus('testing');

    const resetError = () => setTimeout(() => setHaSaveStatus('idle'), 3000);
    let ws: WebSocket;
    try {
      ws = new WebSocket(haSocketUrl(haUrl, haPort));
    } catch {
      setHaSaveStatus('error');
      resetError();
      return;
    }

    const timeout = setTimeout(() => {
      ws.close();
      setHaSaveStatus('error');
      resetError();
    }, 5000);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: haToken }));
      } else if (msg.type === 'auth_ok') {
        clearTimeout(timeout);
        ws.close();
        setHaSaveStatus('success');
        onHASettingsSave({ url: haUrl, port: haPort, token: haToken });
        setTimeout(() => setHaSaveStatus('idle'), 2000);
      } else if (msg.type === 'auth_invalid') {
        clearTimeout(timeout);
        ws.close();
        setHaSaveStatus('error');
        resetError();
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      setHaSaveStatus('error');
      resetError();
    };
  }, [haUrl, haPort, haToken, onHASettingsSave]);

  const compassRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const angleFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = compassRef.current;
    if (!svg) return northOffset;
    const rect = svg.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (deg < 0) deg += 360;
    return Math.round(deg);
  }, [northOffset]);

  const handleCompassPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    onNorthOffsetChange(angleFromEvent(e));
  }, [angleFromEvent, onNorthOffsetChange]);

  const handleCompassPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    onNorthOffsetChange(angleFromEvent(e));
  }, [angleFromEvent, onNorthOffsetChange]);

  const handleCompassPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleApplyModelScale = useCallback(() => {
    try {
      const cfg = getConfig();
      const nextScale = normalizeModelScale(modelScaleValue);
      setModelScaleValue(String(nextScale));
      updateConfig({
        model: {
          ...cfg.model,
          scale: nextScale,
          objectOverrides: cfg.model?.objectOverrides ?? [],
        },
      });
      scaleReloadSeenRef.current = false;
      setModelScaleStatus('applying');
      onReloadModel();
    } catch {
      setModelScaleStatus('error');
      setTimeout(() => setModelScaleStatus('idle'), 3000);
    }
  }, [modelScaleValue, onReloadModel]);

  const handleReplaceModel = useCallback(async () => {
    if (!selectedModelFile) return;
    try {
      const cfg = getConfig();
      previousModelRef.current = await getModelBlob();
      previousFullConfigRef.current = cfg;
      await uploadModel(selectedModelFile);
      updateConfig({
        model: {
          ...getConfig().model,
          scale: normalizeModelScale(cfg.model?.scale),
          objectOverrides: [],
        },
      });
      modelReloadSeenRef.current = false;
      setModelReplaceStatus('applying');
      onReloadModel();
    } catch {
      setModelReplaceStatus('error');
      setTimeout(() => setModelReplaceStatus('idle'), 3000);
    }
  }, [onReloadModel, selectedModelFile]);

  if (!open) return null;

  const haState = demoMode ? 'demo' : haStatus === 'auth_error' || haStatus === 'error' ? 'error' : haStatus === 'connected' ? 'ok' : 'pending';
  const haStateText = demoMode ? t('settings.demoActive')
    : haStatus === 'connected' ? t('common.connected')
      : haStatus === 'auth_error' ? t('settings.authError')
        : haStatus === 'error' ? t('common.failed')
          : t('settings.reconnecting');
  const modelBusy = modelReplaceStatus === 'applying' || modelReplaceStatus === 'restoring';
  const shadowLevel = shadowLevelOf(sunShadowRes);
  const cameraItems: { key: keyof CameraControlsFlags; label: string }[] = [
    { key: 'zoom', label: t('settings.zoom') },
    { key: 'rotate', label: t('settings.rotate') },
    { key: 'pan', label: t('settings.pan') },
  ];
  const sectionTitle = section === 'main' ? t('settings.title') : t(SECTIONS.find(s => s.key === section)!.labelKey);

  return (
    <div className="settings-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="settings-header">
          {section !== 'main' && (
            <button type="button" className="settings-icon-btn" onClick={() => setSection('main')} aria-label={t('common.back')}>
              <ChevronLeft size={20} />
            </button>
          )}
          <h2 className="settings-title" id={titleId}>{sectionTitle}</h2>
          <button type="button" className="settings-icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-body" ref={bodyRef} key={section}>
          {section === 'main' && (
            <div className="settings-page">
              <nav className="settings-nav">
                {SECTIONS.map(({ key, labelKey, hintKey, icon: Icon }) => (
                  <button key={key} type="button" className="settings-nav-item" onClick={() => setSection(key)}>
                    <span className="settings-nav-icon"><Icon size={18} strokeWidth={1.6} /></span>
                    <span className="settings-nav-text">
                      <span className="settings-nav-label">{t(labelKey)}</span>
                      <span className="settings-nav-hint">{t(hintKey)}</span>
                    </span>
                    {key === 'connection' && <span className={`settings-status-dot ${haState}`} title={haStateText} />}
                    <ChevronRight size={16} className="settings-nav-chevron" />
                  </button>
                ))}
              </nav>

              <div className="settings-quick-actions">
                <button type="button" className="settings-btn" onClick={() => { onEditGrid(); onClose(); }}>
                  <LayoutTemplate size={16} strokeWidth={1.6} />
                  {t('settings.editGrid')}
                </button>
                <button type="button" className="settings-btn" onClick={onStartTour}>
                  <Compass size={16} strokeWidth={1.6} />
                  {t('settings.startTour')}
                </button>
              </div>

              <footer className="settings-about">
                <a href="https://github.com/Raza55/HomeTwin3D" target="_blank" rel="noopener noreferrer">
                  <Github size={14} strokeWidth={1.6} /> HomeTwin3D
                </a>
                <span>Apache-2.0</span>
                <span>{t('settings.build', { build: typeof __HOMETWIN_BUILD__ === 'string' ? __HOMETWIN_BUILD__ : 'dev' })}</span>
              </footer>
            </div>
          )}

          {section === 'connection' && (
            <div className="settings-page">
              <div className={`settings-banner ${haState}`} role="status">
                <span className={`settings-status-dot ${haState}`} />
                {haStateText}
              </div>

              <Group title={t('settings.mode')}>
                <Row label={t('settings.dataSource')} hint={demoMode ? t('settings.demoHint') : t('settings.liveHint')}>
                  <Segmented label={t('settings.mode')} value={demoMode ? 'demo' : 'live'}
                    options={[{ value: 'live', label: t('settings.live') }, { value: 'demo', label: t('settings.demo') }]}
                    tone={v => v === 'demo' ? 'warn' : 'ok'}
                    onChange={v => setDemoMode(v === 'demo')} />
                </Row>
              </Group>

              <Group title={t('settings.homeAssistant')}>
                <div className="settings-fields">
                  <div className="settings-field-row">
                    <div className="settings-field grow">
                      <label htmlFor="settings-ha-url">{t('settings.url')}</label>
                      <input id="settings-ha-url" className="settings-input" type="text" placeholder="homeassistant.local" value={haUrl} onChange={(e) => setHaUrl(e.target.value)} />
                    </div>
                    <div className="settings-field port">
                      <label htmlFor="settings-ha-port">{t('settings.port')}</label>
                      <input id="settings-ha-port" className="settings-input" type="number" value={haPort} onChange={(e) => setHaPort(parseInt(e.target.value) || 8123)} />
                    </div>
                  </div>
                  <div className="settings-field">
                    <label htmlFor="settings-ha-token">{t('settings.token')}</label>
                    <input id="settings-ha-token" className="settings-input" type="password" placeholder="eyJhbGci..." value={haToken} onChange={(e) => setHaToken(e.target.value)} />
                  </div>
                  <button
                    type="button"
                    className={`settings-btn primary${haSaveStatus === 'success' ? ' ok' : haSaveStatus === 'error' ? ' err' : ''}`}
                    disabled={!haUrl || !haToken || haSaveStatus === 'testing'}
                    onClick={handleHASave}
                  >
                    {haSaveStatus === 'testing' ? t('common.testing')
                      : haSaveStatus === 'success' ? `✓ ${t('common.connected')}`
                        : haSaveStatus === 'error' ? `✗ ${t('common.failed')}`
                          : t('settings.testAndSave')}
                  </button>
                </div>
              </Group>
            </div>
          )}

          {section === 'appearance' && (
            <div className="settings-page">
              <Group title={t('settings.design')}>
                <Row label={t('settings.theme')} stacked>
                  <Segmented label={t('settings.theme')} value={theme}
                    options={[
                      { value: 'dark', label: t('settings.dark') },
                      { value: 'light', label: t('settings.light') },
                      { value: 'auto', label: t('settings.dayNight') },
                      { value: 'system', label: t('settings.systemTheme') },
                    ]}
                    onChange={setTheme} />
                </Row>
                <Row label={t('settings.language')}>
                  <Segmented label={t('settings.language')} value={language}
                    options={languages.map(lang => ({ value: lang, label: t(`language.${lang}`) }))}
                    onChange={setLanguage} />
                </Row>
                <Row label={t('settings.kiosk')} hint={`${t('settings.kioskHint')} ${detectKiosk() ? t('settings.kioskDetected') : t('settings.kioskNotDetected')}`} stacked>
                  <Segmented label={t('settings.kiosk')} value={kioskMode}
                    options={[
                      { value: 'auto', label: t('settings.kioskAuto') },
                      { value: 'on', label: t('common.on') },
                      { value: 'off', label: t('common.off') },
                    ]}
                    onChange={v => { setKioskMode(v); updateAppearance({ kioskMode: v }); }} />
                </Row>
                <Row label={t('settings.hud')} hint={t('settings.hudHint')}>
                  <Switch label={t('settings.hud')} checked={hudVisible} onChange={v => { setHudVisible(v); updateAppearance({ hudVisible: v }); }} />
                </Row>
              </Group>

              <Group title={t('settings.colors')}>
                <Row label={t('settings.primaryAccent')} stacked>
                  <Swatches label={t('settings.primaryAccent')} colors={PRIMARY_ACCENTS} value={primaryAccent || PRIMARY_ACCENTS[0].hex}
                    onChange={hex => { setPrimaryAccent(hex); updateAppearance({ primaryAccent: hex }); }} />
                </Row>
                <Row label={t('settings.background')} stacked>
                  <Swatches label={t('settings.background')} colors={resolved === 'dark' ? BG_DARK : BG_LIGHT}
                    value={bgColor || (resolved === 'dark' ? BG_DARK : BG_LIGHT)[0].hex}
                    onChange={hex => { setBgColor(hex); updateAppearance({ bgColor: hex }); }} />
                </Row>
                <Row label={t('settings.panelBackground')} stacked>
                  <Swatches label={t('settings.panelBackground')} colors={resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT}
                    value={panelBgColor || (resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT)[0].hex}
                    onChange={hex => { setPanelBgColor(hex); updateAppearance({ panelBgColor: hex }); }} />
                </Row>
                <Row label={t('settings.sidePanelOpacity')} stacked htmlFor="settings-panel-opacity">
                  <div className="settings-slider">
                    <input id="settings-panel-opacity" type="range" min={20} max={100} step={5} value={panelOpacity}
                      onChange={(e) => { const v = parseInt(e.target.value); setPanelOpacity(v); updateAppearance({ panelOpacity: v }); }} />
                    <output>{panelOpacity}%</output>
                  </div>
                </Row>
              </Group>
            </div>
          )}

          {section === 'view' && (
            <div className="settings-page">
              <Group title={t('settings.quality')}>
                <Row label={t('settings.shadows')} hint={t('settings.shadowsHint')} stacked>
                  <Segmented label={t('settings.shadows')} value={shadowLevel}
                    options={SHADOW_LEVELS.map(level => ({ value: level.key, label: t(`settings.shadowLevel.${level.key}`) }))}
                    onChange={key => {
                      const level = SHADOW_LEVELS.find(l => l.key === key)!;
                      onSunShadowResChange(level.sun);
                      onPointShadowResChange(level.point);
                    }} />
                </Row>
                <Row label={t('settings.weatherEffects')} hint={t('settings.weatherEffectsHint')}>
                  <Switch label={t('settings.weatherEffects')} checked={weatherEnabled} onChange={onWeatherEnabledChange} />
                </Row>
                <Row label={t('settings.parkMinBrightness')} hint={t('settings.parkMinBrightnessHint')} stacked htmlFor="settings-park-brightness">
                  <div className="settings-slider">
                    <input id="settings-park-brightness" type="range" min={0} max={100} step={5} value={parkMinBrightness}
                      onChange={(e) => onParkMinBrightnessChange(parseInt(e.target.value))} />
                    <output>{parkMinBrightness === 0 ? t('common.off') : `${parkMinBrightness}%`}</output>
                  </div>
                </Row>
                <Row label={t('settings.groundGrid')}>
                  <Switch label={t('settings.groundGrid')} checked={groundGrid} onChange={onGroundGridChange} />
                </Row>
                <Row label={t('settings.perspective')} hint={t('settings.perspectiveHint')}>
                  <Switch label={t('settings.perspective')} checked={perspective} onChange={onPerspectiveChange} />
                </Row>
              </Group>

              <Group title={t('settings.look')}>
                <Row label={t('settings.edgeMode')}>
                  <Segmented label={t('settings.edgeMode')} value={edgeMode}
                    options={[{ value: 'classic', label: t('settings.classic') }, { value: 'enhanced', label: t('settings.enhanced') }]}
                    onChange={onEdgeModeChange} />
                </Row>
                {showTextures ? (
                  <p className="settings-note">{t('settings.sketchOptionsHint')}</p>
                ) : (
                  <>
                    <Row label={t('settings.edgeWidth')} stacked htmlFor="settings-edge-width">
                      <div className="settings-slider">
                        <input id="settings-edge-width" type="range" min={0} max={5} step={0.1} value={edgeWidth} onChange={(e) => onEdgeWidthChange(parseFloat(e.target.value))} />
                        <output>{edgeWidth.toFixed(1)}</output>
                      </div>
                    </Row>
                    <Row label={t('settings.sketchColor')} htmlFor="settings-sketch-color">
                      <input id="settings-sketch-color" type="color" className="settings-color-input" value={sketchColor} onChange={(e) => onSketchColorChange(e.target.value)} />
                    </Row>
                    <Row label={t('settings.sheen')} stacked htmlFor="settings-sheen">
                      <div className="settings-slider">
                        <input id="settings-sheen" type="range" min={0} max={1} step={0.05} value={sketchSpecular} onChange={(e) => onSketchSpecularChange(parseFloat(e.target.value))} />
                        <output>{sketchSpecular.toFixed(2)}</output>
                      </div>
                    </Row>
                  </>
                )}
              </Group>

              <Group title={t('settings.sunPreview')}>
                <Row label={t('settings.sunPosition')} hint={t('settings.sunPreviewHint')} stacked htmlFor="settings-sun">
                  <div className="settings-slider">
                    <input id="settings-sun" type="range" min={0} max={1439} step={1} value={sliderValue} onChange={onSliderChange} />
                    <output>{scrubberTime}</output>
                    <button type="button" className={`settings-chip${sunLiveMode ? ' active' : ''}`} onClick={onLiveClick} aria-pressed={sunLiveMode}>
                      {t('settings.now')}
                    </button>
                  </div>
                </Row>
              </Group>

              <Group title={t('settings.cameraControls')}>
                <div className="settings-cam-table" role="table" aria-label={t('settings.cameraControls')}>
                  <div className="settings-cam-head" role="row">
                    <span role="columnheader" />
                    <span role="columnheader">{t('settings.mouse')}</span>
                    <span role="columnheader">{t('settings.touch')}</span>
                  </div>
                  {cameraItems.map(({ key, label }) => (
                    <div className="settings-cam-line" role="row" key={key}>
                      <span role="rowheader">{label}</span>
                      <span role="cell"><Switch label={t('settings.desktopTitle', { control: label })} checked={desktop[key]} onChange={() => toggleDesktop(key)} /></span>
                      <span role="cell"><Switch label={t('settings.mobileTitle', { control: label })} checked={mobile[key]} onChange={() => toggleMobile(key)} /></span>
                    </div>
                  ))}
                </div>
                <div className="settings-subhead">{t('settings.sensitivity.title')}</div>
                {(['rotate', 'tilt', 'zoom', 'pan'] as const).map(key => (
                  <Row key={key} label={t(`settings.sensitivity.${key}`)} hint={t(`settings.sensitivity.${key}Hint`)} stacked htmlFor={`settings-sensitivity-${key}`}>
                    <div className="settings-slider">
                      <input id={`settings-sensitivity-${key}`} type="range" min={25} max={300} step={5} value={cameraSensitivity[key]}
                        onChange={(e) => onCameraSensitivityChange({ [key]: parseInt(e.target.value) })} />
                      <output>{cameraSensitivity[key]}%</output>
                    </div>
                  </Row>
                ))}
                {(Object.keys(DEFAULT_CAMERA_SENSITIVITY) as (keyof CameraSensitivity)[]).some(k => cameraSensitivity[k] !== DEFAULT_CAMERA_SENSITIVITY[k]) && (
                  <div className="settings-actions">
                    <button type="button" className="settings-btn" onClick={() => onCameraSensitivityChange(DEFAULT_CAMERA_SENSITIVITY)}>
                      {t('settings.sensitivity.reset')}
                    </button>
                  </div>
                )}
                <Row label={t('settings.homeView')} hint={t('settings.homeViewHint')} stacked>
                  <div className="settings-actions">
                    <button type="button" className="settings-btn" onClick={() => { onChangeHomeView(); onClose(); }}>
                      {t('settings.changeHomeView')}
                    </button>
                    {(getSetting('controls').homeView || getConfig().homeView || homeViewReset === 'done') && (
                      <button
                        type="button"
                        className={`settings-btn${homeViewReset === 'done' ? ' ok' : ' danger'}`}
                        disabled={homeViewReset === 'done'}
                        onClick={() => {
                          updateSettings('controls', { homeView: null });
                          updateConfig({ homeView: undefined });
                          setHomeViewReset('done');
                          setTimeout(() => setHomeViewReset('idle'), 1500);
                        }}
                      >
                        {homeViewReset === 'done' ? `✓ ${t('common.reset')}` : t('common.reset')}
                      </button>
                    )}
                  </div>
                </Row>
              </Group>
            </div>
          )}

          {section === 'setup' && (
            <div className="settings-page">
              <Group title={t('settings.assignDevices')}>
                <FloorplanEntities onStartVisualMatching={onStartVisualMatching} onApply={onReloadModel} disabled={modelBusy} />
              </Group>

              <Group title={t('settings.model3d')}>
                <div className="settings-banner" role="status">
                  <span className={`settings-status-dot status-${modelStatus}`} style={modelStatusColor ? { backgroundColor: modelStatusColor } : undefined} />
                  {t('settings.currentModel')}: <strong>{t(`settings.modelStatus.${modelStatus}`)}</strong>
                </div>
                <button type="button" className="settings-model-picker" disabled={modelBusy} onClick={() => modelInputRef.current?.click()}>
                  <Upload size={18} strokeWidth={1.5} />
                  <span>
                    <strong>{selectedModelFile ? selectedModelFile.name : t('settings.chooseGlb')}</strong>
                    <small>{selectedModelFile ? t('settings.fileSize', { size: formatFileSize(selectedModelFile.size) }) : t('settings.glbOnly')}</small>
                  </span>
                </button>
                <input
                  ref={modelInputRef}
                  type="file"
                  accept=".glb,model/gltf-binary"
                  className="settings-hidden-input"
                  onChange={(e) => {
                    setSelectedModelFile(e.target.files?.[0] ?? null);
                    setModelReplaceStatus('idle');
                    e.target.value = '';
                  }}
                />
                {selectedModelFile && (
                  <div className="settings-model-confirm">
                    {(getConfig().model?.objectOverrides?.length ?? 0) > 0 && (
                      <div className="settings-model-warning">
                        <AlertTriangle size={16} strokeWidth={1.5} />
                        <span>{t('settings.replaceModelWarning', { count: getConfig().model?.objectOverrides?.length ?? 0 })}</span>
                      </div>
                    )}
                    <div className="settings-actions">
                      <button type="button" className="settings-btn" disabled={modelBusy} onClick={() => setSelectedModelFile(null)}>
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        className={`settings-btn primary${modelReplaceStatus === 'success' ? ' ok' : modelReplaceStatus === 'error' ? ' err' : ''}`}
                        disabled={modelBusy}
                        onClick={handleReplaceModel}
                      >
                        {modelReplaceStatus === 'applying' ? <><RefreshCw className="settings-spin" size={15} /> {t('settings.reloadingModel')}</>
                          : modelReplaceStatus === 'restoring' ? <><RefreshCw className="settings-spin" size={15} /> {t('settings.restoringModel')}</>
                            : t('settings.replaceNow')}
                      </button>
                    </div>
                  </div>
                )}
                {modelReplaceStatus === 'success' && <div className="settings-inline-feedback success">{t('settings.modelReplacedLive')}</div>}
                {modelReplaceStatus === 'error' && <div className="settings-inline-feedback error">{t('settings.modelReplaceFailedRestored')}</div>}

                <Row label={t('settings.sceneScale')} hint={t('settings.sceneScaleHint')} stacked htmlFor="settings-model-scale">
                  <div className="settings-field-row">
                    <input
                      id="settings-model-scale"
                      className="settings-input"
                      type="number"
                      min={MODEL_SCALE_MIN}
                      max={MODEL_SCALE_MAX}
                      step="0.001"
                      value={modelScaleValue}
                      onChange={(e) => { setModelScaleValue(e.target.value); setModelScaleStatus('idle'); }}
                    />
                    <button
                      type="button"
                      className={`settings-btn${modelScaleStatus === 'success' ? ' ok' : modelScaleStatus === 'error' ? ' err' : ''}`}
                      disabled={modelScaleStatus === 'applying'}
                      onClick={handleApplyModelScale}
                    >
                      {modelScaleStatus === 'applying' ? <RefreshCw className="settings-spin" size={15} />
                        : modelScaleStatus === 'success' ? `✓ ${t('settings.applied')}`
                          : modelScaleStatus === 'error' ? `✗ ${t('common.failed')}`
                            : t('settings.apply')}
                    </button>
                  </div>
                </Row>
              </Group>

              <Group title={t('settings.modelOrientation')}>
                <div className="settings-compass-row">
                  <svg
                    ref={compassRef}
                    className="settings-compass"
                    viewBox="0 0 100 100"
                    width="104"
                    height="104"
                    role="slider"
                    aria-label={t('settings.modelOrientation')}
                    aria-valuemin={0}
                    aria-valuemax={359}
                    aria-valuenow={northOffset}
                    onPointerDown={handleCompassPointerDown}
                    onPointerMove={handleCompassPointerMove}
                    onPointerUp={handleCompassPointerUp}
                    style={{ touchAction: 'none' }}
                  >
                    <circle cx="50" cy="50" r="46" className="compass-ring" />
                    <text x="50" y="12" className="compass-label compass-n">N</text>
                    <text x="50" y="95" className="compass-label">S</text>
                    <text x="7" y="54" className="compass-label">W</text>
                    <text x="93" y="54" className="compass-label">{language.startsWith('de') ? 'O' : 'E'}</text>
                    <g transform={`rotate(${northOffset}, 50, 50)`}>
                      <line x1="50" y1="50" x2="50" y2="14" className="compass-needle" />
                      <polygon points="50,14 46,24 54,24" className="compass-arrow" />
                      <circle cx="50" cy="50" r="3" className="compass-center" />
                    </g>
                  </svg>
                  <div className="settings-compass-text">
                    <strong>{northOffset}°</strong>
                    <span>{t('settings.modelOrientationHint')}</span>
                  </div>
                </div>
              </Group>

              <SharedInstallationSettings />

              <Group title={t('settings.backup')}>
                <Row label={t('settings.backupAll')} hint={t('settings.backupHint')} stacked>
                  <div className="settings-actions">
                    <button type="button" className="settings-btn" onClick={exportBackup}>{t('settings.export')}</button>
                    <button
                      type="button"
                      className={`settings-btn${importStatus === 'success' ? ' ok' : importStatus === 'error' ? ' err' : ''}`}
                      onClick={() => importInputRef.current?.click()}
                    >
                      {importStatus === 'success' ? `✓ ${t('common.imported')}` : importStatus === 'error' ? `✗ ${t('common.failed')}` : t('common.import')}
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".zip"
                      className="settings-hidden-input"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          await importBackup(file);
                          setImportStatus('success');
                          setTimeout(() => window.location.reload(), 800);
                        } catch {
                          setImportStatus('error');
                          setTimeout(() => setImportStatus('idle'), 3000);
                        }
                        e.target.value = '';
                      }}
                    />
                  </div>
                </Row>
              </Group>

              <Group title={t('settings.dangerZone')}>
                <Row label={t('settings.resetRestartOnboarding')} hint={confirmReset ? t('settings.eraseAllConfig') : t('settings.resetHint')} stacked>
                  <div className="settings-actions">
                    {confirmReset ? (
                      <>
                        <button
                          type="button"
                          className="settings-btn danger solid"
                          onClick={async () => {
                            await resetConfig();
                            clearSettings();
                            onClose();
                            navigate('/onboarding');
                          }}
                        >
                          {t('common.confirm')}
                        </button>
                        <button type="button" className="settings-btn" onClick={() => setConfirmReset(false)}>{t('common.cancel')}</button>
                      </>
                    ) : (
                      <button type="button" className="settings-btn danger" onClick={() => setConfirmReset(true)}>
                        {t('common.reset')}
                      </button>
                    )}
                  </div>
                </Row>
              </Group>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
