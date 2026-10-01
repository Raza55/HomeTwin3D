/** Pause screen work in hidden tabs; resuming draws the latest state immediately. */
export class VisibleScreenUpdates {
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(private refresh: () => void, private pause: () => void) {
    document.addEventListener('visibilitychange', this.visibilityChanged);
  }

  get visible(): boolean { return !this.disposed && !document.hidden; }

  setTicking(ticking: boolean): void {
    if (!ticking || !this.visible) { this.stop(); return; }
    this.timer ??= setInterval(() => { if (this.visible) this.refresh(); }, 1000);
  }

  private stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private visibilityChanged = (): void => {
    if (this.disposed) return;
    if (document.hidden) { this.stop(); this.pause(); }
    else this.refresh();
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
  }
}
