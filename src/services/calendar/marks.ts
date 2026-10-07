import { publicHolidays } from './holidays.ts';
import { schoolHolidayOn, type SchoolHoliday } from './schoolHolidays.ts';

/** 'DE-RP' → 'RP' */
export function regionShort(code: string): string {
  return code.slice(3);
}

export interface DayMarks {
  holiday?: string;
  /** States the public holiday(s) of the day apply to. */
  holidayRegions?: string[];
  school?: SchoolHoliday & { regions: string[] };
}

/**
 * Public and school holidays of the chosen states per day. With several states, a holiday
 * that does not apply to all of them names the states it applies to: "Fronleichnam (RP)".
 */
export function makeMarks(years: number[], regions: string[], showPublic: boolean, school: Record<string, SchoolHoliday[]>, showSchool: boolean) {
  const label = (name: string, where: string[]) =>
    regions.length > 1 && where.length < regions.length ? `${name} (${where.map(regionShort).join(', ')})` : name;
  const holidays = new Map<string, Map<string, string[]>>();
  if (showPublic) {
    for (const year of years) for (const region of regions) for (const h of publicHolidays(year, region)) {
      const names = holidays.get(h.date) ?? new Map<string, string[]>();
      names.set(h.name, [...(names.get(h.name) ?? []), region]);
      holidays.set(h.date, names);
    }
  }
  return (date: string): DayMarks => {
    const names = holidays.get(date);
    const marks: DayMarks = names ? {
      holiday: [...names].map(([name, where]) => label(name, where)).join(' · '),
      holidayRegions: [...new Set([...names.values()].flat())],
    } : {};
    if (!showSchool) return marks;
    const hits = regions.flatMap(region => {
      const h = schoolHolidayOn(school[region] ?? [], date);
      return h ? [{ region, h }] : [];
    });
    if (hits.length) {
      const byName = new Map<string, string[]>();
      for (const { region, h } of hits) byName.set(h.name, [...(byName.get(h.name) ?? []), region]);
      marks.school = { ...hits[0].h, name: [...byName].map(([name, where]) => label(name, where)).join(' · '), regions: hits.map(h => h.region) };
    }
    return marks;
  };
}
