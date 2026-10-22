import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import EventEditor from '../src/components/Calendar/EventEditor';
import { installation } from '../src/services/installationConfig';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import type { EventDraft } from '../src/services/calendar/haCalendar';

installation.calendarStudent = 'Student';
const host = document.createElement('div'); document.body.append(host);
const root = createRoot(host);
let saved: EventDraft | undefined;
let generation = 0;
export const result = () => saved;
const time = (hour: number, minute = 0, day = 2) => new Date(2026, 10, day, hour, minute);
const lesson = (hour: number, subject = 'Math', person = 'Student', day = 2) => ({
  calendar: 'calendar.test', summary: subject, description: `Art: Stundenplan\nFür: ${person}`,
  start: time(hour, 0, day), end: time(hour, 45, day), allDay: false,
});
export function mount(mode = 'new', readOnly = false) {
  saved = undefined;
  const event = mode === 'new' ? undefined : {
    calendar: 'calendar.test', uid: 'test', summary: 'ÜL: Math', description: 'Für: Student\nSymbol: ul\nNote: 12 Punkte',
    start: mode === 'timed' ? time(8) : time(0), end: mode === 'timed' ? time(8, 45) : time(0, 0, 3), allDay: mode !== 'timed',
  };
  const backend: any = { create: async (_calendar: string, draft: EventDraft) => { saved = draft; }, update: async (_event: unknown, draft: EventDraft) => { saved = draft; } };
  flushSync(() => root.render(<LanguageProvider><EventEditor key={++generation} request={{ date: time(0), event, readOnly }} backend={backend}
    calendars={[{ entityId: 'calendar.test', name: 'Test', canCreate: true, canUpdate: true, canDelete: true }]}
    profiles={new Map()} lessons={[lesson(8), lesson(10), lesson(9, 'English'), lesson(11, 'Math', 'Other'), lesson(12, 'Math', 'Student', 3)]}
    persons={['Student', 'Other']} defaultPersons={[]} calendarColor={() => 'orange'} personColor={() => 'orange'} onClose={() => {}} onSaved={() => {}} /></LanguageProvider>));
}
