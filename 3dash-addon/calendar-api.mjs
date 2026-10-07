// Calendar API of the HomeTwin3D add-on: create, change and delete Home Assistant calendar
// events with JSON over HTTP (scripts, shortcuts, other systems). nginx forwards
// /api/calendar/ to this service; it talks to HA through the Supervisor WebSocket.
//
// Events sent with a "ref" (your own key) are updated when sent again instead of being
// duplicated. The key is stored as the line "Ref: <key>" in the event description, the
// exam grade as "Note: <points> Punkte" (the dashboard shows and edits both).
//
// Runs with Node 20 (--experimental-websocket) in the add-on; no dependencies.

import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const DAY = 86400000;
const REF_LINE = /^Ref: (\S+)\s*$/m;
const PERSONS_LINE = /^Für: (.+?)\s*$/m;
const GRADE_LINE = /^Note: (\d{1,2}) Punkte?\s*$/m;
const TIMETABLE_LINE = /^Art: Stundenplan\s*$/m;
const SYMBOL_LINE = /^Symbol: ([a-z]+)\s*$/m;
const META_LINES = /^(?:Für: .+|Note: \d{1,2} Punkte?|Ref: \S+|Art: .+|Symbol: [a-z]+)\s*$/gm;

/* ── Home Assistant WebSocket ── */

export function connectHA({ url, token, WebSocketImpl = globalThis.WebSocket, timeoutMs = 15000 }) {
  let ws = null;
  let ready = null;
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  const fail = (err) => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(err); }
    pending.clear();
    listeners.clear();
  };

  const connect = () => {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      ws = new WebSocketImpl(url);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
        if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        else if (msg.type === 'auth_ok') resolve();
        else if (msg.type === 'auth_invalid') reject(new Error('Home Assistant rejected the token'));
        else if (msg.type === 'event') listeners.get(msg.id)?.(msg.event);
        else if (msg.type === 'result') {
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          clearTimeout(p.timer);
          msg.success ? p.resolve(msg.result) : p.reject(new Error(msg.error?.message ?? 'Request failed'));
        }
      };
      ws.onerror = () => reject(new Error('Home Assistant not reachable'));
      ws.onclose = () => { ready = null; ws = null; fail(new Error('Connection to Home Assistant closed')); };
    });
    ready.catch(() => { ready = null; });
    return ready;
  };

  const send = async (msg, onEvent) => {
    await connect();
    const id = nextId++;
    if (onEvent) listeners.set(id, onEvent);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); listeners.delete(id); reject(new Error('Timeout')); }, timeoutMs);
      pending.set(id, { resolve: (r) => resolve({ id, result: r }), reject, timer });
      ws.send(JSON.stringify({ ...msg, id }));
    });
  };

  return {
    async request(msg) { return (await send(msg)).result; },
    /** First push of a subscription, then unsubscribe (calendar/event/subscribe lists events with uid). */
    async snapshot(msg) {
      let id;
      const first = new Promise((resolve) => {
        send(msg, (event) => resolve(event)).then(r => { id = r.id; }, () => resolve(null));
      });
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs));
      try {
        return await Promise.race([first, timeout]);
      } finally {
        await Promise.resolve();
        if (id !== undefined) { listeners.delete(id); send({ type: 'unsubscribe_events', subscription: id }).catch(() => {}); }
      }
    },
    close() { ws?.close(); },
  };
}

