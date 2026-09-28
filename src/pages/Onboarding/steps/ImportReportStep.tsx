import { useTranslation } from '../../../contexts/LanguageContext';

interface Props {
  hasModel: boolean;
  modelSize?: string;
  hasSettings: boolean;
  haStatus: 'success' | 'error' | 'missing';
  haError?: string;
  haUrl?: string;
  haPort?: number;
  lightsCount: number;
  displaysCount: number;
  wallsCount: number;
  tubesCount: number;
  settingsCount: number;
  onContinue: () => void;
}

export default function ImportReportStep({
  hasModel, modelSize, hasSettings,
  haStatus, haError, haUrl, haPort,
  lightsCount, displaysCount, wallsCount, tubesCount, settingsCount,
  onContinue,
}: Props) {
  const t = useTranslation();
  const haOk = haStatus === 'success';
  const suffix = (count: number) => (count === 1 ? '' : 's');
  const detail = haUrl ? ` (${haUrl}:${haPort})` : '';
  const errorDetail = haError ? ` - ${haError}` : '';

  return (
    <div className="onboarding-step onboarding-completion">
      <div>
        <h1>{t('onboarding.importReportTitle')}</h1>
        <h2>{t('onboarding.importReportSubtitle')}</h2>
      </div>

      <div className="onboarding-checklist">
        <div className="onboarding-check-item">
          <span className="check">{'\u2713'}</span>
          {t('onboarding.configurationRestored')}
        </div>

        {lightsCount > 0 && (
          <div className="onboarding-check-item">
            <span className="check">{'\u2713'}</span>
            {t('onboarding.lightCount', { count: lightsCount, suffix: suffix(lightsCount) })}
          </div>
        )}

        {displaysCount > 0 && (
          <div className="onboarding-check-item">
            <span className="check">{'\u2713'}</span>
            {t('onboarding.displayCount', { count: displaysCount, suffix: suffix(displaysCount) })}
          </div>
        )}

        {wallsCount > 0 && (
          <div className="onboarding-check-item">
            <span className="check">{'\u2713'}</span>
            {t('onboarding.wallCount', { count: wallsCount, suffix: suffix(wallsCount) })}
          </div>
        )}

        {tubesCount > 0 && (
          <div className="onboarding-check-item">
            <span className="check">{'\u2713'}</span>
            {t('onboarding.tubeCount', { count: tubesCount, suffix: suffix(tubesCount) })}
          </div>
        )}

        <div className="onboarding-check-item">
          <span className={hasModel ? 'check' : 'skip'}>
            {hasModel ? '\u2713' : '\u2014'}
          </span>
          {hasModel ? t('onboarding.modelRestored', { size: modelSize ? ` (${modelSize})` : '' }) : t('onboarding.modelNotIncluded')}
        </div>

        <div className="onboarding-check-item">
          <span className={hasSettings ? 'check' : 'skip'}>
            {hasSettings ? '\u2713' : '\u2014'}
          </span>
          {hasSettings ? t('onboarding.settingsRestored', { count: settingsCount, suffix: suffix(settingsCount) }) : t('onboarding.settingsNotIncluded')}
        </div>

        <div className="onboarding-check-item">
          <span className={haOk ? 'check' : 'skip'} style={haStatus === 'error' ? { color: 'var(--red)' } : undefined}>
            {haOk ? '\u2713' : haStatus === 'error' ? '\u2717' : '\u2014'}
          </span>
          {haOk
            ? t('onboarding.haConnected', { details: detail })
            : haStatus === 'error'
              ? t('onboarding.haFailed', { details: detail, error: errorDetail })
              : t('onboarding.haNotConfigured')}
        </div>
      </div>

      {!haOk && (
        <p style={{ color: 'var(--muted)' }}>
          {t('onboarding.nextConfigureHA')}
        </p>
      )}

      <button className="onboarding-btn primary" onClick={onContinue}>
        {t('onboarding.continue')}
      </button>
    </div>
  );
}
