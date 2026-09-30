import { EngineInstrumentation, SceneInstrumentation, type AbstractEngine, type Engine, type Scene } from '@babylonjs/core';
import { clusteredLightingMode } from './FloorplanLighting';
import { isTabletClass } from './DeviceClass';
import { markStartup, startupPhase, startupSummary } from './StartupTiming';

declare const __HOMETWIN_BUILD__: string;

/**
 * Read-only performance readout, enabled with `?perf` in the page URL.
 * Meant for devices without developer tools at hand (e.g. an iPad on the wall):
 * FPS, CPU time per rendered frame, the worst frame gap (stutter), draw calls,
 * JS memory where the browser exposes it, and the active rendering options.
 */
export function createPerfOverlay(engine: AbstractEngine, scene: Scene): () => void {
  const instrumentation = new SceneInstrumentation(scene);
  instrumentation.captureFrameTime = true;
  // Breakdown of the CPU time: visibility, shadow/glow/other targets, main pass, shader compiles.
  instrumentation.captureActiveMeshesEvaluationTime = true;
  instrumentation.captureRenderTargetsRenderTime = true;
  instrumentation.captureCameraRenderTime = true;
  const engineInstrumentation = new EngineInstrumentation(engine);
  engineInstrumentation.captureShaderCompilationTime = true;
  let evaluation = 0, targets = 0, camera = 0, compileStart = engineInstrumentation.shaderCompilationTimeCounter.total;

  const panel = document.createElement('div');
  panel.setAttribute('aria-hidden', 'true');
  Object.assign(panel.style, {
    position: 'fixed', left: '8px', bottom: '8px', zIndex: '99999', pointerEvents: 'none',
    font: '12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre',
    color: '#e2e8f0', background: 'rgba(2, 6, 23, 0.78)', padding: '6px 8px', borderRadius: '6px',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(panel);

  let renderer: string;
  if (engine.isWebGPU) {
    const info = (engine as unknown as { _adapterInfo?: { vendor?: string; architecture?: string; description?: string } })._adapterInfo;
    renderer = `WebGPU ${info?.description || [info?.vendor, info?.architecture].filter(Boolean).join(' ') || ''}`.trim();
  } else {
    const gl = (engine as Engine)._gl as WebGL2RenderingContext | null;
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    renderer = `WebGL ${String((debugInfo && gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) ?? gl?.getParameter(gl.RENDERER) ?? '?')
      .replace(/^ANGLE \((.*)\)$/, '$1')}`;
  }
  renderer = renderer.slice(0, 64);
  const browserEngine = 'userAgentData' in navigator ? 'Chromium' : /AppleWebKit/.test(navigator.userAgent) ? 'WebKit' : 'other';

  let frames = 0, cpu = 0, draws = 0, worstGap = 0, last = performance.now(), loopStart = engine.frameId;
  const onFrame = scene.onAfterRenderObservable.add(() => {
    // First frame with every shader ready (checked only until then).
    if (startupPhase('ready') && !startupPhase('frame') && scene.isReady(false)) markStartup('frame');
    const now = performance.now();
    worstGap = Math.max(worstGap, now - last);
    last = now;
    frames++;
    cpu += instrumentation.frameTimeCounter.current;
    evaluation += instrumentation.activeMeshesEvaluationTimeCounter.current;
    targets += instrumentation.renderTargetsRenderTimeCounter.current;
    camera += instrumentation.cameraRenderTimeCounter.current;
    draws += instrumentation.drawCallsCounter.current;
  });

  let windowStart = performance.now();
  // What kept the app awake during the last window (see WakeStats in SceneManager).
  type Stats = { input: Record<string, number>; requests: number; markerRequests: number; viewMoves: number; changes: Record<string, number> };
  const copy = (s?: Stats): Stats => ({ input: { ...s?.input }, requests: s?.requests ?? 0, markerRequests: s?.markerRequests ?? 0, viewMoves: s?.viewMoves ?? 0, changes: { ...s?.changes } });
  let wakeStart = copy(scene.metadata?.wakeStats);
  const wakeLine = () => {
    const now = copy(scene.metadata?.wakeStats), top = (a: Record<string, number>, b: Record<string, number>) =>
      Object.entries(a).map(([k, v]) => [k, v - (b[k] ?? 0)] as const).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(', ') || '–';
    const line = `wake: input ${top(now.input, wakeStart.input)} · req ${now.requests - wakeStart.requests} (icons ${now.markerRequests - wakeStart.markerRequests}) · view ${now.viewMoves - wakeStart.viewMoves} · change ${top(now.changes, wakeStart.changes)}`;
    wakeStart = now;
    return line;
  };
  const timer = window.setInterval(() => {
    const now = performance.now();
    const seconds = (now - windowStart) / 1000;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const per = (total: number) => (frames ? total / frames : 0).toFixed(1);
    panel.textContent = [
      // loop: render-loop passes per second (idle frames the app skipped count too; ~2 while it sleeps).
      `FPS ${(frames / seconds).toFixed(1)}   CPU ${(frames ? cpu / frames : 0).toFixed(1)} ms   worst ${worstGap.toFixed(0)} ms   loop ${((engine.frameId - loopStart) / seconds).toFixed(0)}/s`,
      `draws ${frames ? Math.round(draws / frames) : 0}   JS heap ${memory ? `${Math.round(memory.usedJSHeapSize / 1e6)} MB` : 'n/a'}`,
      `${engine.getRenderWidth()}×${engine.getRenderHeight()}   UBO ${engine.isWebGPU || (engine as Engine).supportsUniformBuffers ? 'on' : 'off'}   ${browserEngine}`,
      `eval ${per(evaluation)}  targets ${per(targets)}  main ${per(camera)}  other ${per(cpu - camera - evaluation)}  shaders ${(engineInstrumentation.shaderCompilationTimeCounter.total - compileStart).toFixed(0)} ms`,
      startupSummary(),
      wakeLine(),
      `${renderer}   build ${typeof __HOMETWIN_BUILD__ === 'string' ? __HOMETWIN_BUILD__ : '?'}   cluster ${clusteredLightingMode()}   ${isTabletClass() ? 'tablet' : 'desktop'}`,
    ].join('\n');
    compileStart = engineInstrumentation.shaderCompilationTimeCounter.total;
    frames = 0; cpu = 0; draws = 0; worstGap = 0; evaluation = 0; targets = 0; camera = 0; windowStart = now; loopStart = engine.frameId;
  }, 2000);

  return () => {
    window.clearInterval(timer);
    scene.onAfterRenderObservable.remove(onFrame);
    instrumentation.dispose();
    engineInstrumentation.dispose();
    panel.remove();
  };
}
