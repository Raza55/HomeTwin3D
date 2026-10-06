/** Local calendar dates as 'YYYY-MM-DD' (no time zone shifts, unlike toISOString). */
export function ymd(date: Date): string {
  const m = date.getMonth() + 1, d = date.getDate();
  return `${date.getFullYear()}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

export function parseYmd(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
}

export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  target.setDate(Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
  return target;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday of the week (German weeks start on Monday). */
export function startOfWeek(date: Date): Date {
  return addDays(startOfDay(date), -((date.getDay() + 6) % 7));
}

/** ISO 8601 week number (KW). */
export function isoWeek(date: Date): number {
  const thursday = addDays(startOfDay(date), 3 - ((date.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

/** 42 days (6 weeks) starting on the Monday on or before the 1st of the month. */
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

/** Local date-time with UTC offset, e.g. 2026-10-07T15:00:00+02:00 (HA wants consistent zones). */
export function isoLocal(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${ymd(date)}T${hhmm(minutesOfDay(date))}:00${sign}${hhmm(Math.floor(abs / 60) * 60 + abs % 60)}`;
}
