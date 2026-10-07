/**
 * A small drawn scene per month, like the picture on a wall calendar.
 * Plain SVG shapes: no image files, sharp on every screen, same in both themes.
 */
import type { ReactElement } from 'react';

const W = 320, H = 130;

/** Deterministic scatter so a month always looks the same. */
function scatter(seed: number, count: number) {
  let s = seed * 9301 + 49297;
  const next = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({ length: count }, () => ({ x: next(), y: next(), r: next() }));
}

const fir = (x: number, y: number, h: number, color: string, snow = false, lights: string[] = []) => (
  <g key={`fir${x}`}>
    <rect x={x - h * .04} y={y - h * .12} width={h * .08} height={h * .14} fill="#5b4033" />
    {[0, 1, 2].map(i => {
      const top = y - h + i * h * .26, base = y - h * .1 - (2 - i) * h * .18, half = h * (.18 + i * .07);
      return (
        <g key={i}>
          <path d={`M${x} ${top} L${x + half} ${base} L${x - half} ${base} Z`} fill={color} />
          {snow && <path d={`M${x} ${top} L${x + half * .45} ${top + (base - top) * .45} L${x - half * .45} ${top + (base - top) * .45} Z`} fill="#f4f8ff" />}
        </g>
      );
    })}
    {lights.map((c, i) => <circle key={i} cx={x + Math.sin(i * 2.3) * h * .16} cy={y - h * .25 - (i % 4) * h * .15} r={1.8} fill={c} />)}
  </g>
);

const roundTree = (x: number, y: number, h: number, crown: string, dots?: string, dotCount = 9) => (
  <g key={`tree${x}`}>
    <rect x={x - 2.2} y={y - h * .45} width={4.4} height={h * .45} fill="#6b4b36" />
    <circle cx={x} cy={y - h * .62} r={h * .3} fill={crown} />
    <circle cx={x - h * .2} cy={y - h * .5} r={h * .2} fill={crown} />
    <circle cx={x + h * .2} cy={y - h * .5} r={h * .21} fill={crown} />
    {dots && scatter(Math.round(x), dotCount).map((p, i) => (
      <circle key={i} cx={x + (p.x - .5) * h * .62} cy={y - h * .4 - p.y * h * .48} r={1.6 + p.r * 1.2} fill={dots} />
    ))}
  </g>
);

const bareTree = (x: number, y: number, h: number, color: string) => (
  <g key={`bare${x}`} stroke={color} strokeLinecap="round" fill="none">
    <path d={`M${x} ${y} L${x} ${y - h}`} strokeWidth={3.2} />
    <path d={`M${x} ${y - h * .45} L${x - h * .3} ${y - h * .8} M${x} ${y - h * .6} L${x + h * .32} ${y - h * .9} M${x} ${y - h * .8} L${x - h * .15} ${y - h * 1.05} M${x - h * .2} ${y - h * .68} L${x - h * .36} ${y - h * .7} M${x + h * .2} ${y - h * .76} L${x + h * .34} ${y - h * .72}`} strokeWidth={1.8} />
  </g>
);

const flower = (x: number, y: number, color: string, center = '#f6c945', size = 3.2) => (
  <g key={`f${x}-${y}`}>
    <path d={`M${x} ${y} L${x} ${y - size * 3}`} stroke="#3f7d3a" strokeWidth={1.3} />
    {[0, 72, 144, 216, 288].map(a => (
      <circle key={a} cx={x + Math.cos(a * Math.PI / 180) * size * .8} cy={y - size * 3 + Math.sin(a * Math.PI / 180) * size * .8} r={size * .62} fill={color} />
    ))}
    <circle cx={x} cy={y - size * 3} r={size * .45} fill={center} />
  </g>
);

const tulip = (x: number, y: number, color: string) => (
  <g key={`t${x}`}>
    <path d={`M${x} ${y} L${x} ${y - 14}`} stroke="#3f7d3a" strokeWidth={1.6} />
    <path d={`M${x} ${y - 4} q-6 -4 -5 -10`} stroke="#4c9443" strokeWidth={2} fill="none" />
    <path d={`M${x - 4.5} ${y - 20} L${x - 4.5} ${y - 14} Q${x} ${y - 10} ${x + 4.5} ${y - 14} L${x + 4.5} ${y - 20} L${x + 2} ${y - 17} L${x} ${y - 21} L${x - 2} ${y - 17} Z`} fill={color} />
  </g>
);

