import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepeat, repeatRule } from '../src/services/calendar/recurrence.ts';
import { calendarBackend } from '../src/services/calendar/haCalendar.ts';

test('custom intervals generate interoperable recurrence rules', () => {
  assert.equal(repeatRule('WEEKLY', 2), 'FREQ=WEEKLY;INTERVAL=2');
  assert.equal(repeatRule('MONTHLY', 3), 'FREQ=MONTHLY;INTERVAL=3');
  assert.equal(repeatRule('DAILY', 1), 'FREQ=DAILY');
  assert.equal(repeatRule('', 1), undefined);
  for (const n of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => repeatRule('WEEKLY', n));
});
test('editing interval preserves weekdays and ending conditions', () => {
  const rule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10;WKST=MO';
  assert.deepEqual(readRepeat(rule), { repeat: 'WEEKLY', interval: 2 });
  assert.equal(repeatRule('WEEKLY', 2, rule), rule);
  assert.equal(repeatRule('WEEKLY', 3, rule), 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10;WKST=MO;INTERVAL=3');
  assert.equal(repeatRule('WEEKLY', 1, rule), 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10;WKST=MO');
  assert.equal(repeatRule('MONTHLY', 2, rule), 'FREQ=MONTHLY;INTERVAL=2');
  const other = 'FREQ=HOURLY;INTERVAL=6;UNTIL=20271231T120000Z';
  assert.equal(readRepeat(other).repeat, 'CUSTOM');
  assert.equal(repeatRule('CUSTOM', 6, other), other);
});
test('demo expands every second week, not every week', async () => {
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const backend = calendarBackend({ request: async () => [] });
  await backend.create('calendar.demo', { summary: 'Training', start: new Date(2026, 9, 5, 10), end: new Date(2026, 9, 5, 11), allDay: false, rrule: repeatRule('WEEKLY', 2) });
  let unsubscribe;
  const events = await new Promise(resolve => { unsubscribe = backend.subscribe('calendar.demo', new Date(2026, 9, 1), new Date(2026, 10, 1), resolve); });
  unsubscribe();
  assert.deepEqual(events.map(e => e.start.getDate()), [5, 19]);
  delete globalThis.localStorage;
});
