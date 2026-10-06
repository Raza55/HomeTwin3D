import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, normalizeInput, splitDescription } from '../3dash-addon/calendar-api.mjs';

/** In-memory Home Assistant with one Local Calendar. */
function fakeHA() {
  const events = [];
  let uid = 0;
  const calls = [];
  return {
    events, calls,
    async request(msg) {
      calls.push(msg.type);
      if (msg.type === 'get_states') return [{ entity_id: 'calendar.family', attributes: { friendly_name: 'Family', supported_features: 7 } }];
      if (msg.type === 'calendar/event/create') { events.push({ ...msg.event, start: msg.event.dtstart, end: msg.event.dtend, uid: `u${++uid}`, all_day: msg.event.dtstart.length === 10 }); return null; }
      if (msg.type === 'calendar/event/update') { const e = events.find(x => x.uid === msg.uid); Object.assign(e, { description: undefined, location: undefined }, msg.event, { start: msg.event.dtstart, end: msg.event.dtend }); return null; }
      if (msg.type === 'calendar/event/delete') { events.splice(events.findIndex(x => x.uid === msg.uid), 1); return null; }
      throw new Error(`unexpected ${msg.type}`);
    },
    async snapshot() { return { events: events.map(e => ({ ...e })) }; },
  };
}

const auth = { authorization: 'Bearer secret-token' };
const call = (handle, method, path, { body, query = {}, headers = auth } = {}) => handle({ method, path, query, headers, body });

test('token is required', async () => {
  const handle = createApi({ ha: fakeHA(), apiToken: 'secret-token' });
  assert.equal((await call(handle, 'GET', '/api/calendar', { headers: {} })).status, 401);
  assert.equal((await call(handle, 'GET', '/api/calendar', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await call(createApi({ ha: fakeHA(), apiToken: '' }), 'GET', '/api/calendar')).status, 503);
  const info = await call(handle, 'GET', '/api/calendar');
  assert.equal(info.status, 200);
  assert.equal(info.body.defaultCalendar, 'calendar.family');
});

test('create, send again unchanged, change, grade kept, delete by ref', async () => {
  const ha = fakeHA();
  const handle = createApi({ ha, apiToken: 'secret-token' });
  const exam = { ref: 'exam-m1-1', summary: 'Klausur Mathematik', start: '2026-10-26T07:50', end: '2026-10-26T09:20', description: 'Stunden 1-2' };
  let r = await call(handle, 'POST', '/api/calendar/events', { body: [exam, { summary: 'Sportfest', start: '2026-07-01' }] });
  assert.deepEqual(r.body.results.map(x => x.status), ['created', 'created']);
  assert.equal(ha.events[0].dtstart, '2026-10-26T07:50:00');
  assert.equal(ha.events[0].description, 'Stunden 1-2\nRef: exam-m1-1');
  assert.equal(ha.events[1].dtend, '2026-07-02', 'all-day end is exclusive in HA');

  r = await call(handle, 'POST', '/api/calendar/events', { body: exam });
  assert.equal(r.body.results[0].status, 'unchanged');

  // A grade entered on the tablet survives an update without grade
  ha.events[0].description = 'Stunden 1-2\nNote: 12 Punkte\nRef: exam-m1-1';
  r = await call(handle, 'POST', '/api/calendar/events', { body: { ...exam, start: '2026-10-27T07:50', end: '2026-10-27T09:20' } });
  assert.equal(r.body.results[0].status, 'updated');
  assert.equal(ha.events.length, 2);
  assert.equal(ha.events[0].dtstart, '2026-10-27T07:50:00');
  assert.deepEqual(splitDescription(ha.events[0].description), { notes: 'Stunden 1-2', ref: 'exam-m1-1', grade: 12, persons: [] });

  r = await call(handle, 'POST', '/api/calendar/events', { body: { ...exam, start: '2026-10-27T07:50', end: '2026-10-27T09:20', persons: ['Anna'] } });
  assert.equal(ha.events[0].description, 'Stunden 1-2\nFür: Anna\nNote: 12 Punkte\nRef: exam-m1-1');

  r = await call(handle, 'POST', '/api/calendar/events', { body: { ...exam, start: '2026-10-27T07:50', end: '2026-10-27T09:20', grade: 9 } });
  assert.equal(splitDescription(ha.events[0].description).grade, 9);

  const listed = await call(handle, 'GET', '/api/calendar/events', { query: { start: '2026-01-01', end: '2026-12-31', ref: 'exam-m1-1' } });
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].grade, 9);
  assert.deepEqual(listed.body[0].persons, ['Anna'], 'people kept when not sent again');
  assert.equal(listed.body[0].description, 'Stunden 1-2');

  r = await call(handle, 'DELETE', '/api/calendar/events', { query: { ref: 'exam-m1-1' } });
  assert.equal(r.status, 200);
  assert.equal(ha.events.length, 1);
  assert.equal((await call(handle, 'DELETE', '/api/calendar/events', { query: { ref: 'exam-m1-1' } })).status, 404);
});

