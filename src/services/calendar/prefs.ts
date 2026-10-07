/** Per-browser calendar preferences (the events themselves live in Home Assistant). */
export interface CalendarPrefs {
  /** States whose public and school holidays are shown (chosen on first use). */
  regions: string[];
  /** The first-use question about the states was answered. */
  setupDone: boolean;
  showPublicHolidays: boolean;
  showSchoolHolidays: boolean;
  /** Calendar new appointments go to. */
  defaultCalendar?: string;
  hiddenCalendars: string[];
  view: 'year' | 'month' | 'week';
  /** People added on this device (others come from the events' "Für:" lines). */
  persons: string[];
  /** Show only events for these people (empty: everyone). */
  personFilter: string[];
  /** Exams (titles with "Klausur", "Klassenarbeit", ...) in their own color. */
  highlightExams: boolean;
  examColor: string;
  /** Timetable lessons in the day list on school days. */
  showTimetable: boolean;
  /** Week view: yesterday plus six days, seven days from today, or the calendar week. */
  weekStart: 'yesterday' | 'today' | 'monday';
}

const KEY = 'calendar.prefs';
const DEFAULTS: CalendarPrefs = { regions: [], setupDone: false, showPublicHolidays: true, showSchoolHolidays: true, hiddenCalendars: [], view: 'month', persons: [], personFilter: [], highlightExams: true, examColor: '#f97316', showTimetable: true, weekStart: 'yesterday' };

export function loadCalendarPrefs(): CalendarPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CalendarPrefs> & { region?: string };
    // Earlier versions had a single state
    if (!stored.regions && stored.region) { stored.regions = [stored.region]; stored.setupDone = true; }
    delete stored.region;
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCalendarPrefs(prefs: CalendarPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* defaults next time */ }
  window.dispatchEvent(new Event('calendar-prefs-changed'));
}
