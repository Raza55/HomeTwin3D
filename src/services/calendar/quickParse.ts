/**
 * Understands short German appointment phrases, typed or spoken:
 * "Zahnarzt morgen 15 Uhr", "Elternabend Dienstag 19:30 2 Stunden",
 * "Oma Geburtstag 12. März ganztägig", "Training von 17 bis 18:30 Uhr".
 * Whatever is not a date, time or duration becomes the title.
 */
import { addDays, ymd } from './dates.ts';

export interface QuickParse {
  title: string;
  /** YYYY-MM-DD */
  date?: string;
  startMinutes?: number;
  durationMinutes?: number;
  allDay?: boolean;
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/^(?:montag|mo\.?)$/, 1], [/^(?:dienstag|di\.?)$/, 2], [/^(?:mittwoch|mi\.?)$/, 3], [/^(?:donnerstag|do\.?)$/, 4],
  [/^(?:freitag|fr\.?)$/, 5], [/^(?:samstag|sonnabend|sa\.?)$/, 6], [/^(?:sonntag|so\.)$/, 0],
];
const MONTHS = ['jan', 'feb', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'];
const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};
const NUM = '(\\d{1,2}|eins|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)';

function num(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NUMBER_WORDS[value] ?? NaN;
}

export function parseQuickText(input: string, now = new Date()): QuickParse {
  let text = ` ${input.trim()} `;
  const result: QuickParse = { title: '' };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (m && fn(m) !== false) text = text.replace(m[0], ' ');
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  take(/\s(ganztägig|ganztags|den ganzen tag)(?=[\s,.!?])/i, () => { result.allDay = true; });

  // Dates: 12.10.(2026), 12. Oktober (2026)
  take(/\s(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=[\s,!?])/, m => {
    let year = m[3] ? Number(m[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (date.getMonth() !== Number(m[2]) - 1) return false;
    if (!m[3] && date < today) date.setFullYear(year + 1);
    result.date = ymd(date);
  });
  if (!result.date) take(/\s(\d{1,2})\.?\s+(jan|feb|mär|maer|apr|mai|jun|jul|aug|sep|okt|nov|dez)[a-zä]*\.?(?:\s+(\d{4}))?(?=[\s,.!?])/i, m => {
    const month = MONTHS.indexOf(m[2].toLowerCase().replace('maer', 'mär'));
    const date = new Date(m[3] ? Number(m[3]) : today.getFullYear(), month, Number(m[1]));
    if (!m[3] && date < today) date.setFullYear(date.getFullYear() + 1);
    result.date = ymd(date);
  });
  if (!result.date) take(/\s(heute|übermorgen|morgen)(?!s)(?=[\s,.!?])/i, m => {
    const offset = { heute: 0, morgen: 1, übermorgen: 2 }[m[1].toLowerCase() as 'heute'] ?? 0;
    result.date = ymd(addDays(today, offset));
  });
  if (!result.date) take(/\s(?:am\s+|(?:nächsten|nächste|kommenden|kommende)\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag|mo\.?|di\.?|mi\.?|do\.?|fr\.?|sa\.?|so\.)(?=[\s,!?])/i, m => {
    const word = m[1].toLowerCase();
    const weekday = WEEKDAYS.find(([re]) => re.test(word))?.[1];
    if (weekday === undefined) return false;
    // The same weekday means next week ("heute" would be said for today)
    const ahead = ((weekday - today.getDay() + 7) % 7) || 7;
    result.date = ymd(addDays(today, ahead));
  });

  const period = text.match(/\s(morgens|früh|vormittags|mittags|nachmittags|abends|nachts)(?=[\s,.!?])/i)?.[1].toLowerCase();
  if (period) text = text.replace(new RegExp(`\\s${period}(?=[\\s,.!?])`, 'i'), ' ');
  const toMinutes = (h: number, m = 0) => {
    if (h < 12 && (period === 'nachmittags' || period === 'abends' || (period === 'nachts' && h >= 8))) h += 12;
    return h <= 24 && m < 60 ? (h % 24) * 60 + m : NaN;
  };

  // Ranges: "von 17 bis 18:30 Uhr", "17-19 Uhr"
  take(new RegExp(`\\s(?:von\\s+)?${NUM}(?:[:.](\\d{2}))?(?:\\s*uhr)?\\s*(?:bis|-|–)\\s*${NUM}(?:[:.](\\d{2}))?(?:\\s*uhr)?(?=[\\s,.!?])`, 'i'), m => {
    const start = toMinutes(num(m[1].toLowerCase()), Number(m[2] ?? 0));
    let end = toMinutes(num(m[3].toLowerCase()), Number(m[4] ?? 0));
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    if (end <= start && end + 720 > start) end += 720; // "von 11 bis 1"
    if (end <= start) return false;
    result.startMinutes = start;
    result.durationMinutes = end - start;
  });
  if (result.startMinutes === undefined) take(new RegExp(`\\s(?:um\\s+|ab\\s+)?halb\\s+${NUM}(?:\\s*uhr)?(?=[\\s,.!?])`, 'i'), m => {
    const t = toMinutes(num(m[1].toLowerCase()) - 1, 30);
    if (Number.isNaN(t)) return false;
    result.startMinutes = t;
  });
  if (result.startMinutes === undefined) take(new RegExp(`\\s(?:um\\s+|ab\\s+)?${NUM}(?:[:.](\\d{2})(?:\\s*uhr)?|\\s*uhr(?:\\s+(\\d{2}))?)(?=[\\s,.!?])`, 'i'), m => {
    const t = toMinutes(num(m[1].toLowerCase()), Number(m[2] ?? m[3] ?? 0));
    if (Number.isNaN(t)) return false;
    result.startMinutes = t;
  });
  if (result.startMinutes === undefined) take(new RegExp(`\\s(?:um|ab)\\s+${NUM}(?=[\\s,.!?])`, 'i'), m => {
    const t = toMinutes(num(m[1].toLowerCase()));
    if (Number.isNaN(t)) return false;
    result.startMinutes = t;
  });

  // Durations: "2 Stunden", "1,5 h", "90 min", "eine halbe Stunde", "anderthalb Stunden"
  if (result.durationMinutes === undefined) {
    take(/\s(?:für\s+)?(?:eine\s+)?halbe\s+stunde(?=[\s,.!?])/i, () => { result.durationMinutes = 30; });
    take(/\s(?:für\s+)?(?:anderthalb|eineinhalb)\s+stunden(?=[\s,.!?])/i, () => { result.durationMinutes = 90; });
    take(new RegExp(`\\s(?:für\\s+)?(\\d+(?:[.,]\\d+)?|${NUM.slice(1, -1)})\\s*(h|std\\.?|stunden?)(?=[\\s,.!?])`, 'i'), m => {
      const hours = /\d/.test(m[1]) ? Number(m[1].replace(',', '.')) : num(m[1].toLowerCase());
      if (!(hours > 0)) return false;
      result.durationMinutes = Math.round(hours * 60);
    });
    take(/\s(?:für\s+)?(\d+)\s*(min|minuten)\.?(?=[\s,.!?])/i, m => { result.durationMinutes = Number(m[1]); });
  }

  const title = text
    .replace(/\s(?:am|um|ab|von|für|zum|zur|an|bis)(?=\s*$)/gi, ' ')
    .replace(/^\s*(?:am|um|ab|von|für|an)\s/i, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '')
    .trim();
  result.title = title ? title[0].toUpperCase() + title.slice(1) : '';
  if (result.allDay) { delete result.startMinutes; delete result.durationMinutes; }
  return result;
}

/** True when the phrase contained something besides a title. */
export function hasSchedule(p: QuickParse): boolean {
  return p.date !== undefined || p.startMinutes !== undefined || p.durationMinutes !== undefined || !!p.allDay;
}
