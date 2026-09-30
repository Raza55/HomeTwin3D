// Modified for HomeTwin3D: independent add-on repository. See ORIGIN.md.
import { useState } from 'react';
import { updateSettings } from '../../../services/settingsStore';
import { haSocketUrl } from '../../../services/haWebSocket';
import { useTranslation } from '../../../contexts/LanguageContext';

interface Props {
  onComplete: () => void;
  initialHA?: { url: string; port: number; token: string; error?: string };
  /** Shown above the form, e.g. when the shared installation is already loaded. */
  notice?: string;
}

/** Test HA connection by opening a temporary WebSocket. */
export async function testHA(url: string, port: number, token: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(haSocketUrl(url, port));
    } catch {
      resolve({ success: false, error: 'Invalid URL' });
      return;
    }

    const timeout = setTimeout(() => { ws.close(); resolve({ success: false, error: 'Timeout (5s)' }); }, 5000);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (msg.type === 'auth_ok') {
        clearTimeout(timeout); ws.close(); resolve({ success: true });
      } else if (msg.type === 'auth_invalid') {
        clearTimeout(timeout); ws.close(); resolve({ success: false, error: 'Invalid token' });
      }
    };
    ws.onerror = () => { clearTimeout(timeout); ws.close(); resolve({ success: false, error: 'Connection failed' }); };
  });
}

export default function HASetupStep({ onComplete, initialHA, notice }: Props) {
  const t = useTranslation();
  const [url, setUrl] = useState(initialHA?.url ?? '');
  const [port, setPort] = useState(initialHA?.port ?? 8123);
  const [token, setToken] = useState(initialHA?.token ?? '');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(initialHA?.error ? 'error' : 'idle');
  const [errorMsg, setErrorMsg] = useState(initialHA?.error ?? '');
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    if (!url || !token) return;
    setStatus('testing');
    setErrorMsg('');
    try {
      const result = await testHA(url, port, token);
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(result.error || t('onboarding.connectionFailed'));
      }
    } catch {
      setStatus('error');
      setErrorMsg(t('onboarding.networkError'));
    }
  };

  const handleSave = () => {
    if (!url || !token) return;
    setSaving(true);
    try {
      updateSettings('connection', { haSettings: { url, port, token } });
      onComplete();
    } catch {
      setStatus('error');
      setErrorMsg(t('onboarding.saveConfigurationFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-step">
      <div>
        <h1>{t('onboarding.haTitle')}</h1>
        <h2>{t('onboarding.haSubtitle')}</h2>
      </div>
      {notice && <div className="onboarding-notice" role="status">{notice}</div>}

      {window.location.protocol === 'https:' && (
        <div className="onboarding-tips">
          <div className="onboarding-tips-title">{t('onboarding.httpsDetected')}</div>
          <ul>
            <li>{t('onboarding.httpsTip1')}</li>
            <li>{t('onboarding.httpsTip2')}</li>
            <li>{t('onboarding.httpsTip3')}</li>
          </ul>
          <div style={{ marginTop: 12, fontSize: '0.9em', opacity: 0.85 }}>
            {t('onboarding.noNabuCasa')}
          </div>
          <a
            href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FRaza55%2FHomeTwin3D"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 8 }}
          >
            <img
              src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg"
              alt={t('onboarding.addRepoAlt')}
            />
          </a>
        </div>
      )}

      <div className="onboarding-row">
        <div className="onboarding-field" style={{ flex: 3 }}>
          <label className="onboarding-label">{t('onboarding.ipUrl')}</label>
          <input
            className="onboarding-input"
            type="text"
            placeholder="192.168.1.xxx"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus('idle'); }}
          />
        </div>
        <div className="onboarding-field" style={{ flex: 1 }}>
          <label className="onboarding-label">{t('settings.port')}</label>
          <input
            className="onboarding-input"
            type="number"
            value={port}
            onChange={(e) => { setPort(parseInt(e.target.value) || 8123); setStatus('idle'); }}
          />
        </div>
      </div>

      <div className="onboarding-field">
        <label className="onboarding-label">{t('onboarding.longLivedToken')}</label>
        <input
          className="onboarding-input"
          type="password"
          placeholder="eyJhbGci..."
          value={token}
          onChange={(e) => { setToken(e.target.value); setStatus('idle'); }}
        />
        <p>
          {t('onboarding.generateToken')}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="onboarding-btn"
          onClick={handleTest}
          disabled={!url || !token}
        >
          {t('onboarding.testConnection')}
        </button>
        <button
          className="onboarding-btn primary"
          onClick={handleSave}
          disabled={!url || !token || saving}
        >
          {saving ? t('onboarding.saving') : t('onboarding.saveContinue')}
        </button>
      </div>

      {status !== 'idle' && (
        <div className={`onboarding-status ${status}`}>
          {status === 'testing' && t('onboarding.testingConnection')}
          {status === 'success' && `\u2713 ${t('onboarding.connectedSuccessfully')}`}
          {status === 'error' && `\u2717 ${errorMsg}`}
        </div>
      )}
    </div>
  );
}
