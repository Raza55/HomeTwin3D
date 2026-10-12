import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { HAState } from '../types';
import type { HAConnectionStatus } from '../services/haWebSocket';
import { homeWarnings } from '../services/homeStatus';
import { useLanguage } from '../contexts/LanguageContext';
import './SettingsModal.css';
import './HomeWarnings.css';

export default function HomeWarnings({ states, connection, onClose }: {
  states: Record<string, HAState>; connection: HAConnectionStatus; onClose: () => void;
}) {
  const { t } = useLanguage();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); }
      // The close button is the only interactive element in this dialog.
      if (event.key === 'Tab') { event.preventDefault(); close.current?.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); previous?.focus(); };
  }, [onClose]);
  const warnings = connection === 'connected' ? homeWarnings(states) : [];
  return <div className="settings-backdrop home-warnings-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="home-warnings-title">
      <header className="settings-header">
        <h2 id="home-warnings-title" className="settings-title">{t('dashboard.homeWarnings.title')}</h2>
        <button ref={close} type="button" className="settings-icon-btn" onClick={onClose} aria-label={t('common.close')}><X size={22} /></button>
      </header>
      <div className="settings-body">
        <p className="home-warnings-hint">{t('dashboard.homeWarnings.scope')}</p>
        {connection !== 'connected' ? <p role="status">{t(`dashboard.homeWarnings.${connection}`)}</p>
          : warnings.length ? <ul className="home-warnings-list">{warnings.map(warning => <li key={warning.entityId}>
            <strong>{warning.label}</strong>
            <span>{t(`dashboard.homeWarnings.kind.${warning.kind}`)} · {warning.value}</span>
            <code>{warning.entityId}</code>
          </li>)}</ul> : <p role="status">{t('dashboard.homeWarnings.none')}</p>}
      </div>
    </section>
  </div>;
}
