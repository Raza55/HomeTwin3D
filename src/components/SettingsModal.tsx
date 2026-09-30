// Modified for HomeTwin3D: project repository link. See ORIGIN.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Palette, Box, MonitorCloud, Hand, Cog, Info,
  LayoutTemplate, ChevronLeft, X,
  Monitor, Smartphone, Search, RotateCw, Move,
  Github, HeartHandshake, Scale, Upload, RefreshCw, FileBox, AlertTriangle,
} from 'lucide-react';
import { haSocketUrl, type HAConnectionStatus } from '../services/haWebSocket';
import type { HASettings } from '../types';
import SharedInstallationSettings from './SharedInstallationSettings';
import { getConfig, getModelBlob, resetConfig, updateConfig, exportBackup, importBackup, uploadModel, restoreModel } from '../services/configApi';
import { clearSettings, getSetting, getSettings, updateSettings } from '../services/settingsStore';
import { MODEL_SCALE_MAX, MODEL_SCALE_MIN, normalizeModelScale } from '../babylon/SceneScale';
import { useDemoMode } from '../contexts/DemoModeContext';
import { useCameraControls, type CameraControlsFlags } from '../contexts/CameraControlsContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  useTheme,
  BG_DARK, BG_LIGHT,
  PRIMARY_ACCENTS, STATUS_ACCENTS,
  PANEL_BG_DARK, PANEL_BG_LIGHT,
} from '../contexts/ThemeContext';
import { SYSTEM_LOCATION } from '../constants/location';
import './SettingsModal.css';
import FloorplanEntities from './FloorplanEntities';

type Section = 'main' | 'connection' | 'model' | 'appearance' | 'render' | 'environment' | 'controls' | 'system' | 'infos';

interface Props {
  open: boolean;
  onClose: () => void;

  /* Sun scrubber */
  sliderValue: number;
  scrubberTime: string;
  sunLiveMode: boolean;
  onSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLiveClick: () => void;

  /* North offset */
  northOffset: number;
  onNorthOffsetChange: (degrees: number) => void;

  /* Edge scrubber */
  edgeWidth: number;
  onEdgeWidthChange: (width: number) => void;
  edgeMode: 'classic' | 'enhanced';
  onEdgeModeChange: (mode: 'classic' | 'enhanced') => void;

  /* Ground grid */
  groundGrid: boolean;
  onGroundGridChange: (enabled: boolean) => void;

  /* Weather effects */
  weatherEnabled: boolean;
  onWeatherEnabledChange: (enabled: boolean) => void;

  /* Perspective */
  perspective: boolean;
  onPerspectiveChange: (enabled: boolean) => void;

  /* Shadow resolution */
  sunShadowRes: number;
  onSunShadowResChange: (res: number) => void;
  pointShadowRes: number;
  onPointShadowResChange: (res: number) => void;

  /* Textures */
  showTextures: boolean;
  onShowTexturesChange: (enabled: boolean) => void;
  onRecenterView: () => void;

  /* Sketch material */
  sketchColor: string;
  onSketchColorChange: (color: string) => void;
  sketchSpecular: number;
  onSketchSpecularChange: (value: number) => void;

  /* Debug */
  onDebugToggle: () => void;

  /* Grid edit */
  onEditGrid: () => void;

  /* Home view */
  onChangeHomeView: () => void;

  /* HA settings */
  haSettings: HASettings;
  onHASettingsSave: (settings: HASettings) => void;

  /* Status */
  lightsOnCount: number;
  haStatus: HAConnectionStatus;
  modelStatus: string;
  modelStatusColor?: string;
  onReloadModel: () => void;
  onStartVisualMatching?: (category?: 'light' | 'other') => void;
}

