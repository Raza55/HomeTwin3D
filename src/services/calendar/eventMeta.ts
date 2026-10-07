/**
 * Extra data of calendar events. HA calendar events have no custom fields, so it lives in
 * lines at the end of the description, readable in HA and the same on every device:
 *   Für: Anna, Ben     (who the event is for)
 *   Note: 11 Punkte    (exam grade in MSS points 0-15)
 *   Ref: some-key      (key of events sent through the calendar API, see 3dash-addon/calendar-api.mjs)
 *   Art: Stundenplan   (timetable lesson: shown in the day list on school days, not as an appointment)
 *   Symbol: doctor     (symbol chosen in the dialog, see eventKinds.ts; otherwise recognised from the title)
 */

const EXAM = /klausur|klassenarbeit|kursarbeit/i;
const PERSONS_LINE = /^Für: (.+?)\s*$/m;
const GRADE_LINE = /^Note: (\d{1,2}) Punkte?\s*$/m;
const REF_LINE = /^Ref: (\S+)\s*$/m;
const TIMETABLE_LINE = /^Art: Stundenplan\s*$/m;
const SYMBOL_LINE = /^Symbol: ([a-z]+)\s*$/m;
const META_LINES = /^(?:Für: .+|Note: \d{1,2} Punkte?|Ref: \S+|Art: .+|Symbol: [a-z]+)\s*$/gm;

export interface EventMeta {
  /** Description without the data lines (the notes field). */
  notes: string;
  persons: string[];
  grade?: number;
  ref?: string;
  /** Lesson of a timetable. */
  timetable?: boolean;
  /** Symbol chosen in the dialog ("none": no symbol). */
  symbol?: string;
}

export function isExam(summary: string): boolean {
  return EXAM.test(summary);
}

/** Events titled "Anna: Klausur ..." count for a known person even without a "Für:" line. */
function personFromTitle(summary: string | undefined, known: string[]): string | undefined {
  const prefix = summary?.match(/^([^:]{1,30}):\s/)?.[1].trim().toLowerCase();
  return prefix ? known.find(p => p.toLowerCase() === prefix) : undefined;
}

export function readMeta(description: string | undefined, summary?: string, knownPersons: string[] = []): EventMeta {
  const text = description ?? '';
  const points = Number(text.match(GRADE_LINE)?.[1] ?? NaN);
  const listed = text.match(PERSONS_LINE)?.[1].split(',').map(p => p.trim()).filter(Boolean);
  const fromTitle = personFromTitle(summary, knownPersons);
  return {
    notes: text.replace(META_LINES, '').replace(/\n{2,}/g, '\n').trim(),
    persons: listed?.length ? listed : fromTitle ? [fromTitle] : [],
    grade: points >= 0 && points <= 15 ? points : undefined,
    ref: text.match(REF_LINE)?.[1],
    timetable: TIMETABLE_LINE.test(text),
    symbol: text.match(SYMBOL_LINE)?.[1],
  };
}

export function writeMeta(meta: EventMeta): string {
  return [
    meta.notes.trim(),
    meta.timetable ? 'Art: Stundenplan' : '',
    meta.symbol ? `Symbol: ${meta.symbol}` : '',
    meta.persons.length ? `Für: ${meta.persons.join(', ')}` : '',
    meta.grade !== undefined ? `Note: ${meta.grade} ${meta.grade === 1 ? 'Punkt' : 'Punkte'}` : '',
    meta.ref ? `Ref: ${meta.ref}` : '',
  ].filter(Boolean).join('\n');
}

export function readGrade(description: string | undefined): number | undefined {
  return readMeta(description).grade;
}

/** Points to the German school grade (15-13 → 1, ..., 1-3 → 5, 0 → 6). */
export function pointsToGrade(points: number): number {
  return points === 0 ? 6 : 6 - Math.ceil(points / 3);
}

export function gradeTone(points: number): 'good' | 'mid' | 'low' {
  return points >= 10 ? 'good' : points >= 5 ? 'mid' : 'low';
}

/** Short badge text: first letters, e.g. "J" or "Ra" when two names share the first letter. */
export function personInitials(name: string, all: string[]): string {
  const clash = all.some(p => p !== name && p[0]?.toLowerCase() === name[0]?.toLowerCase());
  return clash ? name.slice(0, 2) : name.slice(0, 1).toUpperCase();
}
