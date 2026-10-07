import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, publicHolidays } from '../src/services/calendar/holidays.ts';
import { schoolHolidayOn, mergeHolidays } from '../src/services/calendar/schoolHolidays.ts';
import { parseQuickText } from '../src/services/calendar/quickParse.ts';
import { buildProfiles, suggest } from '../src/services/calendar/learning.ts';
import { isoWeek, monthGrid, ymd, isoLocal } from '../src/services/calendar/dates.ts';

// Tuesday, 6 October 2026, 10:00
const now = new Date(2026, 9, 6, 10, 0);

test('easter and Rhineland-Palatinate public holidays', () => {
  assert.equal(ymd(easterSunday(2026)), '2026-04-05');
  assert.equal(ymd(easterSunday(2027)), '2027-03-28');
  const rp = publicHolidays(2026, 'DE-RP').map(h => `${h.date} ${h.name}`);
  assert.deepEqual(rp, [
    '2026-01-01 Neujahr', '2026-04-03 Karfreitag', '2026-04-06 Ostermontag', '2026-05-01 Tag der Arbeit',
    '2026-05-14 Christi Himmelfahrt', '2026-05-25 Pfingstmontag', '2026-06-04 Fronleichnam',
    '2026-10-03 Tag der Deutschen Einheit', '2026-11-01 Allerheiligen', '2026-12-25 1. Weihnachtsfeiertag', '2026-12-26 2. Weihnachtsfeiertag',
  ]);
  assert.ok(publicHolidays(2026, 'DE-SN').some(h => h.date === '2026-11-18' && h.name === 'Buß- und Bettag'));
  assert.ok(!publicHolidays(2026, 'DE-HE').some(h => h.name === 'Allerheiligen'));
});

test('school holidays: lookup and fetched data replacing bundled range', () => {
  const bundled = [{ start: '2026-10-05', end: '2026-10-16', name: 'Herbstferien' }, { start: '2029-10-22', end: '2029-11-02', name: 'Herbstferien' }];
  assert.equal(schoolHolidayOn(bundled, '2026-10-06')?.name, 'Herbstferien');
  assert.equal(schoolHolidayOn(bundled, '2026-10-17'), undefined);
  const merged = mergeHolidays(bundled, { fetchedAt: 0, from: '2025-01-01', to: '2027-12-31', holidays: [{ start: '2026-10-06', end: '2026-10-16', name: 'Herbstferien' }] });
  assert.deepEqual(merged.map(h => h.start), ['2026-10-06', '2029-10-22']);
});

test('quick text: dates, times, durations and title', () => {
  assert.deepEqual(parseQuickText('Zahnarzt morgen 15 Uhr', now), { title: 'Zahnarzt', date: '2026-10-07', startMinutes: 900 });
  assert.deepEqual(parseQuickText('Elternabend am Dienstag um 19:30 2 Stunden', now), { title: 'Elternabend', date: '2026-10-13', startMinutes: 1170, durationMinutes: 120 });
  assert.deepEqual(parseQuickText('Oma Geburtstag 12. März ganztägig', now), { title: 'Oma Geburtstag', date: '2027-03-12', allDay: true });
  assert.deepEqual(parseQuickText('Training von 17 bis 18:30 Uhr', now), { title: 'Training', startMinutes: 1020, durationMinutes: 90 });
  assert.deepEqual(parseQuickText('Friseur 24.10. halb drei nachmittags', now), { title: 'Friseur', date: '2026-10-24', startMinutes: 870 });
  assert.deepEqual(parseQuickText('Kino übermorgen abends um 8', now), { title: 'Kino', date: '2026-10-08', startMinutes: 1200 });
  assert.deepEqual(parseQuickText('Joggen 45 min', now), { title: 'Joggen', durationMinutes: 45 });
  assert.deepEqual(parseQuickText('Einkaufen', now), { title: 'Einkaufen' });
});

test('learning: usual time, duration, weekday and ranking', () => {
  const samples = [
    { summary: 'Fußball', start: '2026-09-01T17:00:00+02:00', end: '2026-09-01T18:30:00+02:00', allDay: false, calendar: 'calendar.family' },
    { summary: 'Fußball', start: '2026-09-08T17:00:00+02:00', end: '2026-09-08T18:30:00+02:00', allDay: false, calendar: 'calendar.family' },
    { summary: 'fußball ', start: '2026-09-15T17:05:00+02:00', end: '2026-09-15T18:30:00+02:00', allDay: false },
    { summary: 'Friseur', start: '2026-08-01T10:00:00+02:00', end: '2026-08-01T11:00:00+02:00', allDay: false },
    { summary: 'Müll', start: '2026-09-02', end: '2026-09-03', allDay: true },
  ];
  const profiles = buildProfiles(samples);
  const [first] = suggest(profiles, 'fu', now.getTime());
  assert.equal(first.title, 'Fußball');
  assert.equal(first.count, 3);
  assert.equal(first.startMinutes, 17 * 60);
  assert.equal(first.durationMinutes, 90);
  assert.equal(first.weekday, 2);
  assert.equal(first.calendar, 'calendar.family');
  assert.deepEqual(suggest(profiles, 'f', now.getTime()).map(s => s.title.toLowerCase()), ['fußball', 'friseur']);
  assert.equal(suggest(profiles, 'mü', now.getTime())[0].allDay, true);
  assert.equal(suggest(profiles, 'xyz', now.getTime()).length, 0);
});