const SECTIONS: { key: Section; labelKey: string; icon: typeof Server }[] = [
  { key: 'connection', labelKey: 'settings.connection', icon: Server },
  { key: 'model', labelKey: 'settings.model3d', icon: FileBox },
  { key: 'appearance', labelKey: 'settings.appearance', icon: Palette },
  { key: 'render', labelKey: 'settings.render', icon: Box },
  { key: 'environment', labelKey: 'settings.environment', icon: MonitorCloud },
  { key: 'controls', labelKey: 'settings.controls', icon: Hand },
  { key: 'system', labelKey: 'settings.system', icon: Cog },
  { key: 'infos', labelKey: 'settings.infos', icon: Info },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsModal({
  open,
  onClose,
  sliderValue,
  scrubberTime,
  sunLiveMode,
  onSliderChange,
  onLiveClick,
  northOffset,
  onNorthOffsetChange,
  edgeWidth,
  onEdgeWidthChange,
  edgeMode,
  onEdgeModeChange,
  groundGrid,
  onGroundGridChange,
  weatherEnabled,
  onWeatherEnabledChange,
  perspective,
  onPerspectiveChange,
  sunShadowRes,
  onSunShadowResChange,
  pointShadowRes,
  onPointShadowResChange,
  showTextures,
  onShowTexturesChange,
  onRecenterView,
  sketchColor,
  onSketchColorChange,
  sketchSpecular,
  onSketchSpecularChange,
  onDebugToggle,
  onEditGrid,
  onChangeHomeView,
  haSettings,
  onHASettingsSave,
  lightsOnCount,
  haStatus,
  modelStatus,
  modelStatusColor,
  onReloadModel,
  onStartVisualMatching,
}: Props) {
  const navigate = useNavigate();
  const { demoMode, setDemoMode } = useDemoMode();
  const { desktop, mobile, toggleDesktop, toggleMobile } = useCameraControls();
  const { theme, resolved, setTheme, refreshAppearance } = useTheme();
  const { language, languages, setLanguage, t } = useLanguage();

  const [section, setSection] = useState<Section>('main');
  const [prevSection, setPrevSection] = useState<Section>('main');
  const [animating, setAnimating] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined);
  const [haUrl, setHaUrl] = useState(haSettings.url);
  const [haPort, setHaPort] = useState(haSettings.port);
  const [haToken, setHaToken] = useState(haSettings.token);
  const [haSaveStatus, setHaSaveStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [modelReplaceStatus, setModelReplaceStatus] = useState<'idle' | 'applying' | 'restoring' | 'success' | 'error'>('idle');
  const [selectedModelFile, setSelectedModelFile] = useState<File | null>(null);
  const [modelScaleValue, setModelScaleValue] = useState('1');
  const [modelScaleStatus, setModelScaleStatus] = useState<'idle' | 'applying' | 'success' | 'error'>('idle');
  const previousModelRef = useRef<Blob | null>(null);
  const previousModelConfigRef = useRef<ReturnType<typeof getConfig>['model']>(undefined);
  const previousFullConfigRef = useRef<ReturnType<typeof getConfig> | null>(null);
  const modelReloadSeenRef = useRef(false);
  const scaleReloadSeenRef = useRef(false);
  const [homeViewReset, setHomeViewReset] = useState<'idle' | 'done'>('idle');

  // Appearance state
  const [bgColor, setBgColor] = useState(() => getSettings().appearance.bgColor);
  const [primaryAccent, setPrimaryAccent] = useState(() => getSettings().appearance.primaryAccent);
  const [statusAccent, setStatusAccent] = useState(() => getSettings().appearance.statusAccent);
  const [panelOpacity, setPanelOpacity] = useState(() => getSettings().appearance.panelOpacity);
  const [panelDots, setPanelDots] = useState(() => getSettings().appearance.panelDots);
  const [panelBgColor, setPanelBgColor] = useState(() => getSettings().appearance.panelBgColor);
  const [backdropObscure, setBackdropObscure] = useState(() => getSettings().appearance.backdropObscure);
  const [backdropBlur, setBackdropBlur] = useState(() => getSettings().appearance.backdropBlur);
  const [hudVisible, setHudVisible] = useState(() => getSettings().appearance.hudVisible);
  const [borderStyle, setBorderStyle] = useState(() => getSettings().appearance.borderStyle);
  const [cornerRadius, setCornerRadius] = useState(() => getSettings().appearance.cornerRadius);

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
    if (open) {
      setSection('main');
      setPrevSection('main');
      setAnimating(false);
      setConfirmReset(false);
      setBodyHeight(undefined);
      const cfg = getConfig();
      setLatitude(String(cfg.location?.latitude ?? SYSTEM_LOCATION.latitude));
      setLongitude(String(cfg.location?.longitude ?? SYSTEM_LOCATION.longitude));
      setModelScaleValue(String(normalizeModelScale(cfg.model?.scale)));
      setModelReplaceStatus('idle');
      setSelectedModelFile(null);
      setModelScaleStatus('idle');
    }
  }, [open]);

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

  // Capture main page height once rendered
  useEffect(() => {
    if (open && section === 'main' && mainRef.current && bodyHeight === undefined) {
      setBodyHeight(mainRef.current.offsetHeight);
    }
  }, [open, section, bodyHeight]);

  const navigateTo = useCallback((target: Section) => {
    setPrevSection(section);
    setSection(target);
    setAnimating(true);
  }, [section]);

  const handleTransitionEnd = useCallback(() => {
    setAnimating(false);
    setPrevSection(section);
  }, [section]);

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
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
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

  const controlItems: { key: keyof CameraControlsFlags; icon: typeof Search; label: string }[] = [
    { key: 'zoom', icon: Search, label: t('settings.zoom') },
    { key: 'rotate', icon: RotateCw, label: t('settings.rotate') },
    { key: 'pan', icon: Move, label: t('settings.pan') },
  ];

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

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
      previousModelConfigRef.current = cfg.model;
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

  const haStatusColor =
    haStatus === 'connected' ? 'var(--green)' :
    haStatus === 'error' || haStatus === 'auth_error' ? 'var(--red)' :
    haStatus === 'connecting' || haStatus === 'disconnected' ? 'var(--yellow)' :
    undefined;

  const haStatusText =
    haStatus === 'auth_error' ? t('settings.authError') :
    haStatus === 'disconnected' ? t('settings.reconnecting') :
    haStatus;

  if (!open) return null;

  const sectionTitle = t(SECTIONS.find(s => s.key === section)?.labelKey ?? 'settings.title');

  return (
    <div className="settings-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal">
        {/* Header */}
        <div className="settings-header">
          {section !== 'main' ? (
            <button className="settings-back-btn" onClick={() => navigateTo('main')}>
              <ChevronLeft size={16} />
            </button>
          ) : null}
          <span className="settings-title">
            {section === 'main' ? t('settings.title') : sectionTitle}
          </span>
          <button className="settings-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Sliding body */}
        <div
          className="settings-body"
          style={bodyHeight ? { height: bodyHeight } : undefined}
          onTransitionEnd={handleTransitionEnd}
        >
          {/* Main panel */}
          <div
            className={`settings-panel settings-panel-main${
              section === 'main' ? ' active' : ''
            }${section !== 'main' ? ' exit-left' : ''}`}
            ref={mainRef}
          >
            <div className="settings-main">
              <div className="settings-list">
                {SECTIONS.map(({ key, labelKey, icon: Icon }) => (
                  <button
                    key={key}
                    className="settings-list-item"
                    onClick={() => navigateTo(key)}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span>{t(labelKey)}</span>
                  </button>
                ))}
              </div>

              <div className="settings-bottom-actions">
                <button
                  className="settings-big-btn"
                  onClick={() => { onEditGrid(); onClose(); }}
                >
                  <LayoutTemplate size={20} strokeWidth={1.5} />
                  <span>{t('settings.editGrid')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section panel */}
          <div
            className={`settings-panel settings-panel-section${
              section !== 'main' ? ' active' : ''
            }${section === 'main' ? ' exit-right' : ''}`}
          >
            {/* Connection */}
            {(section === 'connection' || (animating && prevSection === 'connection')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.mode')}</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${!demoMode ? ' active live' : ''}`}
                      onClick={() => setDemoMode(false)}
                    >
                      {t('settings.live')}
                    </button>
                    <button
                      className={`settings-mode-btn${demoMode ? ' active demo' : ''}`}
                      onClick={() => setDemoMode(true)}
                    >
                      {t('settings.demo')}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.homeAssistant')}</div>
                  <div className="settings-ha-fields">
                    <div className="settings-ha-row">
                      <div className="settings-ha-field" style={{ flex: 3 }}>
                        <label className="settings-ha-label">{t('settings.url')}</label>
                        <input
                          className="settings-ha-input"
                          type="text"
                          placeholder="192.168.1.xxx"
                          value={haUrl}
                          onChange={(e) => setHaUrl(e.target.value)}
                        />
                      </div>
                      <div className="settings-ha-field" style={{ flex: 1 }}>
                        <label className="settings-ha-label">{t('settings.port')}</label>
                        <input
                          className="settings-ha-input"
                          type="number"
                          value={haPort}
                          onChange={(e) => setHaPort(parseInt(e.target.value) || 8123)}
                        />
                      </div>
                    </div>
                    <div className="settings-ha-field">
                      <label className="settings-ha-label">{t('settings.token')}</label>
                      <input
                        className="settings-ha-input"
                        type="password"
                        placeholder="eyJhbGci..."
                        value={haToken}
                        onChange={(e) => setHaToken(e.target.value)}
                      />
                    </div>
                    <button
                      className={`settings-action-btn${haSaveStatus === 'success' ? ' ha-ok' : haSaveStatus === 'error' ? ' ha-err' : ''}`}
                      disabled={!haUrl || !haToken || haSaveStatus === 'testing'}
                      onClick={handleHASave}
                    >
                      {haSaveStatus === 'testing' ? t('common.testing')
                        : haSaveStatus === 'success' ? `\u2713 ${t('common.connected')}`
                        : haSaveStatus === 'error' ? `\u2717 ${t('common.failed')}`
                        : t('common.save')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3D model */}
            {(section === 'model' || (animating && prevSection === 'model')) && (
              <div className="settings-page">
                <FloorplanEntities onStartVisualMatching={onStartVisualMatching} onApply={onReloadModel} disabled={modelReplaceStatus === 'applying' || modelReplaceStatus === 'restoring'} />
                <div className="settings-model-status" role="status">
                  <span
                    className={`settings-model-status-dot status-${modelStatus}`}
                    style={modelStatusColor ? { backgroundColor: modelStatusColor } : undefined}
                  />
                  <div>
                    <span className="settings-model-status-label">{t('settings.currentModel')}</span>
                    <strong>{t(`settings.modelStatus.${modelStatus}`)}</strong>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.replaceModel')}</div>
                  <button
                    className="settings-model-picker"
                    disabled={modelReplaceStatus === 'applying' || modelReplaceStatus === 'restoring'}
                    onClick={() => modelInputRef.current?.click()}
                  >
                    <Upload size={18} strokeWidth={1.5} />
                    <span>
                      <strong>{selectedModelFile ? selectedModelFile.name : t('settings.chooseGlb')}</strong>
                      <small>
                        {selectedModelFile
                          ? t('settings.fileSize', { size: formatFileSize(selectedModelFile.size) })
                          : t('settings.glbOnly')}
                      </small>
                    </span>
                  </button>
                  <input
                    ref={modelInputRef}
                    type="file"
                    accept=".glb,model/gltf-binary"
                    className="settings-hidden-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setSelectedModelFile(file);
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
                        <button
                          className="settings-action-btn"
                          disabled={modelReplaceStatus === 'applying' || modelReplaceStatus === 'restoring'}
                          onClick={() => setSelectedModelFile(null)}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          className={`settings-action-btn settings-action-primary${modelReplaceStatus === 'success' ? ' ha-ok' : modelReplaceStatus === 'error' ? ' ha-err' : ''}`}
                          disabled={modelReplaceStatus === 'applying' || modelReplaceStatus === 'restoring'}
                          onClick={handleReplaceModel}
                        >
                          {modelReplaceStatus === 'applying' ? <><RefreshCw className="settings-spin" size={15} /> {t('settings.reloadingModel')}</>
                            : modelReplaceStatus === 'restoring' ? <><RefreshCw className="settings-spin" size={15} /> {t('settings.restoringModel')}</>
                            : t('settings.replaceNow')}
                        </button>
                      </div>
                    </div>
                  )}

                  {modelReplaceStatus === 'success' && (
                    <div className="settings-inline-feedback success">{t('settings.modelReplacedLive')}</div>
                  )}
                  {modelReplaceStatus === 'error' && (
                    <div className="settings-inline-feedback error">{t('settings.modelReplaceFailedRestored')}</div>
                  )}
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.sceneScale')}</div>
                  <div className="settings-model-scale-row">
                    <div className="settings-ha-field">
                      <label className="settings-ha-label" htmlFor="settings-model-scale">{t('settings.scale')}</label>
                      <input
                        id="settings-model-scale"
                        className="settings-ha-input"
                        type="number"
                        min={MODEL_SCALE_MIN}
                        max={MODEL_SCALE_MAX}
                        step="0.001"
                        value={modelScaleValue}
                        onChange={(e) => {
                          setModelScaleValue(e.target.value);
                          setModelScaleStatus('idle');
                        }}
                      />
                    </div>
                    <button
                      className={`settings-action-btn${modelScaleStatus === 'success' ? ' ha-ok' : modelScaleStatus === 'error' ? ' ha-err' : ''}`}
                      disabled={modelScaleStatus === 'applying'}
                      onClick={handleApplyModelScale}
                    >
                      {modelScaleStatus === 'applying' ? <RefreshCw className="settings-spin" size={15} />
                        : modelScaleStatus === 'success' ? `\u2713 ${t('settings.applied')}`
                        : modelScaleStatus === 'error' ? `\u2717 ${t('common.failed')}`
                        : t('settings.apply')}
                    </button>
                  </div>
                  <p className="settings-model-hint">{t('settings.sceneScaleHint')}</p>
                </div>
              </div>
            )}

            {/* Appearance */}
            {(section === 'appearance' || (animating && prevSection === 'appearance')) && (
              <div className="settings-page">
                {/* Theme */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.theme')}</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => setTheme('dark')}>{t('settings.dark')}</button>
                    <button className={`settings-mode-btn${theme === 'light' ? ' active' : ''}`} onClick={() => setTheme('light')}>{t('settings.light')}</button>
                    <button className={`settings-mode-btn${theme === 'auto' ? ' active' : ''}`} onClick={() => setTheme('auto')}>{t('settings.dayNight')}</button>
                    <button className={`settings-mode-btn${theme === 'system' ? ' active' : ''}`} onClick={() => setTheme('system')}>{t('settings.systemTheme')}</button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.language')}</div>
                  <div className="settings-mode-toggle">
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        className={`settings-mode-btn${language === lang ? ' active' : ''}`}
                        onClick={() => setLanguage(lang)}
                      >
                        {t(`language.${lang}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.background')}</div>
                  <div className="settings-swatch-row">
                    {(resolved === 'dark' ? BG_DARK : BG_LIGHT).map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(bgColor || (resolved === 'dark' ? BG_DARK : BG_LIGHT)[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setBgColor(hex); updateAppearance({ bgColor: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Primary Accent */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.primaryAccent')}</div>
                  <div className="settings-swatch-row">
                    {PRIMARY_ACCENTS.map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(primaryAccent || PRIMARY_ACCENTS[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setPrimaryAccent(hex); updateAppearance({ primaryAccent: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Status Accent */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.statusAccent')}</div>
                  <div className="settings-swatch-row">
                    {STATUS_ACCENTS.map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(statusAccent || STATUS_ACCENTS[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setStatusAccent(hex); updateAppearance({ statusAccent: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Panel Background */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.panelBackground')}</div>
                  <div className="settings-swatch-row">
                    {(resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT).map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(panelBgColor || (resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT)[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setPanelBgColor(hex); updateAppearance({ panelBgColor: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Side Panel Opacity */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.sidePanelOpacity')}</div>
                  <div className="settings-scrubber">
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={panelOpacity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setPanelOpacity(v);
                        updateAppearance({ panelOpacity: v });
                      }}
                    />
                    <span className="settings-scrubber-time">{panelOpacity}%</span>
                  </div>
                </div>

                {/* Panel Dots */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.panelDots')}</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${panelDots ? ' active' : ''}`} onClick={() => { setPanelDots(true); updateAppearance({ panelDots: true }); }}>{t('common.on')}</button>
                    <button className={`settings-mode-btn${!panelDots ? ' active' : ''}`} onClick={() => { setPanelDots(false); updateAppearance({ panelDots: false }); }}>{t('common.off')}</button>
                  </div>
                </div>

                {/* Border Style */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.borders')}</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${borderStyle === 'subtle' ? ' active' : ''}`} onClick={() => { setBorderStyle('subtle'); updateAppearance({ borderStyle: 'subtle' }); }}>{t('settings.subtle')}</button>
                    <button className={`settings-mode-btn${borderStyle === 'large' ? ' active' : ''}`} onClick={() => { setBorderStyle('large'); updateAppearance({ borderStyle: 'large' }); }}>{t('settings.large')}</button>
                    <button className={`settings-mode-btn${borderStyle === 'none' ? ' active' : ''}`} onClick={() => { setBorderStyle('none'); updateAppearance({ borderStyle: 'none' }); }}>{t('settings.none')}</button>
                  </div>
                </div>

                {/* Corner Radius */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.cornerRadius')}</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${cornerRadius === 'sharp' ? ' active' : ''}`} onClick={() => { setCornerRadius('sharp'); updateAppearance({ cornerRadius: 'sharp' }); }}>{t('settings.sharp')}</button>
                    <button className={`settings-mode-btn${cornerRadius === 'soft' ? ' active' : ''}`} onClick={() => { setCornerRadius('soft'); updateAppearance({ cornerRadius: 'soft' }); }}>{t('settings.soft')}</button>
                    <button className={`settings-mode-btn${cornerRadius === 'round' ? ' active' : ''}`} onClick={() => { setCornerRadius('round'); updateAppearance({ cornerRadius: 'round' }); }}>{t('settings.round')}</button>
                  </div>
                </div>

                {/* Backdrop */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.backdrop')}</div>
                  <div className="settings-checkbox-group">
                    <label className="settings-checkbox">
                      <input type="checkbox" checked={backdropObscure} onChange={(e) => { setBackdropObscure(e.target.checked); updateAppearance({ backdropObscure: e.target.checked }); }} />
                      <span>{t('settings.obscure')}</span>
                    </label>
                    <label className="settings-checkbox">
                      <input type="checkbox" checked={backdropBlur} onChange={(e) => { setBackdropBlur(e.target.checked); updateAppearance({ backdropBlur: e.target.checked }); }} />
                      <span>{t('settings.blur')}</span>
                    </label>
                  </div>
                </div>

                {/* HUD */}
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.hud')}</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${hudVisible ? ' active' : ''}`} onClick={() => { setHudVisible(true); updateAppearance({ hudVisible: true }); }}>{t('common.visible')}</button>
                    <button className={`settings-mode-btn${!hudVisible ? ' active' : ''}`} onClick={() => { setHudVisible(false); updateAppearance({ hudVisible: false }); }}>{t('common.hidden')}</button>
                  </div>
                </div>

              </div>
            )}

            {/* Render */}
            {(section === 'render' || (animating && prevSection === 'render')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.textures')}</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${showTextures ? ' active' : ''}`}
                      onClick={() => onShowTexturesChange(true)}
                    >
                      {t('common.on')}
                    </button>
                    <button
                      className={`settings-mode-btn${!showTextures ? ' active' : ''}`}
                      onClick={() => onShowTexturesChange(false)}
                    >
                      {t('common.off')}
                    </button>
                    <button
                      className="settings-mode-btn"
                      onClick={onRecenterView}
                    >
                      {t('common.recenter')}
                    </button>
                  </div>
                </div>

                {!showTextures && (
                  <>
                    <div className="settings-section">
                      <div className="settings-section-label">{t('settings.sketchColor')}</div>
                      <input
                        type="color"
                        className="settings-color-input"
                        value={sketchColor}
                        onChange={(e) => onSketchColorChange(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <div className="settings-section-label">{t('settings.sheen')}</div>
                      <div className="settings-scrubber">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={sketchSpecular}
                          onChange={(e) => onSketchSpecularChange(parseFloat(e.target.value))}
                        />
                        <span className="settings-scrubber-time">{sketchSpecular.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.edgeMode')}</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${edgeMode === 'classic' ? ' active' : ''}`}
                      onClick={() => onEdgeModeChange('classic')}
                    >
                      {t('settings.classic')}
                    </button>
                    <button
                      className={`settings-mode-btn${edgeMode === 'enhanced' ? ' active' : ''}`}
                      onClick={() => onEdgeModeChange('enhanced')}
                    >
                      {t('settings.enhanced')}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.edgeWidth')}</div>
                  <div className="settings-scrubber">
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.1}
                      value={edgeWidth}
                      onChange={(e) => onEdgeWidthChange(parseFloat(e.target.value))}
                    />
                    <span className="settings-scrubber-time">{edgeWidth.toFixed(1)}</span>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.groundGrid')}</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${groundGrid ? ' active' : ''}`}
                      onClick={() => onGroundGridChange(true)}
                    >
                      {t('common.on')}
                    </button>
                    <button
                      className={`settings-mode-btn${!groundGrid ? ' active' : ''}`}
                      onClick={() => onGroundGridChange(false)}
                    >
                      {t('common.off')}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.perspective')}</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${perspective ? ' active' : ''}`}
                      onClick={() => onPerspectiveChange(true)}
                    >
                      {t('common.on')}
                    </button>
                    <button
                      className={`settings-mode-btn${!perspective ? ' active' : ''}`}
                      onClick={() => onPerspectiveChange(false)}
                    >
                      {t('common.off')}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.sunShadow')}</div>
                  <div className="settings-mode-toggle">
                    {[0, 512, 1024, 2048, 4096].map((res) => (
                      <button
                        key={res}
                        className={`settings-mode-btn${sunShadowRes === res ? ' active' : ''}`}
                        onClick={() => onSunShadowResChange(res)}
                      >
                        {res === 0 ? t('common.off') : res}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.pointShadow')}</div>
                  <div className="settings-mode-toggle">
                    {[0, 256, 512, 1024, 2048].map((res) => (
                      <button
                        key={res}
                        className={`settings-mode-btn${pointShadowRes === res ? ' active' : ''}`}
                        onClick={() => onPointShadowResChange(res)}
                      >
                        {res === 0 ? t('common.off') : res}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Environment */}
            {(section === 'environment' || (animating && prevSection === 'environment')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.location')}</div>
                  <div className="settings-ha-row">
                    <div className="settings-ha-field" style={{ flex: 1 }}>
                      <label className="settings-ha-label">{t('settings.latitude')}</label>
                      <input
                        className="settings-ha-input"
                        type="number"
                        step="0.0001"
                        value={latitude}
                        onChange={(e) => {
                          setLatitude(e.target.value);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= -90 && val <= 90) {
                            updateConfig({ location: { latitude: val, longitude: parseFloat(longitude) || 0 } });
                          }
                        }}
                      />
                    </div>
                    <div className="settings-ha-field" style={{ flex: 1 }}>
                      <label className="settings-ha-label">{t('settings.longitude')}</label>
                      <input
                        className="settings-ha-input"
                        type="number"
                        step="0.0001"
                        value={longitude}
                        onChange={(e) => {
                          setLongitude(e.target.value);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= -180 && val <= 180) {
                            updateConfig({ location: { latitude: parseFloat(latitude) || 0, longitude: val } });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.sunPosition')}</div>
                  <div className="settings-scrubber">
                    <input
                      type="range"
                      min={0}
                      max={1439}
                      step={1}
                      value={sliderValue}
                      onChange={onSliderChange}
                    />
                    <span className="settings-scrubber-time">{scrubberTime}</span>
                    <button
                      className={`settings-live-btn${sunLiveMode ? ' active' : ''}`}
                      onClick={onLiveClick}
                    >
                      {t('settings.live')}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.modelOrientation')}</div>
                  <div className="settings-compass-row">
                    <svg
                      ref={compassRef}
                      className="settings-compass"
                      viewBox="0 0 100 100"
                      width="100"
                      height="100"
                      onPointerDown={handleCompassPointerDown}
                      onPointerMove={handleCompassPointerMove}
                      onPointerUp={handleCompassPointerUp}
                      style={{ touchAction: 'none' }}
                    >
                      <circle cx="50" cy="50" r="46" className="compass-ring" />
                      <text x="50" y="12" className="compass-label compass-n">N</text>
                      <text x="50" y="95" className="compass-label">S</text>
                      <text x="7" y="54" className="compass-label">W</text>
                      <text x="93" y="54" className="compass-label">E</text>
                      <g transform={`rotate(${northOffset}, 50, 50)`}>
                        <line x1="50" y1="50" x2="50" y2="14" className="compass-needle" />
                        <polygon points="50,14 46,24 54,24" className="compass-arrow" />
                        <circle cx="50" cy="50" r="3" className="compass-center" />
                      </g>
                    </svg>
                    <span className="settings-scrubber-time">{northOffset}&deg;</span>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.weatherEffects')}</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${weatherEnabled ? ' active' : ''}`}
                      onClick={() => onWeatherEnabledChange(true)}
                    >
                      {t('common.on')}
                    </button>
                    <button
                      className={`settings-mode-btn${!weatherEnabled ? ' active' : ''}`}
                      onClick={() => onWeatherEnabledChange(false)}
                    >
                      {t('common.off')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Controls */}
            {(section === 'controls' || (animating && prevSection === 'controls')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.cameraControls')}</div>
                  <div className="settings-cam-grid">
                    <div className="settings-cam-row">
                      <Monitor size={16} strokeWidth={1.5} className="settings-cam-device-icon" />
                      {controlItems.map(({ key, icon: Icon, label }) => (
                        <button
                          key={`d-${key}`}
                          className={`settings-cam-btn${desktop[key] ? ' active' : ''}`}
                          onClick={() => toggleDesktop(key)}
                          title={t('settings.desktopTitle', { control: label })}
                        >
                          <Icon size={16} strokeWidth={1.5} />
                        </button>
                      ))}
                    </div>
                    <div className="settings-cam-row">
                      <Smartphone size={16} strokeWidth={1.5} className="settings-cam-device-icon" />
                      {controlItems.map(({ key, icon: Icon, label }) => (
                        <button
                          key={`m-${key}`}
                          className={`settings-cam-btn${mobile[key] ? ' active' : ''}`}
                          onClick={() => toggleMobile(key)}
                          title={t('settings.mobileTitle', { control: label })}
                        >
                          <Icon size={16} strokeWidth={1.5} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.homeView')}</div>
                  <div className="settings-actions">
                    <button
                      className="settings-action-btn"
                      onClick={() => { onChangeHomeView(); onClose(); }}
                    >
                      {t('settings.changeHomeView')}
                    </button>
                    {(getSetting('controls').homeView || getConfig().homeView || homeViewReset === 'done') && (
                      <button
                        className={`settings-action-btn${homeViewReset === 'done' ? ' ha-ok' : ''}`}
                        style={homeViewReset === 'done' ? undefined : { borderColor: 'var(--red)', color: 'var(--red)' }}
                        disabled={homeViewReset === 'done'}
                        onClick={() => {
                          updateSettings('controls', { homeView: null });
                          updateConfig({ homeView: undefined });
                          setHomeViewReset('done');
                          setTimeout(() => setHomeViewReset('idle'), 1500);
                        }}
                      >
                        {homeViewReset === 'done' ? `\u2713 ${t('common.reset')}` : t('common.reset')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* System */}
            {(section === 'infos' || (animating && prevSection === 'infos')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.repository')}</div>
                  <a
                    className="settings-action-btn settings-repo-link"
                    href="https://github.com/Raza55/HomeTwin3D"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github size={16} strokeWidth={1.5} />
                    <span>HomeTwin3D</span>
                  </a>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.license')}</div>
                  <div className="settings-infos-license">
                    <Scale size={16} strokeWidth={1.5} />
                    <span>Apache-2.0</span>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-infos-footer">
                  <HeartHandshake size={16} strokeWidth={1.5} />
                  <span>{t('settings.builtWithLove')}</span>
                </div>
              </div>
            )}

            {(section === 'system' || (animating && prevSection === 'system')) && (
              <div className="settings-page">
                <SharedInstallationSettings />

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.backup')}</div>
                  <div className="settings-actions">
                    <button className="settings-action-btn" onClick={exportBackup}>
                      {t('settings.export')}
                    </button>
                    <button
                      className={`settings-action-btn${importStatus === 'success' ? ' ha-ok' : importStatus === 'error' ? ' ha-err' : ''}`}
                      onClick={() => importInputRef.current?.click()}
                    >
                      {importStatus === 'success' ? `\u2713 ${t('common.imported')}` : importStatus === 'error' ? `\u2717 ${t('common.failed')}` : t('common.import')}
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".zip"
                      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
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
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('settings.debug')}</div>
                  <div className="settings-actions">
                    <button className="settings-action-btn" onClick={() => { onDebugToggle(); onClose(); }}>
                      {t('settings.renderDebug')}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">{t('common.reset')}</div>
                  <div className="settings-actions">
                    {confirmReset ? (
                      <>
                        <span style={{ fontSize: 10, color: 'var(--red)', alignSelf: 'center' }}>{t('settings.eraseAllConfig')}</span>
                        <button
                          className="settings-action-btn"
                          style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                          onClick={async () => {
                            await resetConfig();
                            clearSettings();
                            onClose();
                            navigate('/onboarding');
                          }}
                        >
                          {t('common.confirm')}
                        </button>
                        <button className="settings-action-btn" onClick={() => setConfirmReset(false)}>
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        className="settings-action-btn"
                        style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                        onClick={() => setConfirmReset(true)}
                      >
                        {t('settings.resetRestartOnboarding')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-status">
                  <div className="settings-status-chip">
                    {t('settings.lightsOn')} <span>{lightsOnCount}</span>
                  </div>
                  <div className="settings-status-chip">
                    {t('settings.ha')} <span style={{ color: demoMode ? 'var(--orange)' : haStatusColor }}>
                      {demoMode ? t('settings.demo').toLowerCase() : haStatusText}
                    </span>
                  </div>
                  <div className="settings-status-chip">
                    {t('settings.model')} <span style={{ color: modelStatusColor }}>{modelStatus}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
