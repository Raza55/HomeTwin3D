import { useRef, useState } from 'react';
import AnimatedLogo from '../../../components/AnimatedLogo';
import { useTranslation } from '../../../contexts/LanguageContext';

interface Props {
  onConnect: () => void;
  onSimulation: () => void;
  onImport: (file: File) => void | Promise<void>;
}

export default function WelcomeStep({ onConnect, onSimulation, onImport }: Props) {
  const t = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      await onImport(file);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="onboarding-step onboarding-welcome">
      <AnimatedLogo />
      <h2>{t('onboarding.welcomeSubtitle')}</h2>

      <p>{t('onboarding.welcomeBody')}</p>

      <div className="onboarding-welcome-actions">
        <button className="onboarding-btn primary" onClick={onConnect} disabled={importing}>
          {t('onboarding.connectHA')}
        </button>
        <button className="onboarding-btn simulation" onClick={onSimulation} disabled={importing}>
          {t('onboarding.trySimulation')}
        </button>
        <button
          className="onboarding-btn import"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? t('onboarding.importing') : t('onboarding.importBackup')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {importing && (
        <p style={{ color: 'var(--muted)', marginTop: 12 }}>
          {t('onboarding.restoringBackup')}
        </p>
      )}
    </div>
  );
}
