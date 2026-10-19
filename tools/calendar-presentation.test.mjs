import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentCalendarEvents, redundantHoliday } from '../src/services/calendar/presentation.ts';
import { readMeta } from '../src/services/calendar/eventMeta.ts';
import { sanitizeInstallation, storeInstallation, publishableInstallation } from '../src/services/installationConfig.ts';

const event = (patch = {}) => ({ calendar: 'calendar.demo', uid: 'one', summary: 'Appointment', start: new Date(2026, 9, 22, 10), end: new Date(2026, 9, 22, 11), allDay: false, ...patch });
const external = 'calendar.external';
test('calendar ownership adds a person in the display without mutating the original', () => {
  const original = event({ calendar: external, description: 'Notes' });
  const [shown] = presentCalendarEvents([original], { [external]: 'Anna' });
  assert.deepEqual(readMeta(shown.description).persons, ['Anna']);
  assert.equal(original.description, 'Notes');
});
test('linked copies prefer the owned calendar and retain other people', () => {
  const local = event({ description: 'Für: Ben, Anna\nRef: example-link' });
  const remote = event({ calendar: external, uid: 'other', description: 'Ref: example-link' });
  for (const input of [[local, remote], [remote, local]]) {
    const shown = presentCalendarEvents(input, { [external]: 'Anna' });
    assert.equal(shown.length, 1);
    assert.equal(shown[0].calendar, external);
    assert.deepEqual(readMeta(shown[0].description).persons, ['Anna', 'Ben']);
  }
});
test('same title is insufficient; occurrences and same-calendar events remain separate', () => {
  assert.equal(presentCalendarEvents([event(), event({ calendar: external, uid: 'different' })]).length, 2);
  assert.equal(presentCalendarEvents([event(), event({ start: new Date(2027, 9, 22, 10) })]).length, 2);
  assert.equal(presentCalendarEvents([event(), event()]).length, 2);
  assert.equal(presentCalendarEvents([event(), event({ calendar: external })]).length, 1);
});
test('holiday suppression requires a read-only single-day exact-name match', () => {
  const holiday = event({ summary: 'Neujahr', start: new Date(2027, 0, 1), end: new Date(2027, 0, 2), allDay: true });
  const calendars = [{ entityId: holiday.calendar, canCreate: false }];
  assert.equal(redundantHoliday(holiday, calendars, 'Neujahr'), true);
  assert.equal(redundantHoliday(holiday, [{ ...calendars[0], canCreate: true }], 'Neujahr'), false);
  assert.equal(redundantHoliday(holiday, calendars, undefined), false);
  assert.equal(redundantHoliday({ ...holiday, end: new Date(2027, 0, 3) }, calendars, 'Neujahr'), false);
});
test('ownership survives shared installation and invalid mappings are discarded', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const clean = sanitizeInstallation({ calendarOwners: { [external]: ' Anna ', invalid: 'Other', 'calendar.bad': 1 } });
  assert.deepEqual(clean, { calendarOwners: { [external]: 'Anna' } });
  storeInstallation(clean);
  assert.deepEqual(publishableInstallation(), clean);
  storeInstallation({});
  assert.equal(publishableInstallation(), undefined);
  delete globalThis.localStorage;
});
