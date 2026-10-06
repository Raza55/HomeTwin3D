import { useEffect, useMemo, useState } from 'react';
import { getActiveHAConnection, type HALike } from '../../services/haWebSocket';
import { calendarBackend, type CalEvent, type CalendarBackend, type CalendarInfo } from '../../services/calendar/haCalendar';

/** The active HA connection, followed while the Dashboard (re)connects or switches to demo. */
export function useActiveConnection(): HALike | null {
  const [conn, setConn] = useState<HALike | null>(() => getActiveHAConnection());
  useEffect(() => {
    const id = setInterval(() => setConn(current => {
      const next = getActiveHAConnection();
      return next === current ? current : next;
    }), 2000);
    return () => clearInterval(id);
  }, []);
  return conn;
}

export type CalendarStatus = 'offline' | 'loading' | 'ready';

/**
 * Calendars and their events in [start, end). Events arrive by subscription, so changes
 * from other devices or HA automations show up without reloading.
 */
export function useCalendarData(start: Date, end: Date, hidden: string[] = [], enabled = true) {
  const conn = useActiveConnection();
  const backend: CalendarBackend | null = useMemo(() => (enabled ? calendarBackend(conn) : null), [conn, enabled]);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [status, setStatus] = useState<CalendarStatus>(backend ? 'loading' : 'offline');
  const [byCalendar, setByCalendar] = useState<Record<string, CalEvent[]>>({});

  // Calendar list; retried while the connection is still coming up
  useEffect(() => {
    setByCalendar({});
    if (!backend) { setStatus('offline'); setCalendars([]); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setStatus('loading');
    const load = () => backend.calendars().then(list => {
      if (cancelled) return;
      setCalendars(list);
      setStatus('ready');
    }).catch(() => { if (!cancelled) timer = setTimeout(load, 3000); });
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [backend]);

  const startMs = start.getTime(), endMs = end.getTime();
  const hiddenKey = hidden.join('|');
  useEffect(() => {
    if (!backend || !calendars.length) return;
    const visible = calendars.filter(c => !hidden.includes(c.entityId));
    setByCalendar(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => visible.some(c => c.entityId === id))));
    const unsubs = visible.map(c => backend.subscribe(c.entityId, new Date(startMs), new Date(endMs), events => {
      setByCalendar(prev => ({ ...prev, [c.entityId]: events }));
    }));
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, calendars, startMs, endMs, hiddenKey]);

  const events = useMemo(
    () => Object.values(byCalendar).flat().sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay)),
    [byCalendar],
  );
  return { backend, calendars, events, status };
}
