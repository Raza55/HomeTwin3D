import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Flame, Droplet } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { getSetting } from '../../services/settingsStore';
import '../SettingsModal.css';
import './KaloPanel.css';

interface Tile {
  unit: string; period: string; value: number; estimated: boolean; referenceValue: number;
  previousPeriod: string; previousValue: number; pctPrevious: number; pctReference: number;
}
interface Month { period: string; estimated: boolean; heat?: number; heatReference?: number; warmWater?: number; warmWaterReference?: number }
interface Consumption { updated: string; heat: Tile | null; warmWater: Tile | null; months: Month[] }
type Kind = 'heat' | 'warmWater';
const ERRORS = ['authentication', 'not_configured', 'unavailable'] as const;

export function useKaloConsumption(open: boolean) {
  const [data, setData] = useState<Consumption>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const controller = new AbortController();
    setLoading(true); setError('');
    (async () => {
      try {
        const connection = getSetting('connection');
        const token = connection.mode === 'live' ? connection.haSettings.token : '';
        if (!token) throw Error('authentication');
        const response = await fetch(new URL('api/kalo/consumption', new URL(import.meta.env.BASE_URL, window.location.href)), {
          headers: { 'X-HomeTwin-HA-Authorization': `Bearer ${token}` }, cache: 'no-store', redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw Error((ERRORS as readonly string[]).includes(body.error) ? body.error : 'unavailable');
        }
        const body = await response.json() as Consumption;
        if (!stopped) { setData(body); setError(''); }
      } catch (e) {
        if (!stopped) { setData(undefined); setError(e instanceof Error ? e.message : 'unavailable'); }
      } finally {
        if (!stopped) setLoading(false);
      }
    })();
    return () => { stopped = true; controller.abort(); };
  }, [open, revision]);
  return { data, error, loading, reload: () => setRevision(n => n + 1) };
}

function monthLabel(period: string, locale: string) {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

export default function KaloPanel({ onClose }: { onClose: () => void }) {
  const { t, language } = useLanguage();
  const [kind, setKind] = useState<Kind>('heat');
  const { data, error, loading, reload } = useKaloConsumption(true);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  const tile = data ? data[kind] : null;
  const refKey = kind === 'heat' ? 'heatReference' : 'warmWaterReference';
  // The year in review: the twelve most recent months, each paired with the same
  // month one year earlier (the portal's "Vorjahr") and with comparable households.
  const chart = useMemo(() => {
    const months = (data?.months ?? []).filter(m => typeof m[kind] === 'number');
    const byPeriod = new Map(months.map(m => [m.period, m]));
    const recent = months.slice(-12);
    const rows = recent.map(m => {
      const [y, mo] = m.period.split('-').map(Number);
      const prior = byPeriod.get(`${y - 1}-${String(mo).padStart(2, '0')}`);
      return { period: m.period, value: m[kind] as number, previous: prior?.[kind], reference: m[refKey], estimated: m.estimated };
    });
    const max = Math.max(1, ...rows.flatMap(r => [r.value, r.previous ?? 0, r.reference ?? 0]));
    return { rows, max };
  }, [data, kind, refKey]);

  const unit = tile?.unit === 'KWH' ? 'kWh' : (tile?.unit ?? '');
  const n = (v: number | undefined) => Math.round(Number(v ?? 0)).toLocaleString(language);

  return <div className="settings-backdrop kalo-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="settings-modal kalo-modal" role="dialog" aria-modal="true" aria-labelledby="kalo-title">
      <header className="settings-header">
        <h2 id="kalo-title" className="settings-title">{t('kalo.title')}</h2>
        <button ref={close} type="button" className="settings-icon-btn" onClick={onClose} aria-label={t('common.close')}><X size={22} /></button>
      </header>
      <div className="settings-body kalo-body">
        <div className="kalo-tabs" role="tablist" aria-label={t('kalo.title')}>
          <button type="button" role="tab" aria-selected={kind === 'heat'} className={`kalo-tab${kind === 'heat' ? ' active' : ''}`} onClick={() => setKind('heat')}><Flame size={16} aria-hidden="true" />{t('kalo.heat')}</button>
          <button type="button" role="tab" aria-selected={kind === 'warmWater'} className={`kalo-tab${kind === 'warmWater' ? ' active' : ''}`} onClick={() => setKind('warmWater')}><Droplet size={16} aria-hidden="true" />{t('kalo.warmWater')}</button>
        </div>

        {loading && !data && <p role="status">{t('kalo.loading')}</p>}
        {error && <p role="alert" className="kalo-error">{t(`kalo.error.${(ERRORS as readonly string[]).includes(error) ? error : 'unavailable'}`)}</p>}

        {tile && !error && <>
          <div className="kalo-tile">
            <div className="kalo-now">
              <div className="kalo-value">{n(tile.value)} <span className="kalo-unit">{unit}</span>{tile.estimated && <span className="kalo-est" title={t('kalo.estimated')}>*</span>}</div>
              <div className="kalo-period">{monthLabel(tile.period, language)}</div>
            </div>
            <div className="kalo-compare">
              {tile.pctReference <= 0
                ? <p className="kalo-good">{Math.abs(tile.pctReference)} % {t('kalo.lessThanComparable')}</p>
                : <p className="kalo-high">{tile.pctReference} % {t('kalo.moreThanComparable')}</p>}
              <p className="kalo-muted">{t('kalo.previousYear')} ({monthLabel(tile.previousPeriod, language)}): {n(tile.previousValue)} {unit}</p>
            </div>
          </div>

          <h3 className="kalo-subhead">{t('kalo.yearReview')}</h3>
          <ul className="kalo-chart">
            {chart.rows.map(row => <li key={row.period}>
              <span className="kalo-month">{monthLabel(row.period, language)}</span>
              <span className="kalo-bars" aria-hidden="true">
                <span className="kalo-bar kalo-bar-now" style={{ width: `${(row.value / chart.max) * 100}%` }} />
                {typeof row.previous === 'number' && <span className="kalo-bar kalo-bar-prev" style={{ width: `${(row.previous / chart.max) * 100}%` }} />}
              </span>
              <span className="kalo-num">{n(row.value)}{row.estimated ? '*' : ''}</span>
            </li>)}
          </ul>
          <div className="kalo-legend">
            <span><i className="kalo-swatch kalo-sw-now" />{t('kalo.current')}</span>
            <span><i className="kalo-swatch kalo-sw-prev" />{t('kalo.previousYear')}</span>
            <span className="kalo-muted">{unit}</span>
          </div>
        </>}

        <div className="kalo-actions">
          <button type="button" className="settings-btn" onClick={reload}>{t('kalo.reload')}</button>
        </div>
      </div>
    </section>
  </div>;
}
