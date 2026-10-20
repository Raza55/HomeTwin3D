import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, CalendarDays, House, Box, ArrowUpRight, RefreshCw, WifiOff, Settings2, Lightbulb, DoorOpen, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSimulationMode } from '../../contexts/SimulationModeContext';
import { homeWarnings } from '../../services/homeStatus';
import { readItems, readStored } from '../../services/shopping';
import { loadStartPage, type StartPage } from '../../services/startPage';
import { useMobileConnection } from './useMobileConnection';
import './MobileHome.css';

const CalendarView = lazy(() => import('../Calendar/CalendarView'));
const HomeWarnings = lazy(() => import('../HomeWarnings'));

export default function MobileHome() {
  const { language } = useLanguage();
  const de = language.startsWith('de');
  const txt = (a: string, b: string) => de ? a : b;
  const { simulationMode } = useSimulationMode();
  const { states, status, ready, configured, reconnect } = useMobileConnection(simulationMode);
  const navigate = useNavigate();
  const location = useLocation();
  const calendar = location.pathname === '/mobile/calendar';
  const warningsOpen = location.pathname === '/mobile/status';
  const close = useCallback(() => navigate('/mobile', { replace: true }), [navigate]);
  const [now, setNow] = useState(() => new Date());
  const [start, setStart] = useState(loadStartPage);
  const [storageError, setStorageError] = useState(false);
  const [localCount, setLocalCount] = useState(() => readItems('shopping.items.local').filter(i => i.status === 'needs_action').length);
  useEffect(() => {
    const update = () => { setNow(new Date()); setLocalCount(readItems('shopping.items.local').filter(i => i.status === 'needs_action').length); };
    const timer = setInterval(update, 60000);
    window.addEventListener('focus', update); window.addEventListener('storage', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('storage', update); };
  }, []);
  const live = ready && status === 'connected';
  const values = Object.values(states);
  const warnings = live ? homeWarnings(states) : [];
  const lights = values.filter(s => s.entity_id.startsWith('light.') && s.state === 'on').length;
  const contacts = values.filter(s => s.entity_id.startsWith('binary_sensor.') && ['window', 'door', 'opening'].includes(String(s.attributes.device_class)) && s.state === 'on').length;
  const selected = readStored<unknown>('shopping.selected', 'local');
  const shoppingLocal = selected === 'local';
  const remoteCount = typeof selected === 'string' ? Number(states[selected]?.state) : NaN;
  const count = shoppingLocal ? localCount : live && Number.isFinite(remoteCount) && remoteCount >= 0 ? remoteCount : undefined;
  const statusText = !configured ? txt('Noch nicht verbunden', 'Not connected yet')
    : status === 'auth_error' ? txt('Anmeldung prüfen', 'Check sign-in')
    : live ? txt('Mit deinem Zuhause verbunden', 'Connected to your home')
    : status === 'connecting' || status === 'connected' ? txt('Verbindung wird hergestellt …', 'Connecting …') : txt('Zuhause gerade nicht erreichbar', 'Home is currently unreachable');

  return <main className="mobile-home">
    <div className="mobile-home-shell" {...{ inert: calendar || warningsOpen ? '' : undefined }}>
      <header className="mobile-home-header">
        <div className="mobile-brand"><House size={22} aria-hidden="true" /><span>HOMETWIN3D</span></div>
        <span className={`mobile-connection-dot${live ? ' live' : ''}`} aria-label={statusText} />
      </header>
      <p className="mobile-home-date">{new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</p>
      <h1>{txt('Dein Zuhause.', 'Your home.')}<br /><span>{txt('Alles griffbereit.', 'Always within reach.')}</span></h1>
      <div className="mobile-home-connection" role="status">
        {live ? <ShieldCheck size={18} /> : <WifiOff size={18} />}
        <span>{statusText}</span>
        {configured && <button type="button" onClick={reconnect} aria-label={txt('Verbindung erneuern', 'Reconnect')}><RefreshCw size={19} /></button>}
      </div>
      {!configured && <p className="mobile-home-setup">{txt('Deine lokale Einkaufsliste ist sofort nutzbar. Verbinde dieses Gerät mit Home Assistant für Kalender und Hausstatus.', 'Your local shopping list is ready to use. Connect this device to Home Assistant for calendar and home status.')} <Link to="/onboarding">{txt('Einrichten', 'Set up')}</Link></p>}

      <nav className="mobile-home-tiles" aria-label={txt('Schnellzugriffe', 'Shortcuts')}>
        <Link className="mobile-tile shopping" to="/shopping?from=mobile">
          <div className="mobile-tile-top"><ShoppingCart size={27} /><ArrowUpRight size={20} /></div>
          <strong>{txt('Einkaufsliste', 'Shopping list')}</strong>
          <span>{count === undefined ? txt('Liste öffnen', 'Open list') : txt(`${count} Artikel offen`, `${count} items remaining`)}</span>
          <small>{shoppingLocal ? txt('Auf diesem Gerät', 'On this device') : txt('Deine ausgewählte Liste', 'Your selected list')}</small>
        </Link>
        <Link className="mobile-tile calendar" to="/mobile/calendar">
          <div className="mobile-tile-top"><CalendarDays size={27} /><ArrowUpRight size={20} /></div>
          <strong>{txt('Kalender', 'Calendar')}</strong><span>{txt('Termine & Planung', 'Events & planning')}</span>
          <small>{txt('Mit deinen Kalenderansichten', 'Your calendar views')}</small>
        </Link>
        <Link className={`mobile-tile status${warnings.length ? ' has-warnings' : ''}`} to="/mobile/status">
          <div className="mobile-tile-top"><House size={27} /><ArrowUpRight size={20} /></div>
          <strong>{txt('Hausstatus', 'Home status')}</strong>
          <span>{!live ? txt('Status nicht verfügbar', 'Status unavailable') : warnings.length ? txt(`${warnings.length} ${warnings.length === 1 ? 'Hinweis' : 'Hinweise'}`, `${warnings.length} ${warnings.length === 1 ? 'alert' : 'alerts'}`) : txt('Keine aktiven Warnungen', 'No active warnings')}</span>
          <small>{txt('Warnungen im Detail', 'View warning details')}</small>
        </Link>
        <Link className="mobile-tile board" to="/board">
          <div className="mobile-tile-top"><Box size={27} /><ArrowUpRight size={20} /></div>
          <strong>{txt('3D-Board', '3D board')}</strong><span>{txt('Räume & Geräte', 'Rooms & devices')}</span>
          <small>{txt('Interaktive Hausansicht', 'Interactive home view')}</small>
        </Link>
      </nav>

      <section className="mobile-home-summary" aria-label={txt('Zuhause auf einen Blick', 'Home at a glance')}>
        <h2>{txt('Gerade zuhause', 'At home now')}</h2>
        <div><Lightbulb size={20} /><span>{txt('Lichter eingeschaltet', 'Lights on')}</span><strong>{live ? lights : '—'}</strong></div>
        <div><DoorOpen size={20} /><span>{txt('Offene Tür-/Fensterkontakte', 'Open door/window sensors')}</span><strong>{live ? contacts : '—'}</strong></div>
        <p>{txt('Gemeldete Home-Assistant-Zustände. Nicht vorhandene Sensoren können nicht berücksichtigt werden.', 'Reported Home Assistant states. Devices without sensors cannot be included.')}</p>
      </section>
      <details className="mobile-home-settings"><summary><Settings2 size={18} />{txt('Startseite auf diesem Gerät', 'Start page on this device')}</summary>
        <label>{txt('Beim Öffnen des Boards', 'When opening the board')}
          <select aria-label={txt('Startansicht', 'Start view')} value={start} onChange={e => {
            const value = e.target.value as StartPage; setStart(value);
            try { localStorage.setItem('home.startPage', value); setStorageError(false); } catch { setStorageError(true); }
          }}>
            <option value="auto">{txt('Automatisch nach Bildschirmgröße', 'Automatic by screen size')}</option>
            <option value="mobile">{txt('Handy-Startseite', 'Mobile start page')}</option>
            <option value="board">{txt('3D-Board', '3D board')}</option>
          </select>
        </label>
        {storageError && <p role="alert">{txt('Einstellung konnte nicht gespeichert werden.', 'Could not save this preference.')}</p>}
        <p>{txt('Diese Seite lässt sich als Lesezeichen speichern oder über das Browsermenü zum Home-Bildschirm hinzufügen.', 'Bookmark this page or add it to your home screen using your browser menu.')}</p>
      </details>
    </div>
    {calendar && <Suspense fallback={<div className="mobile-home-loading" role="status">{txt('Kalender wird geladen …', 'Loading calendar …')}</div>}>
      {configured && live ? <CalendarView onClose={close} /> : <section className="mobile-home-unconfigured" role="dialog" aria-modal="true" aria-label={txt('Kalender', 'Calendar')}>
        <h2>{configured ? txt('Kalender', 'Calendar') : txt('Kalender verbinden', 'Connect calendar')}</h2>
        <p role="status">{configured ? statusText : txt('Verbinde zuerst dieses Gerät mit Home Assistant.', 'Connect this device to Home Assistant first.')}</p>
        {configured ? <button onClick={reconnect}>{txt('Erneut verbinden', 'Reconnect')}</button> : <Link to="/onboarding">{txt('Einrichten', 'Set up')}</Link>}
        <button autoFocus onClick={close}>{txt('Zur Startseite', 'Back to start')}</button>
      </section>}
    </Suspense>}
    {warningsOpen && <Suspense fallback={<div className="mobile-home-loading" role="status">…</div>}><HomeWarnings states={live ? states : {}} connection={live ? 'connected' : status === 'connected' ? 'connecting' : status} onClose={close} /></Suspense>}
  </main>;
}
