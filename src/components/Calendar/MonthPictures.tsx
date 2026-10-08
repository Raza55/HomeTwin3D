import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { monthPicture, prepareMonthPicture } from '../../services/calendar/monthPictures';

export function useMonthPictures() {
  const [pictures, setPictures] = useState<Record<number, string>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const urls = useRef<Record<number, string>>({});
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    Promise.all(Array.from({ length: 12 }, (_, month) => monthPicture(month))).then(blobs => {
      if (!active) return;
      blobs.forEach((blob, month) => { if (blob) urls.current[month] = URL.createObjectURL(blob); });
      setPictures({ ...urls.current });
      setReady(true);
    }).catch(() => { if (active) setError(true); });
    return () => {
      active = false;
      mounted.current = false;
      Object.values(urls.current).forEach(URL.revokeObjectURL);
      urls.current = {};
    };
  }, []);
  async function save(month: number, blob: Blob | null) {
    await monthPicture(month, blob);
    if (!mounted.current) return;
    if (urls.current[month]) URL.revokeObjectURL(urls.current[month]);
    if (blob) urls.current[month] = URL.createObjectURL(blob);
    else delete urls.current[month];
    setPictures({ ...urls.current });
  }
  return { pictures, ready, error, save };
}

export default function MonthPictures({ initialMonth, state }: {
  initialMonth: number; state: ReturnType<typeof useMonthPictures>;
}) {
  const { t, language } = useLanguage();
  const [month, setMonth] = useState(initialMonth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  async function change(file: File | null) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try { await state.save(month, file ? await prepareMonthPicture(file) : null); }
    catch { setError(true); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <section className="cal-picture-settings" aria-label={t('calendar.pictures')}>
      <div className="cal-settings-title">{t('calendar.pictures')}</div>
      <label className="cal-field">
        <span>{t('calendar.pictureMonth')}</span>
        <select value={month} disabled={busy} onChange={e => { setMonth(Number(e.target.value)); setError(false); }}>
          {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>
            {new Intl.DateTimeFormat(language, { month: 'long' }).format(new Date(2026, index, 1))}
          </option>)}
        </select>
      </label>
      {state.pictures[month] && <img className="cal-picture-preview" src={state.pictures[month]} alt={t('calendar.pictures')} />}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void change(file);
      }} />
      <div className="cal-picture-actions">
        <button type="button" className="cal-btn" disabled={busy || !state.ready} onClick={() => input.current?.click()}>
          {busy ? t('calendar.pictureSaving') : t(state.pictures[month] ? 'calendar.pictureReplace' : 'calendar.pictureUpload')}
        </button>
        {state.pictures[month] && <button type="button" className="cal-btn" disabled={busy} onClick={() => void change(null)}>{t('calendar.pictureRemove')}</button>}
      </div>
      {(error || state.error) && <p role="alert">{t('calendar.pictureError')}</p>}
      <p className="cal-muted cal-settings-note">{t('calendar.pictureNote')}</p>
    </section>
  );
}
