import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { isDaytime } from '../babylon/SunController';
import { getSetting, getSettings, updateSettings } from '../services/settingsStore';
import type { AppSettings } from '../services/settingsStore';
import { SYSTEM_LOCATION } from '../constants/location';

type ThemeMode = 'dark' | 'light' | 'auto' | 'system';
type ResolvedTheme = 'dark' | 'light';

/* ── colour palettes ── */

export const BG_DARK = [
  { hex: '#0a0e1a', label: 'Deep Navy' },
  { hex: '#0d0d0d', label: 'True Black' },
  { hex: '#1a1a2e', label: 'Midnight Purple' },
  { hex: '#0f1923', label: 'Dark Slate' },
  { hex: '#111827', label: 'Charcoal' },
  { hex: '#0c1222', label: 'Ocean Dark' },
];

export const BG_LIGHT = [
  { hex: '#f0f2f5', label: 'Cool Gray' },
  { hex: '#ffffff', label: 'Pure White' },
  { hex: '#faf5f0', label: 'Warm Cream' },
  { hex: '#f0fdf4', label: 'Mint Tint' },
  { hex: '#f8fafc', label: 'Ice White' },
  { hex: '#f5f0ff', label: 'Lavender Mist' },
];

export const PRIMARY_ACCENTS = [
  { hex: '#38bdf8', label: 'Sky Blue' },
  { hex: '#818cf8', label: 'Indigo' },
  { hex: '#f472b6', label: 'Pink' },
  { hex: '#fb923c', label: 'Orange' },
  { hex: '#a78bfa', label: 'Violet' },
  { hex: '#2dd4bf', label: 'Teal' },
];

export const STATUS_ACCENTS = [
  { hex: '#4ade80', label: 'Green' },
  { hex: '#38bdf8', label: 'Sky Blue' },
  { hex: '#fbbf24', label: 'Gold' },
  { hex: '#f472b6', label: 'Pink' },
  { hex: '#2dd4bf', label: 'Teal' },
  { hex: '#a78bfa', label: 'Violet' },
];

export const PANEL_BG_DARK = [
  { hex: '#0d1424', label: 'Deep Navy' },
  { hex: '#0d0d0d', label: 'True Black' },
  { hex: '#1a1a2e', label: 'Midnight Purple' },
  { hex: '#0f1923', label: 'Dark Slate' },
  { hex: '#111827', label: 'Charcoal' },
  { hex: '#0c1222', label: 'Ocean Dark' },
];

export const PANEL_BG_LIGHT = [
  { hex: '#ffffff', label: 'Pure White' },
  { hex: '#f0f2f5', label: 'Cool Gray' },
  { hex: '#faf5f0', label: 'Warm Cream' },
  { hex: '#f0fdf4', label: 'Mint Tint' },
  { hex: '#f8fafc', label: 'Ice White' },
  { hex: '#f5f0ff', label: 'Lavender Mist' },
];

/* ── defaults per theme ── */

const THEME_DEFAULTS = {
  dark: { bg: '#0a0e1a', surface: '#0d1424', accent: '#38bdf8', accentDim: '#0f3a52', green: '#4ade80', border: '#1a2236', border2: '#243044' },
  light: { bg: '#f0f2f5', surface: '#ffffff', accent: '#0284c7', accentDim: '#dbeafe', green: '#16a34a', border: '#d1d5db', border2: '#b0b8c4' },
};

/* ── helpers ── */

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - amount;
  return `#${[r, g, b].map(c => Math.round(c * f).toString(16).padStart(2, '0')).join('')}`;
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `#${[r, g, b].map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('')}`;
}

const CORNER_MAP = { sharp: '0px', soft: '8px', round: '24px' } as const;

/* ── apply appearance CSS variables ── */

