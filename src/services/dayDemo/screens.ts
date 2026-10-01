/**
 * Procedural screen content for the day demo (TV and PC monitor). Original
 * vector drawings rendered into one reusable canvas: no external images, no
 * network, and nothing that could be mistaken for a real broadcast.
 */
import type { ScreenFrame } from './engine.ts';
import type { ScreenKind } from './story.ts';
import { clockLabel } from './story.ts';

const W = 960, H = 540;
let canvas: HTMLCanvasElement | null = null;

function context(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  canvas ??= Object.assign(document.createElement('canvas'), { width: W, height: H });
  return canvas.getContext('2d');
}

/** Deterministic pseudo-random numbers so stars and code lines stay put between frames. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const de = (frame: ScreenFrame) => frame.language.startsWith('de');

function drawNews(ctx: CanvasRenderingContext2D, f: ScreenFrame): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0a1f4d'); g.addColorStop(1, '#173d85');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Studio light beams and a globe made of meridians.
  ctx.save(); ctx.globalAlpha = .12; ctx.fillStyle = '#9fc3ff';
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(120 + i * 180, 0); ctx.lineTo(60 + i * 190, H); ctx.lineTo(140 + i * 190, H); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.translate(700, 215); ctx.strokeStyle = '#6fa8ff88'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 130, 0, Math.PI * 2); ctx.stroke();
  const turn = f.frame * .18;
  for (let i = 0; i < 6; i++) { const rx = Math.abs(Math.cos(turn + i * Math.PI / 6)) * 130; ctx.beginPath(); ctx.ellipse(0, 0, rx, 130, 0, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(0, i * 45, Math.sqrt(130 ** 2 - (i * 45) ** 2), 10, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  const headlines = de(f)
    ? ['Gewitterfront erreicht am Nachmittag den Süden', 'Energie: Solarstrom deckt heute 68 % des Bedarfs', 'Verkehr: freie Fahrt auf den Hauptachsen', 'Sport: Heimsieg im Spitzenspiel', 'Kultur: Lange Nacht der Museen am Wochenende']
    : ['Thunderstorm front reaches the south this afternoon', 'Energy: solar covers 68 % of demand today', 'Traffic: main roads clear', 'Sport: home win in the top match', 'Culture: museum night this weekend'];
  ctx.fillStyle = '#ffffff'; ctx.font = '800 54px system-ui'; ctx.fillText(de(f) ? 'MORGENMAGAZIN' : 'MORNING SHOW', 56, 110);
  ctx.fillStyle = '#9cc2ff'; ctx.font = '500 24px system-ui'; ctx.fillText(de(f) ? 'Live aus dem Studio' : 'Live from the studio', 58, 148);
  // Lower third.
  ctx.fillStyle = '#d6202b'; ctx.fillRect(0, 360, 200, 64);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 30px system-ui'; ctx.fillText(de(f) ? 'AKTUELL' : 'LATEST', 26, 403);
  ctx.fillStyle = '#ffffffee'; ctx.fillRect(200, 360, W - 200, 64);
  ctx.fillStyle = '#0b1f45'; ctx.font = '700 28px system-ui'; ctx.fillText(headlines[Math.floor(f.frame / 3) % headlines.length], 222, 403);
  ctx.fillStyle = '#071331'; ctx.fillRect(0, 470, W, 70);
  ctx.fillStyle = '#ffd35a'; ctx.font = '700 24px system-ui'; ctx.fillText(clockLabel(f.clock), 28, 514);
  ctx.fillStyle = '#c8d8ff'; ctx.font = '500 22px system-ui';
  const ticker = headlines.join('   +++   ');
  ctx.save(); ctx.beginPath(); ctx.rect(120, 470, W - 120, 70); ctx.clip();
  ctx.fillText(ticker, 140 - (f.frame * 60) % 1400, 514); ctx.restore();
}

function drawMovie(ctx: CanvasRenderingContext2D, f: ScreenFrame): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#02030d'); sky.addColorStop(.55, '#0b1838'); sky.addColorStop(1, '#14284a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const rnd = seeded(7);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W, y = rnd() * 300, twinkle = .45 + .55 * Math.abs(Math.sin(f.frame * .7 + i));
    ctx.fillStyle = `rgba(255,255,255,${(.35 + rnd() * .6) * twinkle})`; ctx.fillRect(x, y, 1.6, 1.6);
  }
  // Aurora ribbons.
  const t = f.frame * .35;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  [['#29ff9a', 0], ['#5cf2ff', 1.7], ['#b45cff', 3.1]].forEach(([color, phase], k) => {
    for (let x = 0; x < W; x += 6) {
      const base = 120 + k * 28 + Math.sin(x / 140 + t + (phase as number)) * 38 + Math.sin(x / 57 - t * .6) * 12;
      const height = 90 + 60 * Math.sin(x / 90 + t * .8 + (phase as number));
      const g = ctx.createLinearGradient(0, base, 0, base + height);
      g.addColorStop(0, `${color}00`); g.addColorStop(.6, `${color}55`); g.addColorStop(1, `${color}00`);
      ctx.fillStyle = g; ctx.fillRect(x, base, 6, height);
    }
  });
  ctx.restore();
  // Mountains and the lake reflection.
  const ridge = (offset: number, color: string, amp: number, seed: number) => {
    const r = seeded(seed); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, offset - r() * amp);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  };
  ridge(360, '#0d1530', 110, 3); ridge(395, '#070b1b', 70, 9);
  const lake = ctx.createLinearGradient(0, 400, 0, H);
  lake.addColorStop(0, '#173a4c'); lake.addColorStop(1, '#050913');
  ctx.fillStyle = lake; ctx.fillRect(0, 400, W, H - 400);
  ctx.save(); ctx.globalAlpha = .25; ctx.fillStyle = '#29ff9a';
  for (let i = 0; i < 14; i++) ctx.fillRect(120 + ((i * 97 + f.frame * 9) % 720), 412 + i * 8, 80 - i * 4, 2);
  ctx.restore();
  // Letterbox and subtitle.
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 54); ctx.fillRect(0, H - 54, W, 54);
  const subs = de(f)
    ? ['„Seit drei Nächten tanzt der Himmel.“', '„Wir sind fast am Ende der Welt.“', '„Hörst du das? Das Eis singt.“', '']
    : ['“The sky has been dancing for three nights.”', '“We are almost at the end of the world.”', '“Can you hear it? The ice is singing.”', ''];
  const sub = subs[Math.floor(f.frame / 4) % subs.length];
  if (sub) { ctx.fillStyle = '#ffffffe6'; ctx.font = 'italic 500 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText(sub, W / 2, H - 82); ctx.textAlign = 'left'; }
}

function drawDesktop(ctx: CanvasRenderingContext2D, f: ScreenFrame): void {
  const wall = ctx.createLinearGradient(0, 0, W, H);
  wall.addColorStop(0, '#1d3b6e'); wall.addColorStop(1, '#4b2c7a');
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H);
  const win = (x: number, y: number, w: number, h: number, title: string) => {
    ctx.fillStyle = '#0d1117f2'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
    ctx.fillStyle = '#1b2230'; ctx.beginPath(); ctx.roundRect(x, y, w, 30, [10, 10, 0, 0]); ctx.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 18 + i * 18, y + 15, 5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#9aa7bd'; ctx.font = '500 14px system-ui'; ctx.fillText(title, x + 76, y + 20);
  };
  // Code editor with scrolling, syntax-coloured lines.
  win(30, 30, 520, 440, 'dayDemo.ts — HomeTwin3D');
  const rnd = seeded(11), colors = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#abb2bf', '#56b6c2'];
  const lines = Array.from({ length: 60 }, () => Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => [colors[Math.floor(rnd() * colors.length)], 20 + rnd() * 90] as const));
  const indent = Array.from({ length: 60 }, () => Math.floor(rnd() * 4));
  const first = f.frame % 40;
  for (let i = 0; i < 20; i++) {
    const y = 76 + i * 20, line = lines[(first + i) % lines.length];
    ctx.fillStyle = '#4b5263'; ctx.font = '13px ui-monospace, monospace'; ctx.fillText(String(first + i + 1).padStart(3, ' '), 40, y);
    let x = 84 + indent[(first + i) % indent.length] * 18;
    for (const [color, width] of line) { ctx.fillStyle = color; ctx.fillRect(x, y - 9, width, 9); x += width + 8; }
  }
  ctx.fillStyle = '#61afef'; ctx.fillRect(84, 76 + 19 * 20 - 9, 2, 12);
  // Live chart.
  win(575, 30, 355, 230, de(f) ? 'Energie heute' : 'Energy today');
  ctx.strokeStyle = '#ffffff14'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(592, 90 + i * 34); ctx.lineTo(912, 90 + i * 34); ctx.stroke(); }
  const plot = (color: string, fn: (i: number) => number) => {
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i <= 32; i++) { const x = 592 + i * 10, y = 228 - fn(i + f.frame) * 130; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  };
  plot('#ffd35a', i => .45 + .4 * Math.sin(i / 6));
  plot('#4cc9f0', i => .3 + .15 * Math.sin(i / 3 + 1) + .08 * Math.sin(i * 1.7));
  // Status card.
  win(575, 280, 355, 190, de(f) ? 'Smart Home' : 'Smart home');
  const items = de(f) ? [['Lichter an', '3'], ['Rollos', '30 %'], ['Außen', '21 °C'], ['Solar', `${(4.2 + Math.sin(f.frame) * .3).toFixed(1)} kW`]] : [['Lights on', '3'], ['Blinds', '30 %'], ['Outside', '21 °C'], ['Solar', `${(4.2 + Math.sin(f.frame) * .3).toFixed(1)} kW`]];
  items.forEach(([label, value], i) => {
    ctx.fillStyle = '#9aa7bd'; ctx.font = '500 17px system-ui'; ctx.fillText(label, 598, 342 + i * 32);
    ctx.fillStyle = '#e6edf7'; ctx.font = '700 17px system-ui'; ctx.textAlign = 'right'; ctx.fillText(value, 905, 342 + i * 32); ctx.textAlign = 'left';
  });
  // Taskbar.
  ctx.fillStyle = '#0b0f17e6'; ctx.fillRect(0, H - 44, W, 44);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i === 1 ? '#61afef' : '#3a4558'; ctx.beginPath(); ctx.roundRect(360 + i * 42, H - 36, 30, 28, 6); ctx.fill(); }
  ctx.fillStyle = '#e6edf7'; ctx.font = '600 16px system-ui'; ctx.textAlign = 'right'; ctx.fillText(clockLabel(f.clock), W - 20, H - 16); ctx.textAlign = 'left';
}

function drawGame(ctx: CanvasRenderingContext2D, f: ScreenFrame): void {
  const sky = ctx.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#12002e'); sky.addColorStop(1, '#ff2d95');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 300);
  // Striped synthwave sun.
  ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 270, 130, Math.PI, 0); ctx.clip();
  const sun = ctx.createLinearGradient(0, 140, 0, 270); sun.addColorStop(0, '#ffe66d'); sun.addColorStop(1, '#ff6b35');
  ctx.fillStyle = sun; ctx.fillRect(W / 2 - 130, 140, 260, 130);
  ctx.fillStyle = '#ff2d95';
  for (let i = 0; i < 6; i++) ctx.fillRect(W / 2 - 130, 200 + i * 12, 260, 2 + i);
  ctx.restore();
  ctx.fillStyle = '#1a0533';
  ctx.beginPath(); ctx.moveTo(0, 300);
  for (let x = 0; x <= W; x += 60) ctx.lineTo(x, 300 - 40 - 50 * Math.abs(Math.sin(x * .013)));
  ctx.lineTo(W, 300); ctx.fill();
  ctx.fillStyle = '#0a0018'; ctx.fillRect(0, 300, W, H - 300);
  // Perspective grid racing towards the viewer.
  ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 10;
  for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 14, 300); ctx.lineTo(W / 2 + i * 120, H); ctx.stroke(); }
  const phase = (f.frame * .37) % 1;
  for (let i = 0; i < 10; i++) { const d = Math.pow((i + phase) / 10, 2.2), y = 300 + d * (H - 300); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.shadowBlur = 0;
  // Player ship and HUD.
  const sway = Math.sin(f.frame * .9) * 60;
  ctx.fillStyle = '#ff2d95'; ctx.beginPath(); ctx.moveTo(W / 2 + sway, 410); ctx.lineTo(W / 2 + sway - 48, 470); ctx.lineTo(W / 2 + sway + 48, 470); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#00f0ff'; ctx.fillRect(W / 2 + sway - 30, 470, 60, 6);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 26px ui-monospace, monospace'; ctx.fillText(`SCORE ${String(12840 + f.frame * 370).padStart(7, '0')}`, 28, 44);
  ctx.textAlign = 'right'; ctx.fillText(`LAP ${1 + Math.floor(f.frame / 12) % 3}/3`, W - 28, 44); ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff33'; ctx.fillRect(28, 60, 220, 10);
  ctx.fillStyle = '#29ff9a'; ctx.fillRect(28, 60, 220 * (.55 + .4 * Math.abs(Math.sin(f.frame * .2))), 10);
}

const DRAW: Record<ScreenKind, (ctx: CanvasRenderingContext2D, frame: ScreenFrame) => void> = {
  news: drawNews, movie: drawMovie, work: drawDesktop, game: drawGame,
};

export function renderDemoScreen(kind: ScreenKind, frame: ScreenFrame): string | undefined {
  const ctx = context();
  if (!ctx || !canvas) return undefined;
  ctx.save();
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  DRAW[kind](ctx, frame);
  ctx.restore();
  return canvas.toDataURL('image/jpeg', .82);
}
