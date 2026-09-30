import type { Scene } from '@babylonjs/core';
import { getRenderBatchSet } from './RenderBatch';
import { SceneChangeMonitor } from './SceneChangeMonitor';

/**
 * Render self-checks for manual QA in a real browser (GPU and the real model
 * are needed, so they do not run in CI). Available in dev builds and with
 * `?qa`, as `window.__hometwinQa` in the browser console:
 *
 *   await __hometwinQa.compareBatches()  // merged batches vs. their sources, pixel by pixel
 *   __hometwinQa.checkIdle()              // change reasons still reported after settling
 *
 * compareBatches renders the same view twice back to back, so animations do
 * not count; differences show real shading or drawing-order changes.
 */
export interface RenderQa {
  compareBatches(threshold?: number): Promise<{ pixels: number; differing: number; share: string; max: number }>;
  checkIdle(frames?: number): string[];
}

export function installRenderQa(scene: Scene): void {
  const wanted = import.meta.env?.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('qa'));
  if (!wanted || typeof window === 'undefined') return;
  const engine = scene.getEngine();
  const frame = () => { engine.beginFrame(); scene.render(); engine.endFrame(); };
  const grab = async () => {
    frame();
    const width = engine.getRenderWidth(), height = engine.getRenderHeight();
    engine.beginFrame(); scene.render();
    const pixels = await engine.readPixels(0, 0, width, height);
    engine.endFrame();
    return new Uint8Array((pixels as ArrayBufferView).buffer.slice(0));
  };
  const qa: RenderQa = {
    async compareBatches(threshold = 2) {
      const set = getRenderBatchSet(scene) as unknown as { batches?: Array<{ active: boolean }>; version: number } | undefined;
      const batches = set?.batches ?? [];
      const merged = await grab();
      const before = batches.map(batch => batch.active);
      batches.forEach(batch => { batch.active = false; });
      if (set) set.version++;
      const sources = await grab();
      batches.forEach((batch, i) => { batch.active = before[i]; });
      if (set) set.version++;
      frame();
      let differing = 0, max = 0;
      for (let i = 0; i < merged.length; i += 4) {
        const d = Math.max(Math.abs(merged[i] - sources[i]), Math.abs(merged[i + 1] - sources[i + 1]), Math.abs(merged[i + 2] - sources[i + 2]));
        if (d > threshold) { differing++; max = Math.max(max, d); }
      }
      const pixels = merged.length / 4;
      return { pixels, differing, share: `${(differing / pixels * 100).toFixed(3)}%`, max };
    },
    checkIdle(frames = 10) {
      const monitor = new SceneChangeMonitor(scene);
      const reasons: string[] = [];
      for (let i = 0; i < frames; i++) {
        frame();
        if (monitor.check() && i >= 2) reasons.push(`frame ${i}: ${monitor.lastReason}`);
      }
      return reasons;
    },
  };
  (window as Window & { __hometwinQa?: RenderQa }).__hometwinQa = qa;
}
