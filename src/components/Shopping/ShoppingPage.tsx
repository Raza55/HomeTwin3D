import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Mic, Plus, RefreshCw, ShoppingCart, StopCircle, ListChecks, PencilLine } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSimulationMode } from '../../contexts/SimulationModeContext';
import { parseShoppingInput, shoppingSuggestions } from '../../services/shopping';
import { useShopping } from './useShopping';
import ShoppingGroups, { ShoppingCategoryIcon } from './ShoppingGroups';
import './ShoppingPage.css';

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export default function ShoppingPage() {
  const { language } = useLanguage();
  const de = language.startsWith('de');
  const txt = (german: string, english: string) => de ? german : english;
  const { simulationMode } = useSimulationMode();
  const data = useShopping(simulationMode, de);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [notice, setNotice] = useState('');
  const [shoppingMode, setShoppingMode] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
  const speechAvailable = !!Speech && window.isSecureContext;
  const open = data.items.filter(i => i.status === 'needs_action');
  const done = data.items.filter(i => i.status === 'completed');
  const parsed = parseShoppingInput(draft);
  const suggestions = shoppingSuggestions(data.history, data.items, parsed.length <= 1 ? draft : '', de
    ? ['Milch', 'Brot', 'Eier', 'Butter', 'Äpfel', 'Bananen', 'Kaffee', 'Tomaten']
    : ['Milk', 'Bread', 'Eggs', 'Butter', 'Apples', 'Bananas', 'Coffee', 'Tomatoes']);

  useEffect(() => () => {
    const r = recognition.current;
    if (r) { r.onresult = r.onerror = r.onend = null; r.abort(); }
  }, []);

  function dictate() {
    if (listening) { recognition.current?.stop(); return; }
    if (!Speech || !speechAvailable) { input.current?.focus(); return; }
    setSpeechError('');
    const r = new Speech(); recognition.current = r;
    r.lang = language; r.continuous = false; r.interimResults = false;
    r.onresult = event => {
      const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ');
      if (text.trim()) setDraft(previous => previous.trim() ? `${previous.trim()}, ${text.trim()}` : text.trim());
    };
    r.onerror = () => { setListening(false); setSpeechError(txt('Diktat nicht verfügbar. Mikrofonfreigabe prüfen oder das Mikrofon der Bildschirmtastatur verwenden.', 'Dictation unavailable. Check microphone permission or use your keyboard microphone.')); };
    r.onend = () => { setListening(false); input.current?.focus(); };
    try { r.start(); setListening(true); } catch { r.onerror(); }
  }
  async function submit(text: string, clear: boolean) {
    if (!parseShoppingInput(text).length) return;
    setNotice('');
    if (await data.add(text)) {
      if (clear) setDraft('');
      setNotice(txt('Auf der Liste.', 'On your list.'));
      input.current?.focus();
    }
  }

  return <main className={`shopping-page${shoppingMode ? ' shopping-mode' : ''}`}>
    <div className="shopping-shell">
      <header className="shopping-header">
        <Link to="/" className="shopping-back" aria-label={txt('Zurück zum Board', 'Back to board')}><ArrowLeft size={22} /></Link>
        <div><div className="shopping-eyebrow">HOMETWIN3D</div><h1><ShoppingCart size={25} /> {txt('Einkaufsliste', 'Shopping list')}</h1></div>
        <button type="button" disabled={data.busy || listening || (!data.local && !data.connected)} onClick={() => void data.refresh()} aria-label={txt('Liste aktualisieren', 'Refresh list')}><RefreshCw size={21} /></button>
      </header>

      <div className="shopping-mode-bar">
        <button type="button" aria-pressed={shoppingMode} disabled={listening} onClick={() => setShoppingMode(value => !value)}>
          {shoppingMode ? <PencilLine size={20} /> : <ListChecks size={20} />}
          {shoppingMode ? txt('Liste bearbeiten', 'Edit list') : txt('Einkaufsmodus', 'Shopping mode')}
        </button>
        <span>{shoppingMode ? txt('Abhaken & weiter', 'Check off & go') : txt('Nach Warengruppen sortiert', 'Sorted by category')}</span>
      </div>
      {data.items.length > 0 && <div className="shopping-progress">
        <div><strong>{open.length} {txt('noch offen', 'remaining')}</strong><span>{done.length} / {data.items.length} {txt('erledigt', 'completed')}</span></div>
        <progress value={done.length} max={data.items.length} aria-label={txt('Fortschritt der Einkaufsliste', 'Shopping list progress')} />
      </div>}

      <section className="shopping-source" aria-label={txt('Listenauswahl', 'List selection')}>
        <label htmlFor="shopping-list">{txt('Deine Liste', 'Your list')}</label>
        <select id="shopping-list" value={data.list} disabled={data.busy || listening} onChange={e => { data.select(e.target.value); setNotice(''); }}>
          <option value="local">{txt('Nur auf diesem Gerät', 'Only on this device')}</option>
          {!data.local && !data.lists.some(l => l.id === data.list) && <option value={data.list}>{txt('Gespeicherte Liste (nicht erreichbar)', 'Saved list (unavailable)')}</option>}
          {data.lists.map(l => <option key={l.id} value={l.id}>{l.name}{l.available ? '' : txt(' (nicht verfügbar)', ' (unavailable)')}</option>)}
        </select>
        <p className="shopping-sync" role="status">{data.local ? txt('Lokal gespeichert · kein Google-Abgleich', 'Saved locally · no Google sync') : data.connected && data.loaded ? txt('Mit Home Assistant verbunden', 'Connected to Home Assistant') : txt('Offline / wird geladen · gespeicherter Stand', 'Offline / loading · saved items')}</p>
      </section>

      <form className="shopping-compose" onSubmit={e => { e.preventDefault(); void submit(draft, true); }}>
        <label htmlFor="shopping-input">{txt('Was fehlt noch?', 'What do you need?')}</label>
        <textarea id="shopping-input" ref={input} value={draft} rows={2} maxLength={2000} disabled={data.busy}
          placeholder={txt('z. B. Milch, Brot, 6 Eier', 'e.g. milk, bread, 6 eggs')}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!data.busy && !listening) void submit(draft, true); } }} />
        <div className="shopping-compose-actions">
          <button type="button" onClick={dictate} disabled={data.busy} aria-pressed={listening} aria-label={listening ? txt('Diktat stoppen', 'Stop dictation') : txt('Spracheingabe', 'Voice input')}>
            {listening ? <StopCircle size={20} /> : <Mic size={20} />}{listening ? txt('Stopp', 'Stop') : txt('Diktieren', 'Dictate')}
          </button>
          <button type="submit" className="shopping-primary" disabled={!data.canAdd || data.busy || listening || !parsed.length}><Plus size={20} />{txt('Hinzufügen', 'Add')}{parsed.length > 1 ? ` (${parsed.length})` : ''}</button>
        </div>
        <p className="shopping-hint">{listening ? txt('Ich höre zu … danach prüfen und hinzufügen.', 'Listening … review and add afterwards.') : speechAvailable
          ? txt('Mehrere Artikel mit Komma trennen. Diktat wird vor dem Hinzufügen angezeigt.', 'Separate items with commas. Review dictation before adding.')
          : txt('Auf iPad/iPhone: Eingabefeld antippen und das Mikrofon der Bildschirmtastatur verwenden. Mehrere Artikel mit Komma trennen.', 'On iPad/iPhone: tap the input and use the keyboard microphone. Separate items with commas.')}</p>
        {speechError && <p role="alert" className="shopping-error">{speechError}</p>}
      </form>

      {suggestions.length > 0 && <section className="shopping-suggestions" aria-label={txt('Artikelvorschläge', 'Item suggestions')}>
        <h2>{draft.trim() ? txt('Passende Artikel', 'Matching items') : txt('Schnell hinzufügen', 'Quick add')}</h2>
        <div>{suggestions.map(name => <button key={name} type="button" disabled={!data.canAdd || data.busy || listening} onClick={() => void submit(name, !!draft.trim() && parsed.length <= 1)}><ShoppingCategoryIcon name={name} />{name}<Plus size={14} aria-hidden="true" /></button>)}</div>
      </section>}

      {data.error && <p className="shopping-error" role="alert">{data.error}</p>}
      <p className="shopping-notice" role="status">{data.busy ? txt('Wird gespeichert …', 'Saving …') : notice}</p>
      <section className="shopping-items" aria-label={txt('Einkäufe', 'Groceries')}>
        <div className="shopping-section-title"><h2>{txt('Noch besorgen', 'To buy')}</h2><span>{open.length}</span></div>
        {!open.length && <div className="shopping-empty"><ShoppingCart size={38} /><p>{data.loaded ? txt('Alles auf der Liste erledigt.', 'Everything checked off.') : txt('Noch keine Artikel geladen.', 'No items loaded yet.')}</p><span>{txt('Oben Artikel eingeben oder einen Vorschlag antippen.', 'Type an item above or tap a suggestion.')}</span></div>}
        <ShoppingGroups key={data.list} list={data.list} items={open} de={de} disabled={!data.canUpdate || data.busy} onToggle={item => void data.toggle(item)} />
        {done.length > 0 && <details className="shopping-done"><summary>{txt('Erledigt', 'Completed')} · {done.length}</summary>{done.map(item => <button className="shopping-row" key={item.uid} type="button" role="checkbox" aria-checked={true} disabled={!data.canUpdate || data.busy} onClick={() => void data.toggle(item)}><Check size={25} /><span>{item.summary}</span></button>)}</details>}
      </section>

      <details className="shopping-help"><summary>{txt('Google-Sync, Sprache & Handy', 'Google sync, voice & mobile')}</summary>
        <p>{txt('Artikel werden automatisch nach Warengruppen sortiert. Über das Etikett neben einem Artikel kannst du die Gruppe korrigieren. Die Zuordnung wird pro Liste auf diesem Gerät gemerkt, auch bei geänderter Mengenangabe. „Automatisch erkennen“ setzt die Korrektur zurück. Unbekannte Artikel stehen unter Sonstiges.', 'Items are automatically grouped by category. Use the tag beside an item to correct its category. Assignments are remembered per list on this device, including when the quantity changes. “Detect automatically” resets the correction. Unknown items appear under Other.')}</p>
        <p>{txt('Der Einkaufsmodus blendet Eingabe und Vorschläge aus. Über „Liste bearbeiten“ kannst du jederzeit ergänzen. Der Fortschritt zählt alle offenen und erledigten Einträge der ausgewählten Liste.', 'Shopping mode hides the input and suggestions. Use “Edit list” to add more at any time. Progress counts all open and completed items in the selected list.')}</p>
        <p>{txt('Für Geräteabgleich: In Home Assistant unter Einstellungen → Geräte & Dienste die Integration Google Tasks hinzufügen und dein Google-Konto verbinden. Eine Einkaufsliste in Google Tasks anlegen und hier auf allen Geräten dieselbe Liste auswählen.', 'For cross-device sync: add the Google Tasks integration in Home Assistant under Settings → Devices & services and connect your Google account. Create a shopping list in Google Tasks and select the same list here on every device.')}</p>
        <p>{txt('Änderungen hier gehen direkt an Google Tasks. Änderungen aus Google können bis zu 30 Minuten brauchen; der Aktualisieren-Button fordert einen neuen Abgleich an. Unterwegs muss Home Assistant erreichbar sein. Offline bleibt der zuletzt gespeicherte Stand lesbar; Änderungen sind dann gesperrt.', 'Changes here are sent to Google Tasks immediately. Changes from Google can take up to 30 minutes; the refresh button requests an update. Home Assistant must be reachable on the go. Offline, saved items remain readable; editing is disabled.')}</p>
        <p>{txt('Diese Seite als Lesezeichen oder zum Home-Bildschirm hinzufügen: Sie öffnet direkt die Einkaufsliste ohne 3D-Ansicht. Das Board muss auf dem Handy mit Home Assistant verbunden sein.', 'Bookmark this page or add it to your home screen to open the list directly without the 3D view. Connect the board to Home Assistant on your phone.')}</p>
        <p>{txt('Vorschläge lernen aus erfolgreich hinzugefügten Artikeln auf diesem Gerät. Die lokale Liste und dieses Lernverhalten werden nicht mit Google synchronisiert. Beim Listenwechsel werden keine Artikel übertragen.', 'Suggestions learn from successfully added items on this device. The local list and learning history do not sync with Google. Switching lists does not transfer items.')}</p>
        <p>{txt('Das Mikrofon im Browser benötigt HTTPS, Browserunterstützung und Mikrofonfreigabe. Je nach Browser verarbeitet dessen Sprachanbieter die Aufnahme. Alternativ funktioniert das systemeigene Tastatur-Diktat.', 'Browser dictation requires HTTPS, browser support and microphone permission. Your browser’s speech provider may process the recording. System keyboard dictation is an alternative.')}</p>
        <a href="https://www.home-assistant.io/integrations/google_tasks/" target="_blank" rel="noreferrer">{txt('Google Tasks einrichten', 'Set up Google Tasks')}</a>
        {' · '}<Link to="/onboarding">{txt('Board einrichten', 'Set up board')}</Link>
      </details>
    </div>
  </main>;
}
