import { useState } from 'react';
import { updateConfig } from '../../../services/configApi';
import { useTranslation } from '../../../contexts/LanguageContext';
import { SYSTEM_LOCATION } from '../../../constants/location';

interface Props {
  onComplete: () => void;
}

export default function LocationStep({ onComplete }: Props) {
  const t = useTranslation();
  const [latitude, setLatitude] = useState(String(SYSTEM_LOCATION.latitude));
  const [longitude, setLongitude] = useState(String(SYSTEM_LOCATION.longitude));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    setSaving(true);
    try {
      await updateConfig({ location: { latitude: lat, longitude: lng } });
      onComplete();
    } catch {
      // silently continue
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-step">
      <div>
        <h1>{t('onboarding.locationTitle')}</h1>
        <h2>{t('onboarding.locationSubtitle')}</h2>
      </div>

      <p>{t('onboarding.locationBody')}</p>

      <div className="onboarding-row">
        <div className="onboarding-field">
          <label className="onboarding-label">{t('settings.latitude')}</label>
          <input
            className="onboarding-input"
            type="number"
            step="0.0001"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder={String(SYSTEM_LOCATION.latitude)}
          />
        </div>
        <div className="onboarding-field">
          <label className="onboarding-label">{t('settings.longitude')}</label>
          <input
            className="onboarding-input"
            type="number"
            step="0.0001"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder={String(SYSTEM_LOCATION.longitude)}
          />
        </div>
      </div>

      <p>{t('onboarding.locationHelp')}</p>

      <button
        className="onboarding-btn primary"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? t('onboarding.saving') : t('onboarding.saveContinue')}
      </button>
    </div>
  );
}
