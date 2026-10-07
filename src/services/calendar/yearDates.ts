/**
 * Dates of the year that are not public holidays but worth seeing in a family calendar:
 * clock changes, the start of the seasons, full and new moon, and customs.
 * Everything is computed (no network): seasons and moon phases follow Meeus,
 * "Astronomical Algorithms" (ch. 27 and 49), accurate to a few minutes.
 */
import { addDays, ymd } from './dates.ts';
import { easterSunday } from './holidays.ts';

export type YearDateKind = 'clock' | 'season' | 'moon' | 'custom';

export interface YearDate {
  date: string;
  kind: YearDateKind;
  de: string;
  en: string;
  /** Full or new moon (the moon symbol differs). */
  phase?: 'full' | 'new';
}

const rad = (deg: number) => deg * Math.PI / 180;
const fromJde = (jde: number) => new Date((jde - 2440587.5) * 86_400_000);
const time = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** n-th weekday (0 = Sunday) of a month; n = -1 for the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = new Date(year, month, 1);
    return new Date(year, month, 1 + (weekday - first.getDay() + 7) % 7 + (n - 1) * 7);
  }
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - (last.getDay() - weekday + 7) % 7);
}

const SEASON_TERMS: [number, number, number][] = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112],
  [156, 73.14, 45036.886], [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906],
  [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328],
  [17, 288.79, 4562.452], [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848],
  [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074],
];

/** Equinoxes and solstices of a year (March, June, September, December). */
export function seasonStarts(year: number): Date[] {
  const y = (year - 2000) / 1000;
  const mean = [
    2451623.80984 + 365242.37404 * y + 0.05169 * y ** 2 - 0.00411 * y ** 3 - 0.00057 * y ** 4,
    2451716.56767 + 365241.62603 * y + 0.00325 * y ** 2 + 0.00888 * y ** 3 - 0.00030 * y ** 4,
    2451810.21715 + 365242.01767 * y - 0.11575 * y ** 2 + 0.00337 * y ** 3 + 0.00078 * y ** 4,
    2451900.05952 + 365242.74049 * y - 0.06223 * y ** 2 - 0.00823 * y ** 3 + 0.00032 * y ** 4,
  ];
  return mean.map(jde0 => {
    const t = (jde0 - 2451545) / 36525;
    const w = rad(35999.373 * t - 2.47);
    const dl = 1 + 0.0334 * Math.cos(w) + 0.0007 * Math.cos(2 * w);
    const s = SEASON_TERMS.reduce((sum, [a, b, c]) => sum + a * Math.cos(rad(b + c * t)), 0);
    return fromJde(jde0 + 0.00001 * s / dl);
  });
}

