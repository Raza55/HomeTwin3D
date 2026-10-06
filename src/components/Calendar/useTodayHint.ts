import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { addDays, hhmm, minutesOfDay, startOfDay, ymd } from '../../services/calendar/dates';
import { makeMarks } from '../../services/calendar/marks';
import { loadCalendarPrefs } from '../../services/calendar/prefs';
import { useCalendarData } from './useCalendarData';

/** Today's events and holiday for the HUD date (count badge and tooltip). */
export function useTodayHint(enabled: boolean): { count: number; label: string } {
  const { t } = useLanguage();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const id = setInterval(() => setDay(prev => (ymd(prev) === ymd(new Date()) ? prev : startOfDay(new Date()))), 60000);
    return () => clearInterval(id);
  }, []);
  const end = useMemo(() => addDays(day, 1), [day]);
  const prefs = loadCalendarPrefs();
  const { events } = useCalendarData(day, end, prefs.hiddenCalendars, enabled);
  return useMemo(() => {
    if (!enabled) return { count: 0, label: '' };
    const holiday = makeMarks([day.getFullYear()], prefs.regions, prefs.showPublicHolidays, {}, false)(ymd(day)).holiday;
    const items = events.map(e => (e.allDay ? e.summary : `${hhmm(minutesOfDay(e.start))} ${e.summary}`));
    const count = events.length;
    const head = count === 1 ? t('calendar.todayOne') : count > 1 ? t('calendar.todayCount', { count }) : '';
    return { count, label: [holiday, head && `${head}: ${items.join(', ')}`].filter(Boolean).join(' · ') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, events, day, t]);
}