const sunflower = (x: number, y: number, h: number) => (
  <g key={`sf${x}`}>
    <path d={`M${x} ${y} L${x} ${y - h}`} stroke="#3f7d3a" strokeWidth={2} />
    <ellipse cx={x + 5} cy={y - h * .45} rx={5} ry={2.4} fill="#4c9443" />
    {Array.from({ length: 12 }, (_, i) => i * 30).map(a => (
      <ellipse key={a} cx={x + Math.cos(a * Math.PI / 180) * 6.5} cy={y - h + Math.sin(a * Math.PI / 180) * 6.5} rx={3.2} ry={1.6} fill="#f5c21b" transform={`rotate(${a} ${x + Math.cos(a * Math.PI / 180) * 6.5} ${y - h + Math.sin(a * Math.PI / 180) * 6.5})`} />
    ))}
    <circle cx={x} cy={y - h} r={4.6} fill="#6b3f1d" />
  </g>
);

const pumpkin = (x: number, y: number, s: number) => (
  <g key={`p${x}`}>
    <ellipse cx={x - s * .45} cy={y - s * .5} rx={s * .55} ry={s * .5} fill="#e07b1f" />
    <ellipse cx={x + s * .45} cy={y - s * .5} rx={s * .55} ry={s * .5} fill="#e07b1f" />
    <ellipse cx={x} cy={y - s * .52} rx={s * .6} ry={s * .53} fill="#f08c2a" />
    <rect x={x - 1.2} y={y - s * 1.18} width={2.4} height={s * .3} fill="#4f6b2c" />
  </g>
);

const sun = (x: number, y: number, r: number, color = '#ffd34d', glow = 'rgba(255,214,90,.35)') => (
  <g key="sun"><circle cx={x} cy={y} r={r * 1.8} fill={glow} /><circle cx={x} cy={y} r={r} fill={color} /></g>
);

const hills = (back: string, front: string, backY = 84, frontY = 100) => (
  <g key="hills">
    <path d={`M0 ${backY} Q60 ${backY - 18} 120 ${backY - 4} T240 ${backY - 6} T320 ${backY - 12} L320 ${H} L0 ${H} Z`} fill={back} />
    <path d={`M0 ${frontY} Q80 ${frontY - 14} 170 ${frontY - 2} T320 ${frontY - 8} L320 ${H} L0 ${H} Z`} fill={front} />
  </g>
);

function particles(kind: 'snow' | 'rain' | 'leaves' | 'petals' | 'confetti' | 'stars', seed: number, count: number, maxY = H) {
  return scatter(seed, count).map((p, i) => {
    const x = p.x * W, y = p.y * maxY;
    switch (kind) {
      case 'snow': return <circle key={i} cx={x} cy={y} r={.9 + p.r * 1.6} fill="#ffffff" opacity={.85} />;
      case 'rain': return <path key={i} d={`M${x} ${y} l-2.5 7`} stroke="#c9dcf2" strokeWidth={1.1} opacity={.7} />;
      case 'stars': return <circle key={i} cx={x} cy={y} r={.5 + p.r} fill="#fff8d6" opacity={.5 + p.r * .5} />;
      case 'leaves': return <ellipse key={i} cx={x} cy={y} rx={3} ry={1.5} fill={['#d9531e', '#e8a33a', '#b8361e', '#f0c24b'][i % 4]} transform={`rotate(${p.r * 180} ${x} ${y})`} />;
      case 'petals': return <ellipse key={i} cx={x} cy={y} rx={2.2} ry={1.2} fill={i % 2 ? '#f7c6d9' : '#ffffff'} transform={`rotate(${p.r * 180} ${x} ${y})`} />;
      case 'confetti': return <rect key={i} x={x} y={y} width={3} height={1.8} fill={['#e4405f', '#f5c21b', '#3d9be9', '#43b36b', '#a463d6'][i % 5]} transform={`rotate(${p.r * 180} ${x} ${y})`} />;
    }
  });
}

type Scene = { sky: [string, string]; parts: ReactElement[] };

