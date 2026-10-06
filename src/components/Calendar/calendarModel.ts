import { addDays, startOfDay, ymd } from '../../services/calendar/dates';
import type { CalEvent } from '../../services/calendar/haCalendar';

export const CALENDAR_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#facc15'];

export function calendarColor(calendars: string[], entityId: string): string {
  const i = calendars.indexOf(entityId);
  return CALENDAR_COLORS[(i < 0 ? 0 : i) % CALENDAR_COLORS.length];
}

/** Events per day (YYYY-MM-DD); multi-day events appear on every day they touch. */
export function indexByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    // End is exclusive: an event ending at midnight does not touch the next day
    const last = new Date(Math.max(e.start.getTime(), e.end.getTime() - 1));
    for (let d = startOfDay(e.start), i = 0; d <= last && i < 400; d = addDays(d, 1), i++) {
      const key = ymd(d);
      const list = map.get(key);
      if (list) list.push(e); else map.set(key, [e]);
    }
  }
  return map;
}

export { makeMarks, type DayMarks } from '../../services/calendar/marks';

/** Side-by-side lanes for overlapping timed events of one day. */
export function layoutDay(events: CalEvent[]): Array<{ event: CalEvent; lane: number; lanes: number }> {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: Array<{ event: CalEvent; lane: number; lanes: number }> = [];
  let cluster: typeof out = [];
  let clusterEnd = 0;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map(c => c.lane + 1));
    for (const c of cluster) c.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };
  for (const event of sorted) {
    const start = event.start.getTime();
    if (cluster.length && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex(end => end <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = event.end.getTime();
    cluster.push({ event, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, event.end.getTime());
  }
  if (cluster.length) flush();
  return out;
}
