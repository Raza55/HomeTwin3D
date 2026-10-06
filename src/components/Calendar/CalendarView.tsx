import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Plus, Repeat, Settings2, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { addDays, addMonths, hhmm, isoWeek, minutesOfDay, monthGrid, parseYmd, startOfDay, startOfWeek, ymd } from '../../services/calendar/dates';
import type { CalEvent } from '../../services/calendar/haCalendar';
import { gradeTone, isExam, personInitials, readMeta } from '../../services/calendar/eventMeta';
import { buildProfiles, loadLocalSamples } from '../../services/calendar/learning';
import { loadCalendarPrefs, saveCalendarPrefs, type CalendarPrefs } from '../../services/calendar/prefs';
import { refreshSchoolHolidays, schoolHolidays } from '../../services/calendar/schoolHolidays';
import { calendarColor, indexByDay, layoutDay, makeMarks, type DayMarks } from './calendarModel';
import EventEditor, { type EditorRequest } from './EventEditor';
import RegionPicker from './RegionPicker';
import { useCalendarData } from './useCalendarData';
import './CalendarView.css';

interface Props {
  onClose: () => void;
}

type View = CalendarPrefs['view'];
const HOUR_PX = 56;
const EXAM_COLORS = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#a855f7', '#ec4899'];
const PERSON_COLORS = ['#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#3b82f6', '#ec4899'];
const MAX_CHIPS = 3;

