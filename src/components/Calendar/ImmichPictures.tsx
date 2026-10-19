import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { getSetting } from '../../services/settingsStore';
import type { CalendarPrefs } from '../../services/calendar/prefs';

export function useImmichPictures(enabled: boolean, seconds: number) {
  const [photo, setPhoto] = useState<{ current: string; previous?: string }>();
  const [album, setAlbum] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) { setPhoto(undefined); setError(''); setAlbum(''); return; }
    setPhoto(undefined); setAlbum(''); setError('');
    let stopped = false, busy = false, previousId = '', currentUrl = '', oldUrl = '';
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const request = async (path: string) => {
      const connection = getSetting('connection');
      const token = connection.mode === 'live' ? connection.haSettings.token : '';
      if (!token) throw Error('authentication');
      const response = await fetch(new URL('api/immich/' + path, new URL(import.meta.env.BASE_URL, window.location.href)), {
        headers: { 'X-HomeTwin-HA-Authorization': `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(['authentication', 'not_configured', 'empty_album'].includes(body.error) ? body.error : 'unavailable');
      }
      return response;
    };
    const clear = () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      currentUrl = oldUrl = '';
    };
    const load = async () => {
      if (stopped || busy || document.hidden) return;
      busy = true;
      let retry = true;
      try {
        const status = await request('status');
        if (!status.headers.get('content-type')?.includes('application/json')) throw Error('not_configured');
        const info = await status.json();
        const response = await request('image' + (previousId ? `?previous=${encodeURIComponent(previousId)}` : ''));
        if (!response.headers.get('content-type')?.startsWith('image/')) throw Error('unavailable');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        try { const image = new Image(); image.src = url; await image.decode(); }
        catch { URL.revokeObjectURL(url); throw Error('unavailable'); }
        if (stopped) { URL.revokeObjectURL(url); return; }
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        oldUrl = currentUrl; currentUrl = url;
        previousId = response.headers.get('x-photo-id') ?? '';
        setPhoto({ current: currentUrl, previous: oldUrl || undefined });
        setAlbum(String(info.albumName ?? '')); setError('');
      } catch (e) {
        if (!stopped) {
          const message = e instanceof Error ? e.message : 'unavailable';
          retry = !['authentication', 'not_configured'].includes(message);
          clear(); setPhoto(undefined); setError(message);
        }
      } finally {
        busy = false;
        if (!stopped && retry) timer = setTimeout(() => void load(), Math.max(10, Number(seconds) || 30) * 1000);
      }
    };
    const visibility = () => { clearTimeout(timer); if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visibility);
    void load();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); clear(); document.removeEventListener('visibilitychange', visibility); };
  }, [enabled, seconds, revision]);
  return { photo: enabled ? photo : undefined, album, error, reload: () => setRevision(n => n + 1) };
}

export default function ImmichPictures({ prefs, onChange, state }: {
  prefs: CalendarPrefs; onChange: (patch: Partial<CalendarPrefs>) => void; state: ReturnType<typeof useImmichPictures>;
}) {
  const { t } = useLanguage();
  return <section className="cal-picture-settings" aria-label="Immich">
    <div className="cal-settings-title">Immich</div>
    <label className="cal-check"><input type="checkbox" checked={!!prefs.immichEnabled} onChange={e => onChange({ immichEnabled: e.target.checked })} />{t('calendar.immichEnable')}</label>
    <p className="cal-muted">{t('calendar.immichSetup')}</p>
    {!!prefs.immichEnabled && <>
      <label className="cal-field">{t('calendar.immichInterval')}<select value={prefs.immichInterval ?? 30} onChange={e => onChange({ immichInterval: Number(e.target.value) })}>
        {[10, 30, 60, 300].map(s => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
      </select></label>
      {state.album && <p>{t('calendar.immichAlbum')}: {state.album}</p>}
      {state.error && <p role="alert">{t(`calendar.immichError.${['authentication', 'not_configured', 'empty_album'].includes(state.error) ? state.error : 'unavailable'}`)}</p>}
      {!state.album && !state.error && <p role="status">{t('calendar.immichLoading')}</p>}
      <button type="button" className="cal-btn" onClick={state.reload}>{t('calendar.immichReload')}</button>
    </>}
  </section>;
}
