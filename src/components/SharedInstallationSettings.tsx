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
      case 'published': return t('settings.shared.published').replace('{revision}', String(status.revision));
      case 'conflict': return t('settings.shared.newer').replace('{revision}', String(status.revision));
      default: return t('settings.shared.version').replace('{revision}', String(status.revision));
    }
  })();

  return (
    <div className="settings-section">
      <div className="settings-section-label">{t('settings.shared.title')}</div>
      <div className="settings-checkbox-group">
        <label className="settings-checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => { setSharedEnabled(e.target.checked); setEnabled(e.target.checked); }} />
          <span>{t('settings.shared.follow')}</span>
        </label>
      </div>
      <div className="settings-ha-fields">
        <div style={{ fontSize: 11, opacity: .8 }} role="status">{statusText}</div>
        <div className="settings-ha-row">
          <div className="settings-ha-field" style={{ flex: 3 }}>
            <label className="settings-ha-label">{t('settings.shared.pin')}</label>
            <input
              className="settings-ha-input"
              type="password"
              autoComplete="off"
              value={pin}
              placeholder={t('settings.shared.pinPlaceholder')}
              onChange={(e) => { setPin(e.target.value); setPinStatus('idle'); if (!e.target.value) setSharedPin(''); }}
            />
          </div>
          <button
            className={`settings-action-btn${pinStatus === 'ok' ? ' ha-ok' : pinStatus === 'error' ? ' ha-err' : ''}`}
            style={{ alignSelf: 'flex-end' }}
            disabled={!pin || pinStatus === 'testing'}
            onClick={() => { void savePin(); }}
          >
            {pinStatus === 'testing' ? t('common.testing') : pinStatus === 'ok' ? `✓ ${t('common.save')}` : pinStatus === 'error' ? `✗ ${t('common.failed')}` : t('common.save')}
          </button>
        </div>
        <div className="settings-actions">
          <button className="settings-action-btn" disabled={busy || !enabled || !pin || pinStatus === 'testing'} onClick={() => { void publish(); }}>
            {busy ? t('common.testing') : t('settings.shared.publish')}
          </button>
          <button className="settings-action-btn" disabled={busy || !enabled} onClick={() => run(loadLatestShared, ['updated'])}>
            {t('settings.shared.load')}
          </button>
        </div>
      </div>
    </div>
  );
}

