/**
 * Calendar events through Home Assistant's calendar WebSocket API (Local Calendar and
 * other calendar integrations). Demo and simulation connections cannot subscribe; they
 * use a calendar kept in this browser instead, so the view works without HA.
 */
import type { HALike } from '../haWebSocket';
import { addDays, isoLocal, ymd } from './dates.ts';

export interface CalendarInfo {
  entityId: string;
  name: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface CalEvent {
  calendar: string;
  uid?: string;
  recurrenceId?: string;
  rrule?: string;
  summary: string;
  description?: string;
  location?: string;
  /** Local start; all-day events start at local midnight. */
  start: Date;
  /** Exclusive end (all-day: midnight after the last day). */
  end: Date;
  allDay: boolean;
}

export interface EventDraft {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  rrule?: string;
}

/** Which occurrences of a recurring event a change affects. */
export type RecurrenceScope = 'this' | 'future' | 'all';

// CalendarEntityFeature: CREATE_EVENT = 1, DELETE_EVENT = 2, UPDATE_EVENT = 4
const CREATE = 1, DELETE = 2, UPDATE = 4;

interface RawEvent {
  start: string; end: string; summary: string; description?: string | null; location?: string | null;
  uid?: string | null; recurrence_id?: string | null; rrule?: string | null; all_day?: boolean;
}

function parseHaTime(value: string): Date {
  return value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
}

function fromRaw(calendar: string, raw: RawEvent): CalEvent {
  return {
    calendar,
    uid: raw.uid ?? undefined,
    recurrenceId: raw.recurrence_id ?? undefined,
    rrule: raw.rrule ?? undefined,
    summary: raw.summary ?? '',
    description: raw.description ?? undefined,
    location: raw.location ?? undefined,
    start: parseHaTime(raw.start),
    end: parseHaTime(raw.end),
    allDay: raw.all_day ?? raw.start.length <= 10,
  };
}

function toHaEvent(draft: EventDraft): Record<string, unknown> {
  const event: Record<string, unknown> = {
    summary: draft.summary.trim(),
    dtstart: draft.allDay ? ymd(draft.start) : isoLocal(draft.start),
    dtend: draft.allDay ? ymd(draft.end) : isoLocal(draft.end),
  };
  if (draft.description?.trim()) event.description = draft.description.trim();
  if (draft.location?.trim()) event.location = draft.location.trim();
  if (draft.rrule) event.rrule = draft.rrule;
  return event;
}

export interface CalendarBackend {
  readonly live: boolean;
  calendars(): Promise<CalendarInfo[]>;
  /** Pushes the events of the range now and after every change; returns the unsubscribe function. */
  subscribe(calendar: string, start: Date, end: Date, onEvents: (events: CalEvent[]) => void): () => void;
  create(calendar: string, draft: EventDraft): Promise<void>;
  update(event: CalEvent, draft: EventDraft, scope?: RecurrenceScope): Promise<void>;
  remove(event: CalEvent, scope?: RecurrenceScope): Promise<void>;
}

interface HAStateLike { entity_id: string; attributes?: { friendly_name?: string; supported_features?: number } }

function liveBackend(conn: HALike & { subscribe: NonNullable<HALike['subscribe']> }): CalendarBackend {
  const recurrence = (event: CalEvent, scope?: RecurrenceScope) => event.recurrenceId && scope !== 'all'
    ? { recurrence_id: event.recurrenceId, ...(scope === 'future' ? { recurrence_range: 'THISANDFUTURE' } : {}) }
    : {};
  return {
    live: true,
    async calendars() {
      const states = await conn.request({ type: 'get_states' }) as HAStateLike[];
      return (Array.isArray(states) ? states : [])
        .filter(s => s.entity_id.startsWith('calendar.'))
        .map(s => {
          const features = s.attributes?.supported_features ?? 0;
          return {
            entityId: s.entity_id,
            name: s.attributes?.friendly_name ?? s.entity_id.slice(9),
            canCreate: !!(features & CREATE),
            canDelete: !!(features & DELETE),
            canUpdate: !!(features & UPDATE),
          };
        })
        .sort((a, b) => Number(b.canCreate) - Number(a.canCreate) || a.name.localeCompare(b.name));
    },
    subscribe(calendar, start, end, onEvents) {
      return conn.subscribe(
        { type: 'calendar/event/subscribe', entity_id: calendar, start: isoLocal(start), end: isoLocal(end) },
        (event) => {
          const events = (event as { events?: RawEvent[] | null })?.events;
          if (Array.isArray(events)) onEvents(events.map(raw => fromRaw(calendar, raw)));
        },
      );
    },
    async create(calendar, draft) {
      await conn.request({ type: 'calendar/event/create', entity_id: calendar, event: toHaEvent(draft) });
    },
    async update(event, draft, scope) {
      await conn.request({ type: 'calendar/event/update', entity_id: event.calendar, uid: event.uid, ...recurrence(event, scope), event: toHaEvent(draft) });
    },
    async remove(event, scope) {
      await conn.request({ type: 'calendar/event/delete', entity_id: event.calendar, uid: event.uid, ...recurrence(event, scope) });
    },
  };
}

/* ── Demo calendar (browser only, no recurrence expansion beyond weekly/monthly/yearly) ── */

const DEMO_KEY = 'calendar.demoEvents';
const DEMO_CALENDAR = 'calendar.demo';

interface DemoStored { uid: string; summary: string; description?: string; location?: string; start: string; end: string; allDay: boolean; rrule?: string }

function demoBackend(): CalendarBackend {
  const listeners = new Set<() => void>();
  const load = (): DemoStored[] => {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '[]'); } catch { return []; }
  };
  const save = (list: DemoStored[]) => {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); } catch { /* demo only */ }
    listeners.forEach(l => l());
  };
  const stored = (draft: EventDraft, uid: string): DemoStored => ({
    uid, summary: draft.summary.trim(), description: draft.description, location: draft.location, rrule: draft.rrule,
    allDay: draft.allDay, start: draft.allDay ? ymd(draft.start) : isoLocal(draft.start), end: draft.allDay ? ymd(draft.end) : isoLocal(draft.end),
  });
  const expand = (s: DemoStored, from: Date, to: Date): CalEvent[] => {
    const base = fromRaw(DEMO_CALENDAR, { ...s, all_day: s.allDay });
    base.rrule = s.rrule;
    const freq = s.rrule?.match(/FREQ=(WEEKLY|MONTHLY|YEARLY)/)?.[1];
    const out: CalEvent[] = [];
    const length = base.end.getTime() - base.start.getTime();
    for (let i = 0, start = base.start; start < to && i < 600; i++) {
      if (start.getTime() + length > from.getTime()) out.push({ ...base, start, end: new Date(start.getTime() + length) });
      if (!freq) break;
      start = freq === 'WEEKLY' ? addDays(base.start, 7 * (i + 1))
        : new Date(base.start.getFullYear() + (freq === 'YEARLY' ? i + 1 : 0), base.start.getMonth() + (freq === 'MONTHLY' ? i + 1 : 0), base.start.getDate(), base.start.getHours(), base.start.getMinutes());
    }
    return out;
  };
  return {
    live: false,
    async calendars() {
      return [{ entityId: DEMO_CALENDAR, name: 'Demo', canCreate: true, canUpdate: true, canDelete: true }];
    },
    subscribe(_calendar, start, end, onEvents) {
      const push = () => onEvents(load().flatMap(s => expand(s, start, end)));
      listeners.add(push);
      queueMicrotask(push);
      return () => { listeners.delete(push); };
    },
    async create(_calendar, draft) {
      save([...load(), stored(draft, `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)]);
    },
    async update(event, draft) {
      save(load().map(s => (s.uid === event.uid ? stored(draft, s.uid) : s)));
    },
    async remove(event) {
      save(load().filter(s => s.uid !== event.uid));
    },
  };
}

let demo: CalendarBackend | null = null;

/** Null without any connection: a live installation must not fall back to the demo calendar. */
export function calendarBackend(conn: HALike | null): CalendarBackend | null {
  if (!conn) return null;
  if (conn.subscribe) return liveBackend(conn as HALike & { subscribe: NonNullable<HALike['subscribe']> });
  return (demo ??= demoBackend());
}
