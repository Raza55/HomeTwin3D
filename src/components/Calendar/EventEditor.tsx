import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Sparkles, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { addDays, hhmm, minutesOfDay, parseYmd, startOfDay, ymd } from '../../services/calendar/dates';
import type { CalEvent, CalendarBackend, CalendarInfo, EventDraft, RecurrenceScope } from '../../services/calendar/haCalendar';
import { rememberSample, suggest, type Profile, type Suggestion } from '../../services/calendar/learning';
import { gradeTone, isExam, pointsToGrade, readMeta, writeMeta } from '../../services/calendar/eventMeta';
import { hasSchedule, parseQuickText, type QuickParse } from '../../services/calendar/quickParse';

export interface EditorRequest {
  date: Date;
  startMinutes?: number;
  allDay?: boolean;
  event?: CalEvent;
  /** Events of calendars without update support are only shown. */
  readOnly?: boolean;
}

interface Props {
  request: EditorRequest;
  backend: CalendarBackend;
  calendars: CalendarInfo[];
  defaultCalendar?: string;
  calendarColor: (entityId: string) => string;
  profiles: Map<string, Profile>;
  /** Known people (from events and this device), offered as "for whom" choices. */
  persons: string[];
  /** Preselected for new events (the person filter, if one is active). */
  defaultPersons: string[];
  personColor: (name: string) => string;
  onClose: () => void;
  /** Called with the saved event's date (to show it) and its people, or nothing after a delete. */
  onSaved: (date?: Date, persons?: string[]) => void;
}

type Repeat = '' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
const DURATIONS = [30, 60, 90, 120, 180];

interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;
const Speech: SpeechCtor | undefined = typeof window !== 'undefined'
  ? (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition
  : undefined;

export default function EventEditor({ request, backend, calendars, defaultCalendar, calendarColor, profiles, persons: knownPersons, defaultPersons, personColor, onClose, onSaved }: Props) {
  const { language, t } = useLanguage();
  const existing = request.event;
  const readOnly = !!request.readOnly;
  const initialStart = existing && !existing.allDay ? minutesOfDay(existing.start)
    : request.startMinutes ?? Math.min(22 * 60, Math.ceil((minutesOfDay(new Date()) + 30) / 60) * 60);

  const [title, setTitle] = useState(existing?.summary ?? '');
  const [date, setDate] = useState(ymd(existing?.start ?? request.date));
  const [allDay, setAllDay] = useState(existing?.allDay ?? request.allDay ?? false);
  const [startMin, setStartMin] = useState(initialStart);
  const [duration, setDuration] = useState(existing && !existing.allDay ? Math.max(5, Math.round((existing.end.getTime() - existing.start.getTime()) / 60000)) : 60);
  const [endDate, setEndDate] = useState(existing?.allDay ? ymd(addDays(existing.end, -1)) : ymd(existing?.start ?? request.date));
  const [repeat, setRepeat] = useState<Repeat>((existing?.rrule?.match(/FREQ=(WEEKLY|MONTHLY|YEARLY)/)?.[1] as Repeat) ?? '');
  const [calendar, setCalendar] = useState(existing?.calendar ?? defaultCalendar ?? calendars[0]?.entityId ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const initialMeta = useMemo(() => readMeta(existing?.description, existing?.summary, knownPersons), [existing, knownPersons]);
  const [description, setDescription] = useState(initialMeta.notes);
  const [grade, setGrade] = useState(initialMeta.grade);
  const [persons, setPersons] = useState<string[]>(existing ? initialMeta.persons : defaultPersons);
  const [personChoices, setPersonChoices] = useState(() => [...new Set([...knownPersons, ...initialMeta.persons])]);
  const [newPerson, setNewPerson] = useState<string | null>(null);
  const [more, setMore] = useState(!!(existing?.location || initialMeta.notes));
  // Date/time chosen by hand: typed or spoken phrases then no longer move it
  const [scheduleTouched, setScheduleTouched] = useState(!!existing || request.startMinutes !== undefined);
  const [titleFocused, setTitleFocused] = useState(!existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askScope, setAskScope] = useState<null | 'save' | 'delete'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const recurring = !!(existing?.rrule || existing?.recurrenceId);

  const parsed = useMemo(() => parseQuickText(title), [title]);
  const suggestions = useMemo(
    () => (titleFocused && !readOnly ? suggest(profiles, parsed.title || title).filter(s => s.title !== title.trim()) : []),
    [profiles, title, parsed.title, titleFocused, readOnly],
  );

  useEffect(() => () => recognition.current?.stop(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fmtDay = useMemo(() => new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short' }), [language]);
  const describe = (p: QuickParse) => [
    p.date && fmtDay.format(parseYmd(p.date)),
    p.allDay ? t('calendar.allDay') : p.startMinutes !== undefined && hhmm(p.startMinutes),
    p.durationMinutes && durationLabel(p.durationMinutes),
  ].filter(Boolean).join(' · ');
  const durationLabel = (min: number) => min < 60 ? `${min} min` : `${String(min / 60).replace('.', ',')} h`;
  const weekdayName = (d: number) => new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(2026, 0, 4 + d));

  const applyParsed = (p: QuickParse) => {
    if (p.title) setTitle(p.title);
    if (p.date) { setDate(p.date); setEndDate(p.date); }
    if (p.allDay) setAllDay(true);
    if (p.startMinutes !== undefined) { setStartMin(p.startMinutes); setAllDay(false); }
    if (p.durationMinutes) setDuration(p.durationMinutes);
    setScheduleTouched(true);
  };

  const applySuggestion = (s: Suggestion) => {
    setTitle(s.title);
    setTitleFocused(false);
    if (!scheduleTouched) {
      setAllDay(s.allDay);
      if (s.startMinutes !== undefined) setStartMin(s.startMinutes);
      if (!s.allDay) setDuration(s.durationMinutes);
      else setEndDate(ymd(addDays(parseYmd(date), Math.max(1, Math.round(s.durationMinutes / 1440)) - 1)));
    }
    if (s.calendar && calendars.some(c => c.entityId === s.calendar)) setCalendar(s.calendar);
    if (s.location && !location) { setLocation(s.location); setMore(true); }
  };

  const toggleVoice = () => {
    if (!Speech) return;
    if (listening) { recognition.current?.stop(); return; }
    const rec = new Speech();
    rec.lang = language;
    rec.interimResults = true;
    rec.continuous = false;
    let transcript = '';
    rec.onresult = e => {
      transcript = Array.from(e.results).map(r => r[0]?.transcript ?? '').join(' ').trim();
      setTitle(transcript);
    };
    rec.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') setError(t('calendar.voiceError')); };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      const p = parseQuickText(transcript);
      if (hasSchedule(p)) applyParsed(p);
    };
    recognition.current = rec;
    setError('');
    setListening(true);
    rec.start();
  };

  const metaDescription = (points: number | undefined) => writeMeta({ notes: description, persons, grade: points, ref: initialMeta.ref });

  const buildDraft = (points = grade): EventDraft | null => {
    let p: QuickParse | null = null;
    // "Zahnarzt morgen 15 Uhr" + save: the phrase decides unless date/time were set by hand
    if (!scheduleTouched && hasSchedule(parsed)) p = parsed;
    const summary = (p?.title || title).trim();
    if (!summary) return null;
    const day = p?.date ?? date;
    const isAllDay = p?.allDay ?? (p?.startMinutes !== undefined ? false : allDay);
    const start = parseYmd(day);
    if (isAllDay) {
      const last = p?.date ? start : parseYmd(endDate < day ? day : endDate);
      return { summary, start, end: addDays(last, 1), allDay: true, location, description: metaDescription(points), rrule: repeat ? `FREQ=${repeat}` : undefined };
    }
    const minutes = p?.startMinutes ?? startMin;
    start.setHours(Math.floor(minutes / 60), minutes % 60);
    const end = new Date(start.getTime() + (p?.durationMinutes ?? duration) * 60000);
    return { summary, start, end, allDay: false, location, description: metaDescription(points), rrule: repeat ? `FREQ=${repeat}` : undefined };
  };

  const save = async (scope?: RecurrenceScope, points = grade) => {
    const draft = buildDraft(points);
    if (!draft) { setError(t('calendar.titleMissing')); return; }
    if (existing && recurring && !scope) { setAskScope('save'); return; }
    setBusy(true);
    setError('');
    try {
      if (existing) {
        // A single changed occurrence cannot carry its own repetition rule
        await backend.update(existing, scope === 'this' ? { ...draft, rrule: undefined } : draft, scope);
      } else {
        await backend.create(calendar, draft);
      }
      rememberSample({
        summary: draft.summary, allDay: draft.allDay, calendar: existing?.calendar ?? calendar, location: draft.location || undefined,
        start: draft.allDay ? ymd(draft.start) : draft.start.toISOString(), end: draft.allDay ? ymd(draft.end) : draft.end.toISOString(),
      });
      onSaved(draft.start, persons);
    } catch (e) {
      setError(`${t('calendar.saveFailed')}: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
      setAskScope(null);
    }
  };

  const remove = async (scope?: RecurrenceScope) => {
    if (!existing) return;
    if (recurring && !scope) { setAskScope('delete'); return; }
    if (!recurring && !confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    try {
      await backend.remove(existing, scope);
      onSaved();
    } catch (e) {
      setError(`${t('calendar.deleteFailed')}: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
      setAskScope(null);
    }
  };

  const touch = () => setScheduleTouched(true);
  const todayYmd = ymd(new Date()), tomorrowYmd = ymd(addDays(startOfDay(new Date()), 1));
  const endLabel = hhmm((startMin + duration) % 1440);

  return (
    <div className="cal-editor-backdrop" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="cal-editor" onSubmit={e => { e.preventDefault(); if (!readOnly) void save(); }} aria-label={existing ? t('calendar.edit') : t('calendar.add')}>
        <div className="cal-editor-head">
          <h3>{readOnly ? t('calendar.details') : existing ? t('calendar.edit') : t('calendar.add')}</h3>
          <button type="button" className="cal-icon-btn" onClick={onClose} aria-label={t('calendar.close')}><X size={22} /></button>
        </div>

        <div className="cal-title-row">
          <input className="cal-title-input" value={title} placeholder={t('calendar.titlePlaceholder')} autoFocus={!existing}
            readOnly={readOnly} enterKeyHint="done" autoComplete="off"
            onChange={e => { setTitle(e.target.value); setTitleFocused(true); }}
            onFocus={() => setTitleFocused(true)} onBlur={() => setTimeout(() => setTitleFocused(false), 150)} />
          {Speech && !readOnly && (
            <button type="button" className={`cal-mic${listening ? ' listening' : ''}`} onClick={toggleVoice}
              aria-label={listening ? t('calendar.voiceStop') : t('calendar.voice')} title={listening ? t('calendar.voiceStop') : t('calendar.voice')}>
              {listening ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
          )}
        </div>
        {listening && <div className="cal-hint">{t('calendar.voiceHint')}</div>}

        {!readOnly && hasSchedule(parsed) && !listening && (
          <button type="button" className="cal-parsed" onClick={() => applyParsed(parsed)}>
            <Sparkles size={15} aria-hidden="true" />
            <span><strong>{parsed.title || title}</strong> · {describe(parsed)}</span>
            <span className="cal-parsed-action">{scheduleTouched ? t('calendar.apply') : t('calendar.recognized')}</span>
          </button>
        )}

        {isExam(title) && (
          <div className="cal-grade">
            <div className="cal-grade-head">
              <span className="cal-row-label">{t('calendar.grade')}</span>
              <span className={grade === undefined ? 'cal-muted' : ''}>
                {grade === undefined ? t('calendar.gradeNone') : t('calendar.gradeValue', { points: grade, grade: pointsToGrade(grade) })}
              </span>
            </div>
            <div className="cal-grade-grid" role="group" aria-label={t('calendar.grade')}>
              {Array.from({ length: 16 }, (_, p) => (
                <button type="button" key={p} disabled={readOnly || busy} aria-pressed={grade === p}
                  className={`cal-grade-btn ${gradeTone(p)}${grade === p ? ' active' : ''}`}
                  onClick={() => {
                    const next = grade === p ? undefined : p;
                    setGrade(next);
                    // A grade for an existing exam is saved right away: one tap and done
                    if (existing && !recurring) void save(undefined, next);
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="cal-suggestions" role="listbox" aria-label={t('calendar.suggestions')}>
            {suggestions.map(s => (
              <button type="button" role="option" aria-selected={false} key={s.title} className="cal-suggestion"
                onPointerDown={e => e.preventDefault()} onClick={() => applySuggestion(s)}>
                <span className="cal-suggestion-title">{s.title}</span>
                <span className="cal-suggestion-meta">
                  {[s.weekday !== undefined && weekdayName(s.weekday), s.allDay ? t('calendar.allDay') : s.startMinutes !== undefined && hhmm(s.startMinutes),
                    !s.allDay && durationLabel(s.durationMinutes), `${s.count}×`].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        )}

        <fieldset className="cal-editor-fields" disabled={readOnly}>
          <div className="cal-row">
            <span className="cal-row-label">{t('calendar.date')}</span>
            <div className="cal-chips">
              <button type="button" className={date === todayYmd ? 'active' : ''} onClick={() => { setDate(todayYmd); setEndDate(todayYmd); touch(); }}>{t('calendar.today')}</button>
              <button type="button" className={date === tomorrowYmd ? 'active' : ''} onClick={() => { setDate(tomorrowYmd); setEndDate(tomorrowYmd); touch(); }}>{t('calendar.tomorrow')}</button>
              <input type="date" value={date} required onChange={e => { if (e.target.value) { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); touch(); } }} />
            </div>
          </div>

          <div className="cal-row">
            <span className="cal-row-label">{t('calendar.time')}</span>
            <div className="cal-chips">
              <button type="button" className={allDay ? 'active' : ''} onClick={() => { setAllDay(a => !a); touch(); }}>{t('calendar.allDay')}</button>
              {!allDay && <input type="time" value={hhmm(startMin)} step={300} onChange={e => { const [h, m] = e.target.value.split(':').map(Number); if (!Number.isNaN(h)) { setStartMin(h * 60 + (m || 0)); touch(); } }} />}
              {allDay && (
                <label className="cal-inline">{t('calendar.until')}
                  <input type="date" value={endDate} min={date} onChange={e => { if (e.target.value) { setEndDate(e.target.value); touch(); } }} />
                </label>
              )}
            </div>
          </div>

          {!allDay && (
            <div className="cal-row">
              <span className="cal-row-label">{t('calendar.duration')}</span>
              <div className="cal-chips">
                {DURATIONS.map(d => (
                  <button type="button" key={d} className={duration === d ? 'active' : ''} onClick={() => { setDuration(d); touch(); }}>{durationLabel(d)}</button>
                ))}
                <span className="cal-muted">{t('calendar.until')} {endLabel}</span>
              </div>
            </div>
          )}

          <div className="cal-row">
            <span className="cal-row-label">{t('calendar.repeat')}</span>
            <div className="cal-chips">
              {(['', 'WEEKLY', 'MONTHLY', 'YEARLY'] as Repeat[]).map(r => (
                <button type="button" key={r || 'none'} className={repeat === r ? 'active' : ''} onClick={() => setRepeat(r)}>{t(`calendar.repeat.${r || 'none'}`)}</button>
              ))}
            </div>
          </div>

          <div className="cal-row">
            <span className="cal-row-label">{t('calendar.forWhom')}</span>
            <div className="cal-chips">
              {personChoices.map(p => (
                <button type="button" key={p} className={persons.includes(p) ? 'active' : ''} aria-pressed={persons.includes(p)}
                  onClick={() => setPersons(list => list.includes(p) ? list.filter(x => x !== p) : [...list, p])}>
                  <span className="cal-swatch" style={{ background: personColor(p) }} /> {p}
                </button>
              ))}
              {newPerson === null ? (
                <button type="button" onClick={() => setNewPerson('')}>{t('calendar.addPerson')}</button>
              ) : (
                <input autoFocus value={newPerson} placeholder={t('calendar.personName')} enterKeyHint="done" maxLength={30}
                  onChange={e => setNewPerson(e.target.value.replace(/[,:\n]/g, ''))}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const name = newPerson.trim();
                    if (name) {
                      setPersonChoices(list => list.includes(name) ? list : [...list, name]);
                      setPersons(list => list.includes(name) ? list : [...list, name]);
                    }
                    setNewPerson(null);
                  }}
                  onBlur={() => setNewPerson(null)} />
              )}
            </div>
          </div>

          {!existing && calendars.length > 1 && (
            <div className="cal-row">
              <span className="cal-row-label">{t('calendar.calendar')}</span>
              <div className="cal-chips">
                {calendars.map(c => (
                  <button type="button" key={c.entityId} className={calendar === c.entityId ? 'active' : ''} onClick={() => setCalendar(c.entityId)}>
                    <span className="cal-swatch" style={{ background: calendarColor(c.entityId) }} /> {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {more ? (
            <>
              <input className="cal-input" value={location} placeholder={t('calendar.location')} onChange={e => setLocation(e.target.value)} />
              <textarea className="cal-input" value={description} rows={2} placeholder={t('calendar.notes')} onChange={e => setDescription(e.target.value)} />
            </>
          ) : (
            !readOnly && <button type="button" className="cal-link" onClick={() => setMore(true)}>{t('calendar.more')}</button>
          )}
        </fieldset>

        {error && <div className="cal-error" role="alert">{error}</div>}

        {askScope && (
          <div className="cal-scope">
            <span>{askScope === 'save' ? t('calendar.scopeSave') : t('calendar.scopeDelete')}</span>
            <div className="cal-chips">
              <button type="button" disabled={busy} onClick={() => (askScope === 'save' ? save('this') : remove('this'))}>{t('calendar.scopeThis')}</button>
              {askScope === 'save'
                ? <button type="button" disabled={busy} onClick={() => save('future')}>{t('calendar.scopeFuture')}</button>
                : <button type="button" disabled={busy} onClick={() => remove('all')}>{t('calendar.scopeAll')}</button>}
              <button type="button" onClick={() => setAskScope(null)}>{t('calendar.cancel')}</button>
            </div>
          </div>
        )}

        {!readOnly && !askScope && (
          <div className="cal-editor-actions">
            {existing && (
              <button type="button" className={`cal-btn cal-btn-danger${confirmDelete ? ' confirm' : ''}`} disabled={busy} onClick={() => remove()}>
                <Trash2 size={18} aria-hidden="true" /> {confirmDelete ? t('calendar.deleteConfirm') : t('calendar.delete')}
              </button>
            )}
            <span className="cal-spacer" />
            <button type="button" className="cal-btn" onClick={onClose} disabled={busy}>{t('calendar.cancel')}</button>
            <button type="submit" className="cal-btn cal-btn-primary cal-btn-large" disabled={busy || !title.trim()}>{busy ? '…' : t('calendar.save')}</button>
          </div>
        )}
      </form>
    </div>
  );
}
