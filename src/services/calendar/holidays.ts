import { addDays, ymd } from './dates.ts';

/** German federal states as ISO 3166-2 codes (OpenHolidays uses the same). */
export const GERMAN_REGIONS = [
  ['DE-BW', 'Baden-Württemberg'], ['DE-BY', 'Bayern'], ['DE-BE', 'Berlin'], ['DE-BB', 'Brandenburg'],
  ['DE-HB', 'Bremen'], ['DE-HH', 'Hamburg'], ['DE-HE', 'Hessen'], ['DE-MV', 'Mecklenburg-Vorpommern'],
  ['DE-NI', 'Niedersachsen'], ['DE-NW', 'Nordrhein-Westfalen'], ['DE-RP', 'Rheinland-Pfalz'], ['DE-SL', 'Saarland'],
  ['DE-SN', 'Sachsen'], ['DE-ST', 'Sachsen-Anhalt'], ['DE-SH', 'Schleswig-Holstein'], ['DE-TH', 'Thüringen'],
] as const;

export interface Holiday {
  date: string;
  name: string;
}

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Statutory public holidays of a German state (computed, works for any year). */
export function publicHolidays(year: number, region = 'DE-RP'): Holiday[] {
  const easter = easterSunday(year);
  const fixed = (month: number, day: number) => ymd(new Date(year, month - 1, day));
  const fromEaster = (days: number) => ymd(addDays(easter, days));
  const inRegion = (...codes: string[]) => codes.includes(region);
  const list: Array<Holiday | false> = [
    { date: fixed(1, 1), name: 'Neujahr' },
    inRegion('DE-BW', 'DE-BY', 'DE-ST') && { date: fixed(1, 6), name: 'Heilige Drei Könige' },
    (inRegion('DE-BE') || (inRegion('DE-MV') && year >= 2023)) && { date: fixed(3, 8), name: 'Internationaler Frauentag' },
    { date: fromEaster(-2), name: 'Karfreitag' },
    inRegion('DE-BB') && { date: fromEaster(0), name: 'Ostersonntag' },
    { date: fromEaster(1), name: 'Ostermontag' },
    { date: fixed(5, 1), name: 'Tag der Arbeit' },
    { date: fromEaster(39), name: 'Christi Himmelfahrt' },
    inRegion('DE-BB') && { date: fromEaster(49), name: 'Pfingstsonntag' },
    { date: fromEaster(50), name: 'Pfingstmontag' },
    inRegion('DE-BW', 'DE-BY', 'DE-HE', 'DE-NW', 'DE-RP', 'DE-SL') && { date: fromEaster(60), name: 'Fronleichnam' },
    inRegion('DE-SL') && { date: fixed(8, 15), name: 'Mariä Himmelfahrt' },
    inRegion('DE-TH') && year >= 2019 && { date: fixed(9, 20), name: 'Weltkindertag' },
    { date: fixed(10, 3), name: 'Tag der Deutschen Einheit' },
    (inRegion('DE-BB', 'DE-MV', 'DE-SN', 'DE-ST', 'DE-TH') || (inRegion('DE-HB', 'DE-HH', 'DE-NI', 'DE-SH') && year >= 2018))
      && { date: fixed(10, 31), name: 'Reformationstag' },
    inRegion('DE-BW', 'DE-BY', 'DE-NW', 'DE-RP', 'DE-SL') && { date: fixed(11, 1), name: 'Allerheiligen' },
    // Wednesday before 23 November
    inRegion('DE-SN') && { date: ymd(addDays(new Date(year, 10, 22), -((new Date(year, 10, 22).getDay() + 4) % 7))), name: 'Buß- und Bettag' },
    { date: fixed(12, 25), name: '1. Weihnachtsfeiertag' },
    { date: fixed(12, 26), name: '2. Weihnachtsfeiertag' },
  ];
  return list.filter((h): h is Holiday => !!h);
}
