import { useRef, useState } from 'react';
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
  const [importFailed, setImportFailed] = useState(false);

  const handleFile = async (file: File) => {
    setImporting(true);
    setImportFailed(false);
    try {
      await onImport(file);
    } catch {
      setImportFailed(true);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="onboarding-step onboarding-welcome">
      <img className="onboarding-logo" src={`${import.meta.env.BASE_URL}favicon/dark/web-app-manifest-512x512.png`} alt="" width={112} height={112} />
      <h1 className="onboarding-wordmark">HomeTwin<span>3D</span></h1>
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
          className="onboarding-hidden-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
      </div>

      {importFailed && <p className="onboarding-error" role="alert">{t('onboarding.importFailed')}</p>}
      {importing && (
        <p className="onboarding-muted">
          {t('onboarding.restoringBackup')}
        </p>
      )}
    </div>
  );
}
