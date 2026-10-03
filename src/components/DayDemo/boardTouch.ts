/**
 * Day demo: a visible fingertip that operates the board like a person would.
 * It taps a lamp or blind, then the real buttons and sliders of the popup that
 * opens; every change goes through the popup's own service calls.
 */
import './boardTouch.css';

export type BoardControl =
  /** A colour button (`swatch`) or a white temperature (`kelvin`, slider), then the brightness. */
  | { kind: 'light'; entityId: string; swatch?: string; kelvin?: number; brightness: number }
  | { kind: 'blinds'; entityId: string; position: number }
  /** The TV Dial popup: picks this source (its label, e.g. SHIELD). */
  | { kind: 'tv'; source: string }
  /** Long press on a marker (the PC's: switches it on). */
  | { kind: 'hold'; target: string }
  /** Taps these buttons of the marker filter on the plan's right edge. */
  | { kind: 'filter'; categories: string[] };

/** Controls that open a device popup (lamp or blind). */
export type PopupControl = Exclude<BoardControl, { kind: 'filter' }>;

export interface BoardTouchDeps {
  /** Screen position of a lamp or blind (null: not in view). */
  point(control: PopupControl): { x: number; y: number } | null;
  /** Opens the popup as a tap there would. */
  open(control: PopupControl, x: number, y: number): void;
}

class Cancelled extends Error {}

