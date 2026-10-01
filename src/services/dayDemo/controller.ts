/**
 * Browser side of the day demo: drives the engine every animation frame and
 * maps the virtual day onto the 3D scene — sun, weather, lightning, an optional
 * camera tour — while measuring frame times per chapter (benchmark).
 */
import { ArcRotateCamera, SceneInstrumentation, Vector3, type AbstractEngine, type DirectionalLight, type Engine, type HemisphericLight, type Scene } from '@babylonjs/core';
import { setSunDateOverride, updateSunPosition } from '../../babylon/SunController';
import type { WeatherData } from '../weatherApi';
import { DayDemoEngine, type DayDemoHooks, type DayDemoSnapshot } from './engine';
import { CHAPTERS, DEMO_DATE, clockToVirtual, virtualToClock, type DemoWeather } from './story';
import { prepareCurrentLightVariants, prerenderLampShadowMaps } from '../../babylon/FloorplanLighting';
import type { DayDemoCast } from './cast';
import { renderDemoScreen } from './screens';

export interface DayDemoSceneDeps {
  scene: Scene;
  engine: AbstractEngine;
  sun: DirectionalLight;
  hemi: HemisphericLight;
  requestRender(): void;
  location(): { latitude: number; longitude: number; northOffset: number };
  /** Applies weather to particles/fog/park and returns the cloud cover factor for the sun. */
  applyWeather(weather: WeatherData): number;
  /** Throttled: virtual clock minutes and weather for HUD, theme and side panels. */
  onClock?(clockMinutes: number, weather: WeatherData): void;
}

export interface ChapterResult { id: string; fps: number; p95: number; cpu: number; draws: number; frames: number }
export interface BenchmarkResult {
  score: number; fps: number; p95: number; low1: number; cpu: number; draws: number;
  frames: number; seconds: number; renderer: string; resolution: string; speed: number; tour: boolean;
  chapters: ChapterResult[];
}

export interface DayDemoViewState extends DayDemoSnapshot {
  tour: boolean;
  /** 0..1 while shader variants for the whole story are prepared; undefined when ready. */
  preparing?: number;
  result?: BenchmarkResult;
  fps: number;
}

interface Bucket { frames: number; ms: number; cpu: number; draws: number; gaps: number[] }

/**
 * Camera framing per chapter: weather scenes pull back and lower the view so
 * the park, sky and precipitation show; indoor scenes move closer.
 */
const CHAPTER_VIEW: Record<string, { zoom: number; tilt: number }> = {
  night: { zoom: 1.3, tilt: .12 }, wake: { zoom: .88, tilt: 0 }, sunrise: { zoom: 1.2, tilt: .1 }, coffee: { zoom: .88, tilt: 0 },
  bath: { zoom: .92, tilt: 0 }, breakfast: { zoom: .95, tilt: 0 }, away: { zoom: 1.1, tilt: .05 }, chores: { zoom: 1, tilt: 0 },
  sunny: { zoom: 1.45, tilt: .16 }, shade: { zoom: 1.2, tilt: .08 }, homeoffice: { zoom: .92, tilt: 0 }, warning: { zoom: 1.4, tilt: .16 },
  storm: { zoom: 1.6, tilt: .2 }, clearing: { zoom: 1.4, tilt: .14 }, home: { zoom: 1, tilt: 0 }, cooking: { zoom: .9, tilt: 0 },
  sunset: { zoom: 1.3, tilt: .14 }, cinema: { zoom: .88, tilt: 0 }, gaming: { zoom: .9, tilt: 0 }, goodnight: { zoom: 1.05, tilt: .05 },
  nightlight: { zoom: .95, tilt: 0 }, snow: { zoom: 1.6, tilt: .2 }, dawn: { zoom: 1.35, tilt: .14 },
};


function rendererName(engine: AbstractEngine): string {
  if (engine.isWebGPU) return 'WebGPU';
  const gl = (engine as Engine)._gl as WebGL2RenderingContext | null;
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const name = String((info && gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) ?? gl?.getParameter(gl.RENDERER) ?? 'WebGL');
  return name.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 80);
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

export class DayDemoController {
  readonly engine: DayDemoEngine;
  private deps: DayDemoSceneDeps;
  private frame = 0;
  private lastFrame = 0;
  private lastSunClock = NaN;
  private lastSunUpdate = 0;
  private lastCcf = 1;
  private ccf = 1;
  private lastWeather: DemoWeather | null = null;
  private lastClockNotify = -Infinity;
  private tour = true;
  private tourTime = 0;
  private framing = { zoom: 1, tilt: 0 };
  private home: { alpha: number; beta: number; radius: number; target: Vector3 } | null = null;
  private instrumentation: SceneInstrumentation;
  private buckets = new Map<string, Bucket>();
  private lastRender = 0;
  private fpsWindow: number[] = [];
  private result?: BenchmarkResult;
  private listeners = new Set<() => void>();
  private view: DayDemoViewState;
  private disposeFns: (() => void)[] = [];
  private preparing: number | undefined;
  private disposed = false;

