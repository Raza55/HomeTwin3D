import type { AbstractEngine } from '@babylonjs/core';

/**
 * Safari on iPadOS drops the WebGL context under GPU memory pressure, after the
 * screen was locked or when the tab stayed in the background. The HUD stays, but
 * the canvas turns empty. Babylon rebuilds all GPU resources when the browser
 * restores the context; WebKit often never does. Without a restore within a few
 * seconds the page reloads (only while visible, at most a few times per
 * session, so a device that keeps losing its context does not reload forever).
 *
 * Counts survive the reload (sessionStorage) and show in the `?perf` overlay.
 */
const RESTORE_TIMEOUT_MS = 4000;
const RELOAD_WINDOW_MS = 10 * 60_000;
const MAX_RELOADS_PER_WINDOW = 3;
const STATS_KEY = 'hometwin.contextLoss';

interface Stats { lost: number; restored: number; reloads: number[] }

function readStats(): Stats {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STATS_KEY) ?? 'null') as Partial<Stats> | null;
    if (stored) return { lost: stored.lost ?? 0, restored: stored.restored ?? 0, reloads: stored.reloads ?? [] };
  } catch { /* storage blocked: counts stay per page */ }
  return { lost: 0, restored: 0, reloads: [] };
}

let stats = readStats();
function saveStats(): void {
  try { sessionStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* see readStats */ }
}

/** Overlay text, e.g. "ctx lost 2 restored 1 reloads 1". */
export function contextLossSummary(): string {
  return `ctx lost ${stats.lost} restored ${stats.restored} reloads ${stats.reloads.length}`;
}

/** Calls `onRestored` after Babylon rebuilt the context; reloads when it never comes back. */
export function installContextLossRecovery(engine: AbstractEngine, onRestored: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waitingForVisible = false;

  const reload = () => {
    if (document.hidden) {
      // A hidden page may still get its context back when shown again.
      if (!waitingForVisible) { waitingForVisible = true; document.addEventListener('visibilitychange', onVisible); }
      return;
    }
    const now = Date.now();
    stats.reloads = stats.reloads.filter(time => now - time < RELOAD_WINDOW_MS);
    if (stats.reloads.length >= MAX_RELOADS_PER_WINDOW) {
      console.error('[ContextLoss] WebGL context not restored, reload limit reached');
      return;
    }
    stats.reloads.push(now);
    saveStats();
    console.warn('[ContextLoss] WebGL context not restored, reloading');
    location.reload();
  };
  const onVisible = () => {
    if (document.hidden) return;
    waitingForVisible = false;
    document.removeEventListener('visibilitychange', onVisible);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; reload(); }, RESTORE_TIMEOUT_MS);
  };

  const lost = engine.onContextLostObservable.add(() => {
    stats.lost++;
    saveStats();
    console.warn('[ContextLoss] WebGL context lost');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; reload(); }, RESTORE_TIMEOUT_MS);
  });
  const restored = engine.onContextRestoredObservable.add(() => {
    stats.restored++;
    saveStats();
    console.warn('[ContextLoss] WebGL context restored');
    if (timer) { clearTimeout(timer); timer = null; }
    if (waitingForVisible) { waitingForVisible = false; document.removeEventListener('visibilitychange', onVisible); }
    onRestored();
  });

  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    engine.onContextLostObservable.remove(lost);
    engine.onContextRestoredObservable.remove(restored);
  };
}
