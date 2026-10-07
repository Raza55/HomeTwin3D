/**
 * Timetable: weekly recurring calendar events marked "Art: Stundenplan". They are not shown as
 * appointments, only as the lessons of a school day (day list, week view), and only when there is school.
 */
import type { CalEvent } from './haCalendar';

const NO_SCHOOL = /unterrichtsfrei|ferientag/i;
const AWAY = /praktikum|fahrt|reflitage|refli-tage|austausch|exkursion/i;
const DAY = 86400000;

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Lessons of one day: none on weekends, public or school holidays and days marked "unterrichtsfrei";
 * a lesson also gives way while its person is away (trips, internships, multi-day events) or has
 * an appointment of their own at that time (exam, doctor, ...): appointments override lessons.
 * Appointments of other people or of nobody in particular (school events) do not.
 */
export function schoolLessons(
  day: Date,
  lessons: CalEvent[],
  events: CalEvent[],
  marks: { holiday?: string; school?: unknown },
  personsOf: (e: CalEvent) => string[],
): CalEvent[] {
  const weekday = day.getDay();
  if (weekday === 0 || weekday === 6 || marks.holiday || marks.school) return [];
  const whole = { start: day, end: new Date(day.getTime() + DAY) };
  if (events.some(e => e.allDay && NO_SCHOOL.test(e.summary) && overlaps(e, whole))) return [];
  return lessons
    .filter(lesson => {
      const who = personsOf(lesson);
      return !events.some(e => {
        if (!overlaps(e, lesson)) return false;
        const theirs = !who.length || personsOf(e).some(p => who.includes(p));
        if (!theirs) return false;
        const multiDay = e.end.getTime() - e.start.getTime() > DAY;
        return multiDay || (e.allDay && AWAY.test(e.summary)) || !e.allDay;
      });
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** "Anna: M1" → "M1" when Anna is a known person (the day list shows whose plan it is). */
export function lessonTitle(summary: string, persons: string[]): string {
  const m = summary.match(/^([^:]{1,30}):\s+(.*)$/);
  return m && persons.some(p => p.toLowerCase() === m[1].trim().toLowerCase()) ? m[2] : summary;
}
