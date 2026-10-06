/**
 * "Learns" appointments: titles used before are suggested with their usual time,
 * duration, calendar and place. The calendar's own past events are the main source
 * (shared by every device through HA); appointments created on this device are also
 * remembered locally so a suggestion is available right away.
 */

export interface LearnSample {
  summary: string;
  /** ISO date (all-day) or date-time. */
  start: string;
  end: string;
  allDay: boolean;
  calendar?: string;
  location?: string;
}

export interface Suggestion {
  title: string;
  count: number;
  allDay: boolean;
  /** Usual start, minutes after midnight (timed events). */
  startMinutes?: number;
  durationMinutes: number;
  /** Weekday (0 = Sunday) when most uses fall on the same day. */
  weekday?: number;
  calendar?: string;
  location?: string;
}

const STORAGE_KEY = 'calendar.learned';
const MAX_LOCAL = 300;

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mostCommon<T>(values: T[]): { value: T; share: number } | undefined {
  if (!values.length) return undefined;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0], bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return { value: best, share: bestCount / values.length };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Date-only strings are local midnight; date-times keep their offset. */
function toDate(value: string): Date {
  return value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
}

export interface Profile { suggestion: Suggestion; lastUsed: number }

export function buildProfiles(samples: LearnSample[]): Map<string, Profile> {
  const groups = new Map<string, LearnSample[]>();
  const seen = new Set<string>();
  for (const s of samples) {
    const key = normalizeTitle(s.summary);
    if (!key || seen.has(`${key}|${s.start}`)) continue;
    seen.add(`${key}|${s.start}`);
    const list = groups.get(key);
    if (list) list.push(s); else groups.set(key, [s]);
  }
  const profiles = new Map<string, Profile>();
  for (const [key, list] of groups) {
    const latest = list.reduce((a, b) => (toDate(a.start) > toDate(b.start) ? a : b));
    const allDay = mostCommon(list.map(s => s.allDay))!.value;
    const relevant = list.filter(s => s.allDay === allDay);
    const starts = relevant.map(s => toDate(s.start));
    const durations = relevant.map(s => Math.max(allDay ? 1440 : 5, Math.round((toDate(s.end).getTime() - toDate(s.start).getTime()) / 60000)));
    // Usual time: most common quarter hour, so one odd appointment does not move it
    const startMinutes = allDay ? undefined : mostCommon(starts.map(d => Math.round((d.getHours() * 60 + d.getMinutes()) / 15) * 15))!.value;
    const weekday = mostCommon(starts.map(d => d.getDay()));
    profiles.set(key, {
      lastUsed: toDate(latest.start).getTime(),
      suggestion: {
        title: mostCommon(list.map(s => s.summary.trim()))!.value,
        count: list.length,
        allDay,
        startMinutes,
        durationMinutes: median(durations),
        weekday: weekday && list.length >= 2 && weekday.share >= 0.6 ? weekday.value : undefined,
        calendar: mostCommon(list.map(s => s.calendar).filter((c): c is string => !!c))?.value,
        location: latest.location || undefined,
      },
    });
  }
  return profiles;
}

/**
 * Suggestions for what is typed: titles starting with the query first, then titles with
 * a word starting with it. Frequent and recently used titles rank higher. An empty
 * query lists the most used titles.
 */
export function suggest(profiles: Map<string, Profile>, query: string, now = Date.now(), limit = 6): Suggestion[] {
  const q = normalizeTitle(query);
  const scored: Array<{ s: Suggestion; score: number }> = [];
  for (const [key, p] of profiles) {
    let match = 0;
    if (!q) match = 1;
    else if (key === q) match = 0.5; // already typed in full: only useful for its details
    else if (key.startsWith(q)) match = 3;
    else if (key.split(' ').some(w => w.startsWith(q))) match = 2;
    else if (q.length >= 3 && key.includes(q)) match = 1;
    if (!match) continue;
    const ageDays = Math.abs(now - p.lastUsed) / 86400000;
    const score = match * 10 + Math.log2(1 + p.suggestion.count) * 3 + Math.max(0, 3 - ageDays / 60);
    scored.push({ s: p.suggestion, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.s);
}

export function loadLocalSamples(): LearnSample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberSample(sample: LearnSample): void {
  try {
    const list = [...loadLocalSamples(), sample].slice(-MAX_LOCAL);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* storage unavailable: suggestions then come from the calendar only */ }
}
