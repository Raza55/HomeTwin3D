import { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { LOGO_PARAMS } from './logoData';
import './AnimatedLogo.css';

const THEMES = {
  dark:  { front: '#e0e0e0', top: '#c8c8c8', side: '#d4d4d4' },
  light: { front: '#1a1a1a', top: '#3d3d3d', side: '#2a2a2a' },
};

// Neon cycle order for intro (ends on white/black depending on theme)
const NEON_COLORS = [
  '#38bdf8', '#ff00ff', '#00ff66', '#ff3333',
  '#ffaa00', '#8844ff', '#ffffff', '#333333',
];

// Final neon resting color per theme (contrast with logo color)
const NEON_FINAL: Record<string, string> = {
  dark: '#333333',
  light: '#ffffff',
};

const GLOW_INTENSITY = 50;

const { thickness: THICKNESS, targetDepth: TARGET_DEPTH, spacing: SPACING, angle: ANGLE } = LOGO_PARAMS;
const ANIM_DURATION = 1200;
const INTRO_DURATION = 3000;
const ANIM_DELAY = 600;

interface Point { x: number; y: number }

interface SlashFaces {
  front: Point[];
  top: Point[] | null;
  right: Point[] | null;
  base: Point[] | null;
}

function generateSlash(
  cx: number, topY: number, thickness: number,
  length: number, depth: number, angle: number, is3D: boolean,
): SlashFaces {
  const halfW = thickness / 2;
  const dx = Math.tan((angle * Math.PI) / 180) * length;
  const botY = topY + length;

  const tl = { x: cx - halfW + dx, y: topY };
  const tr = { x: cx + halfW + dx, y: topY };
  const br = { x: cx + halfW, y: botY };
  const bl = { x: cx - halfW, y: botY };

  if (!is3D) {
    return { front: [tl, tr, br, bl], top: null, right: null, base: null };
  }

  const ox = depth * 0.6;
  const oy = -depth * 0.5;

  const tl3 = { x: tl.x + ox, y: tl.y + oy };
  const tr3 = { x: tr.x + ox, y: tr.y + oy };
  const br3 = { x: br.x + ox, y: br.y + oy };

  return {
    base: [bl, br, br3, tr3, tl3, tl],
    front: [bl, br, tr, tl],
    right: [br, br3, tr3, tr],
    top: [tl, tr, tr3, tl3],
  };
}

function pts(arr: Point[]): string {
  return arr.map((p) => `${p.x},${p.y}`).join(' ');
}

function computeScene(depth: number) {
  const tanA = Math.tan((ANGLE * Math.PI) / 180);
  const fixedW = THICKNESS * 3 + SPACING * 2 + depth * 0.1;
  const length = Math.max(50, fixedW / Math.max(0.05, 1 - tanA));

  const rawSlashes = [0, 1, 2].map((i) => {
    const cx = THICKNESS / 2 + i * (THICKNESS + SPACING);
    return generateSlash(cx, 0, THICKNESS, length, depth, ANGLE, depth > 0);
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rawSlashes.forEach((s) => {
    [s.front, s.right, s.top, s.base].filter(Boolean).forEach((face) => {
      face!.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
  });

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const squareSide = Math.max(contentW, contentH);
  const margin = 4;
  const viewSize = squareSide + margin * 2;

  const offX = -minX + margin + (squareSide - contentW) / 2;
  const offY = -minY + margin + (squareSide - contentH) / 2;

  const slashes = rawSlashes.map((s) => ({
    front: s.front.map((p) => ({ x: p.x + offX, y: p.y + offY })),
    right: s.right?.map((p) => ({ x: p.x + offX, y: p.y + offY })) ?? null,
    top: s.top?.map((p) => ({ x: p.x + offX, y: p.y + offY })) ?? null,
    base: s.base?.map((p) => ({ x: p.x + offX, y: p.y + offY })) ?? null,
  }));

  return { slashes, viewSize };
}

/** Parse "#rrggbb" to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r, g, b] to "#rrggbb" */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Interpolate between two hex colors */
function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  );
}

/** Get smoothly interpolated color cycling through the palette at progress [0,1] */
function getCycleColor(progress: number, finalColor: string): string {
  const palette = [...NEON_COLORS, finalColor];
  const last = palette.length - 1;
  if (progress >= 1) return palette[last];
  if (progress <= 0) return palette[0];
  const pos = progress * last;
  const idx = Math.floor(pos);
  return lerpColor(palette[idx], palette[Math.min(idx + 1, last)], pos - idx);
}

export default function AnimatedLogo() {
  const { resolved } = useTheme();
  const colors = THEMES[resolved];
  const finalNeon = NEON_FINAL[resolved] ?? '#333333';
  const finalNeonRef = useRef(finalNeon);
  finalNeonRef.current = finalNeon;

  const [depth, setDepth] = useState(0);
  const depthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const introDoneRef = useRef(false);

  // Neon state: null = off, string = active color
  const [activeNeon, setActiveNeon] = useState<string | null>(null);
  const [glowOpacity, setGlowOpacity] = useState(0);
  // Click cycling index: -1 = use intro/resting color, 0..N-1 = manual
  const [clickIndex, setClickIndex] = useState(-1);

  // When theme changes after intro, update resting neon color (only if not manually overridden)
  useEffect(() => {
    if (introDoneRef.current && clickIndex === -1) {
      setActiveNeon(finalNeon);
    }
  }, [finalNeon, clickIndex]);

  const playTransition = useCallback((to: number) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const from = depthRef.current;
    if (from === to) return;

    const start = performance.now();
    const duration = ANIM_DURATION * (Math.abs(to - from) / TARGET_DEPTH);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const d = from + (to - from) * ease;
      depthRef.current = d;
      setDepth(d);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Intro animation: extrusion + neon color cycle
  useEffect(() => {
    const timer = setTimeout(() => {
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / INTRO_DURATION);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Drive depth
        const d = TARGET_DEPTH * ease;
        depthRef.current = d;
        setDepth(d);

        // Drive neon color cycle + glow fade-in
        setActiveNeon(getCycleColor(ease, finalNeonRef.current));
        setGlowOpacity(Math.min(1, t / 0.2));

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          introDoneRef.current = true;
          setActiveNeon(finalNeonRef.current);
          setGlowOpacity(1);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, ANIM_DELAY);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!introDoneRef.current) return;
    playTransition(0);
  }, [playTransition]);

  const handleMouseLeave = useCallback(() => {
    if (!introDoneRef.current) return;
    playTransition(TARGET_DEPTH);
  }, [playTransition]);

  const handleClick = useCallback(() => {
    if (!introDoneRef.current) return;
    setClickIndex((prev) => {
      const next = prev + 1;
      if (next >= NEON_COLORS.length) {
        // Turn off neon
        setActiveNeon(null);
        return -1;
      }
      setActiveNeon(NEON_COLORS[next]);
      return next;
    });
  }, []);

  const { slashes, viewSize } = computeScene(depth);

  const neonActive = activeNeon !== null;
  const sw = 1 + GLOW_INTENSITY * 0.03;
  const swSide = 0.8 + GLOW_INTENSITY * 0.02;

  return (
    <div
      className="animated-logo"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        {neonActive && (
          <defs>
            <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={2 + GLOW_INTENSITY * 0.12} result="b1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation={6 + GLOW_INTENSITY * 0.24} result="b2" />
              <feGaussianBlur in="SourceGraphic" stdDeviation={12 + GLOW_INTENSITY * 0.5} result="b3" />
              <feMerge>
                <feMergeNode in="b3" />
                <feMergeNode in="b2" />
                <feMergeNode in="b1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        {slashes.map((s, i) => (
          <g key={i}>
            {s.base && <polygon points={pts(s.base)} fill={colors.front} />}
            <polygon points={pts(s.front)} fill={colors.front} />
            {s.right && <polygon points={pts(s.right)} fill={colors.side} />}
            {s.top && <polygon points={pts(s.top)} fill={colors.top} />}
            {neonActive && (
              <g filter="url(#logo-glow)" opacity={glowOpacity}>
                {s.base && <polygon points={pts(s.base)} fill="none" stroke={activeNeon} strokeWidth={sw} strokeLinejoin="round" />}
                <polygon points={pts(s.front)} fill="none" stroke={activeNeon} strokeWidth={sw} strokeLinejoin="round" />
                {s.right && <polygon points={pts(s.right)} fill="none" stroke={activeNeon} strokeWidth={swSide} strokeLinejoin="round" opacity={0.7} />}
                {s.top && <polygon points={pts(s.top)} fill="none" stroke={activeNeon} strokeWidth={swSide} strokeLinejoin="round" opacity={0.7} />}
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