  constructor(cast: DayDemoCast, hooks: Omit<DayDemoHooks, 'screen'>, deps: DayDemoSceneDeps, language: string) {
    this.deps = deps;
    this.engine = new DayDemoEngine(cast, { ...hooks, screen: renderDemoScreen }, language);
    this.view = this.buildView();
    this.instrumentation = new SceneInstrumentation(deps.scene);
    this.instrumentation.captureFrameTime = true;
    const unsubscribe = this.engine.subscribe(() => this.emit());
    this.disposeFns.push(unsubscribe);
    const observer = deps.scene.onAfterRenderObservable.add(() => this.sample());
    this.disposeFns.push(() => deps.scene.onAfterRenderObservable.remove(observer));
    // Any manual camera input ends the tour: the viewer has taken over.
    const canvas = deps.engine.getRenderingCanvas();
    const takeOver = () => { if (this.tour) { this.tour = false; this.emit(); } };
    canvas?.addEventListener('pointerdown', takeOver);
    canvas?.addEventListener('wheel', takeOver, { passive: true });
    this.disposeFns.push(() => { canvas?.removeEventListener('pointerdown', takeOver); canvas?.removeEventListener('wheel', takeOver); });
    const camera = deps.scene.activeCamera;
    if (camera instanceof ArcRotateCamera) this.home = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone() };
    setSunDateOverride(new Date(new Date().getFullYear(), DEMO_DATE.month, DEMO_DATE.day, 12));
  }

  // --- Control ------------------------------------------------------------------

  async start(speed = 1, startClock?: string): Promise<void> {
    this.engine.setSpeed(speed);
    await this.prepare();
    if (this.disposed) return;
    if (startClock) { this.engine.seek(clockToVirtual(startClock)); this.engine.play(); } else this.engine.start();
    this.resetBenchmark();
    this.syncScene(true);
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      this.frame = requestAnimationFrame(loop);
      const dt = Math.min(250, now - this.lastFrame);
      this.lastFrame = now;
      if (document.hidden) return;
      const wasFinished = this.engine.isFinished;
      this.engine.advance(dt);
      this.updateTour(dt);
      this.syncScene(false);
      if (!wasFinished && this.engine.isFinished) this.finish();
    };
    this.frame = requestAnimationFrame(loop);
  }

  /**
   * Makes lamp switching free of shader work: lamps stay enabled while "off"
   * (intensity 0) and surfaces keep the lamps they get at full power, so the
   * light layout of every material stays fixed for the whole demo. Its shader
   * variants (with sun shadows on and off) and all lamp shadow maps are
   * prepared once here; otherwise each new combination of lamps compiled
   * hundreds of variants mid-demo (stalls up to a second, surfaces missing).
   */
  private async prepare(): Promise<void> {
    const { scene, sun, hemi } = this.deps;
    // Mirror captures (0.1-0.7 s each) would follow every daylight change.
    scene.metadata = { ...scene.metadata, freezeMirrorProbes: true, steadyLamps: true };
    this.preparing = 0;
    this.emit();
    const t0 = performance.now();
    this.engine.seek(0);
    for (const light of scene.lights) {
      if (light === sun || light === hemi || light.isEnabled(false) || !light.getShadowGenerator()) continue;
      light.intensity = 0;
      light.setEnabled(true);
    }
    const { latitude, longitude, northOffset } = this.deps.location();
    // Night (no sun shadow) and day (sun shadow) need separate variants.
    for (const clock of [3 * 60, 13 * 60]) {
      updateSunPosition(sun, hemi, latitude, longitude, clock, northOffset, 1);
      prepareCurrentLightVariants(scene);
      this.preparing = this.preparing! + .3;
      this.emit();
      await new Promise(resolve => setTimeout(resolve, 0));
      if (this.disposed) return;
    }
    // The first frame of each screen kind initialises canvas, fonts and gradients (30-200 ms).
    for (const kind of ['news', 'movie', 'work', 'game'] as const) renderDemoScreen(kind, { frame: 0, clock: 0, title: '', language: 'de-DE', progress: 0 });
    const t1 = performance.now();
    // Lamp shadow maps would otherwise render on first activation (up to ~0.1 s each).
    const maps = await prerenderLampShadowMaps(scene, () => this.disposed);
    const t2 = performance.now();
    if (this.disposed) return;
    // Variants compile in parallel; wait (bounded) until the GPU programs are ready.
    const engine = this.deps.engine as AbstractEngine & { _compiledEffects?: Record<string, { isReady(): boolean }> };
    const pending = () => Object.values(engine._compiledEffects ?? {}).filter(effect => !effect.isReady()).length;
    const total = Math.max(1, pending());
    const deadline = performance.now() + 25000;
    while (pending() && performance.now() < deadline) {
      this.preparing = .7 + .3 * (1 - pending() / total);
      this.emit();
      await new Promise(resolve => setTimeout(resolve, 50));
      if (this.disposed) return;
    }
    console.info(`[DayDemo] Prepared shader variants in ${Math.round(t1 - t0)} ms, ${maps} lamp shadow maps in ${Math.round(t2 - t1)} ms, compile wait ${Math.round(performance.now() - t2)} ms (${pending()} still compiling)`);
    this.preparing = undefined;
    this.emit();
  }

  togglePlay(): void {
    if (this.engine.isPlaying) this.engine.pause();
    else {
      if (this.engine.isFinished) this.restart();
      else this.engine.play();
    }
  }

  restart(): void {
    this.result = undefined;
    this.engine.seek(0);
    this.engine.play();
    this.resetBenchmark();
    this.syncScene(true);
    this.emit();
  }

  seek(virtual: number): void {
    this.engine.seek(virtual);
    // A jump makes the frame statistics meaningless; start a fresh measurement.
    this.resetBenchmark();
    this.result = undefined;
    this.syncScene(true);
    this.emit();
  }

  setSpeed(speed: number): void { this.engine.setSpeed(speed); }
  setLanguage(language: string): void { this.engine.setLanguage(language); }

  setTour(on: boolean): void {
    this.tour = on;
    this.tourTime = 0;
    const camera = this.deps.scene.activeCamera;
    if (on && camera instanceof ArcRotateCamera) this.home = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone() };
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getView = (): DayDemoViewState => this.view;

  dispose(restoreCamera = true): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    // Mirrors catch up with the real daylight; lamps switch off for real again with the next HA states.
    this.deps.scene.metadata = { ...this.deps.scene.metadata, freezeMirrorProbes: false, steadyLamps: false };
    // Blinds moved without refreshing lamp shadows during the demo.
    for (const light of this.deps.scene.lights) if (light !== this.deps.sun) light.getShadowGenerator()?.getShadowMap()?.resetRefreshCounter();
    this.disposeFns.forEach(fn => fn());
    this.instrumentation.dispose();
    this.engine.pause();
    setSunDateOverride(null);
    const camera = this.deps.scene.activeCamera;
    if (restoreCamera && this.home && camera instanceof ArcRotateCamera) {
      camera.alpha = this.home.alpha; camera.beta = this.home.beta; camera.radius = this.home.radius; camera.setTarget(this.home.target.clone());
    }
    this.listeners.clear();
  }

  // --- Scene sync -----------------------------------------------------------------

  private emit(): void {
    this.view = this.buildView();
    for (const listener of this.listeners) listener();
  }

  private buildView(): DayDemoViewState {
    const fps = this.fpsWindow.length > 1 ? (this.fpsWindow.length - 1) * 1000 / (this.fpsWindow[this.fpsWindow.length - 1] - this.fpsWindow[0]) : 0;
    return { ...this.engine.getSnapshot(), tour: this.tour, result: this.result, fps: Math.round(fps), preparing: this.preparing };
  }

  private syncScene(force: boolean): void {
    const { sun, hemi, requestRender } = this.deps;
    const weather = this.engine.weather;
    const last = this.lastWeather;
    if (force || !last || last.weather_code !== weather.weather_code || Math.abs(last.cloud_cover - weather.cloud_cover) >= 2
      || Math.abs(last.rain - weather.rain) >= .25 || Math.abs(last.snowfall - weather.snowfall) >= .1) {
      this.lastWeather = weather;
      this.ccf = this.deps.applyWeather(weather);
    }
    const snapshot = this.engine.getSnapshot();
    const clock = snapshot.clock;
    // Each sun update re-renders its shadow map: at most ~3 per second, and only after
    // the sun moved at least a virtual minute (~0.25°, below a visible shadow step).
    const now = performance.now();
    const sunMoved = !(Math.abs(clock - this.lastSunClock) < 1) || this.ccf !== this.lastCcf;
    if (force || (sunMoved && now - this.lastSunUpdate > 330)) {
      this.lastSunUpdate = now;
      const { latitude, longitude, northOffset } = this.deps.location();
      updateSunPosition(sun, hemi, latitude, longitude, clock, northOffset, this.ccf);
      this.lastSunClock = clock; this.lastCcf = this.ccf;
    }
    if (force || now - this.lastClockNotify > 400) {
      this.lastClockNotify = now;
      this.deps.onClock?.(Math.floor(clock), weather);
    }
    requestRender();
  }

  private updateTour(dt: number): void {
    const camera = this.deps.scene.activeCamera;
    if (!this.tour || !this.home || !(camera instanceof ArcRotateCamera)) return;
    this.tourTime += dt / 1000;
    const t = this.tourTime;
    const intro = Math.min(1, t / 5);
    const smooth = intro * intro * (3 - 2 * intro);
    // A slow orbit (~2.5 min per turn) with gentle tilt and zoom so walls, windows and the park all show.
    const target = CHAPTER_VIEW[this.view.chapter?.id ?? ''] ?? { zoom: 1, tilt: 0 };
    const follow = 1 - Math.exp(-dt / 2600);
    this.framing.zoom += (target.zoom - this.framing.zoom) * follow;
    this.framing.tilt += (target.tilt - this.framing.tilt) * follow;
    const cinematicBeta = Math.min(1.05, Math.max(.62, this.home.beta)) + this.framing.tilt;
    const beta = this.home.beta + (cinematicBeta - this.home.beta) * smooth + .1 * Math.sin(t * Math.PI * 2 / 41) * smooth;
    camera.alpha += dt / 1000 * .042 * smooth;
    camera.beta = Math.max(camera.lowerBetaLimit ?? .05, Math.min(camera.upperBetaLimit ?? 1.5, beta));
    const zoom = 1 + (this.framing.zoom - 1) * smooth;
    const radius = this.home.radius * zoom * (1 + .05 * Math.sin(t * Math.PI * 2 / 57) * smooth);
    camera.radius = Math.max(camera.lowerRadiusLimit ?? 0, Math.min(camera.upperRadiusLimit ?? Infinity, radius));
  }

  // --- Benchmark --------------------------------------------------------------------

  private resetBenchmark(): void {
    this.buckets.clear();
    this.lastRender = 0;
  }

  private sample(): void {
    const now = performance.now();
    this.fpsWindow.push(now);
    while (this.fpsWindow.length > 2 && now - this.fpsWindow[0] > 1000) this.fpsWindow.shift();
    const previous = this.lastRender;
    this.lastRender = now;
    if (!previous || !this.engine.isPlaying || document.hidden) return;
    const gap = now - previous;
    if (gap > 1000) return;
    const chapter = CHAPTERS[Math.max(0, this.view.chapterIndex)]?.chapter.id ?? 'night';
    let bucket = this.buckets.get(chapter);
    if (!bucket) { bucket = { frames: 0, ms: 0, cpu: 0, draws: 0, gaps: [] }; this.buckets.set(chapter, bucket); }
    bucket.frames++; bucket.ms += gap;
    bucket.cpu += this.instrumentation.frameTimeCounter.current;
    bucket.draws = Math.max(bucket.draws, this.instrumentation.drawCallsCounter.current);
    if (bucket.gaps.length < 6000) bucket.gaps.push(gap);
  }

  private finish(): void {
    const chapters: ChapterResult[] = [];
    let frames = 0, ms = 0, cpu = 0, draws = 0;
    const gaps: number[] = [];
    for (const { chapter } of CHAPTERS) {
      const bucket = this.buckets.get(chapter.id);
      if (!bucket || !bucket.frames) continue;
      chapters.push({
        id: chapter.id, frames: bucket.frames, fps: +(bucket.frames * 1000 / bucket.ms).toFixed(1),
        p95: +percentile(bucket.gaps, .95).toFixed(1), cpu: +(bucket.cpu / bucket.frames).toFixed(2), draws: bucket.draws,
      });
      frames += bucket.frames; ms += bucket.ms; cpu += bucket.cpu; draws = Math.max(draws, bucket.draws);
      gaps.push(...bucket.gaps);
    }
    const fps = ms ? frames * 1000 / ms : 0;
    const p99 = percentile(gaps, .99);
    const low1 = p99 ? 1000 / p99 : 0;
    // Average frame rate, discounted for stutter (1 % lows well below the average).
    const score = Math.round(fps * 100 * Math.pow(Math.min(1, low1 / Math.max(1, fps)), .35));
    const engine = this.deps.engine;
    this.result = {
      score, fps: +fps.toFixed(1), p95: +percentile(gaps, .95).toFixed(1), low1: +low1.toFixed(1),
      cpu: frames ? +(cpu / frames).toFixed(2) : 0, draws, frames, seconds: +(ms / 1000).toFixed(1),
      renderer: rendererName(engine), resolution: `${engine.getRenderWidth()} × ${engine.getRenderHeight()}`,
      speed: this.engine.getSnapshot().speed, tour: this.tour, chapters,
    };
    console.info('[DayDemo] Benchmark', this.result);
    this.emit();
  }
}