test('date helpers', () => {
  assert.equal(isoWeek(new Date(2026, 9, 6)), 41);
  assert.equal(isoWeek(new Date(2027, 0, 1)), 53);
  assert.equal(ymd(monthGrid(2026, 9)[0]), '2026-09-28');
  assert.match(isoLocal(new Date(2026, 9, 7, 15, 0)), /^2026-10-07T15:00:00[+-]\d{2}:\d{2}$/);
});

test('marks for several states name the states a holiday applies to', async () => {
  const { makeMarks } = await import('../src/services/calendar/marks.ts');
  const school = { 'DE-RP': [{ start: '2026-10-05', end: '2026-10-16', name: 'Herbstferien' }], 'DE-HE': [{ start: '2026-10-05', end: '2026-10-17', name: 'Herbstferien' }] };
  const one = makeMarks([2026], ['DE-RP'], true, school, true);
  assert.equal(one('2026-06-04').holiday, 'Fronleichnam');
  assert.equal(one('2026-10-06').school.name, 'Herbstferien');
  const two = makeMarks([2026], ['DE-RP', 'DE-SN'], true, school, true);
  assert.equal(two('2026-06-04').holiday, 'Fronleichnam (RP)');
  assert.equal(two('2026-10-03').holiday, 'Tag der Deutschen Einheit');
  assert.equal(two('2026-10-31').holiday, 'Reformationstag (SN)');
  assert.equal(two('2026-10-06').school.name, 'Herbstferien (RP)');
  assert.equal(makeMarks([2026], ['DE-RP', 'DE-HE'], true, school, true)('2026-10-06').school.name, 'Herbstferien');
  assert.deepEqual(makeMarks([2026], [], true, school, true)('2026-10-03'), {});
});