/* ── Event helpers ── */

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function isDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isDateTime(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(v); }
function parseLocal(v) { return isDate(v) ? new Date(`${v}T00:00:00`) : new Date(v.replace(' ', 'T')); }
function addDaysYmd(v, days) { const d = parseLocal(v); d.setDate(d.getDate() + days); return ymd(d); }
/** Local wall time without zone: HA reads it in its own time zone. */
function localDateTime(d) { return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

export function splitDescription(description) {
  const text = description ?? '';
  const grade = text.match(GRADE_LINE);
  return {
    notes: text.replace(META_LINES, '').replace(/\n{2,}/g, '\n').trim(),
    ref: text.match(REF_LINE)?.[1],
    grade: grade ? Number(grade[1]) : undefined,
    persons: text.match(PERSONS_LINE)?.[1].split(',').map(p => p.trim()).filter(Boolean) ?? [],
    timetable: TIMETABLE_LINE.test(text),
    symbol: text.match(SYMBOL_LINE)?.[1],
  };
}

export function joinDescription({ notes, persons = [], grade, ref, timetable = false, symbol }) {
  return [notes?.trim(), timetable ? 'Art: Stundenplan' : '', symbol ? `Symbol: ${symbol}` : '', persons.length ? `Für: ${persons.join(', ')}` : '', grade !== undefined ? `Note: ${grade} ${grade === 1 ? 'Punkt' : 'Punkte'}` : '', ref ? `Ref: ${ref}` : '']
    .filter(Boolean).join('\n');
}

function publicEvent(calendar, e) {
  const meta = splitDescription(e.description);
  return {
    calendar, uid: e.uid ?? undefined, recurrenceId: e.recurrence_id ?? undefined, rrule: e.rrule ?? undefined,
    summary: e.summary, start: e.start, end: e.end, allDay: !!e.all_day,
    description: meta.notes || undefined, location: e.location || undefined, ref: meta.ref, grade: meta.grade, persons: meta.persons, timetable: meta.timetable, symbol: meta.symbol,
  };
}

/** Validates one input event. Throws with a readable message. */
export function normalizeInput(raw, defaultCalendar) {
  if (!raw || typeof raw !== 'object') throw new Error('Event must be an object');
  const calendar = raw.calendar ?? defaultCalendar;
  if (!calendar || !/^calendar\.[a-z0-9_]+$/.test(calendar)) throw new Error('calendar missing or invalid (e.g. "calendar.family")');
  const ref = raw.ref === undefined ? undefined : String(raw.ref);
  if (ref !== undefined && !/^[A-Za-z0-9._:-]{1,120}$/.test(ref)) throw new Error('ref: 1-120 characters A-Z a-z 0-9 . _ : -');
  if (raw.delete) {
    if (!ref && !raw.uid) throw new Error('delete needs ref or uid');
    return { calendar, ref, uid: raw.uid, delete: true, start: raw.start };
  }
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  if (!summary) throw new Error('summary missing');
  const start = raw.start;
  if (!isDate(start) && !isDateTime(start)) throw new Error('start must be YYYY-MM-DD (all day) or YYYY-MM-DDTHH:MM');
  const allDay = raw.allDay ?? isDate(start);
  let dtstart, dtend;
  if (allDay) {
    dtstart = start.slice(0, 10);
    // "end" of an all-day event is its last day (inclusive); HA wants the day after
    const last = raw.end ? String(raw.end).slice(0, 10) : addDaysYmd(dtstart, Math.max(1, Number(raw.days) || 1) - 1);
    if (!isDate(last) || last < dtstart) throw new Error('end must be a date on or after start');
    dtend = addDaysYmd(last, 1);
  } else {
    if (!isDateTime(start)) throw new Error('start needs a time for timed events');
    const startDate = parseLocal(start);
    let endDate;
    if (raw.end !== undefined) {
      if (!isDateTime(raw.end)) throw new Error('end must be YYYY-MM-DDTHH:MM');
      endDate = parseLocal(raw.end);
    } else {
      endDate = new Date(startDate.getTime() + (Number(raw.durationMinutes) > 0 ? Number(raw.durationMinutes) : 60) * 60000);
    }
    if (!(endDate > startDate)) throw new Error('end must be after start');
    const zoned = /(Z|[+-]\d{2}:?\d{2})$/.test(start);
    dtstart = zoned ? start : localDateTime(startDate);
    dtend = zoned && raw.end ? raw.end : localDateTime(endDate);
  }
  const grade = raw.grade === undefined || raw.grade === null ? raw.grade : Number(raw.grade);
  if (grade !== undefined && grade !== null && !(Number.isInteger(grade) && grade >= 0 && grade <= 15)) throw new Error('grade: points 0-15');
  let persons;
  if (raw.persons !== undefined && raw.persons !== null) {
    persons = (Array.isArray(raw.persons) ? raw.persons : String(raw.persons).split(',')).map(p => String(p).trim()).filter(Boolean);
    if (persons.some(p => p.length > 30 || /[,:\n]/.test(p))) throw new Error('persons: names up to 30 characters without , or :');
  }
  return {
    calendar, ref, uid: raw.uid, summary, dtstart, dtend, allDay, persons,
    timetable: raw.timetable === undefined ? undefined : !!raw.timetable,
    symbol: raw.symbol === undefined ? undefined : (/^[a-z]{1,20}$/.test(String(raw.symbol)) ? String(raw.symbol) : (() => { throw new Error('symbol: lowercase key, e.g. "doctor"'); })()),
    description: raw.description === undefined ? undefined : String(raw.description),
    location: raw.location === undefined ? undefined : String(raw.location),
    rrule: raw.rrule ? String(raw.rrule).replace(/^RRULE:/, '') : undefined,
    grade,
  };
}

function sameEvent(existing, event) {
  const norm = (v) => (v ?? '').trim();
  return existing.summary === event.summary
    && existing.start.slice(0, 19) === event.dtstart.slice(0, 19)
    && existing.end.slice(0, 19) === event.dtend.slice(0, 19)
    && norm(existing.description) === norm(event.description)
    && norm(existing.location) === norm(event.location)
    && norm(existing.rrule) === norm(event.rrule);
}

/* ── iCalendar feed (subscription in Google, Apple, Outlook) ── */

function icsText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding: at most 75 octets per line, continuation lines start with a space. */
function foldLine(line) {
  const out = [];
  let current = '', bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) { out.push(current); current = ''; bytes = 0; }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

function icsUtc(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIcs(events, { name = 'HomeTwin3D', now = new Date() } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HomeTwin3D//Calendar API//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const stamp = icsUtc(now);
  for (const e of events) {
    const meta = splitDescription(e.description);
    const description = [meta.notes, meta.persons.length ? `Für: ${meta.persons.join(', ')}` : '', meta.grade !== undefined ? `Note: ${meta.grade} Punkte` : '']
      .filter(Boolean).join('\n');
    // Recurring events arrive expanded; every occurrence gets its own stable UID
    const uid = `${e.uid ?? `${e.start}-${e.summary}`}${e.recurrence_id ? `-${e.recurrence_id}` : ''}@hometwin3d`;
    const allDay = isDate(e.start);
    lines.push('BEGIN:VEVENT', `UID:${icsText(uid)}`, `DTSTAMP:${stamp}`,
      allDay ? `DTSTART;VALUE=DATE:${e.start.replace(/-/g, '')}` : `DTSTART:${icsUtc(e.start)}`,
      allDay ? `DTEND;VALUE=DATE:${e.end.replace(/-/g, '')}` : `DTEND:${icsUtc(e.end)}`,
      `SUMMARY:${icsText(e.summary ?? '')}`);
    if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/* ── API ── */

export function createApi({ ha, apiToken, feedToken = '', defaultCalendar }) {
  const calendars = async () => {
    const states = await ha.request({ type: 'get_states' });
    return states.filter(s => s.entity_id.startsWith('calendar.')).map(s => ({
      entityId: s.entity_id,
      name: s.attributes?.friendly_name ?? s.entity_id,
      canCreate: !!((s.attributes?.supported_features ?? 0) & 1),
    }));
  };

  const fallbackCalendar = async () => defaultCalendar || (await calendars()).find(c => c.canCreate)?.entityId;

  const listEvents = async (calendar, start, end) => {
    const event = await ha.snapshot({ type: 'calendar/event/subscribe', entity_id: calendar, start, end });
    if (!event || !Array.isArray(event.events)) throw new Error(`Calendar ${calendar} could not be read`);
    return event.events;
  };

  const upsert = async (items) => {
    const results = [];
    // One read per calendar covering every event of the request (one year around them)
    const byCalendar = new Map();
    for (const item of items) {
      if (item.error) continue;
      const list = byCalendar.get(item.calendar) ?? [];
      list.push(item);
      byCalendar.set(item.calendar, list);
    }
    const existing = new Map();
    for (const [calendar, list] of byCalendar) {
      const times = list.map(i => parseLocal(i.dtstart ?? i.start ?? ymd(new Date())).getTime()).filter(t => !Number.isNaN(t));
      const from = new Date(Math.min(...times, Date.now()) - 400 * DAY), to = new Date(Math.max(...times, Date.now()) + 400 * DAY);
      existing.set(calendar, await listEvents(calendar, localDateTime(from), localDateTime(to)));
    }
    for (const item of items) {
      if (item.error) { results.push({ status: 'error', error: item.error, index: item.index }); continue; }
      const events = existing.get(item.calendar);
      const match = events.find(e => (item.uid && e.uid === item.uid) || (item.ref && splitDescription(e.description).ref === item.ref));
      const base = { index: item.index, ref: item.ref, calendar: item.calendar };
      try {
        if (item.delete) {
          if (!match) { results.push({ ...base, status: 'not_found' }); continue; }
          await ha.request({ type: 'calendar/event/delete', entity_id: item.calendar, uid: match.uid });
          events.splice(events.indexOf(match), 1);
          results.push({ ...base, uid: match.uid, status: 'deleted' });
          continue;
        }
        const old = match ? splitDescription(match.description) : { notes: '', grade: undefined, persons: [], timetable: false };
        const description = joinDescription({
          notes: item.description ?? old.notes,
          persons: item.persons ?? old.persons,
          timetable: item.timetable ?? old.timetable,
          symbol: item.symbol ?? old.symbol,
          grade: item.grade === null ? undefined : item.grade ?? old.grade,
          ref: item.ref ?? old.ref,
        });
        const location = item.location ?? match?.location ?? undefined;
        const event = { summary: item.summary, dtstart: item.dtstart, dtend: item.dtend };
        if (description) event.description = description;
        if (location) event.location = location;
        if (item.rrule) event.rrule = item.rrule;
        if (match) {
          if (sameEvent(match, { ...event, description, location, rrule: item.rrule ?? match.rrule })) {
            results.push({ ...base, uid: match.uid, status: 'unchanged' });
            continue;
          }
          await ha.request({ type: 'calendar/event/update', entity_id: item.calendar, uid: match.uid, event });
          results.push({ ...base, uid: match.uid, status: 'updated' });
        } else {
          await ha.request({ type: 'calendar/event/create', entity_id: item.calendar, event });
          // Later items with the same ref in this request update instead of creating again
          events.push({ ...event, start: event.dtstart, end: event.dtend, uid: undefined });
          results.push({ ...base, status: 'created' });
        }
      } catch (err) {
        results.push({ ...base, status: 'error', error: err.message });
      }
    }
    return results;
  };

  const matches = (given, token) => {
    if (typeof given !== 'string' || !given || !token) return false;
    const a = Buffer.from(given), b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const authorized = (req) => {
    const header = req.headers.authorization ?? '';
    return matches(header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-hometwin-token'] ?? req.query.token, apiToken);
  };

  /** Read-only subscription feed: the token travels in the URL, since calendar apps cannot send headers. */
  const feed = async (req) => {
    if (!feedToken && !apiToken) return { status: 503, body: { error: 'Calendar feed disabled: set calendar_feed_token in the add-on options' } };
    if (!matches(req.query.token, feedToken) && !matches(req.query.token, apiToken)) return { status: 401, body: { error: 'Missing or wrong token' } };
    const all = await calendars();
    const wanted = req.query.calendar ? req.query.calendar.split(',') : all.map(c => c.entityId);
    const person = req.query.person?.toLowerCase();
    const now = new Date();
    const from = localDateTime(new Date(now.getTime() - 90 * DAY)), to = localDateTime(new Date(now.getTime() + 400 * DAY));
    const events = [];
    for (const calendar of wanted) {
      if (!all.some(c => c.entityId === calendar)) return { status: 404, body: { error: `Unknown calendar ${calendar}` } };
      for (const e of await listEvents(calendar, from, to)) {
        const meta = splitDescription(e.description);
        if (person && !meta.persons.some(p => p.toLowerCase() === person)) continue;
        // Timetable lessons only on request: in a phone calendar they would bury the appointments
        if (meta.timetable && req.query.timetable !== '1') continue;
        events.push(e);
      }
    }
    const name = req.query.name ?? (person ? `${req.query.person}` : 'HomeTwin3D');
    return { status: 200, contentType: 'text/calendar; charset=utf-8', raw: buildIcs(events, { name, now }) };
  };

  return async function handle(req) {
    const route = req.path.replace(/\/+$/, '');
    if (req.method === 'GET' && route === '/api/calendar/feed.ics') {
      try { return await feed(req); } catch (err) { return { status: 502, body: { error: err.message } }; }
    }
    if (!apiToken) return { status: 503, body: { error: 'Calendar API disabled: set calendar_api_token in the add-on options' } };
    if (!authorized(req)) return { status: 401, body: { error: 'Missing or wrong token' } };
    try {
      if (req.method === 'GET' && route === '/api/calendar') {
        return { status: 200, body: { ok: true, defaultCalendar: await fallbackCalendar(), calendars: await calendars() } };
      }
      if (req.method === 'GET' && route === '/api/calendar/calendars') {
        return { status: 200, body: await calendars() };
      }
      if (req.method === 'GET' && route === '/api/calendar/events') {
        const calendar = req.query.calendar ?? await fallbackCalendar();
        const start = req.query.start ?? ymd(new Date());
        const end = req.query.end ?? addDaysYmd(start, 90);
        if (!isDate(start) || !isDate(end) || end <= start) return { status: 400, body: { error: 'start/end: YYYY-MM-DD, end after start' } };
        const events = await listEvents(calendar, `${start}T00:00:00`, `${end}T00:00:00`);
        return { status: 200, body: events.map(e => publicEvent(calendar, e)).filter(e => !req.query.ref || e.ref === req.query.ref) };
      }
      if ((req.method === 'POST' && route === '/api/calendar/events') || (req.method === 'GET' && route === '/api/calendar/add')) {
        let payload = req.method === 'GET' ? { ...req.query } : req.body;
        if (req.method === 'GET') delete payload.token;
        const calendarDefault = (payload && !Array.isArray(payload) && payload.events ? payload.calendar : undefined) ?? await fallbackCalendar();
        const list = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [payload];
        if (!list.length || list.length > 500) return { status: 400, body: { error: '1-500 events per request' } };
        const items = list.map((raw, index) => {
          try { return { ...normalizeInput(raw, calendarDefault), index }; } catch (err) { return { index, error: err.message }; }
        });
        const results = await upsert(items);
        const failed = results.some(r => r.status === 'error');
        return { status: failed ? (results.every(r => r.status === 'error') ? 400 : 207) : 200, body: { results } };
      }
      if (req.method === 'DELETE' && route === '/api/calendar/events') {
        const calendar = req.query.calendar ?? await fallbackCalendar();
        const item = { ...normalizeInput({ calendar, ref: req.query.ref, uid: req.query.uid, delete: true }, calendar), index: 0 };
        const [result] = await upsert([item]);
        return { status: result.status === 'deleted' ? 200 : result.status === 'not_found' ? 404 : 400, body: result };
      }
      return { status: 404, body: { error: 'Unknown endpoint', endpoints: ['GET /api/calendar', 'GET /api/calendar/events', 'GET /api/calendar/feed.ics', 'POST /api/calendar/events', 'GET /api/calendar/add', 'DELETE /api/calendar/events'] } };
    } catch (err) {
      return { status: err.message?.startsWith('Event') || err.message?.includes('missing') ? 400 : 502, body: { error: err.message } };
    }
  };
}

/* ── HTTP server ── */

export function startServer({ handle, port = 8100, host = '127.0.0.1' }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1_000_000) { res.writeHead(413).end(); return; }
    }
    let body;
    try { body = raw ? JSON.parse(raw) : undefined; } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Body is not valid JSON' }));
      return;
    }
    const result = await handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
    res.writeHead(result.status, { 'content-type': result.contentType ?? 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(result.raw ?? JSON.stringify(result.body, null, 2));
  });
  server.listen(port, host);
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Add-on: Supervisor proxy to HA. Development: HA_URL (ws://host:8123/api/websocket) + HA_TOKEN.
  const ha = connectHA({
    url: process.env.HA_URL ?? 'ws://supervisor/core/websocket',
    token: process.env.HA_TOKEN ?? process.env.SUPERVISOR_TOKEN,
  });
  const handle = createApi({ ha, apiToken: process.env.CALENDAR_API_TOKEN ?? '', feedToken: process.env.CALENDAR_FEED_TOKEN ?? '', defaultCalendar: process.env.CALENDAR_API_DEFAULT || undefined });
  startServer({ handle, port: Number(process.env.CALENDAR_API_PORT ?? 8100) });
  console.log('[calendar-api] listening on 127.0.0.1:' + (process.env.CALENDAR_API_PORT ?? 8100));
}
