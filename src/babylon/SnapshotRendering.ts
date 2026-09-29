import { Constants, RenderTargetTexture, type AbstractEngine, type Scene, type WebGPUEngine } from '@babylonjs/core';

/**
 * WebGPU snapshot rendering: the frame's GPU commands are recorded once as
 * render bundles and replayed while only the camera moves, so a frame costs a
 * few milliseconds of CPU no matter how many draws the apartment needs. That
 * per-draw CPU cost dominates on iPad (WebKit), where camera movement stuttered.
 *
 * In FAST mode Babylon skips mesh evaluation and material binding entirely, so
 * anything else that changes must re-record: scene changes found by the
 * SceneChangeMonitor (lights, materials, transforms, visibility, animations,
 * dynamic textures), explicit render requests (HA updates), added or removed
 * meshes. A second re-record shortly after each one picks up meshes whose
 * shaders were still compiling during the first recording.
 *
 * Babylon renders every render target in every frame while snapshot rendering
 * is on (to keep the recorded pass order), including on-demand targets that
 * are already up to date: mirror probes and lamp shadow maps (refreshRate 0).
 * Those are skipped consistently in recording and replay; when one becomes
 * stale (mirror refresh, door moved) recording pauses for that frame, the
 * target renders normally, and recording restarts. Camera-dependent targets
 * (glow, glass transmission) keep rendering every frame.
 *
 * `?snapshot=1` enables it (WebGPU only, i.e. with `?engine=webgpu`); `?snapshot=0` disables.
 */
export interface SnapshotController {
  /** Something visible changed: record the next frame again. */
  invalidate(): void;
  /** Call right before scene.render(); applies all snapshot switches for that frame. */
  prepareFrame(): void;
  readonly active: boolean;
  dispose(): void;
}

export function snapshotRenderingRequested(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('snapshot') === '1';
}

const FOLLOW_UP_MS = 1000;

type SkippableTarget = RenderTargetTexture & { __snapshotSkip?: boolean };
let skipInstalled = false;
/** Lets the controller skip up-to-date on-demand targets while recording/replaying. */
function installTargetSkip(): void {
  if (skipInstalled) return;
  skipInstalled = true;
  const prototype = RenderTargetTexture.prototype as unknown as { _shouldRender(this: SkippableTarget): boolean };
  const original = prototype._shouldRender;
  prototype._shouldRender = function (this: SkippableTarget) { return this.__snapshotSkip ? false : original.call(this); };
}

/** Targets that follow the camera and must render in every frame. */
function cameraTargets(scene: Scene): Set<unknown> {
  const set = new Set<unknown>();
  for (const layer of scene.effectLayers) set.add((layer as unknown as { _mainTexture?: unknown })._mainTexture);
  const transmission = (scene as unknown as { _transmissionHelper?: { getOpaqueTarget(): unknown } })._transmissionHelper;
  if (transmission) set.add(transmission.getOpaqueTarget());
  return set;
}

/** Shadow maps of lights that currently cast no shadow never render, so they are never pending. */
function idleShadowMaps(scene: Scene): Set<unknown> {
  const set = new Set<unknown>();
  for (const light of scene.lights) {
    const idle = !light.isEnabled() || !light.shadowEnabled;
    for (const generator of light.getShadowGenerators()?.values() ?? []) if (idle) set.add(generator.getShadowMap());
  }
  return set;
}

/** A stale target that still has not rendered after this many paused frames is skipped anyway. */
const MAX_PENDING_FRAMES = 10;

/** Compiles and async textures settle before the first recording. */
const START_DELAY_MS = 3000;

export function setupSnapshotRendering(scene: Scene, engine: AbstractEngine): SnapshotController | null {
  if (!engine.isWebGPU || !snapshotRenderingRequested()) return null;
  installTargetSkip();
  const webgpu = engine as WebGPUEngine;
  // Starts paused: the first prepared frame after the start delay records.
  let active = false, disposed = false, paused = true, resetPending = false;
  let followUp: ReturnType<typeof setTimeout> | null = null;
  const skipped = new Set<SkippableTarget>();
  const waiting = new Map<RenderTargetTexture, number>();
  const clearSkips = () => { for (const target of skipped) target.__snapshotSkip = false; skipped.clear(); };
  const invalidate = () => {
    if (!active) return;
    resetPending = true;
    if (followUp) clearTimeout(followUp);
    followUp = setTimeout(() => { followUp = null; resetPending = true; }, FOLLOW_UP_MS);
  };
  const start = setTimeout(() => {
    scene.executeWhenReady(() => { if (!disposed) active = true; });
  }, START_DELAY_MS);
  const added = scene.onNewMeshAddedObservable.add(invalidate);
  const removed = scene.onMeshRemovedObservable.add(invalidate);

  /** Stale on-demand targets and one-off captures that must render outside the snapshot. */
  const pendingTargets = (onDemand: SkippableTarget[]) => {
    let pending = scene.customRenderTargets.length + (scene.activeCamera?.customRenderTargets.length ?? 0) > 0;
    const followCamera = cameraTargets(scene);
    const idle = idleShadowMaps(scene);
    for (const texture of scene.textures) {
      if (!(texture instanceof RenderTargetTexture) || texture.refreshRate !== 0 || followCamera.has(texture)) continue;
      onDemand.push(texture);
      if (texture.currentRefreshId !== -1 || idle.has(texture)) { waiting.delete(texture); continue; }
      const frames = (waiting.get(texture) ?? 0) + 1;
      waiting.set(texture, frames);
      if (frames <= MAX_PENDING_FRAMES) pending = true;
    }
    return pending;
  };

  return {
    invalidate,
    get active() { return active; },
    prepareFrame() {
      if (!active) return;
      // Every switch happens here, before scene.render(): Babylon picks the fast
      // path at the start of a frame, and a reset later in the frame would
      // record (and then replay) a nearly empty frame.
      const onDemand: SkippableTarget[] = [];
      if (pendingTargets(onDemand)) {
        if (!paused) { paused = true; engine.snapshotRendering = false; }
        clearSkips();
        return;
      }
      for (const target of onDemand) if (!target.__snapshotSkip) { target.__snapshotSkip = true; skipped.add(target); }
      if (paused) {
        paused = false;
        engine.snapshotRenderingMode = Constants.SNAPSHOTRENDERING_FAST;
        engine.snapshotRendering = true;
      } else if (resetPending) {
        webgpu.snapshotRenderingReset();
      }
      resetPending = false;
    },
    dispose() {
      disposed = true;
      clearTimeout(start);
      if (followUp) clearTimeout(followUp);
      scene.onNewMeshAddedObservable.remove(added);
      scene.onMeshRemovedObservable.remove(removed);
      clearSkips();
      if (active && !paused) engine.snapshotRendering = false;
      active = false;
    },
  };
}