test('event data lines: people, grade and API key', async () => {
  const m = await import('../src/services/calendar/eventMeta.ts');
  assert.equal(m.isExam('Klausur Mathematik'), true);
  assert.equal(m.isExam('Zahnarzt'), false);
  const desc = 'Kurs M1, Stunden 1-2\nFür: Anna, Ben\nNote: 11 Punkte\nRef: exam-m1-1';
  assert.deepEqual(m.readMeta(desc), { notes: 'Kurs M1, Stunden 1-2', persons: ['Anna', 'Ben'], grade: 11, ref: 'exam-m1-1', timetable: false, symbol: undefined });
  assert.equal(m.writeMeta(m.readMeta(desc)), desc);
  assert.equal(m.writeMeta({ notes: '', persons: [], grade: 1 }), 'Note: 1 Punkt');
  assert.deepEqual(m.readMeta('', 'Anna: Klausur Latein', ['Anna', 'Ben']).persons, ['Anna'], 'title prefix of a known person');
  assert.deepEqual(m.readMeta('', 'Schule: Wandertag', ['Anna']).persons, []);
  assert.equal(m.readMeta('Note: 16 Punkte').grade, undefined);
  assert.deepEqual([15, 13, 12, 10, 9, 7, 6, 4, 3, 1, 0].map(m.pointsToGrade), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  assert.equal(m.personInitials('Anna', ['Anna', 'Ben']), 'A');
  assert.equal(m.personInitials('Robin', ['Robin', 'Rosa']), 'Ro');
});

test('timetable lessons: only on school days, not while away or writing an exam', async () => {
  const { schoolLessons, lessonTitle } = await import('../src/services/calendar/timetable.ts');
  const { readMeta, writeMeta } = await import('../src/services/calendar/eventMeta.ts');
  const ev = (summary, start, end, description = '', allDay = false) => ({ calendar: 'calendar.family', summary, description, start: new Date(start), end: new Date(end), allDay });
  const persons = (e) => readMeta(e.description, e.summary, ['Anna', 'Ben']).persons;
  const lesson = (summary, from, to) => ev(summary, `2026-11-02T${from}`, `2026-11-02T${to}`, 'Raum 1\nArt: Stundenplan\nFür: Anna');
  const monday = new Date(2026, 10, 2);
  const lessons = [lesson('Anna: M1', '07:50', '09:20'), lesson('Anna: E1', '09:35', '11:05')];
  assert.equal(readMeta(lessons[0].description).timetable, true);
  assert.equal(writeMeta(readMeta(lessons[0].description)), 'Raum 1\nArt: Stundenplan\nFür: Anna');
  assert.deepEqual(schoolLessons(monday, lessons, [], {}, persons).map(l => l.summary), ['Anna: M1', 'Anna: E1']);
  assert.equal(schoolLessons(monday, lessons, [], { holiday: 'Feiertag' }, persons).length, 0);
  assert.equal(schoolLessons(monday, lessons, [], { school: {} }, persons).length, 0);
  assert.equal(schoolLessons(new Date(2026, 10, 1), lessons, [], {}, persons).length, 0, 'Sunday');
  assert.equal(schoolLessons(monday, lessons, [ev('Schule: beweglicher Ferientag (unterrichtsfrei)', '2026-11-02T00:00', '2026-11-03T00:00', '', true)], {}, persons).length, 0);
  // Exam of the same person replaces the lesson at that time; someone else's exam does not
  const exam = ev('Klausur Mathematik', '2026-11-02T07:50', '2026-11-02T09:20', 'Für: Anna');
  assert.deepEqual(schoolLessons(monday, lessons, [exam], {}, persons).map(l => l.summary), ['Anna: E1']);
  assert.equal(schoolLessons(monday, lessons, [{ ...exam, description: 'Für: Ben' }], {}, persons).length, 2);
  // Away: internship (all day) or a multi-day trip
  assert.equal(schoolLessons(monday, lessons, [ev('Anna: Berufspraktikum', '2026-11-02T00:00', '2026-11-14T00:00', '', true)], {}, persons).length, 0);
  assert.deepEqual(schoolLessons(monday, lessons, [ev('Reflitage', '2026-10-30T12:10', '2026-11-02T09:30', 'Für: Anna')], {}, persons).map(l => l.summary), ['Anna: E1']);
  // Any appointment of the same person overrides the lesson; others' and general school events do not
  assert.deepEqual(schoolLessons(monday, lessons, [ev('Kieferorthopäde', '2026-11-02T10:00', '2026-11-02T10:30', 'Für: Anna')], {}, persons).map(l => l.summary), ['Anna: M1']);
  assert.equal(schoolLessons(monday, lessons, [ev('Zahnarzt', '2026-11-02T08:00', '2026-11-02T09:00', 'Für: Ben')], {}, persons).length, 2);
  assert.equal(schoolLessons(monday, lessons, [ev('Schule: Tag der Information', '2026-11-02T08:00', '2026-11-02T12:00')], {}, persons).length, 2);
  // A one-day all-day reminder does not cancel school
  assert.equal(schoolLessons(monday, lessons, [ev('Anna: Frist Kurswahl', '2026-11-02T00:00', '2026-11-03T00:00', '', true)], {}, persons).length, 2);
  assert.equal(lessonTitle('Anna: M1', ['Anna']), 'M1');
  assert.equal(lessonTitle('Schule: M1', ['Anna']), 'Schule: M1');
});

test('event symbols: recognised from the title or chosen', async () => {
  const { eventKind, kindFromTitle } = await import('../src/services/calendar/eventKinds.ts');
  const { readMeta, writeMeta } = await import('../src/services/calendar/eventMeta.ts');
  const cases = {
    'Anna: Klausur Mathematik (M1)': 'exam', 'Zahnarzt': 'doctor', 'RA Arzt': 'doctor', 'Kinderarzt U10': 'doctor',
    'Oma Geburtstag': 'birthday', 'Schule: Zeugniskonferenzen (unterrichtsfrei)': 'free', 'Schule: beweglicher Ferientag (unterrichtsfrei)': 'free',
    'Schule: Zeugnisausgabe': 'certificate', 'Anna: Frist Abwahl Kurse': 'deadline', 'Anna: Berufspraktikum (Jg. 10)': 'work',
    'Schule: Elternsprechtag': 'parents', 'Schule: SEB-Sitzung': 'parents', 'Anna: Wettbewerb Mathe ohne Grenzen': 'sport',
    'Anna: Reflitage': 'trip', 'Schule: Wandertag': 'trip', 'White Horse Theatre (MSS 10-12)': 'culture', 'Schule: Bandfestival': 'culture',
    "Schule: Girls' and Boys' Day / Aktion Tagwerk": 'work', 'Friseur': 'haircut', 'Schule: Homeschooling (Teamtag)': 'school',
    'Einkaufen': 'shopping', 'Tag der Information': undefined,
  };
  for (const [title, kind] of Object.entries(cases)) assert.equal(kindFromTitle(title), kind, title);
  assert.equal(eventKind('Zahnarzt', 'party'), 'party');
  assert.equal(eventKind('Zahnarzt', 'none'), undefined);
  assert.equal(eventKind('Zahnarzt', 'unknown'), 'doctor');
  assert.equal(readMeta('Notiz\nSymbol: doctor').symbol, 'doctor');
  assert.equal(readMeta('Notiz\nSymbol: doctor').notes, 'Notiz');
  assert.equal(writeMeta({ notes: 'Notiz', persons: ['Anna'], symbol: 'doctor' }), 'Notiz\nSymbol: doctor\nFür: Anna');
});