/** Full and new moons whose (local) date falls into the year. */
export function moonPhases(year: number): { date: Date; phase: 'full' | 'new' }[] {
  const result: { date: Date; phase: 'full' | 'new' }[] = [];
  const k0 = Math.floor((year - 2000) * 12.3685) - 1;
  for (let i = 0; i < 28; i++) for (const phase of ['new', 'full'] as const) {
    const k = k0 + i + (phase === 'full' ? .5 : 0), t = k / 1236.85;
    const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t ** 2 - 0.00000015 * t ** 3 + 0.00000000073 * t ** 4;
    const e = 1 - 0.002516 * t - 0.0000074 * t ** 2;
    const m = rad(2.5534 + 29.1053567 * k - 0.0000014 * t ** 2 - 0.00000011 * t ** 3);
    const mp = rad(201.5643 + 385.81693528 * k + 0.0107582 * t ** 2 + 0.00001238 * t ** 3 - 0.000000058 * t ** 4);
    const f = rad(160.7108 + 390.67050284 * k - 0.0016118 * t ** 2 - 0.00000227 * t ** 3 + 0.000000011 * t ** 4);
    const om = rad(124.7746 - 1.56375588 * k + 0.0020672 * t ** 2 + 0.00000215 * t ** 3);
    const c = phase === 'new' ? [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208] : [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209];
    const corr = c[0] * Math.sin(mp) + c[1] * e * Math.sin(m) + c[2] * Math.sin(2 * mp) + c[3] * Math.sin(2 * f)
      + c[4] * e * Math.sin(mp - m) + c[5] * e * Math.sin(mp + m) + c[6] * e * e * Math.sin(2 * m)
      - 0.00111 * Math.sin(mp - 2 * f) - 0.00057 * Math.sin(mp + 2 * f) + 0.00056 * e * Math.sin(2 * mp + m)
      - 0.00042 * Math.sin(3 * mp) + 0.00042 * e * Math.sin(m + 2 * f) + 0.00038 * e * Math.sin(m - 2 * f)
      - 0.00024 * e * Math.sin(2 * mp - m) - 0.00017 * Math.sin(om);
    const date = fromJde(jde + corr);
    if (date.getFullYear() === year) result.push({ date, phase });
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** All year dates, sorted by day. */
export function yearDates(year: number): YearDate[] {
  const list: YearDate[] = [];
  const add = (date: Date, kind: YearDateKind, de: string, en: string, phase?: 'full' | 'new') => list.push({ date: ymd(date), kind, de, en, ...(phase ? { phase } : {}) });

  add(nthWeekday(year, 2, 0, -1), 'clock', 'Zeitumstellung: Uhr vor (Sommerzeit)', 'Clocks go forward (summer time)');
  add(nthWeekday(year, 9, 0, -1), 'clock', 'Zeitumstellung: Uhr zurück (Winterzeit)', 'Clocks go back (winter time)');

  const names: [string, string][] = [['Frühlingsanfang', 'Spring begins'], ['Sommeranfang', 'Summer begins'], ['Herbstanfang', 'Autumn begins'], ['Winteranfang', 'Winter begins']];
  seasonStarts(year).forEach((d, i) => add(d, 'season', `${names[i][0]} ${time(d)}`, `${names[i][1]} ${time(d)}`));

  for (const { date, phase } of moonPhases(year)) add(date, 'moon', phase === 'full' ? 'Vollmond' : 'Neumond', phase === 'full' ? 'Full moon' : 'New moon', phase);

  const easter = easterSunday(year);
  const advent4 = addDays(new Date(year, 11, 24), -new Date(year, 11, 24).getDay());
  const customs: [Date, string, string][] = [
    [new Date(year, 1, 14), 'Valentinstag', "Valentine's Day"],
    [addDays(easter, -52), 'Weiberfastnacht', 'Carnival Thursday'],
    [addDays(easter, -48), 'Rosenmontag', 'Rose Monday'],
    [addDays(easter, -46), 'Aschermittwoch', 'Ash Wednesday'],
    [nthWeekday(year, 4, 0, 2), 'Muttertag', "Mother's Day"],
    [addDays(easter, 39), 'Vatertag', "Father's Day"],
    [nthWeekday(year, 9, 0, 1), 'Erntedank', 'Harvest festival'],
    [new Date(year, 9, 31), 'Halloween', 'Halloween'],
    [new Date(year, 10, 11), 'Sankt Martin', "St Martin's Day"],
    [addDays(advent4, -21), '1. Advent', '1st Advent'],
    [addDays(advent4, -14), '2. Advent', '2nd Advent'],
    [addDays(advent4, -7), '3. Advent', '3rd Advent'],
    [advent4, '4. Advent', '4th Advent'],
    [new Date(year, 11, 6), 'Nikolaus', "St Nicholas' Day"],
    [new Date(year, 11, 24), 'Heiligabend', 'Christmas Eve'],
    [new Date(year, 11, 31), 'Silvester', "New Year's Eve"],
  ];
  for (const [d, de, en] of customs) add(d, 'custom', de, en);

  return list.sort((a, b) => a.date.localeCompare(b.date));
}
