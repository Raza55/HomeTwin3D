import { useState, type CSSProperties, type ReactNode } from 'react';
import ImmichPictures, { useImmichPictures } from '../Calendar/ImmichPictures';
import { loadCalendarPrefs, type CalendarPrefs } from '../../services/calendar/prefs';
import { useLanguage } from '../../contexts/LanguageContext';

/** Start with the calendar's choices; subsequent shopping changes stay independent. */
function loadPrefs(): CalendarPrefs {
  const base = loadCalendarPrefs();
  try {
    const stored = JSON.parse(localStorage.getItem('shopping.pictures') ?? 'null');
    if (!stored || typeof stored !== 'object') return base;
    return { ...base,
      immichEnabled: stored.immichEnabled === true,
      immichInterval: [10, 30, 60, 300].includes(stored.immichInterval) ? stored.immichInterval : 30,
      picturePlacement: ['banner', 'header', 'background', 'both'].includes(stored.picturePlacement) ? stored.picturePlacement : 'background',
      pictureFit: stored.pictureFit === 'contain' ? 'contain' : 'cover',
      pictureSize: stored.pictureSize === 'large' ? 'large' : 'compact',
      pictureOpacity: Number.isFinite(stored.pictureOpacity) ? Math.max(10, Math.min(70, stored.pictureOpacity)) : 40,
    };
  } catch { return base; }
}

export default function ShoppingPictures({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const { t, language } = useLanguage();
  const [prefs, setPrefs] = useState(loadPrefs);
  const state = useImmichPictures(enabled && !!prefs.immichEnabled, prefs.immichInterval ?? 30);
  function update(patch: Partial<CalendarPrefs>) {
    setPrefs(current => {
      const next = { ...current, ...patch };
      const { immichEnabled, immichInterval, picturePlacement, pictureFit, pictureSize, pictureOpacity } = next;
      try { localStorage.setItem('shopping.pictures', JSON.stringify({ immichEnabled, immichInterval, picturePlacement, pictureFit, pictureSize, pictureOpacity })); } catch { /* usable for this visit */ }
      return next;
    });
  }
  const photo = state.photo?.current;
  const background = !!photo && ['background', 'both'].includes(prefs.picturePlacement);
  const header = !!photo && ['header', 'both'].includes(prefs.picturePlacement);
  const picture = (className: string) => <div className={className} aria-hidden="true"><img key={photo} src={photo} alt="" style={{ objectFit: prefs.pictureFit }} /></div>;
  return <div className={`shopping-pictures${background ? ' has-background' : ''}${header ? ' has-header' : ''} picture-${prefs.pictureSize}`}
    style={{ '--shopping-photo-opacity': prefs.pictureOpacity / 100 } as CSSProperties}>
    {background && picture('shopping-photo-background')}
    {header && picture('shopping-photo-header')}
    {photo && prefs.picturePlacement === 'banner' && picture('shopping-photo-banner')}
    {children}
    <details className="shopping-picture-settings">
      <summary>{language.startsWith('de') ? 'Hintergrund & Immich-Album' : 'Background & Immich album'}</summary>
      <label>{t('calendar.picturePlacement')}<select value={prefs.picturePlacement} onChange={e => update({ picturePlacement: e.target.value as CalendarPrefs['picturePlacement'] })}>
        {(['banner', 'header', 'background', 'both'] as const).map(mode => <option key={mode} value={mode}>{mode === 'background' ? (language.startsWith('de') ? 'Als Hintergrund' : 'As background') : t('calendar.picturePlacement.' + mode)}</option>)}
      </select></label>
      {['background', 'both'].includes(prefs.picturePlacement) && <label>{t('calendar.pictureOpacity')} · {prefs.pictureOpacity}%
        <input type="range" min="10" max="70" step="5" value={prefs.pictureOpacity} onChange={e => update({ pictureOpacity: Number(e.target.value) })} />
      </label>}
      <label>{t('calendar.pictureSize')}<select value={prefs.pictureSize} onChange={e => update({ pictureSize: e.target.value as CalendarPrefs['pictureSize'] })}>
        <option value="compact">{t('calendar.pictureCompact')}</option><option value="large">{t('calendar.pictureLarge')}</option>
      </select></label>
      <label>{t('calendar.pictureFit')}<select value={prefs.pictureFit} onChange={e => update({ pictureFit: e.target.value as CalendarPrefs['pictureFit'] })}>
        <option value="cover">{t('calendar.pictureCover')}</option><option value="contain">{t('calendar.pictureContain')}</option>
      </select></label>
      <ImmichPictures prefs={prefs} onChange={update} state={state} />
    </details>
  </div>;
}
