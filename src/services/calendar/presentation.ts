import type { CalEvent, CalendarInfo } from './haCalendar';
import { readMeta, writeMeta } from './eventMeta.ts';

/** Calendar ownership is presentation metadata; source descriptions remain untouched. */
export function presentCalendarEvents(events: CalEvent[], owners: Record<string, string> = {}): CalEvent[] {
  const result: CalEvent[] = [];
  const keys = new Map<string, number[]>();
  for (const source of [...events].sort((a, b) => Number(!!owners[b.calendar]) - Number(!!owners[a.calendar]))) {
    const meta = readMeta(source.description);
    const owner = owners[source.calendar];
    if (owner && !meta.persons.includes(owner)) meta.persons.push(owner);
    const event = owner ? { ...source, description: writeMeta(meta) } : source;
    // A Ref explicitly links copies. Without it only the same UID is evidence of a copy.
    // Dates distinguish occurrences of a series; no title-only merging of appointments.
    const identity = meta.ref ? `ref:${meta.ref}` : source.uid ? `uid:${source.uid}` : '';
    const key = `${identity}|${source.start.getTime()}|${source.allDay}`;
    const index = identity ? keys.get(key)?.find(i => result[i].calendar !== source.calendar) : undefined;
    if (index !== undefined) {
      const kept = result[index];
      const keptMeta = readMeta(kept.description);
      keptMeta.persons = [...new Set([...keptMeta.persons, ...meta.persons])];
      result[index] = { ...kept, description: writeMeta(keptMeta) };
    } else {
      if (identity) keys.set(key, [...(keys.get(key) ?? []), result.length]);
      result.push(event);
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
}

/** Match only read-only, single-day holiday feeds against the built-in day label. */
export function redundantHoliday(event: CalEvent, calendars: CalendarInfo[], holiday?: string): boolean {
  if (!holiday || !event.allDay || calendars.find(c => c.entityId === event.calendar)?.canCreate !== false) return false;
  const next = new Date(event.start); next.setDate(next.getDate() + 1);
  if (next.getTime() !== event.end.getTime()) return false;
  const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('de').replace(/\s*\([^)]*\)\s*/g, '').replace(/\s+/g, ' ').trim();
  return holiday.split(' · ').some(name => normalize(name) === normalize(event.summary));
}