export default function CalendarView({ onClose }: Props) {
  const { language, t } = useLanguage();
  const [prefs, setPrefs] = useState<CalendarPrefs>(loadCalendarPrefs);
  const [focus, setFocus] = useState(() => startOfDay(new Date()));
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [schoolVersion, setSchoolVersion] = useState(0);
  const view = prefs.view;

  const updatePrefs = useCallback((patch: Partial<CalendarPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      saveCalendarPrefs(next);
      return next;
    });
  }, []);

  // Midnight rollover while the calendar stays open on a wall tablet
  useEffect(() => {
    const id = setInterval(() => setToday(prev => (ymd(prev) === ymd(new Date()) ? prev : startOfDay(new Date()))), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    for (const region of prefs.regions) {
      refreshSchoolHolidays(region).then(changed => { if (changed) setSchoolVersion(v => v + 1); });
    }
  }, [prefs.regions]);

  // One subscription per focused year (with a margin for month grids and weeks at the edges)
  const year = focus.getFullYear();
  const rangeStart = useMemo(() => addDays(new Date(year, 0, 1), -14), [year]);
  const rangeEnd = useMemo(() => addDays(new Date(year + 1, 0, 1), 14), [year]);
  const { backend, calendars, events: allEvents, status } = useCalendarData(rangeStart, rangeEnd, prefs.hiddenCalendars);
  // People: named in events ("Für: ...") plus those added on this device
  const persons = useMemo(() => {
    const names = new Set(prefs.persons);
    for (const e of allEvents) for (const p of readMeta(e.description).persons) names.add(p);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allEvents, prefs.persons]);
  const personsOf = useCallback((e: CalEvent) => readMeta(e.description, e.summary, persons).persons, [persons]);
  const activeFilter = useMemo(() => prefs.personFilter.filter(p => persons.includes(p)), [prefs.personFilter, persons]);
  // With a person filter, events for nobody in particular (whole family, school days) stay visible
  const events = useMemo(() => activeFilter.length
    ? allEvents.filter(e => { const ps = personsOf(e); return !ps.length || ps.some(p => activeFilter.includes(p)); })
    : allEvents, [allEvents, activeFilter, personsOf]);
  const personColor = useCallback((name: string) => PERSON_COLORS[Math.max(0, persons.indexOf(name)) % PERSON_COLORS.length], [persons]);
  const calendarIds = useMemo(() => calendars.map(c => c.entityId), [calendars]);
  const writable = useMemo(() => calendars.filter(c => c.canCreate), [calendars]);

  const byDay = useMemo(() => indexByDay(events), [events]);
  const school = useMemo(
    () => Object.fromEntries(prefs.regions.map(r => [r, schoolHolidays(r)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.regions, schoolVersion],
  );
  const marksOf = useMemo(
    () => makeMarks([year - 1, year, year + 1], prefs.regions, prefs.showPublicHolidays, school, prefs.showSchoolHolidays),
    [year, prefs.regions, prefs.showPublicHolidays, prefs.showSchoolHolidays, school],
  );
  const profiles = useMemo(() => buildProfiles([
    ...loadLocalSamples(),
    ...events.map(e => ({ summary: e.summary, start: e.allDay ? ymd(e.start) : e.start.toISOString(), end: e.allDay ? ymd(e.end) : e.end.toISOString(), allDay: e.allDay, calendar: e.calendar, location: e.location })),
  ]), [events]);

  const fmt = useMemo(() => ({
    month: new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }),
    monthName: new Intl.DateTimeFormat(language, { month: 'long' }),
    dayLong: new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' }),
    dayShort: new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }),
    weekdayShort: new Intl.DateTimeFormat(language, { weekday: 'short' }),
    weekdayNarrow: new Intl.DateTimeFormat(language, { weekday: 'narrow' }),
  }), [language]);
  const weekdayLabels = useMemo(() => {
    const monday = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => fmt.weekdayShort.format(addDays(monday, i)).replace('.', ''));
  }, [fmt]);

  const navigate = useCallback((dir: -1 | 1) => {
    setFocus(prev => view === 'year' ? addMonths(prev, 12 * dir) : view === 'month' ? addMonths(prev, dir) : addDays(prev, 7 * dir));
  }, [view]);

  const openNew = useCallback((date: Date, startMinutes?: number, allDay?: boolean) => {
    setEditor({ date, startMinutes, allDay });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editor || !prefs.setupDone || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape') { settingsOpen ? setSettingsOpen(false) : onClose(); }
      else if (e.key === 'ArrowLeft') navigate(-1);
      else if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, navigate, onClose, settingsOpen, prefs.setupDone]);

  // Horizontal swipe changes the period (week view keeps vertical scrolling)
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => { if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) navigate(dx < 0 ? 1 : -1);
  };

  const title = view === 'year' ? String(year)
    : view === 'month' ? fmt.month.format(focus)
    : (() => {
      const ws = startOfWeek(focus), we = addDays(ws, 6);
      return `${t('calendar.weekShort')} ${isoWeek(focus)} · ${fmt.dayShort.format(ws)} – ${fmt.dayShort.format(we)} ${we.getFullYear()}`;
    })();

  const examMarked = useCallback((e: CalEvent) => prefs.highlightExams && isExam(e.summary), [prefs.highlightExams]);
  const colorOf = (e: CalEvent) => (examMarked(e) ? prefs.examColor : calendarColor(calendarIds, e.calendar));
  const timeLabel = (e: CalEvent) => e.allDay ? t('calendar.allDay') : `${hhmm(minutesOfDay(e.start))}–${hhmm(minutesOfDay(e.end))}`;
  const editable = (e: CalEvent) => !!e.uid && !!calendars.find(c => c.entityId === e.calendar)?.canUpdate;
  const gradeBadge = (e: CalEvent) => {
    const points = isExam(e.summary) ? readMeta(e.description).grade : undefined;
    const ps = personsOf(e);
    return (
      <>
        {ps.map(p => <span key={p} className="cal-person-badge" style={{ background: personColor(p) }} title={p}>{personInitials(p, persons)}</span>)}
        {points !== undefined && <span className={`cal-grade-badge ${gradeTone(points)}`} title={t('calendar.grade')}>{points}</span>}
      </>
    );
  };
  const openEvent = (e: CalEvent) => setEditor({ date: startOfDay(e.start), event: e, readOnly: !editable(e) });

  const dayPanel = (
    <aside className="cal-agenda" aria-label={fmt.dayLong.format(focus)}>
      <div className="cal-agenda-head">
        <div>
          <div className="cal-agenda-date">{fmt.dayLong.format(focus)}</div>
          {ymd(focus) === ymd(today) && <div className="cal-agenda-sub">{t('calendar.today')}</div>}
        </div>
        {writable.length > 0 && (
          <button type="button" className="cal-btn cal-btn-primary" onClick={() => openNew(focus)}>
            <Plus size={18} aria-hidden="true" /> {t('calendar.add')}
          </button>
        )}
      </div>
      <DayMarksList marks={marksOf(ymd(focus))} />
      <ul className="cal-agenda-list">
        {(byDay.get(ymd(focus)) ?? []).map(e => (
          <li key={`${e.calendar}|${e.uid}|${e.recurrenceId}|${e.start.getTime()}`}>
            <button type="button" className={`cal-agenda-item${examMarked(e) ? ' exam' : ''}`} onClick={() => openEvent(e)} style={{ ['--event-color' as string]: colorOf(e) }}>
              <span className="cal-agenda-time">{timeLabel(e)}</span>
              <span className="cal-agenda-title">
                {e.summary}
                {gradeBadge(e)}
                {(e.rrule || e.recurrenceId) && <Repeat size={13} className="cal-inline-icon" aria-label={t('calendar.repeats')} />}
              </span>
              {e.location && <span className="cal-agenda-loc"><MapPin size={12} aria-hidden="true" /> {e.location}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!(byDay.get(ymd(focus))?.length) && <p className="cal-empty">{t('calendar.noEvents')}</p>}
    </aside>
  );

  return (
    <div className="cal-overlay" style={{ ['--exam-color' as string]: prefs.examColor }} role="dialog" aria-modal="true" aria-label={t('calendar.title')}>
      <header className="cal-header">
        <button type="button" className="cal-icon-btn" onClick={onClose} aria-label={t('calendar.close')}><X size={22} /></button>
        <div className="cal-nav">
          <button type="button" className="cal-icon-btn" onClick={() => navigate(-1)} aria-label={t('calendar.previous')}><ChevronLeft size={24} /></button>
          <h2 className="cal-title">{title}</h2>
          <button type="button" className="cal-icon-btn" onClick={() => navigate(1)} aria-label={t('calendar.next')}><ChevronRight size={24} /></button>
        </div>
        <button type="button" className="cal-btn" onClick={() => setFocus(today)}>{t('calendar.today')}</button>
        <div className="cal-segment" role="tablist">
          {(['year', 'month', 'week'] as View[]).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => updatePrefs({ view: v })}>
              {t(`calendar.view.${v}`)}
            </button>
          ))}
        </div>
        <button type="button" className={`cal-icon-btn${settingsOpen ? ' active' : ''}`} onClick={() => setSettingsOpen(o => !o)} aria-label={t('calendar.settings')}><Settings2 size={20} /></button>
      </header>

      {persons.length > 0 && (
        <div className="cal-persons" role="group" aria-label={t('calendar.personFilter')}>
          <button type="button" className={!activeFilter.length ? 'active' : ''} onClick={() => updatePrefs({ personFilter: [] })}>{t('calendar.everyone')}</button>
          {persons.map(p => (
            <button type="button" key={p} className={activeFilter.includes(p) ? 'active' : ''} aria-pressed={activeFilter.includes(p)}
              onClick={() => updatePrefs({ personFilter: activeFilter.includes(p) ? activeFilter.filter(x => x !== p) : [...activeFilter, p] })}>
              <span className="cal-swatch" style={{ background: personColor(p) }} /> {p}
            </button>
          ))}
        </div>
      )}

      {status !== 'ready' && (
        <div className="cal-status">{status === 'offline' ? t('calendar.offline') : t('calendar.loading')}</div>
      )}
      {status === 'ready' && !writable.length && <div className="cal-status">{t('calendar.noWritable')}</div>}
      {backend && !backend.live && <div className="cal-status cal-status-demo">{t('calendar.demo')}</div>}

      <div className={`cal-body cal-body-${view}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null; }}>
        <main className="cal-main">
          {view === 'year' && (
            <YearView examMarked={examMarked} year={year} today={today} focus={focus} byDay={byDay} marksOf={marksOf} fmt={fmt} weekdayLabels={weekdayLabels}
              onMonth={d => { setFocus(d); updatePrefs({ view: 'month' }); }}
              onDay={d => { setFocus(d); updatePrefs({ view: 'month' }); }} />
          )}
          {view === 'month' && (
            <div className="cal-month">
              <div className="cal-weekdays">{weekdayLabels.map(w => <div key={w}>{w}</div>)}</div>
              <div className="cal-month-grid">
                {monthGrid(focus.getFullYear(), focus.getMonth()).map(day => {
                  const key = ymd(day);
                  const marks = marksOf(key);
                  const list = byDay.get(key) ?? [];
                  const schoolStart = marks.school && (marks.school.start === key || day.getDay() === 1 || day.getDate() === 1);
                  const cls = ['cal-day',
                    day.getMonth() !== focus.getMonth() && 'other',
                    key === ymd(today) && 'today',
                    key === ymd(focus) && 'selected',
                    marks.holiday && 'holiday',
                    marks.school && 'school',
                    list.some(examMarked) && 'exam-day',
                    (day.getDay() === 0 || day.getDay() === 6) && 'weekend',
                  ].filter(Boolean).join(' ');
                  return (
                    <div key={key} className={cls} role="button" tabIndex={0}
                      onClick={() => { if (key === ymd(focus) && writable.length && !list.length) openNew(day); else setFocus(day); }}
                      onDoubleClick={() => writable.length && openNew(day)}
                      onKeyDown={e => { if (e.key === 'Enter') setFocus(day); }}>
                      <div className="cal-day-top">
                        <span className="cal-day-num">{day.getDate()}</span>
                        {marks.holiday && <span className="cal-day-holiday" title={marks.holiday}>{marks.holiday}</span>}
                      </div>
                      {schoolStart && !marks.holiday && <span className="cal-day-school" title={marks.school!.name}>{marks.school!.name}</span>}
                      <div className="cal-day-events">
                        {list.slice(0, MAX_CHIPS).map(e => (
                          <button type="button" key={`${e.calendar}|${e.uid}|${e.recurrenceId}|${e.start.getTime()}`}
                            className={`cal-chip${e.allDay ? ' all-day' : ''}${examMarked(e) ? ' exam' : ''}`} style={{ ['--event-color' as string]: colorOf(e) }}
                            onClick={ev => { ev.stopPropagation(); setFocus(day); openEvent(e); }}>
                            {!e.allDay && <span className="cal-chip-time">{hhmm(minutesOfDay(e.start))}</span>}
                            <span className="cal-chip-title">{e.summary}</span>
                            {gradeBadge(e)}
                          </button>
                        ))}
                        {list.length > MAX_CHIPS && <span className="cal-more">+{list.length - MAX_CHIPS}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {view === 'week' && (
            <WeekView examMarked={examMarked} gradeBadge={gradeBadge} focus={focus} today={today} byDay={byDay} marksOf={marksOf} fmt={fmt} colorOf={colorOf}
              canCreate={writable.length > 0} onSelect={setFocus} onCreate={openNew} onOpen={openEvent} allDayLabel={t('calendar.allDay')} />
          )}
        </main>
        {view !== 'year' && dayPanel}
      </div>

      {writable.length > 0 && (
        <button type="button" className="cal-fab" onClick={() => openNew(focus)} aria-label={t('calendar.add')}><Plus size={30} /></button>
      )}

      {settingsOpen && (
        <div className="cal-settings" role="dialog" aria-label={t('calendar.settings')}>
          <div className="cal-settings-title">{t('calendar.regions')}</div>
          <RegionPicker prefs={prefs} onChange={updatePrefs} compact />
          <div className="cal-settings-title">{t('calendar.exams')}</div>
          <label className="cal-check"><input type="checkbox" checked={prefs.highlightExams} onChange={e => updatePrefs({ highlightExams: e.target.checked })} /> {t('calendar.highlightExams')}</label>
          {prefs.highlightExams && (
            <div className="cal-color-row" role="group" aria-label={t('calendar.examColor')}>
              {EXAM_COLORS.map(c => (
                <button type="button" key={c} className={`cal-color${prefs.examColor === c ? ' active' : ''}`} style={{ background: c }}
                  aria-label={c} aria-pressed={prefs.examColor === c} onClick={() => updatePrefs({ examColor: c })} />
              ))}
              <label className="cal-color cal-color-custom" title={t('calendar.examColor')}>
                <input type="color" value={prefs.examColor} onChange={e => updatePrefs({ examColor: e.target.value })} />
              </label>
            </div>
          )}
          {calendars.length > 0 && <div className="cal-settings-title">{t('calendar.calendars')}</div>}
          {calendars.map(c => (
            <label key={c.entityId} className="cal-check">
              <input type="checkbox" checked={!prefs.hiddenCalendars.includes(c.entityId)}
                onChange={e => updatePrefs({ hiddenCalendars: e.target.checked ? prefs.hiddenCalendars.filter(id => id !== c.entityId) : [...prefs.hiddenCalendars, c.entityId] })} />
              <span className="cal-swatch" style={{ background: calendarColor(calendarIds, c.entityId) }} /> {c.name}
              {!c.canCreate && <span className="cal-muted"> · {t('calendar.readOnly')}</span>}
            </label>
          ))}
          {writable.length > 1 && (
            <label className="cal-field">
              <span>{t('calendar.defaultCalendar')}</span>
              <select value={prefs.defaultCalendar ?? writable[0].entityId} onChange={e => updatePrefs({ defaultCalendar: e.target.value })}>
                {writable.map(c => <option key={c.entityId} value={c.entityId}>{c.name}</option>)}
              </select>
            </label>
          )}
          <p className="cal-muted cal-settings-note">{t('calendar.sourceNote')}</p>
        </div>
      )}

      {!prefs.setupDone && (
        <div className="cal-editor-backdrop">
          <div className="cal-editor cal-setup" role="dialog" aria-label={t('calendar.setupTitle')}>
            <h3>{t('calendar.setupTitle')}</h3>
            <p className="cal-muted">{t('calendar.setupText')}</p>
            <RegionPicker prefs={prefs} onChange={updatePrefs} />
            <div className="cal-editor-actions">
              <span className="cal-muted">{prefs.regions.length ? t('calendar.setupLater') : t('calendar.setupNone')}</span>
              <span className="cal-spacer" />
              <button type="button" className="cal-btn cal-btn-primary cal-btn-large" onClick={() => updatePrefs({ setupDone: true })}>{t('calendar.setupDone')}</button>
            </div>
          </div>
        </div>
      )}

      {editor && backend && (
        <EventEditor request={editor} backend={backend} calendars={writable}
          defaultCalendar={writable.some(c => c.entityId === prefs.defaultCalendar) ? prefs.defaultCalendar! : writable[0]?.entityId}
          calendarColor={id => calendarColor(calendarIds, id)} profiles={profiles}
          persons={persons} defaultPersons={activeFilter} personColor={personColor}
          onClose={() => setEditor(null)}
          onSaved={(date, saved) => {
            setEditor(null);
            if (date) setFocus(startOfDay(date));
            // Names typed in the dialog stay available on this device
            const added = (saved ?? []).filter(p => !prefs.persons.includes(p));
            if (added.length) updatePrefs({ persons: [...prefs.persons, ...added] });
          }} />
      )}
    </div>
  );
}

function DayMarksList({ marks }: { marks: DayMarks }) {
  const { language, t } = useLanguage();
  if (!marks.holiday && !marks.school) return null;
  return (
    <div className="cal-marks">
      {marks.holiday && <span className="cal-mark cal-mark-holiday">{marks.holiday}</span>}
      {marks.school && (
        <span className="cal-mark cal-mark-school">
          {marks.school.name} · {t('calendar.until')} {parseYmd(marks.school.end).toLocaleDateString(language, { day: 'numeric', month: 'numeric' })}
        </span>
      )}
    </div>
  );
}

interface Formats {
  monthName: Intl.DateTimeFormat;
  weekdayShort: Intl.DateTimeFormat;
  dayShort: Intl.DateTimeFormat;
}

function YearView({ examMarked, year, today, focus, byDay, marksOf, fmt, weekdayLabels, onMonth, onDay }: {
  examMarked: (e: CalEvent) => boolean;
  year: number; today: Date; focus: Date; byDay: Map<string, CalEvent[]>; marksOf: (d: string) => DayMarks;
  fmt: Formats; weekdayLabels: string[]; onMonth: (d: Date) => void; onDay: (d: Date) => void;
}) {
  return (
    <div className="cal-year">
      {Array.from({ length: 12 }, (_, month) => (
        <section key={month} className={`cal-mini${today.getFullYear() === year && today.getMonth() === month ? ' current' : ''}`}>
          <button type="button" className="cal-mini-title" onClick={() => onMonth(new Date(year, month, 1))}>
            {fmt.monthName.format(new Date(year, month, 1))}
          </button>
          <div className="cal-mini-grid">
            {weekdayLabels.map(w => <span key={w} className="cal-mini-wd">{w.slice(0, 2)}</span>)}
            {monthGrid(year, month).map(day => {
              const key = ymd(day);
              if (day.getMonth() !== month) return <span key={key} className="cal-mini-day other" />;
              const marks = marksOf(key);
              const list = byDay.get(key) ?? [];
              const count = list.length;
              const exam = list.find(examMarked);
              const cls = ['cal-mini-day', exam && 'exam-day',
                key === ymd(today) && 'today', key === ymd(focus) && 'selected',
                marks.holiday && 'holiday', marks.school && 'school', count > 0 && 'busy',
                (day.getDay() === 0 || day.getDay() === 6) && 'weekend'].filter(Boolean).join(' ');
              return (
                <button key={key} type="button" className={cls} onClick={() => onDay(day)}
                  title={[marks.holiday, marks.school?.name, exam?.summary, count ? `${count}` : ''].filter(Boolean).join(' · ') || undefined}>
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function WeekView({ examMarked, gradeBadge, focus, today, byDay, marksOf, fmt, colorOf, canCreate, onSelect, onCreate, onOpen, allDayLabel }: {
  examMarked: (e: CalEvent) => boolean;
  gradeBadge: (e: CalEvent) => JSX.Element;
  focus: Date; today: Date; byDay: Map<string, CalEvent[]>; marksOf: (d: string) => DayMarks; fmt: Formats;
  colorOf: (e: CalEvent) => string; canCreate: boolean; onSelect: (d: Date) => void;
  onCreate: (d: Date, startMinutes?: number, allDay?: boolean) => void; onOpen: (e: CalEvent) => void; allDayLabel: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(focus), i)), [focus]);
  const [nowMin, setNowMin] = useState(() => minutesOfDay(new Date()));
  useEffect(() => {
    const id = setInterval(() => setNowMin(minutesOfDay(new Date())), 60000);
    return () => clearInterval(id);
  }, []);
  // Start at 7:00 (or a bit before the current hour, if later)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, Math.min(7 * 60, minutesOfDay(new Date()) - 90)) / 60 * HOUR_PX;
  }, []);

  return (
    <div className="cal-week">
      <div className="cal-week-head">
        <div className="cal-week-gutter" />
        {days.map(day => {
          const key = ymd(day);
          const marks = marksOf(key);
          return (
            <button key={key} type="button" onClick={() => onSelect(day)}
              className={['cal-week-day', key === ymd(today) && 'today', key === ymd(focus) && 'selected', marks.holiday && 'holiday', marks.school && 'school', (byDay.get(key) ?? []).some(examMarked) && 'exam-day'].filter(Boolean).join(' ')}>
              <span className="cal-week-wd">{fmt.weekdayShort.format(day).replace('.', '')}</span>
              <span className="cal-week-num">{day.getDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="cal-week-allday">
        <div className="cal-week-gutter">{allDayLabel}</div>
        {days.map(day => {
          const key = ymd(day);
          const marks = marksOf(key);
          const allDay = (byDay.get(key) ?? []).filter(e => e.allDay);
          return (
            <div key={key} className={['cal-week-allday-cell', marks.school && 'school', marks.holiday && 'holiday', (byDay.get(key) ?? []).some(examMarked) && 'exam-day'].filter(Boolean).join(' ')} onDoubleClick={() => canCreate && onCreate(day, undefined, true)}>
              {marks.holiday && <span className="cal-mark cal-mark-holiday">{marks.holiday}</span>}
              {marks.school && (marks.school.start === key || day.getDay() === 1) && <span className="cal-mark cal-mark-school">{marks.school.name}</span>}
              {allDay.map(e => (
                <button type="button" key={`${e.calendar}|${e.uid}|${e.recurrenceId}`} className={`cal-chip all-day${examMarked(e) ? ' exam' : ''}`} style={{ ['--event-color' as string]: colorOf(e) }} onClick={() => onOpen(e)}>
                  <span className="cal-chip-title">{e.summary}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="cal-week-scroll" ref={scroller}>
        <div className="cal-week-grid" style={{ height: 24 * HOUR_PX }}>
          <div className="cal-week-gutter">
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="cal-hour-label" style={{ top: h * HOUR_PX }}>{h ? `${h}:00` : ''}</span>)}
          </div>
          {days.map(day => {
            const key = ymd(day);
            const dayStart = day.getTime();
            const timed = (byDay.get(key) ?? []).filter(e => !e.allDay);
            return (
              <div key={key} className={`cal-week-col${key === ymd(today) ? ' today' : ''}`}
                onClick={e => {
                  if (!canCreate || e.target !== e.currentTarget) return;
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  onSelect(day);
                  onCreate(day, Math.min(23 * 60 + 30, Math.floor(y / HOUR_PX * 2) * 30));
                }}>
                {layoutDay(timed).map(({ event: e, lane, lanes }) => {
                  // Clip events that start the day before or end the next day
                  const from = Math.max(0, (e.start.getTime() - dayStart) / 60000);
                  const to = Math.min(1440, (e.end.getTime() - dayStart) / 60000);
                  return (
                    <button type="button" key={`${e.calendar}|${e.uid}|${e.recurrenceId}|${e.start.getTime()}`} className={`cal-week-event${examMarked(e) ? ' exam' : ''}`}
                      style={{ top: from / 60 * HOUR_PX, height: Math.max(22, (to - from) / 60 * HOUR_PX - 2), left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, ['--event-color' as string]: colorOf(e) }}
                      onClick={() => onOpen(e)}>
                      <span className="cal-week-event-time">{hhmm(minutesOfDay(e.start))}</span>
                      <span className="cal-week-event-title">{e.summary} {gradeBadge(e)}</span>
                      {e.location && to - from >= 60 && <span className="cal-week-event-loc">{e.location}</span>}
                    </button>
                  );
                })}
                {key === ymd(today) && <div className="cal-now" style={{ top: nowMin / 60 * HOUR_PX }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