export class BoardTouch {
  private finger = document.createElement('div');
  private abort: AbortController | null = null;
  /** Interactions run one after another (a filter change and a lamp at the same moment). */
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(private deps: BoardTouchDeps) {
    this.finger.className = 'board-finger';
    this.finger.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.finger);
  }

  /** Queues one interaction behind the running one; cancel() drops all of them. */
  run(control: BoardControl): Promise<void> {
    const generation = this.generation;
    const job = this.queue.then(() => generation === this.generation ? this.exec(control) : undefined);
    this.queue = job.catch(() => {});
    return job;
  }

  private async exec(control: BoardControl): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;
    try {
      // Not while the plan is veiled (switching between textures and the energy view).
      for (let i = 0; i < 40 && document.querySelector('.day-demo-veil.on'); i++) await this.wait(100, abort.signal);
      if (control.kind === 'light') await this.light(control, abort.signal);
      else if (control.kind === 'filter') await this.filter(control, abort.signal);
      else if (control.kind === 'tv') await this.tv(control, abort.signal);
      else if (control.kind === 'hold') await this.hold(control, abort.signal);
      else await this.blinds(control, abort.signal);
    } catch (error) {
      if (!(error instanceof Cancelled)) console.warn('[DayDemo] Board interaction failed:', error);
    } finally {
      if (this.abort === abort) { this.abort = null; this.finger.classList.remove('visible', 'press'); }
    }
  }

  /** Stops a running interaction and closes its popup (jumps, restart, end of the demo). */
  cancel(): void {
    this.generation++;
    if (!this.abort) return;
    this.abort.abort();
    this.abort = null;
    this.finger.classList.remove('visible', 'press');
    document.querySelector<HTMLButtonElement>('.light-quick button[aria-label$="steuerung schließen"]')?.click();
  }

  dispose(): void { this.cancel(); this.finger.remove(); }

  private async light(control: Extract<BoardControl, { kind: 'light' }>, signal: AbortSignal): Promise<void> {
    const popup = await this.openPopup(control, '.light-quick:not(.blind-quick)', signal);
    // A lamp group's popup shows the colour wheel first: switch to its white tab.
    const whiteTab = control.kelvin !== undefined ? [...popup.querySelectorAll<HTMLButtonElement>('.cluster-tabs button')].find(b => b.textContent?.trim() === 'Weiß' && !b.classList.contains('active')) : undefined;
    if (whiteTab) { await this.press(whiteTab, signal); await this.wait(450, signal); }
    const temperature = control.kelvin !== undefined ? popup.querySelector<HTMLInputElement>('input[aria-label="Weißtemperatur"]') : null;
    if (temperature) { await this.drag(temperature, control.kelvin!, signal); await this.wait(800, signal); }
    else {
      const swatch = popup.querySelector<HTMLButtonElement>(`button[aria-label="Farbe ${control.swatch}"]`)
        ?? popup.querySelector<HTMLButtonElement>('.light-quick-colors button');
      if (swatch) { await this.press(swatch, signal); await this.wait(800, signal); }
    }
    const slider = popup.querySelector<HTMLInputElement>('input[aria-label="Helligkeit"]');
    if (slider) { await this.drag(slider, control.brightness, signal); await this.wait(900, signal); }
    const close = popup.querySelector<HTMLButtonElement>('button[aria-label="Lichtsteuerung schließen"]');
    if (close) await this.press(close, signal);
  }

  private async blinds(control: Extract<BoardControl, { kind: 'blinds' }>, signal: AbortSignal): Promise<void> {
    const popup = await this.openPopup(control, '.blind-quick', signal);
    const verb = control.position === 0 ? 'schließen' : 'öffnen';
    // The room section moves every blind there at once; a single blind is the fallback.
    const room = await this.find(`.blind-quick .blind-room button[aria-label$="${verb}"]`, signal, 1200).catch(() => null);
    const button = room ?? popup.querySelector<HTMLButtonElement>(`button[aria-label="Rollo ${verb}"]`);
    if (button) { await this.press(button, signal); await this.wait(1400, signal); }
    const close = popup.querySelector<HTMLButtonElement>('button[aria-label="Rollosteuerung schließen"]');
    if (close) await this.press(close, signal);
  }

  private async tv(control: Extract<BoardControl, { kind: 'tv' }>, signal: AbortSignal): Promise<void> {
    const popup = await this.openPopup(control, '.tv-dial-popup', signal);
    const choice = [...popup.querySelectorAll<HTMLButtonElement>('.tv-dial-grid button')].find(b => b.querySelector('strong')?.textContent?.trim().startsWith(control.source));
    if (choice) { await this.press(choice, signal); await this.wait(1300, signal); }
    const close = popup.querySelector<HTMLButtonElement>('button[aria-label="TV-Steuerung schließen"]');
    if (close) await this.press(close, signal);
  }

  /** Finger glides to the marker and holds it down; a ring fills while it is held. */
  private async hold(control: Extract<BoardControl, { kind: 'hold' }>, signal: AbortSignal): Promise<void> {
    // The marker may appear a frame after a filter change.
    let p = this.deps.point(control);
    for (let i = 0; !p && i < 15; i++) { await this.wait(100, signal); p = this.deps.point(control); }
    if (!p) return;
    this.place(p.x + 140, p.y + 170, 0);
    await this.wait(30, signal);
    this.finger.classList.add('visible');
    await this.moveTo(p.x, p.y, 750, signal);
    this.finger.classList.add('press', 'hold');
    await this.wait(1100, signal);
    this.finger.classList.remove('press', 'hold');
    this.finger.classList.remove('ripple'); void this.finger.offsetWidth; this.finger.classList.add('ripple');
    this.deps.open(control, p.x, p.y);
    await this.wait(700, signal);
  }

  /** The marker filter: the finger taps each category button that changes. */
  private async filter(control: Extract<BoardControl, { kind: 'filter' }>, signal: AbortSignal): Promise<void> {
    const buttons = control.categories.map(c => document.querySelector<HTMLButtonElement>(`.dashboard-marker-filter button[data-category="${c}"]`)).filter((b): b is HTMLButtonElement => !!b);
    if (!buttons.length) return;
    const first = buttons[0].getBoundingClientRect();
    this.place(first.left - 120, first.top + 90, 0);
    await this.wait(30, signal);
    this.finger.classList.add('visible');
    for (const button of buttons) { await this.press(button, signal); await this.wait(180, signal); }
    await this.wait(250, signal);
  }

  /** Finger glides in, taps the device, the popup opens. */
  private async openPopup(control: PopupControl, selector: string, signal: AbortSignal): Promise<HTMLElement> {
    const p = this.deps.point(control) ?? { x: innerWidth / 2, y: innerHeight * .4 };
    this.place(p.x + 140, p.y + 170, 0);
    await this.wait(30, signal);
    this.finger.classList.add('visible');
    await this.moveTo(p.x, p.y, 750, signal);
    await this.tap(signal);
    this.deps.open(control, p.x, p.y);
    const popup = await this.find(selector, signal, 2000);
    await this.wait(650, signal);
    return popup;
  }

  /** Taps a button of the popup (a real click). */
  private async press(element: HTMLElement, signal: AbortSignal): Promise<void> {
    const r = element.getBoundingClientRect();
    // Not on screen (closed popup, hidden bar): nothing to tap.
    if (!r.width || !r.height) return;
    await this.moveTo(r.left + r.width / 2, r.top + r.height / 2, 520, signal);
    await this.tap(signal);
    if (!element.isConnected) return;
    if ((element as HTMLButtonElement).disabled) { console.warn('[DayDemo] Board button is disabled:', element.getAttribute('aria-label')); return; }
    element.click();
  }

  /** Pulls a range slider to `value` as a finger would; the popup commits on release. */
  private async drag(slider: HTMLInputElement, value: number, signal: AbortSignal): Promise<void> {
    const r = slider.getBoundingClientRect();
    const min = Number(slider.min || 0), max = Number(slider.max || 100), from = Number(slider.value);
    const x = (v: number) => r.left + (v - min) / (max - min) * r.width, y = r.top + r.height / 2;
    await this.moveTo(x(from), y, 520, signal);
    this.finger.classList.add('press');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const start = performance.now(), duration = 1100;
    for (;;) {
      const t = Math.min(1, (performance.now() - start) / duration), u = t * t * (3 - 2 * t);
      const v = Math.round(from + (value - from) * u);
      setter.call(slider, String(v));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      this.place(x(v), y, 0);
      if (t >= 1) break;
      await this.wait(16, signal);
    }
    slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    this.finger.classList.remove('press');
  }

  private async tap(signal: AbortSignal): Promise<void> {
    this.finger.classList.add('press');
    await this.wait(170, signal);
    this.finger.classList.remove('press');
    this.finger.classList.remove('ripple'); void this.finger.offsetWidth; this.finger.classList.add('ripple');
    await this.wait(200, signal);
  }

  private place(x: number, y: number, ms: number): void {
    this.finger.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4, 0, .2, 1), opacity .25s` : 'opacity .25s';
    this.finger.style.transform = `translate(${x}px, ${y}px)`;
  }

  private async moveTo(x: number, y: number, ms: number, signal: AbortSignal): Promise<void> {
    this.place(x, y, ms);
    await this.wait(ms + 40, signal);
  }

  private async find(selector: string, signal: AbortSignal, timeout: number): Promise<HTMLElement> {
    const end = performance.now() + timeout;
    for (;;) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
      if (performance.now() > end) throw new Error(`${selector} did not appear`);
      await this.wait(50, signal);
    }
  }

  private wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Cancelled()); return; }
      const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
      const stop = () => { clearTimeout(timer); reject(new Cancelled()); };
      signal.addEventListener('abort', stop, { once: true });
    });
  }
}
