import { useState, useCallback, useEffect, type RefObject } from 'react';
import {
  ShadowGenerator,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type Mesh,
} from '@babylonjs/core';
import type { SceneContext } from '../babylon/SceneManager';
import type { MeshMap } from '../babylon/LightMeshFactory';
import type { StripConfig } from '../babylon/LightMeshFactory';
import type { WeatherEffectsContext } from '../babylon/WeatherEffects';
import type { WeatherData } from '../services/weatherApi';
import { isRaining, isSnowing } from '../services/weatherApi';
import { useTranslation } from '../contexts/LanguageContext';
import './DebugPanel.css';

interface Props {
  open: boolean;
  onClose: () => void;
  sceneCtxRef: RefObject<SceneContext | null>;
  meshMapRef: RefObject<MeshMap>;
  shadowCastersRef: RefObject<AbstractMesh[]>;
  onRebuildLights?: (stripConfig: StripConfig, singleRange: number) => void;
  weatherRef?: RefObject<WeatherEffectsContext | null>;
  onCloudCoverFactorChange?: (ccf: number) => void;
  currentWeather?: WeatherData | null;
}

/* ── Slider row ─────────────────────────────────────────────── */
function Slider({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="debug-control">
      <div className="debug-control-row">
        <label>{label}</label>
        <span className="value">{value % 1 === 0 ? value : value.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

/* ── Toggle row ─────────────────────────────────────────────── */
function Toggle({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="debug-toggle">
      <label>{label}</label>
      <div
        className={`debug-toggle-track${value ? ' on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <div className="debug-toggle-thumb" />
      </div>
    </div>
  );
}

/* ── Collapsible section ────────────────────────────────────── */
function Section({
  title, defaultOpen, children,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="debug-section">
      <div className="debug-section-header" onClick={() => setOpen(!open)}>
        <span className="section-title">{title}</span>
        <span className={`chevron${open ? ' expanded' : ''}`}>&#9656;</span>
      </div>
      {open && <div className="debug-section-body">{children}</div>}
    </div>
  );
}

/* ── Main panel ─────────────────────────────────────────────── */
export default function DebugPanel({
  open, onClose, sceneCtxRef, meshMapRef, shadowCastersRef, onRebuildLights,
  weatherRef, onCloudCoverFactorChange, currentWeather,
}: Props) {
  const t = useTranslation();
  /* --- Sun shadow state --- */
  const [sunIntensity, setSunIntensity] = useState(0.6);
  const [sunBias, setSunBias] = useState(0.005);
  const [sunNormalBias, setSunNormalBias] = useState(0.045);
  const [sunBlurKernel, setSunBlurKernel] = useState(30);
  const [sunDepthScale, setSunDepthScale] = useState(30);

  /* --- Ambient --- */
  const [hemiIntensity, setHemiIntensity] = useState(0.2);

  /* --- Point lights --- */
  const [plBias, setPlBias] = useState(0);
  const [plNormalBias, setPlNormalBias] = useState(0.05);
  const [plRange, setPlRange] = useState(7);
  const [plForceBackFaces, setPlForceBackFaces] = useState(false);

  /* --- Strip lights --- */
  const [stripSpacing, setStripSpacing] = useState(1);
  const [stripMaxLights, setStripMaxLights] = useState(4);
  const [stripRange, setStripRange] = useState(6);

  /* --- Material --- */
  const [backFaceCulling, setBackFaceCulling] = useState(false);
  const [twoSidedLighting, setTwoSidedLighting] = useState(true);

  /* --- Scene --- */
  const [glowIntensity, setGlowIntensity] = useState(0.8);
  const [roofEnabled, setRoofEnabled] = useState(false);
  const roofMeshRef = useState<Mesh | null>(null);

  /* --- Weather debug --- */
  const [debugClouds, setDebugClouds] = useState(false);
  const [debugCloudCover, setDebugCloudCover] = useState(80);
  const [debugRain, setDebugRain] = useState(false);
  const [debugRainIntensity, setDebugRainIntensity] = useState(2);
  const [debugSnow, setDebugSnow] = useState(false);
  const [debugSnowIntensity, setDebugSnowIntensity] = useState(1);

  // Sync weather debug toggles with real weather when panel opens
  useEffect(() => {
    if (!open || !currentWeather) return;
    const cw = currentWeather;
    setDebugClouds(cw.cloud_cover > 10);
    setDebugCloudCover(Math.max(cw.cloud_cover, 10));
    setDebugRain(isRaining(cw.weather_code));
    if (cw.rain > 0) setDebugRainIntensity(Math.max(cw.rain, 0.5));
    setDebugSnow(isSnowing(cw.weather_code));
    if (cw.snowfall > 0) setDebugSnowIntensity(Math.max(cw.snowfall, 0.5));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Unfreeze point-light shadow maps while panel is open ── */
  useEffect(() => {
    const map = meshMapRef.current;
    if (!map) return;

    if (open) {
      for (const key of Object.keys(map)) {
        const sm = map[key].shadowGen?.getShadowMap();
        if (sm) sm.refreshRate = 1;
      }
    }

    return () => {
      if (!map) return;
      for (const key of Object.keys(map)) {
        const sm = map[key].shadowGen?.getShadowMap();
        if (sm) sm.refreshRate = 0;
      }
    };
  }, [open, meshMapRef]);

  /* ── Helpers ──────────────────────────────────────────────── */

  const getSunShadowGen = useCallback((): ShadowGenerator | null => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return null;
    return ctx.sunLight.getShadowGenerator() as ShadowGenerator | null;
  }, [sceneCtxRef]);

  const getCartoonMaterial = useCallback(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return null;
    return ctx.scene.getMaterialByName('cartoon_white') as StandardMaterial | null;
  }, [sceneCtxRef]);

  const forEachPointLight = useCallback(
    (fn: (entry: MeshMap[string]) => void) => {
      const map = meshMapRef.current;
      if (!map) return;
      for (const key of Object.keys(map)) fn(map[key]);
    },
    [meshMapRef],
  );

  /* ── Sun handlers ─────────────────────────────────────────── */

  const handleSunIntensity = useCallback((v: number) => {
    setSunIntensity(v);
    const ctx = sceneCtxRef.current;
    if (ctx) ctx.sunLight.intensity = v;
  }, [sceneCtxRef]);

  const handleSunBias = useCallback((v: number) => {
    setSunBias(v);
    const sg = getSunShadowGen();
    if (sg) sg.bias = v;
  }, [getSunShadowGen]);

  const handleSunNormalBias = useCallback((v: number) => {
    setSunNormalBias(v);
    const sg = getSunShadowGen();
    if (sg) sg.normalBias = v;
  }, [getSunShadowGen]);

  const handleSunBlurKernel = useCallback((v: number) => {
    setSunBlurKernel(v);
    const sg = getSunShadowGen();
    if (sg) sg.blurKernel = v;
  }, [getSunShadowGen]);

  const handleSunDepthScale = useCallback((v: number) => {
    setSunDepthScale(v);
    const sg = getSunShadowGen();
    if (sg) sg.depthScale = v;
  }, [getSunShadowGen]);

  /* ── Ambient handler ──────────────────────────────────────── */

  const handleHemiIntensity = useCallback((v: number) => {
    setHemiIntensity(v);
    const ctx = sceneCtxRef.current;
    if (ctx) ctx.hemiLight.intensity = v;
  }, [sceneCtxRef]);

  /* ── Point light handlers ─────────────────────────────────── */

  const handlePlBias = useCallback((v: number) => {
    setPlBias(v);
    forEachPointLight((e) => { if (e.shadowGen) e.shadowGen.bias = v; });
  }, [forEachPointLight]);

  const handlePlNormalBias = useCallback((v: number) => {
    setPlNormalBias(v);
    forEachPointLight((e) => { if (e.shadowGen) e.shadowGen.normalBias = v; });
  }, [forEachPointLight]);

  const handlePlRange = useCallback((v: number) => {
    setPlRange(v);
    forEachPointLight((e) => {
      // Only update non-strip (single) lights
      if (e.stripLights.length === 0 && e.light) e.light.range = v;
    });
  }, [forEachPointLight]);

  const handlePlForceBackFaces = useCallback((v: boolean) => {
    setPlForceBackFaces(v);
    forEachPointLight((e) => {
      if (e.shadowGen) e.shadowGen.forceBackFacesOnly = v;
    });
  }, [forEachPointLight]);

  /* ── Strip light handlers (live range, rebuild for structure) */

  const handleStripRange = useCallback((v: number) => {
    setStripRange(v);
    forEachPointLight((e) => {
      if (e.stripLights.length > 0) {
        for (const sl of e.stripLights) sl.range = v;
      }
    });
  }, [forEachPointLight]);

  const handleRebuild = useCallback(() => {
    if (onRebuildLights) {
      onRebuildLights({ spacing: stripSpacing, maxLights: stripMaxLights, range: stripRange }, plRange);
    }
  }, [onRebuildLights, stripSpacing, stripMaxLights, stripRange, plRange]);

  /* ── Material handlers ────────────────────────────────────── */

  const handleBackFaceCulling = useCallback((v: boolean) => {
    setBackFaceCulling(v);
    const mat = getCartoonMaterial();
    if (mat) {
      mat.backFaceCulling = v;
      mat.markDirty();
    }
  }, [getCartoonMaterial]);

  const handleTwoSidedLighting = useCallback((v: boolean) => {
    setTwoSidedLighting(v);
    const mat = getCartoonMaterial();
    if (mat) {
      mat.twoSidedLighting = v;
      mat.markDirty();
    }
  }, [getCartoonMaterial]);

  /* ── Scene handlers ───────────────────────────────────────── */

  const handleGlowIntensity = useCallback((v: number) => {
    setGlowIntensity(v);
    const ctx = sceneCtxRef.current;
    if (ctx?.glowLayer) ctx.glowLayer.intensity = v;
  }, [sceneCtxRef]);

  const handleRoofToggle = useCallback((v: boolean) => {
    setRoofEnabled(v);
    const ctx = sceneCtxRef.current;
    const casters = shadowCastersRef.current;
    if (!ctx || !casters) return;

    if (v) {
      let min = new Vector3(Infinity, Infinity, Infinity);
      let max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of casters) {
        try {
          const b = m.getBoundingInfo().boundingBox;
          min = Vector3.Minimize(min, b.minimumWorld);
          max = Vector3.Maximize(max, b.maximumWorld);
        } catch { /* skip */ }
      }
      const margin = 0.5;
      const roof = MeshBuilder.CreateBox('invisible_roof', {
        width: (max.x - min.x) + margin * 2,
        height: 0.05,
        depth: (max.z - min.z) + margin * 2,
      }, ctx.scene);
      roof.position = new Vector3(
        (min.x + max.x) / 2, max.y + 0.025, (min.z + max.z) / 2,
      );
      roof.visibility = 0;
      roof.isPickable = false;
      roof.receiveShadows = false;
      const mat = new StandardMaterial('roof_mat_dbg', ctx.scene);
      mat.disableLighting = true;
      roof.material = mat;

      casters.push(roof);
      const sg = getSunShadowGen();
      if (sg) sg.addShadowCaster(roof, false);
      roofMeshRef[1](roof);
    } else {
      const roof = roofMeshRef[0];
      if (roof) {
        const idx = casters.indexOf(roof);
        if (idx >= 0) casters.splice(idx, 1);
        const sg = getSunShadowGen();
        if (sg) sg.removeShadowCaster(roof);
        roof.dispose();
        roofMeshRef[1](null);
      }
    }
  }, [sceneCtxRef, shadowCastersRef, getSunShadowGen, roofMeshRef]);

  /* ── Weather debug helpers ───────────────────────────────── */

  const applyDebugWeather = useCallback((
    clouds: boolean, cloudCover: number,
    rain: boolean, rainIntensity: number,
    snow: boolean, snowIntensity: number,
  ) => {
    const w = weatherRef?.current;
    if (!w) return;
    const weatherCode = rain ? 61 : snow ? 71 : 0;
    const ccf = w.updateWeather({
      weather_code: weatherCode,
      cloud_cover: clouds ? cloudCover : 0,
      rain: rain ? rainIntensity : 0,
      snowfall: snow ? snowIntensity : 0,
    });
    onCloudCoverFactorChange?.(ccf);
  }, [weatherRef, onCloudCoverFactorChange]);

  const handleDebugClouds = useCallback((v: boolean) => {
    setDebugClouds(v);
    applyDebugWeather(v, debugCloudCover, debugRain, debugRainIntensity, debugSnow, debugSnowIntensity);
  }, [applyDebugWeather, debugCloudCover, debugRain, debugRainIntensity, debugSnow, debugSnowIntensity]);

  const handleDebugCloudCover = useCallback((v: number) => {
    setDebugCloudCover(v);
    applyDebugWeather(debugClouds, v, debugRain, debugRainIntensity, debugSnow, debugSnowIntensity);
  }, [applyDebugWeather, debugClouds, debugRain, debugRainIntensity, debugSnow, debugSnowIntensity]);

  const handleDebugRain = useCallback((v: boolean) => {
    setDebugRain(v);
    applyDebugWeather(debugClouds, debugCloudCover, v, debugRainIntensity, debugSnow, debugSnowIntensity);
  }, [applyDebugWeather, debugClouds, debugCloudCover, debugRainIntensity, debugSnow, debugSnowIntensity]);

  const handleDebugRainIntensity = useCallback((v: number) => {
    setDebugRainIntensity(v);
    applyDebugWeather(debugClouds, debugCloudCover, debugRain, v, debugSnow, debugSnowIntensity);
  }, [applyDebugWeather, debugClouds, debugCloudCover, debugRain, debugSnow, debugSnowIntensity]);

  const handleDebugSnow = useCallback((v: boolean) => {
    setDebugSnow(v);
    applyDebugWeather(debugClouds, debugCloudCover, debugRain, debugRainIntensity, v, debugSnowIntensity);
  }, [applyDebugWeather, debugClouds, debugCloudCover, debugRain, debugRainIntensity, debugSnowIntensity]);

  const handleDebugSnowIntensity = useCallback((v: number) => {
    setDebugSnowIntensity(v);
    applyDebugWeather(debugClouds, debugCloudCover, debugRain, debugRainIntensity, debugSnow, v);
  }, [applyDebugWeather, debugClouds, debugCloudCover, debugRain, debugRainIntensity, debugSnow]);

  return (
    <div className={`debug-panel${open ? ' open' : ''}`}>
      <div className="debug-panel-header">
        <span className="title">{t('debug.renderSettings')}</span>
        <button className="debug-panel-close" onClick={onClose}>&times;</button>
      </div>

      <div className="debug-panel-body">
        <Section title={t('debug.sunLight')} defaultOpen>
          <Slider label={t('debug.intensity')} value={sunIntensity} min={0} max={2} step={0.01} onChange={handleSunIntensity} />
          <Slider label={t('debug.shadowBias')} value={sunBias} min={0} max={0.05} step={0.001} onChange={handleSunBias} />
          <Slider label={t('debug.shadowNormalBias')} value={sunNormalBias} min={0} max={0.1} step={0.001} onChange={handleSunNormalBias} />
          <Slider label={t('debug.blurKernel')} value={sunBlurKernel} min={1} max={64} step={1} onChange={handleSunBlurKernel} />
          <Slider label={t('debug.depthScale')} value={sunDepthScale} min={0} max={200} step={1} onChange={handleSunDepthScale} />
        </Section>

        <Section title={t('debug.ambientLight')} defaultOpen>
          <Slider label={t('debug.intensity')} value={hemiIntensity} min={0} max={2} step={0.01} onChange={handleHemiIntensity} />
        </Section>

        <Section title={t('debug.pointLights')} defaultOpen>
          <Slider label={t('debug.rangeSingle')} value={plRange} min={1} max={30} step={0.5} onChange={handlePlRange} />
          <Slider label={t('debug.shadowBias')} value={plBias} min={0} max={0.05} step={0.001} onChange={handlePlBias} />
          <Slider label={t('debug.shadowNormalBias')} value={plNormalBias} min={0} max={0.1} step={0.001} onChange={handlePlNormalBias} />
          <Toggle label={t('debug.forceBackFacesOnly')} value={plForceBackFaces} onChange={handlePlForceBackFaces} />
        </Section>

        <Section title={t('debug.stripLights')} defaultOpen>
          <Slider label={t('debug.range')} value={stripRange} min={1} max={30} step={0.5} onChange={handleStripRange} />
          <Slider label={t('debug.spacingM')} value={stripSpacing} min={0.1} max={2} step={0.05} onChange={(v) => setStripSpacing(v)} />
          <Slider label={t('debug.maxSubLights')} value={stripMaxLights} min={1} max={10} step={1} onChange={(v) => setStripMaxLights(v)} />
          <button className="debug-rebuild-btn" onClick={handleRebuild}>
            {t('debug.rebuildLights')}
          </button>
        </Section>

        <Section title={t('debug.material')} defaultOpen>
          <Toggle label={t('debug.backFaceCulling')} value={backFaceCulling} onChange={handleBackFaceCulling} />
          <Toggle label={t('debug.twoSidedLighting')} value={twoSidedLighting} onChange={handleTwoSidedLighting} />
        </Section>

        <Section title={t('debug.scene')} defaultOpen>
          <Slider label={t('debug.glowIntensity')} value={glowIntensity} min={0} max={3} step={0.05} onChange={handleGlowIntensity} />
          <Toggle label={t('debug.invisibleRoof')} value={roofEnabled} onChange={handleRoofToggle} />
        </Section>

        <Section title={t('debug.weather')} defaultOpen={false}>
          <Toggle label={t('debug.clouds')} value={debugClouds} onChange={handleDebugClouds} />
          {debugClouds && (
            <Slider label={t('debug.cloudCover')} value={debugCloudCover} min={0} max={100} step={5} onChange={handleDebugCloudCover} />
          )}
          <Toggle label={t('debug.rain')} value={debugRain} onChange={handleDebugRain} />
          {debugRain && (
            <Slider label={t('debug.rainMm')} value={debugRainIntensity} min={0.5} max={10} step={0.5} onChange={handleDebugRainIntensity} />
          )}
          <Toggle label={t('debug.snow')} value={debugSnow} onChange={handleDebugSnow} />
          {debugSnow && (
            <Slider label={t('debug.snowCm')} value={debugSnowIntensity} min={0.5} max={5} step={0.5} onChange={handleDebugSnowIntensity} />
          )}
        </Section>
      </div>
    </div>
  );
}
