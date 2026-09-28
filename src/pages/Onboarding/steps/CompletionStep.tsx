import { useTranslation } from '../../../contexts/LanguageContext';

interface Props {
  demoMode: boolean;
  hasModel: boolean;
  hasLocation: boolean;
  onEnter: () => void;
}

export default function CompletionStep({ demoMode, hasModel, hasLocation, onEnter }: Props) {
  const t = useTranslation();

  return (
    <div className="onboarding-step onboarding-completion">
      <div>
        <h1>{t('onboarding.completionTitle')}</h1>
        <h2>{t('onboarding.completionSubtitle')}</h2>
      </div>

      <div className="onboarding-checklist">
        <div className="onboarding-check-item">
          <span className="check">{'\u2713'}</span>
          {demoMode ? t('onboarding.demoEnabled') : t('onboarding.haConnectedShort')}
        </div>
        <div className="onboarding-check-item">
          <span className={hasModel ? 'check' : 'skip'}>
            {hasModel ? '\u2713' : '\u2014'}
          </span>
          {hasModel ? t('onboarding.modelUploaded') : t('onboarding.modelSkipped')}
        </div>
        <div className="onboarding-check-item">
          <span className={hasLocation ? 'check' : 'skip'}>
            {hasLocation ? '\u2713' : '\u2014'}
          </span>
          {hasLocation ? t('onboarding.locationConfigured') : t('onboarding.locationDefaults')}
        </div>
      </div>

      <p>{t('onboarding.completionBody')}</p>

      <button className="onboarding-btn primary" onClick={onEnter}>
        {t('onboarding.enterDashboard')}
      </button>
    </div>
  );
}