test('URL form and validation errors per event', async () => {
  const ha = fakeHA();
  const handle = createApi({ ha, apiToken: 'secret-token' });
  const r = await call(handle, 'GET', '/api/calendar/add', { headers: {}, query: { token: 'secret-token', summary: 'Zahnarzt', start: '2026-11-03T15:00', durationMinutes: '30' } });
  assert.equal(r.status, 200);
  assert.equal(ha.events[0].dtend, '2026-11-03T15:30:00');
  const mixed = await call(handle, 'POST', '/api/calendar/events', { body: { calendar: 'calendar.family', events: [{ summary: 'Ok', start: '2026-11-04' }, { summary: '', start: '2026-11-04' }, { summary: 'x', start: 'tomorrow' }] } });
  assert.equal(mixed.status, 207);
  assert.deepEqual(mixed.body.results.map(x => x.status), ['created', 'error', 'error']);
  assert.throws(() => normalizeInput({ summary: 'a', start: '2026-11-04T10:00', end: '2026-11-04T09:00' }, 'calendar.family'), /after start/);
  assert.throws(() => normalizeInput({ summary: 'a', start: '2026-11-04', grade: 16 }, 'calendar.family'), /0-15/);
});

test('WebSocket client: auth, request, subscription snapshot with unsubscribe', async () => {
  const { connectHA } = await import('../3dash-addon/calendar-api.mjs');
  const sent = [];
  class FakeSocket {
    constructor() { queueMicrotask(() => this.receive({ type: 'auth_required' })); }
    receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
    send(raw) {
      const msg = JSON.parse(raw);
      sent.push(msg);
      if (msg.type === 'auth') queueMicrotask(() => this.receive({ type: msg.access_token === 'tok' ? 'auth_ok' : 'auth_invalid' }));
      else if (msg.type === 'get_states') queueMicrotask(() => this.receive({ type: 'result', id: msg.id, success: true, result: [1, 2] }));
      else if (msg.type === 'calendar/event/subscribe') queueMicrotask(() => {
        this.receive({ type: 'result', id: msg.id, success: true, result: null });
        this.receive({ type: 'event', id: msg.id, event: { events: [{ summary: 'A', uid: 'u1' }] } });
      });
      else if (msg.type === 'unsubscribe_events') queueMicrotask(() => this.receive({ type: 'result', id: msg.id, success: true, result: null }));
      else if (msg.type === 'calendar/event/create') queueMicrotask(() => this.receive({ type: 'result', id: msg.id, success: false, error: { message: 'nope' } }));
    }
    close() { this.onclose?.(); }
  }
  const ha = connectHA({ url: 'ws://x', token: 'tok', WebSocketImpl: FakeSocket });
  assert.deepEqual(await ha.request({ type: 'get_states' }), [1, 2]);
  assert.deepEqual(await ha.snapshot({ type: 'calendar/event/subscribe', entity_id: 'calendar.family', start: 'a', end: 'b' }), { events: [{ summary: 'A', uid: 'u1' }] });
  await new Promise(r => setTimeout(r, 10));
  const sub = sent.find(m => m.type === 'calendar/event/subscribe');
  assert.equal(sent.find(m => m.type === 'unsubscribe_events')?.subscription, sub.id);
  await assert.rejects(ha.request({ type: 'calendar/event/create' }), /nope/);
  await assert.rejects(connectHA({ url: 'ws://x', token: 'bad', WebSocketImpl: FakeSocket }).request({ type: 'get_states' }), /rejected/);
});
