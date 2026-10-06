import { useLanguage } from '../../contexts/LanguageContext';
import { GERMAN_REGIONS } from '../../services/calendar/holidays';
import type { CalendarPrefs } from '../../services/calendar/prefs';

interface Props {
  prefs: CalendarPrefs;
  onChange: (patch: Partial<CalendarPrefs>) => void;
  compact?: boolean;
}

/** States (one or several) plus which kinds of holidays to show. */
export default function RegionPicker({ prefs, onChange, compact }: Props) {
  const { t } = useLanguage();
  const toggle = (code: string) => onChange({
    regions: prefs.regions.includes(code) ? prefs.regions.filter(r => r !== code) : [...prefs.regions, code],
  });
  return (
    <div className={`cal-regions${compact ? ' compact' : ''}`}>
      <div className="cal-region-grid" role="group" aria-label={t('calendar.regions')}>
        {GERMAN_REGIONS.map(([code, name]) => (
          <button type="button" key={code} className={prefs.regions.includes(code) ? 'active' : ''} aria-pressed={prefs.regions.includes(code)} onClick={() => toggle(code)}>
            {name}
          </button>
        ))}
      </div>
      <label className="cal-check"><input type="checkbox" checked={prefs.showPublicHolidays} onChange={e => onChange({ showPublicHolidays: e.target.checked })} /> {t('calendar.publicHolidays')}</label>
      <label className="cal-check"><input type="checkbox" checked={prefs.showSchoolHolidays} onChange={e => onChange({ showSchoolHolidays: e.target.checked })} /> {t('calendar.schoolHolidays')}</label>
    </div>
  );
}