function scene(month: number): Scene {
  switch (month) {
    case 0: return { sky: ['#9cc4e8', '#e6f0fa'], parts: [
      sun(255, 42, 11, '#fff3c4', 'rgba(255,243,196,.4)'), hills('#e3ecf6', '#f7fafd'),
      fir(40, 104, 46, '#2f5d50', true), fir(70, 108, 34, '#356b5b', true), fir(232, 104, 40, '#2f5d50', true), fir(292, 110, 50, '#2a5547', true),
      ...particles('snow', 1, 40) ] };
    case 1: return { sky: ['#b4c6dc', '#ecf1f6'], parts: [
      hills('#cfdccf', '#bfd2bd'),
      bareTree(268, 104, 52, '#6d5a4c'),
      ...[60, 84, 104, 130, 150].map((x, i) => (
        <g key={`sd${x}`}>
          <path d={`M${x} ${112 - i % 2 * 4} q2 -12 6 -14`} stroke="#4c8c4a" strokeWidth={1.3} fill="none" />
          <ellipse cx={x + 6.5} cy={102 - i % 2 * 4} rx={3} ry={4.2} fill="#ffffff" stroke="#9fb39c" strokeWidth={.6} />
        </g>
      )),
      ...particles('confetti', 2, 26, 80), ...particles('snow', 12, 14) ] };
    case 2: return { sky: ['#a9d3ee', '#eef8f2'], parts: [
      sun(118, 34, 12), hills('#b9dca4', '#cfe8b5'),
      roundTree(250, 104, 58, '#a8d48a', '#e9f6d2', 12),
      ...[30, 48, 66, 110, 130, 160, 190].map((x, i) => flower(x, 116 - (i % 3) * 3, i % 2 ? '#9b6fd6' : '#f3d24c', '#f6a12b', 2.4)),
      ...[[150, 30], [170, 24], [190, 34]].map(([x, y]) => <path key={`b${x}`} d={`M${x - 5} ${y - 2} q5 4 5 4 q0 0 5 -4`} stroke="#4b5563" strokeWidth={1.4} fill="none" />) ] };
    case 3: return { sky: ['#8fb6d6', '#dbe9f1'], parts: [
      ...[0, 1, 2, 3, 4].map(i => <path key={`rb${i}`} d={`M150 ${H} A ${110 - i * 7} ${110 - i * 7} 0 0 1 ${370 - i * 14} ${H}`} transform={`translate(${-40 + i * 7} 0)`} stroke={['#e4405f', '#f59f2a', '#f5d42b', '#43b36b', '#3d7fe9'][i]} strokeWidth={6} fill="none" opacity={.55} />),
      hills('#a5d58f', '#bfe3a2'),
      ...[30, 46, 62, 78, 94, 110, 126].map((x, i) => tulip(x, 120 - (i % 2) * 4, ['#e4405f', '#f59f2a', '#d6336c', '#f5d42b'][i % 4])),
      ...particles('rain', 4, 30, 70) ] };
    case 4: return { sky: ['#86c5f0', '#eaf6fb'], parts: [
      sun(280, 32, 13), hills('#95cf7d', '#acdc8e'),
      roundTree(90, 108, 70, '#f6c1d4', '#ffffff', 14), roundTree(200, 110, 56, '#f8d2df', '#ffffff', 10),
      ...[20, 140, 170, 240, 270, 300].map((x, i) => flower(x, 122 - (i % 2) * 3, i % 2 ? '#ffffff' : '#f6a6c4', '#f6c945', 2.2)),
      ...particles('petals', 5, 18, 90) ] };
    case 5: return { sky: ['#5fb0ec', '#e2f3fc'], parts: [
      sun(150, 30, 14), hills('#7fc46a', '#97d27c'),
      ...scatter(6, 22).map((p, i) => flower(10 + p.x * 300, 108 + p.y * 18, '#ffffff', '#f6c945', 2 + p.r)),
      ...[[210, 52], [240, 64]].map(([x, y]) => (
        <g key={`bf${x}`}><ellipse cx={x - 3} cy={y} rx={4} ry={3} fill="#f59f2a" /><ellipse cx={x + 3} cy={y} rx={4} ry={3} fill="#f5c21b" /></g>
      )) ] };
    case 6: return { sky: ['#4aa6e8', '#d9f0fb'], parts: [
      sun(250, 34, 15),
      <path key="sea" d={`M0 78 L${W} 78 L${W} ${H} L0 ${H} Z`} fill="#2f8fcf" />,
      ...[84, 94, 104].map((y, i) => <path key={`w${y}`} d={`M${i * 20} ${y} q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0`} stroke="#9fd6f3" strokeWidth={1.4} fill="none" opacity={.7} />),
      <path key="beach" d={`M0 112 Q120 104 ${W} 116 L${W} ${H} L0 ${H} Z`} fill="#f1d9a3" />,
      <g key="boat"><path d="M120 76 L160 76 L152 84 L128 84 Z" fill="#ffffff" /><path d="M140 74 L140 44 L158 72 Z" fill="#f5f5f5" /><path d="M138 72 L138 50 L124 72 Z" fill="#e4405f" /></g> ] };
    case 7: return { sky: ['#6cb6ea', '#fbefd2'], parts: [
      sun(270, 30, 16, '#ffcf3f', 'rgba(255,190,60,.35)'),
      <path key="field" d={`M0 86 Q160 76 ${W} 88 L${W} ${H} L0 ${H} Z`} fill="#e3b94d" />,
      ...Array.from({ length: 14 }, (_, i) => <path key={`row${i}`} d={`M${i * 24} ${H} L${100 + i * 9} 86`} stroke="#c99a32" strokeWidth={1.2} opacity={.6} />),
      ...[30, 56, 82, 230, 256].map((x, i) => sunflower(x, 128, 34 + (i % 2) * 8)) ] };
    case 8: return { sky: ['#8bbfe2', '#f3ecd8'], parts: [
      sun(132, 36, 12, '#ffdd73'), hills('#a8c46f', '#bcd27e'),
      roundTree(210, 110, 72, '#6f9f45', '#d6382c', 14),
      <rect key="basket" x={250} y={104} width={26} height={14} rx={3} fill="#a0703f" />,
      ...[255, 262, 269].map(x => <circle key={`ap${x}`} cx={x} cy={103} r={4} fill="#d6382c" />),
      ...particles('leaves', 9, 6, 100) ] };
    case 9: return { sky: ['#e8b77a', '#f8e7cf'], parts: [
      sun(260, 40, 12, '#ffb347', 'rgba(255,170,70,.35)'), hills('#c98a45', '#b8743a'),
      roundTree(60, 106, 66, '#d9531e'), roundTree(120, 108, 52, '#e8a33a'), roundTree(300, 106, 60, '#b8361e'),
      pumpkin(190, 118, 14), pumpkin(220, 120, 10),
      ...particles('leaves', 10, 26, 118) ] };
    case 10: return { sky: ['#9aa6b2', '#d7dde2'], parts: [
      hills('#8e989c', '#7a8578'),
      bareTree(50, 108, 58, '#4a3f38'), bareTree(110, 110, 44, '#4a3f38'), bareTree(280, 106, 62, '#4a3f38'),
      <rect key="fog1" x={0} y={70} width={W} height={18} fill="#eef1f3" opacity={.45} />,
      <rect key="fog2" x={0} y={96} width={W} height={12} fill="#eef1f3" opacity={.35} />,
      <g key="lantern"><path d="M200 120 L200 92 L214 86" stroke="#5b4636" strokeWidth={1.5} fill="none" /><circle cx={214} cy={96} r={13} fill="rgba(255,190,80,.3)" /><rect x={208} y={88} width={12} height={15} rx={4} fill="#f5a524" /></g>,
      ...particles('rain', 11, 26, 90) ] };
    default: return { sky: ['#162447', '#3a4f7a'], parts: [
      ...particles('stars', 12, 40, 70),
      <g key="moon"><circle cx={262} cy={30} r={11} fill="#f8f3d6" /><circle cx={268} cy={26} r={10} fill="#22335c" /></g>,
      hills('#c9d6e8', '#eaf0f8'),
      fir(70, 112, 62, '#244e43', true, ['#f5c21b', '#e4405f', '#ffffff', '#3d9be9', '#f5c21b', '#e4405f', '#ffffff', '#43b36b']),
      <path key="star" d="M70 44 l2.2 4.6 5 .6 -3.7 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -3.7 -3.4 5 -.6 Z" fill="#f5c21b" />,
      fir(150, 114, 36, '#2a5547', true), fir(300, 112, 44, '#2a5547', true),
      ...particles('snow', 13, 30) ] };
  }
}

export default function MonthArt({ month, label }: { month: number; label: string }) {
  const { sky, parts } = scene(month);
  const id = `cal-sky-${month}`;
  return (
    <figure className="cal-month-art" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky[0]} /><stop offset="1" stopColor={sky[1]} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${id})`} />
        {parts}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