function applyAppearance(resolved: ResolvedTheme) {
  const s = getSettings().appearance;
  const d = THEME_DEFAULTS[resolved];
  const root = document.documentElement.style;

  // Background
  const bg = s.bgColor || d.bg;
  root.setProperty('--bg', bg);

  // Primary accent
  const accent = s.primaryAccent || d.accent;
  root.setProperty('--accent', accent);
  const accentDim = resolved === 'dark' ? darkenHex(accent, 0.7) : lightenHex(accent, 0.85);
  root.setProperty('--accent-dim', accentDim);

  // Status accent
  const status = s.statusAccent || d.green;
  root.setProperty('--green', status);

  // Panel / surface
  const surface = s.panelBgColor || d.surface;
  root.setProperty('--surface', surface);

  // Modal surface (always full opacity, uses panelBgColor)
  const [sr, sg, sb] = hexToRgb(surface);
  root.setProperty('--surface-alpha', `rgba(${sr}, ${sg}, ${sb}, 1)`);

  // Side panel background (same panelBgColor but with panelOpacity)
  const alpha = s.panelOpacity / 100;
  root.setProperty('--side-panel-bg', `rgba(${sr}, ${sg}, ${sb}, ${alpha})`);

  // Panel dots
  if (s.panelDots) {
    const dotColor = resolved === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    root.setProperty('--panel-dots', `radial-gradient(circle at 1px 1px, ${dotColor} 1px, transparent 0)`);
    root.setProperty('--panel-dots-size', '24px 24px');
  } else {
    root.setProperty('--panel-dots', 'none');
    root.setProperty('--panel-dots-size', 'auto');
  }

  // Backdrop
  root.setProperty('--backdrop-bg', s.backdropObscure ? 'rgba(0,0,0,0.5)' : 'transparent');
  root.setProperty('--backdrop-blur', s.backdropBlur ? 'blur(4px)' : 'none');

  // Borders — --border/--border2 always available for inputs/sliders;
  // --panel-border controls panel/card/modal borders separately
  root.setProperty('--border', d.border);
  root.setProperty('--border2', d.border2);
  if (s.borderStyle === 'none') {
    root.setProperty('--panel-border', 'transparent');
    root.setProperty('--panel-border-width', '0px');
  } else if (s.borderStyle === 'large') {
    root.setProperty('--panel-border', d.border);
    root.setProperty('--panel-border-width', '2px');
  } else {
    root.setProperty('--panel-border', d.border);
    root.setProperty('--panel-border-width', '1px');
  }

  // Corner radius
  root.setProperty('--corner-radius', CORNER_MAP[s.cornerRadius]);

  // Notify listeners (e.g. 3D scene) that appearance changed
  window.dispatchEvent(new CustomEvent('appearance-changed'));
}

/* ── context ── */

interface ThemeValue {
  theme: ThemeMode;
  resolved: ResolvedTheme;
  setTheme: (t: ThemeMode) => void;
  updateAutoTheme: (minutes?: number) => void;
  refreshAppearance: () => void;
}

const ThemeContext = createContext<ThemeValue>({
  theme: 'dark',
  resolved: 'dark',
  setTheme: () => {},
  updateAutoTheme: () => {},
  refreshAppearance: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => getSetting('appearance').theme,
  );

  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    if (theme === 'auto') return isDaytime(SYSTEM_LOCATION.latitude, SYSTEM_LOCATION.longitude) ? 'light' : 'dark';
    if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return theme as ResolvedTheme;
  });

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;

  const setTheme = useCallback((t: ThemeMode) => {
    updateSettings('appearance', { theme: t });
    setThemeState(t);
  }, []);

  const updateAutoTheme = useCallback((minutes?: number) => {
    if (themeRef.current !== 'auto') return;
    const day = isDaytime(SYSTEM_LOCATION.latitude, SYSTEM_LOCATION.longitude, minutes);
    setResolved(day ? 'light' : 'dark');
  }, []);

  const refreshAppearance = useCallback(() => {
    applyAppearance(resolvedRef.current);
  }, []);

  // When theme mode changes, resolve immediately
  useEffect(() => {
    if (theme === 'auto') {
      setResolved(isDaytime(SYSTEM_LOCATION.latitude, SYSTEM_LOCATION.longitude) ? 'light' : 'dark');
    } else if (theme === 'system') {
      setResolved(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else {
      setResolved(theme as ResolvedTheme);
    }
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setResolved(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Apply data-theme attribute AND custom appearance variables
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    applyAppearance(resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, updateAutoTheme, refreshAppearance }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
