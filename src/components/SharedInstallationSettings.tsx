import { useEffect, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import {
  checkSharedPin, getSharedPin, getSharedRevision, isSharedEnabled, loadLatestShared, onSharedStatus,
  publishShared, setSharedEnabled, setSharedPin, type SharedStatus,
} from '../services/sharedStore';

/** Settings for the shared installation: follow the latest version, write PIN, publish/load. */
export default function SharedInstallationSettings() {
  const t = useTranslation();
  const [enabled, setEnabled] = useState(isSharedEnabled);
  const [pin, setPin] = useState(getSharedPin);
  const [pinStatus, setPinStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>(getSharedPin() ? 'ok' : 'idle');
  const [status, setStatus] = useState<SharedStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    // Only compare revisions here; applying a newer version is left to the explicit button.
    void (async () => {
      if (!isSharedEnabled()) { setStatus({ kind: 'disabled' }); return; }
      const response = await fetch(`${import.meta.env.BASE_URL}shared/state.json`, { cache: 'no-cache' }).catch(() => null);
      if (!active) return;
      if (!response) setStatus({ kind: 'unavailable' });
      else if (response.status === 404) setStatus({ kind: 'empty' });
      else if (!response.ok) setStatus({ kind: 'unavailable' });
      else {
        const revision = (await response.json() as { revision: number }).revision;
        if (active) setStatus(revision === getSharedRevision() ? { kind: 'current', revision } : { kind: 'conflict', revision });
      }
    })();
    const off = onSharedStatus(next => { if (active) setStatus(next); });
    return () => { active = false; off(); };
  }, [enabled]);

  const savePin = async (): Promise<boolean> => {
    setPinStatus('testing');
    const ok = await checkSharedPin(pin);
    setPinStatus(ok ? 'ok' : 'error');
    if (ok) setSharedPin(pin);
    else setStatus({ kind: 'error', message: t('settings.shared.pinRejected') });
    return ok;
  };

  // Publishing checks and stores a newly typed PIN first, so one click is enough.
  const publish = async () => {
    if (pinStatus !== 'ok' && !(await savePin())) return;
    await run(() => publishShared(true));
  };

  const run = async (action: () => Promise<SharedStatus>, reloadOn: SharedStatus['kind'][] = []) => {
    setBusy(true);
    const next = await action();
    setStatus(next);
    setBusy(false);
    if (reloadOn.includes(next.kind)) setTimeout(() => window.location.reload(), 600);
  };

  const statusText = (() => {
    if (!status) return t('settings.shared.checking');
    switch (status.kind) {
      case 'disabled': return t('settings.shared.disabled');
      case 'unavailable': return t('settings.shared.unavailable');
      case 'empty': return t('settings.shared.empty');
      case 'readonly': return t('settings.shared.readonly');
      case 'error': return status.message === t('settings.shared.pinRejected') ? status.message : `${t('common.failed')}: ${status.message}`;
      case 'published': return t('settings.shared.published', { revision: status.revision });
      case 'conflict': return t('settings.shared.newer', { revision: status.revision });
      default: return t('settings.shared.version', { revision: status.revision });
    }
  })();

  return (
    <section className="settings-group">
      <h3 className="settings-group-title">{t('settings.shared.title')}</h3>
      <div className="settings-group-body">
        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">{t('settings.shared.follow')}</span>
            <span className="settings-row-hint" role="status">{statusText}</span>
          </div>
          <div className="settings-row-control">
            <button type="button" role="switch" aria-checked={enabled} aria-label={t('settings.shared.follow')}
              className="settings-switch"
              onClick={() => { setSharedEnabled(!enabled); setEnabled(!enabled); }}>
              <span className="settings-switch-knob" />
            </button>
          </div>
        </div>
        <div className="settings-fields">
          <div className="settings-field-row">
            <div className="settings-field grow">
              <label htmlFor="settings-shared-pin">{t('settings.shared.pin')}</label>
              <input
                id="settings-shared-pin"
                className="settings-input"
                type="password"
                autoComplete="off"
                value={pin}
                placeholder={t('settings.shared.pinPlaceholder')}
                onChange={(e) => { setPin(e.target.value); setPinStatus('idle'); if (!e.target.value) setSharedPin(''); }}
              />
            </div>
            <button
              type="button"
              className={`settings-btn align-end${pinStatus === 'ok' ? ' ok' : pinStatus === 'error' ? ' err' : ''}`}
              disabled={!pin || pinStatus === 'testing'}
              onClick={() => { void savePin(); }}
            >
              {pinStatus === 'testing' ? t('common.testing') : pinStatus === 'ok' ? `✓ ${t('settings.shared.pinOk')}` : pinStatus === 'error' ? `✗ ${t('common.failed')}` : t('common.save')}
            </button>
          </div>
          <div className="settings-actions">
            <button type="button" className="settings-btn primary" disabled={busy || !enabled || !pin || pinStatus === 'testing'} onClick={() => { void publish(); }}>
              {busy ? t('settings.shared.working') : t('settings.shared.publish')}
            </button>
            <button type="button" className="settings-btn" disabled={busy || !enabled} onClick={() => run(loadLatestShared, ['updated'])}>
              {t('settings.shared.load')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
