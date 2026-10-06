# Änderungsverlauf

## 0.5.59 · Kalender als Abo für Google, Apple und Outlook (06.10.2026)

- Mit der neuen Add-on-Option `calendar_feed_token` liefert das Add-on die Termine aus Home Assistant als iCalendar Abo (`/api/calendar/feed.ics`). In Google Kalender per URL abonniert, erscheinen sie dort und auf dem Handy. Optional nur die Termine einer Person (`&person=…`) oder eines Kalenders.
- Der Feed-Schlüssel kann nur lesen. Personen und Noten stehen in der Beschreibung, interne API Schlüssel nicht.
- Dokumentation: Freigabe nur dieses Pfads im Reverse Proxy und Anzeige der Google Kalender im Tablet über die HA Integration *Google Calendar*.

## 0.5.58 · Kalender für das Tablet und Kalender API (06.10.2026)

- Ein Tipp auf Uhrzeit und Datum oben rechts öffnet einen Kalender mit Jahres, Monats und Wochenansicht, groß genug für die Bedienung mit dem Finger. Wischen blättert, die Tagesliste steht neben oder unter dem Raster. Ein Kalendersymbol am Datum zeigt die Zahl der heutigen Termine.
- Termine liegen in Kalendern von Home Assistant (zum Beispiel einem Lokalen Kalender) und sind damit auf allen Geräten gleich; Änderungen anderer Geräte erscheinen sofort.
- Feiertage und Schulferien: Beim ersten Öffnen werden die Bundesländer gewählt, auch mehrere; später über das Zahnrad. Feiertage werden berechnet, Schulferien kommen von der OpenHolidays API (Rheinland Pfalz auch offline).
- Neue Termine: Sätze wie „Zahnarzt morgen 15 Uhr“ werden erkannt, auch per Spracheingabe. Beim Tippen schlägt der Kalender frühere Termine mit ihrer üblichen Zeit, Dauer und ihrem Ort vor. Wiederholungen wöchentlich, monatlich oder jährlich.
- Personen: Termine lassen sich einer oder mehreren Personen zuordnen; Kürzel am Termin, Filter im Kopf.
- Klausuren erhalten eine Notenauswahl von 0 bis 15 Punkten, ein Tipp speichert.
- Kalender API im Add-on: Termine per JSON anlegen, ändern und löschen, mit eigenem Schlüssel (`ref`) ohne Doppelungen. Aus, bis `calendar_api_token` gesetzt ist. Das Add-on erhält dafür Zugriff auf die HA API. Beschreibung in der Add-on-Dokumentation.

## 0.5.57 · Energieansicht der Tagesdemo zeigt den spielenden PC (06.10.2026)

- In den Energiekapiteln der Tagesdemo steht der PC jetzt für den Rechner, auf dem in der Gaming Session gespielt wird (der PC mit Bildschirm). Bisher nahm die Demo das erste Objekt im Modell, dessen Name nach PC aussah; Verbrauch und Raum konnten so zu einem anderen Rechner gehören.

## 0.5.56 · Fertig-Anzeige für Waschmaschine und Trockner (04.10.2026)

- Waschmaschine und Trockner können eine Fertig-Entity erhalten (Zuordnungsassistent, Abschnitt Betriebsanzeige). Meldet sie `on`, wird der Gerätemarker rot, leuchtet langsam pulsierend und zeigt „Fertig“. Die Anzeige verschwindet, sobald HA die Entity zurücksetzt (z. B. Tür geöffnet oder Gerät ausgeschaltet).
- Ist ein Helfer (`input_boolean`) zugeordnet, beendet „Ausgeräumt, Anzeige beenden“ im Popup die Anzeige von Hand.

## 0.5.55 · Dritte Lüftungsbank näher an den Bänken (03.10.2026)

- Außenanlage: Die dritte Lüftungsbank am Südweg steht 2 m weiter vorn entlang des Wegs, also näher an den beiden ausgerichteten Bänken (Mitte zu Mitte jetzt 10,4 m statt 12,4 m zur zweiten Bank). Wegseite, Abstand zur Wegmitte und Drehung entlang der Kurve bleiben gleich.

## 0.5.54 · Neuer Rundgang, kein Seitenpanel mehr (03.10.2026)

- Der Rundgang erklärt in sechs kurzen Schritten die aktuelle Bedienung: Bewegen, Markierungen (Tippen öffnet die Steuerung, Halten bis der Ring sich schließt schaltet direkt, ? heißt noch nicht zugeordnet), Filterleiste, Ansichtsleiste oben rechts und das Zahnrad mit Einstellungen und Editor. Er hebt dabei jeweils das passende Bedienelement hervor und startet erst, wenn die 3D Ansicht geladen ist. In der Energieansicht ohne Filterleiste entfällt der Filterschritt.
- Das Kartenpanel ist entfernt, samt *Karten anordnen*: Der Plan nutzt immer die ganze Breite. Bereits angelegte Karten bleiben in der gespeicherten Konfiguration, werden aber nicht mehr angezeigt.
- Simulation: keine Demokarten mehr; *Simulation verlassen* steht jetzt in den Einstellungen.

## 0.5.53 · Finger der Tagesdemo trifft die Symbole (03.10.2026)

- Der Finger der Tagesdemo zielt bei Lampen, Rollos und Fernseher auf das gezeichnete Symbol der Markierung, so wie beim PC schon zuvor. Bisher steuerte er die Glühbirne, die Mitte des Rollos oder eine geschätzte Stelle über dem Fernseher an und tippte deshalb oft neben das Symbol. Geräte ohne Symbol werden weiter an ihrer Position im Modell angetippt.
- Während die Kamera weiterfährt, folgt der Finger dem Symbol bis zum Tippen bzw. über die ganze Dauer des langen Drucks.

## 0.5.52 · Dritte Lüftungsbank am Südweg (03.10.2026)

- Außenanlage: Eine dritte Lüftungsbank steht dort, wo der Weg hinter den beiden Bänken in die Kurve geht. Sie steht auf derselben Wegseite, mit demselben Abstand zur Wegmitte, und ist entlang der Kurve gedreht. Position und Drehung folgen aus dem Wegverlauf.
- Die Hofkatze umgeht die neue Bank und nutzt sie als Sitzplatz; das Springen zwischen den beiden ausgerichteten Bänken bleibt unverändert.

## 0.5.51 – Katze: Kopf, Hals und Beine überarbeitet (03.10.2026)

- Kopf nach den Proportionen eines echten Katzenmodells: schmaler als der Körper, tiefer angesetzt, breite Wangen, flachere Stirn, schmales Kinn, Schnurrhaarpolster; Ohren außen an den Ecken des Oberkopfs. Die Rückenlinie steigt vorne fließend in einen kurzen, schräg gestellten Hals an (kein „Schneemann“ aus zwei Kugeln mehr).
- Alle vier Beine in Fellfarbe mit hellen Socken (vorher nur die Vorderbeine hell); Beinansätze sitzen tiefer im Körper, die Schwanzspitze ist abgerundet.

## 0.5.50 – Demo: Filter seltener umschalten (03.10.2026)

- Die Tagesdemo stellt die Markierungsfilter nur noch an vier Wendepunkten um (Haus verlassen, Feierabend, Gaming, Nacht) statt in fast jedem Kapitel: morgens und abends Licht, Rollos und Medien, tagsüber Geräte und Rollos, beim Gaming Geräte und Licht, nachts nur Licht. Die Energiekapitel lassen die Auswahl unverändert.

## 0.5.49 – Zahnrad statt Seitenpanel, TV-Quelle und PC-Start in der Demo, Vögel auf geprüften Routen (03.10.2026)

- Das linke Panel entfällt: Ein Zahnrad neben dem Logo öffnet die Einstellungen, dort startet *Editor öffnen* den Editor. Das Kartenpanel erscheint nur noch, wenn Karten angelegt sind (oder beim Anordnen).
- Tagesdemo: Morgens und abends wählt der Finger im TV-Dial-Popup die Quelle SHIELD, bevor Nachrichten bzw. Film starten. Die Gaming-Session beginnt mit einem langen Druck auf die PC-Markierung (Haltering). Interaktionen warten, bis der Schleier nach der Energieansicht weg ist. Demotag 206 s.
- Vögel: fliegen nur noch auf Routen, die einmal beim Start gegen die echte Geometrie geprüft werden (Himmelspunkte, Verbindungen, Anflugpunkte je Landeplatz), zwischengespeichert pro Browser. Gemessen: von rund 100 auf 0–3 Durchquerungen von Baumkronen und Fassaden je 2 000 Flugabschnitte; im Flug keine Hindernisprüfungen mehr pro Bild.

## 0.5.48 – Demo: Finger an Filter und Küchenlicht, reale Leistung; Dokumentation (03.10.2026)

- Tagesdemo: Der Finger schaltet die Markierungskategorien je Kapitel sichtbar in der Filterleiste um. Vor dem Kochen stellt er im Popup der Küchenspots kaltweißes Licht bei voller Helligkeit ein (Reiter „Weiß“, Temperaturregler); die Kamera fährt erst danach an die Küchenzeile. Interaktionen laufen nacheinander. Demotag 183 s.
- Energiefluss in der Demo: Leistungswerte folgen dem Geschehen (Waschmaschine mit Heizphasen bis ~2 kW, Trockner ~800 W, Kaffeemaschine beim Brühen ~1,4 kW, Fernseher ~100 W, PC beim Spielen ~280 W, Kühlschrank im Kompressortakt) und Standby (0,3–1,5 W) sonst.
- Dokumentation: neue Einstiegsanleitung [Erste Schritte](docs/GETTING_STARTED.md) (Installation, Demo, eigenes Blender-Modell, Zuordnen, Anpassen) und [Energie, Demo, Tiere und Filter](docs/ENERGY_DEMO_WILDLIFE.md); README, Add-on-Dokumentation, Projektstand und Agentenübergabe auf 0.5.48.

## 0.5.47 – Markierungsfilter (03.10.2026)

- Neue schmale Leiste rechts unter der Werkzeugleiste: Licht, Rollos, Lüftung, Türen & Fenster, Geräte und Medien lassen sich einzeln aus- und einblenden; die Auswahl bleibt gespeichert. Warnungen (Wasser, Batterie) bleiben immer sichtbar.
- Tagesdemo: Jedes Kapitel zeigt nur die Markierungen, um die es geht (z. B. Bad: Licht und Lüftung, Kochen: Licht und Lüftung, Videoabend: Medien und Licht); Wetter-, Hof- und Energiekapitel zeigen keine. Die Leiste zeigt dabei die Auswahl der Demo, die eigene Einstellung gilt danach wieder.

## 0.5.46 – Demo: Hue-Sync-Stimmung beim Videoabend wieder da (03.10.2026)

- Der Videoabend zeigt wieder das atmosphärische Hue-Sync-Licht rund um den Fernseher. Ursache war die mit 0.5.43 eingeführte Vorbereitung der Skizzenansicht vor dem Demostart: Das Umschalten bei dunklen Lampen ließ sie danach weniger Flächen beleuchten. Die Vorbereitung entfällt; der Wechsel zur Energieansicht liegt weiter hinter dem Schleier.
- Der Schleier beim Wechsel zur Energieansicht hebt sich spätestens nach 3 s auch dann, wenn keine Bilder gerendert werden (z. B. pausierte Demo).
- Modell v111 (Schreibtisch: Monitor aus dem Standfuß, Kopfhörer auf der Erhöhung, Studiomikrofon) ist im Add-on-Stand; die Skripte liegen unter `tools/desk-v111.*`.

## 0.5.45 – Demo: Küche zum Schluss aus etwas Abstand (02.10.2026)

- Kochen: Nach dem Blick zu den Spots geht die Kamera langsam Richtung Esstisch zurück – Spots, ihr rötliches Licht und die ganze Küchenzeile in einem Bild.

## 0.5.44 – Demo: Kamera nie in Nachbarhäusern, ganzer PC beim Gaming, Lichtfarbe beim Kochen (02.10.2026)

- Die Rundflug-Kamera der Demo steigt über Nachbarhäuser, statt hineinzufahren oder hinter einer Fassade zu landen (Umrisse und Dachhöhen, 2 m Abstand); greift bei jeder Startansicht, z. B. beim Schneeschauer am Ende.
- Gaming: Die Kamera sitzt vor dem Schreibtisch auf Tischhöhe und zeigt das ganze beleuchtete PC-Gehäuse statt nur einem Ausschnitt von oben.
- Kochen: Das Küchenlicht wechselt sichtbar von kaltweiß über warmweiß zu einem rötlichen Ton; zum Schluss schaut die Kamera zu den Spots hoch.

## 0.5.43 – Performance-Pass, freundliches Kochlicht (02.10.2026)

- Demo: Beim Kochen geht freundliches warmweißes Licht in der Küche an (3000 K, sanft eingeblendet).
- Energieansicht: Das durchsichtige Skizzenmodell schreibt die Tiefe im selben Durchgang statt mit eigenem Tiefen-Vorlauf – gleiche Optik, aber Babylon prüft nicht mehr jedes Teilnetz zweimal pro Bild (Woche: 9 → 60 FPS im Demo-Benchmark).
- Schattenkarten der Lampen werden nach Tür-, Fenster- und Rollobewegungen verteilt neu berechnet (höchstens 4 pro Bild, Tablet 2); dunkle Lampen warten, bis sie leuchten. Größtes Einzelbild im Demo: 45 000 → 9 000 Draw-Calls (Tablet).
- Spiegel nehmen ihre Umgebung über sechs Bilder auf (eine Würfelseite pro Bild); auf Tablets ohne Kleinteile.
- Verdeckungsbäume der Marker hängen am Geometrie-Inhalt: Umschalten der Texturen baut sie nicht neu (vorher ~0,5 s).
- Demo: Skizzen-Shader der Energiekapitel werden vorab vorbereitet; der Wechsel Textur ↔ Skizze passiert hinter einem kurzen Schleier, „Jetzt“ → „Woche“ ohne erneuten Wechsel.
- Demo-Benchmark (Desktop): Score 2187 → 3514, 1 %-Lows 5,8 → 15,8 FPS, CPU je Bild 13,7 → 9,1 ms.

## 0.5.42 – Vögel mit Gestalt, nichts mehr durch Gebäude und Bänke (02.10.2026)

- Vögel: richtiger kleiner Singvogel mit Kopf, Schnabel, Augen, Schwanzfächer und zweiteiligen Flügeln, die beim Schlagen abknicken; brauner Rücken, heller Bauch.
- Vögel fliegen über oder um Gebäude herum statt hindurch (Umrisse und Dachhöhen aller Häuser); Sitzplätze in Baumkronen, die in ein Haus ragen, entfallen.
- Katze: läuft um alle Hindernisse im Hof (Lüftungsbänke als ein Block, Balken, Spielplatzbank, Mülleimer, Pfosten, Netz, Sträucher, junge Bäume); ein Wegfehler, der sie quer durch eine Bank führen konnte, ist behoben. Hals ohne harte Farbkante, heller Latz und Bauch gehen weich ins Fell über.
- Katze auf den großen Lüftungsbänken vor der Wohnung: springt irgendwo auf die Fläche, läuft darauf entlang, sitzt und liegt, springt auch zur anderen Bank hinüber.

## 0.5.41 – Katze mit Augen, mehr Vögel, Demo mit Hofbesuch und Energiefluss (02.10.2026)

- Katze: Augen mit Pupillen, Nase, Innenohren, Pfoten, Tigerstreifen; springt öfter auf Lüftungsbänke, Bänke und Spielplatzpfosten und liegt dort zum Chillen. Wege führen jetzt über Umwegpunkte um Bänke und Stämme (kein Hängenbleiben mehr); Ein- und Ausgänge liegen auf der Hofachse, weg vom Gebäude.
- Vögel: zwölf statt sieben (Tablet sechs), größer, öfter über der Wohnung, manche picken auf dem Rasen vor den Fenstern.
- Tagesdemo: neues Kapitel „Besuch im Hof“ (die Katze legt sich auf die Bank, Vögel im Gras) und „Energiefluss“ – erst „Jetzt“, dann die Woche, mit typischen Verbrauchswerten einer Wohnung und Lampengruppen, die dem Licht der Demo folgen. Der Demotag dauert dafür 175 s.

## 0.5.40 – Demo: Kochen an der Küchenzeile (02.10.2026)

- Tagesdemo: Beim Kochen steht die Kamera am Esstisch und schwenkt langsam an der beleuchteten Küchenzeile entlang (Spüle, Kochfeld, Messer); die Szene läuft dafür etwas langsamer (Tag 153 s statt 145 s).

## 0.5.39 – Tiere draußen, Energieansicht ohne leeren Skizzenmodus (02.10.2026)

- Neu (optional, Einstellungen → Qualität → „Tiere draußen“): Eine Katze besucht ab und zu den Hof – läuft, rennt, springt auf Bänke, versteckt sich hinter Bäumen und sucht bei Regen oder Schnee Schutz unter einem großen Baum. Vögel fliegen über Hof und Wohnung und landen in den Baumkronen; nachts und bei schlechtem Wetter bleiben sie sitzen. Alles im Code erzeugt (keine Assets), drei Draw-Calls, Bewegung im Shader; der Render-Loop ruht, solange nichts Sichtbares sich bewegt. `?wildlife` lässt die Katze sofort erscheinen.
- Energieansicht: Ohne Texturen ist immer die Energieansicht offen; Blitz und Schließen kehren zu den Texturen zurück. Kurze Verbindungsabbrüche zu Home Assistant schließen die Ansicht nicht mehr.

## 0.5.38 – Energiefluss: 3D-Ansicht folgt dem Zeitraum (02.10.2026)

- Bei Heute, Woche, Monat usw. zeigen auch Kugeln, Stromlinien und Beschriftungen im 3D-Modell den Verbrauch des Zeitraums (kWh und Anteil) statt der aktuellen Leistung; die Zuleitung zeigt die Summe des Zeitraums. „Jetzt“ zeigt weiterhin die Live-Leistung.

## 0.5.37 – Energiefluss: rollierende Zeiträume, Leistung sofort (02.10.2026)

- Quartal, Halbjahr und Jahr zählen jetzt die letzten 3, 6 bzw. 12 Monate bis heute statt des Kalenderzeitraums; der angebrochene erste Monat wird tageweise gezählt.
- Die aktuelle Leistung der Steckdosen erscheint nach dem Neuladen sofort: Der Leistungssensor des Geräts wird auch erkannt, bevor sein Zustand angekommen ist.

## 0.5.36 – Energiefluss: Ebenen und einzelne Lampen (02.10.2026)

- Ebenen im Energiepanel: Geräte, Rollos und Licht lassen sich ein- und ausblenden (Rollos standardmäßig aus); die Auswahl bleibt auf dem Gerät gespeichert.
- „Lampen einzeln“: Statt der Licht-Gruppen pro Raum erscheint jede Lampe mit eigenem (z. B. PowerCalc-)Sensor an ihrer Position im Modell – ohne Doppelzählung; Beschriftungen nur, solange eine Lampe an ist.
- Nach dem Neuladen zeigt die Energieansicht nicht mehr 0 W: Leistungssensoren werden erkannt, sobald Home Assistant die Zustände geliefert hat.
- Stromlinien und Verbrauchspunkte werden nach dem durchsichtigen Modell gezeichnet und bleiben voll sichtbar.

## 0.5.35 – Energiefluss: Bereiche ohne Objekte (02.10.2026)

- Verbraucher in Home-Assistant-Bereichen ohne zugeordnete Objekte landen nicht mehr neben dem Gebäude: Der Bereich wird über gleichnamige Objekte, Raumbezeichnungen oder Rollos gefunden (z. B. „Kaffeezone“ an der Kaffeemaschine, „Balkon“ am Balkon).

## 0.5.34 – Energiefluss: Quartal, Halbjahr, Jahr (02.10.2026)

- Der Verbrauch lässt sich zusätzlich nach Quartal, Halbjahr und Jahr anzeigen (Liste, Anteile und Raumbalken folgen dem Zeitraum); längere Zeiträume nutzen Monatsstatistiken.

## 0.5.33 – Energiefluss: Zeiträume, durchsichtiges Modell (02.10.2026)

- Panel mit „Jetzt | Heute | Woche | Monat“: Bei einem Zeitraum sortiert die Liste nach dessen kWh, Anteile und Raumbalken folgen dem Zeitraumverbrauch; die aktuelle Leistung steht als Hinweis daneben.
- Schreibtisch-Steckdosen erscheinen am PC ihres Bereichs.
- In der Energieansicht ist das Skizzenmodell halbtransparent, Kugeln und Stromlinien sind durch Wände sichtbar.
- Oben rechts immer dieselben vier Knöpfe: Texturen, Energiefluss, Navigationsmodus, Zentrieren. Der Blitz wechselt aus der Texturansicht direkt in die Energieansicht.

## 0.5.32 – Energiefluss: Gerätetypen, Hauptschalter, Zeitraum (02.10.2026)

- Verbraucher werden nach Gerätetyp platziert (Fernseher, PC, Waschmaschine, Trockner, Kaffeemaschine, Kühlschrank, NAS) – auch bei abweichender Schreibweise und nur innerhalb ihres Bereichs; mehrere Steckdosen an einem Gerät liegen nebeneinander.
- Die Zuleitung beginnt am Verbraucher „Main Switch“ / Hauptschalter / Zähler, sonst an der Haustür.
- Im Panel lässt sich der Verbrauch zwischen Heute, Diese Woche und Dieser Monat umschalten.

## 0.5.31 – Energiefluss im Skizzenmodus (02.10.2026)

- Neue Energieansicht im Skizzenmodus (Texturen aus, Blitz-Knopf oben rechts): Alle Verbraucher aus dem Energie-Dashboard von Home Assistant erscheinen im 3D-Plan als leuchtende Kugeln in Raumfarben, mit animierten Stromlinien von der Zuleitung (Haustür). Größe, Linienstärke und Tempo folgen der aktuellen Leistung; Beschriftungen zeigen Watt und Anteil.
- Seitenpanel „Energiefluss“: Leistung jetzt, Verbrauch heute (kWh), Anteile je Raum und eine Liste aller Verbraucher mit Watt, Anteil und Tagesverbrauch.
- Leistungssensoren, Namen und Räume werden aus Home Assistant gelesen; Rollo-Motoren erscheinen an ihrem Rollo, Steckdosen an passenden Objekten oder Modellteilen, sonst in ihrem Bereich. Positionen lassen sich über `energyPlacement` in der privaten Konfiguration korrigieren.
- Tests für Tagesdemo und Energiefluss laufen jetzt auch in der CI.

## 0.5.30 – Tagesdemo: Intro und Spiegel bei Nacht (02.10.2026)

- Vor dem Start zeigt die Tagesdemo 16 Sekunden lang eine Intro-Karte: HomeTwin3D als App (Add-on) in Home Assistant, 3D-Frontend für aktuelle Apple- und Samsung-Tablets sowie Windows-PCs, Steuerung und Status im 3D-Plan, Basis als Open Source auf GitHub. Mit Countdown, „Jetzt starten“ und Beenden. Ein Autorenname kann über die privaten Installationswerte (`installation.author`) ergänzt werden.
- Spiegel werden in der Abenddämmerung und nachts dunkler: Ihre Reflexion folgt dem Tageslicht seit der letzten Aufnahme; in der Tagesdemo nehmen sie den Raum bei jedem Kameraschnitt (hinter der Abblende) und nach Sprüngen neu auf.

## 0.5.29 – Tagesdemo: stimmige Rollo-Abfolge (02.10.2026)

- Board-Szene: „Alle Rollos im Raum schließen“ im Rollo-Popup schließt jetzt wirklich (die Demo-Rollos melden ihre unterstützten Befehle); Rollos derselben Story-Räume, die in Home Assistant einem anderen Bereich zugeordnet sind, folgen kurz danach.
- Morgens fährt das Wohnzimmer-Rollo nach der Eingangsszene nicht mehr herunter, wenn der Sonnenaufgang es bereits geöffnet hat.
- Kinoabend: Die Kamera bleibt drinnen, die Rollos bleiben vom Sonnenuntergang bis zum Morgen unten.
- Texte: Das Intro nennt aktuelle Apple- und Android-Tablets, das Bad-Kapitel das morgendliche Stoßlüften.

## 0.5.28 – Fenster, die nur gekippt werden können (02.10.2026)

- Türen und Fenster können als „nur kippbar“ markiert werden (`door.tiltOnly`, z. B. wenn Möbel davor stehen): Ein offener Kontakt zeigt sie sofort gekippt, der Status lautet „Gekippt“, ein Klick kippt statt zu öffnen.
- Tagesdemo: Beim Lüften kippt ein solches Fenster nur, die übrigen Fenstertüren öffnen weiter ganz.

## 0.5.27 – Türen per Klick öffnen, Flurschrank an der Haustür (02.10.2026)

- Türen mit Türkontakt (Haustür, Balkon- und Fenstertüren) lassen sich per Klick auf das Türblatt öffnen und wieder schließen, in der normalen Ansicht und im Laufmodus. Das ist nur Darstellung: Es wird nichts geschaltet, und sobald der Türkontakt in Home Assistant seinen Zustand ändert, gilt wieder der echte Zustand.
- Modellwerkzeuge v107–v110: Der Flurschrank neben der Haustür steht jetzt an der Ecke und ist 28 cm schmaler, die Haustür schwenkt nicht mehr in den Schrank und öffnet bis 75°.

## 0.5.26 – Tagesdemo: Das Board als Fernbedienung (01.10.2026)

- Neue Szene zur Dämmerung: Ein sichtbarer Finger tippt im 3D-Plan aufs Rollo, im Rollo-Popup auf „Alle Rollos im Raum schließen“ – die Rollos fahren gemeinsam herunter. Danach tippt er eine Lampe an, wählt im Licht-Popup Violett und zieht die Helligkeit auf 45 %. Alles läuft über die echten Popups und Service-Aufrufe.
- Neues Kapitel „Das Board als Fernbedienung“ (inkl. Hinweis, dass das Board auch auf einem aktuellen iPad als Wandpanel flüssig läuft); ein Tag dauert dafür rund 2:25 Minuten.
- Demo-Modus: Eine gewählte RGB-Farbe ersetzt das Weißlicht (wie in Home Assistant); Rollo-Befehle aus dem Popup fahren in der Tagesdemo mit Motorgeschwindigkeit.

## 0.5.25 – Tagesdemo: Esstisch, Küchenmesser und Regenblick (01.10.2026)

- Frühstück: Die Kamera sitzt jetzt wirklich am Esstisch (im Modell am Tischnamen erkannt) und schaut über den Tisch zum Fernseher.
- Einstieg: Vor dem Wechsel zur Kaffeemaschine tritt die Kamera näher Richtung Esstisch und schwenkt weiter an der Küchenzeile entlang bis zu Messerleiste und Messerblock.
- Nach der Waschmaschine fährt die Ansicht Richtung Wohnzimmer, das Symbol der Waschmaschine bleibt im Bild.
- Gewitter: Der Blick aus dem Schlafzimmerfenster beginnt weiter hinten im Raum (Möbel begrenzen den Abstand nicht mehr, nur Wände).

## 0.5.24 – LED-Ziffern und kompaktes Demo-Panel (01.10.2026)

- Info-Displays können Werte als rote Sieben-Segment-LED-Ziffern in einem dunklen Fenster zeigen (`segment: true`, z. B. für Trockner-Displays).
- Tagesdemo: Hat ein Gerät keinen Restzeit-Sensor, zählt die Demo die Laufzeit auf seinem Panel-Display herunter.
- Das Demo-Panel ist nur noch etwa halb so hoch: Uhrzeit, Wetter, Kapiteltitel und Bedienknöpfe in einer Zeile, darunter höchstens zwei Zeilen Text und die letzten zwei Ereignisse, schmalere Zeitleiste.

## 0.5.23 – Türen, Lüften und Gaming-Blick (01.10.2026)

- Türen und Schlösser: Statusänderungen von Türkontakten und Schlössern bewegen das Türblatt und wechseln das Türsymbol jetzt sofort (vorher erst beim nächsten anderen Update).
- Tagesdemo: Beim Verlassen wird die Haustür entriegelt, öffnet und schließt sichtbar (das Türblatt schwenkt weich) und wird wieder verriegelt – das Symbol wechselt mit. Auch beim Heimkommen bleibt die Tür kurz offen.
- Lüften: morgens und nach dem Kochen öffnen die Fenstertüren (abends auch die Balkontür), solange die Rollos oben sind; neues Kapitel „Lüften nach dem Kochen“.
- Einstieg: Der Blick schwenkt weiter an der Küchenzeile entlang, bevor er zur Kaffeemaschine wechselt; Kopfdrehungen laufen jetzt über den kürzesten Winkel ohne Kippen zum Boden.
- Gaming: tiefer und steiler Blick auf den PC unter dem Schreibtisch, die Einstellung hält kurz an; die RGB-Beleuchtung wechselt schneller die Farben.

## 0.5.22 – Tagesdemo: feste Kamera und eigenes Nachrichtenbild (01.10.2026)

- Während der Tagesdemo gehört die Kamera dem Drehbuch: Drehen, Zoomen und Verschieben (auch Mausblick und Tasten in der Ich-Perspektive) sind gesperrt; Startansicht und Navigationsmodus-Knopf reagieren erst nach der Demo wieder.
- Das Seitenpanel links klappt beim Start der Demo automatisch zu und kehrt danach in den vorherigen Zustand zurück.
- Liegt im gemeinsamen Speicher ein Bild unter `objects/demo-news.jpg`, zeigt der Fernseher es beim Frühstück als Nachrichtenbild; sonst bleibt die gezeichnete Nachrichtensendung.

## 0.5.21 – Tagesdemo: Nachrichten, Waschtag und Gaming-Blick (01.10.2026)

- Frühstück: Blick vom Esstisch zum Fernseher; die Nachrichten erscheinen als eigenes Bild im Abendnachrichten-Stil (Studio, Sprecher, Wetterkarte, Bauchbinde) und – wie alle Demo-Bildschirminhalte – vollflächig ohne Player-Einblendung.
- Waschtag: kurze Einstellungen in der Kammer – die laufende Waschmaschine mit Restzeit, später der Schwenk hoch zum Trockner.
- Gaming: vom Monitor zurück und von oben auf den Schreibtisch; die RGB-Beleuchtung des PCs läuft während der Demo als schneller Regenbogen.
- Weniger Ruckler: Der Einstieg in die Ich-Perspektive überspringt bei Kameraeinstellungen die Suche nach einem Startpunkt (vorher 150–350 ms).

## 0.5.20 – Schnellere Tagesdemo mit Raumfokus (01.10.2026)

- Ein Tag dauert jetzt rund zwei Minuten (statt fünf); die Tempo-Auswahl entfällt. Die Außenansicht fährt pro Kapitel zum Raum, in dem etwas passiert (Bad, Küche, Schlafzimmer, Kammer …), zoomt nah heran und dreht sich langsam weiter; Wetterkapitel zeigen das ganze Gelände.
- Neuer Einstieg in Ich-Perspektive: vom Wohnungseingang durchs Wohnzimmer zu den Fenstern – die Dämmerung wird heller, Bäume und Büsche biegen sich im Morgenwind –, dann Schwenk zur Küche und zur vorheizenden Kaffeemaschine. Die Kamera plant ihren Weg mit freier Sicht und hält eine natürliche Kopfneigung.
- Saugroboter und Solar-Hinweise entfernt; das Kapitel heißt jetzt „Waschtag“ (Waschmaschine, danach Trockner).
- Zum Schluss nur noch eine kompakte Zeile: Ø Bilder pro Sekunde (min/max), Lichtschaltungen, Rollofahrten und Updates.
- Kamerastandpunkte und Fensterblicke werden in der Vorbereitung berechnet; der Kameramittelpunkt springt nach der Ich-Perspektive nicht mehr.

## 0.5.19 – App-Hintergrund auf dem Wohnzimmer-TV (01.10.2026)

- Gibt die SHIELD kein Vorschaubild und kein Cover her (z. B. Netflix-Wiedergabe), zeigt das Fernsehermodell einen Hintergrund mit dem Schriftzug der laufenden App (Netflix, YouTube, Plex, Prime Video, Disney+, Spotify) statt der neutralen Grafik.
- Ohne Medientitel steht der App-Name als Titel; Titel, Serie/Interpret und Fortschritt werden angezeigt, sobald Home Assistant sie liefert.

## 0.5.18 – Tagesdemo mit Kameramomenten (01.10.2026)

- Ich-Perspektive in der Tagesdemo (bei aktiver Kamerafahrt): nachts ans Wohnzimmerfenster mit Blick in den nebligen Park, im Gewitter vom Schlafzimmer in den Starkregen, beim Kinoabend vom Sofa auf den Fernseher und danach hinaus, beim Gaming der leuchtende PC und der Blick aus dem Fenster. Fenster, PC und TV werden im Modell erkannt; Wände, Möbel und Vorhänge werden berücksichtigt. Das Rollo am jeweiligen Fenster fährt hoch, solange man davorsteht. Kurze Abblende bei Schnitten, Plan-Marker sind währenddessen ausgeblendet; Maus oder Tastatur übernehmen die Kamera.
- Ruhigere Abendlichter: Ambilight und Gaming-RGB arbeiten vor allem mit langsamem Dimmen und leichten Blautönen statt schneller, kräftiger Farbwechsel.
- Homeoffice-Szene entfernt; der PC erscheint abends beim Gaming. Bewegungsmelder schaltet nachts zwei Lichter sanft ein.
- Das Popup der Kaffeemaschine öffnet sich automatisch, während sie Kaffee zubereitet.
- Zum Schluss eine Tagesbilanz (Automationen, Lampenstunden, Regen, Temperatur, stärkste Böe); die Benchmark-Werte sind aufklappbar.

## 0.5.17 – Wind ohne Dauer-Rendering (01.10.2026)

- Baumkronen wiegen sich erst bei spürbarem Wind (ab 15 km/h, auf Tablets ab 25 km/h, Böen anteilig). Zuvor hielt schon leichter Wind das Board dauerhaft auf 30 Bildern pro Sekunde statt der Ruhe-Bildrate (~2 pro Sekunde) – mehr Akku- und Wärmelast auf dem Wand-iPad. In der Tagesdemo bewegen sich die Bäume weiterhin bei jedem Wind.

## 0.5.16 – Flüssige Tagesdemo und weniger Schattenarbeit (01.10.2026)

- Tagesdemo ohne Kompilier-Ruckler: Lampen bleiben während der Demo technisch aktiv (aus = Helligkeit 0), sodass Schalten und Dimmen keine neuen Shader-Varianten mehr erzeugen. Eine einmalige Vorbereitung (~7 s, mit Fortschrittsanzeige) kompiliert Shader, rendert Lampenschatten und initialisiert die Bildschirminhalte vor dem Start.
- Spiegelreflexionen werden während der Demo nicht bei jeder Tageslichtänderung neu berechnet, Lampenschatten nicht bei jeder Rollofahrt; beides wird beim Beenden einmal nachgeholt. Sonnenschatten aktualisieren sich höchstens etwa dreimal pro Sekunde.
- Auch im Normalbetrieb: Lampen sind nach Typ sortiert, sodass Flächen mit gleich vielen Spot- und Punktlampen dieselben Shader teilen (deutlich weniger Kompilierungen beim Schalten). Rüttelnde Waschmaschinen/Trockner lösen kein Neuzeichnen der Sonnenschatten in jedem Frame mehr aus.
- Rollo-Fahrten berechnen Lampenschatten erst an der Endposition neu.
- Messung (echtes Modell, ganzer Tag bei 2×): Ø 57,5 statt 43 FPS, p99 29 statt 165 ms, Shader-Kompilierungen während der Wiedergabe 69 statt 3184.

## 0.5.15 – Tagesdemo, sichtbares Wetter und weniger Hintergrundarbeit (01.10.2026)

- **Tagesdemo & Benchmark** (Einstellungen → „Tagesdemo & Benchmark“ oder `?daydemo`): ein Spätsommertag von 05:30 bis 05:30 in rund fünf Minuten. 23 Kapitel mit Lichtwecker, Kaffeemaschine, Nachrichten im TV, Abwesenheitsmodus mit Saugroboter und Solar-Waschgang, Hitzeschutz, Homeoffice-PC, Unwetterwarnung, Gewitter mit Lichtautomatik, Kochen, Kinoabend mit Ambilight, Gaming mit RGB, Gute-Nacht-Routine, Nachtlicht und Schneeschauer. Die Rollen werden automatisch den vorhandenen Geräten zugeordnet (Raumnamen, Labels, Raumzonen); fehlende Geräte werden übersprungen.
- Die Demo läuft vollständig über den Demo-Adapter: Es wird kein Home-Assistant-Gerät geschaltet, gespeicherte Demo-Zustände bleiben unverändert. TV und PC-Monitor zeigen im Browser gezeichnete Bildinhalte (keine externen Bilder).
- Overlay mit Uhr, Wetter, Kapiteltext, Automations-Protokoll, Zeitleiste zum Springen, Tempo ½×–4× und optionaler Kamerafahrt. Am Ende eine Benchmark-Auswertung (Ø FPS, 1 % Low, p95, CPU, Draw Calls, je Kapitel). URL-Parameter: `speed`, `from=HH:MM`.
- **Wetter auch im Normalbetrieb deutlich sichtbar:** dichterer, heller Schrägregen um das Gebäude mit Aufprall-Ringen am Boden, größere Schneeflocken, ziehende Wolkenschatten im Park, Wolken am Horizont, Sonnenscheibe, Blitze mit Blitzstrahl und Aufhellung bei Gewitter, Gewitter und Starkregen dunkeln die Szene stärker ab.
- **Wind:** Open-Meteo liefert jetzt auch Windgeschwindigkeit, Böen und Richtung. Baumkronen im Park wiegen sich (Shader, WebGL), Regen und Schnee wehen mit. Bei Wind rendert die Szene mit der Leerlauf-Bildrate statt der Ruhe-Bildrate.
- TV- und PC-Bildschirme pausieren ihre sekündlichen Aktualisierungen in ausgeblendeten Tabs und zeigen beim Zurückkehren sofort den aktuellen Stand.
- Die Markerliste wird nur bei Änderungen neu aufgebaut; pro Frame entstehen keine neuen Arrays mehr für sichtbare Marker.

## 0.5.14 – Weniger identische Render- und Popup-Updates (01.10.2026)

- Marker übertragen ihre Positions-, UV- und Farbpuffer nur bei geänderten Daten zur GPU. Projektion, Verdeckung und Klickprüfung laufen weiterhin pro Frame; Darstellung und Kamerabewegung bleiben erhalten.
- Geöffnete Display- und Rohr-Popups übernehmen gezielt ihre benötigten HA-Entities. Nachträglich eintreffende Sensoren und Anfangszustände nach einer Wiederverbindung werden weiterhin angezeigt.
- PC-RGB-Materialien überspringen identische Animationsschritte. Farben, Ablauf und Reaktionen auf Ein-/Ausschalten bleiben erhalten.

## 0.5.13 – Weniger Hintergrundarbeit (01.10.2026)

- Tür-, Kaffee-, Lüfter-, Echo- und PC-Anzeigen reagieren gezielt auf ihre konfigurierten Entities einschließlich verschachtelter Sensoren und automatischer Kaffee-Warnsensoren. Gebündelte Zustandsereignisse bleiben vollständig erhalten.
- Türgeometrie und Marker benötigen keine sekündliche Dauerprüfung mehr: Zustandsereignisse und ein Timer zum nächsten Kippzeitpunkt reichen. Ein geöffnetes Türpopup aktualisiert seine Dauer weiterhin jede Sekunde.
- Die HUD-Uhr aktualisiert sich zum Minutenwechsel statt jede Sekunde. Bildqualität und Render-Einstellungen bleiben erhalten.

## 0.5.12 – Kaffeemaschine: Tropfschale, Wasser, Bohnen (01.10.2026)

- Meldet die Kaffeemaschine „Tropfschale voll“, „Wassertank leer“ oder „Bohnenbehälter leer“ (Home-Connect-Sensoren), wird das Symbol im Plan orange mit Ausrufezeichen und zeigt die Meldung darunter; das Popup listet sie oben auf. Die Sensoren werden automatisch neben dem Betriebszustand gefunden, ein neuer Modellexport ist nicht nötig. Ist die Maschine offline, erscheinen keine veralteten Meldungen.

## 0.5.11 – Kiosk-Abstand (01.10.2026)

- Im Kiosk-Modus sitzen Logo, Wetter, Werkzeugleiste und Seitenpanel etwas tiefer, damit die Unschärfe der iPad-Statusleiste nicht mehr über die Bedienelemente reicht.

## 0.5.10 – Kiosk-Modus für Wand-Tablets (01.10.2026)

- Neue Einstellung unter Darstellung: „Kiosk-Modus (Wand-Tablet)“ mit Automatisch / Ein / Aus. Automatisch erkennt, ob die App als Home-Bildschirm-App (iPad/iPhone) oder als installierte bzw. Vollbild-App läuft.
- Im Kiosk-Modus rücken Logo, Wetter, Werkzeugleiste, Seitenpanel und Dialoge unter die Apple-Statusleiste und weg vom Home-Balken (sichere Bildschirmränder). Die eigene Uhr entfällt, weil die Statusleiste die Zeit zeigt; Sonne/Wetter und die Werkzeugleiste teilen sich eine Zeile, so bleibt mehr Platz für das Modell.

## 0.5.9 – Stabilere Synchronisierung und weniger CPU-Arbeit (01.10.2026)

- Übertragungen desselben Browsers laufen nacheinander; auf unterstützten sicheren Origins gilt das auch für mehrere Tabs. Änderungen während eines Uploads bleiben für die nächste Übertragung vorgemerkt.
- Gemeinsame Modelle und Objekte werden erst nach vollständigem Download und erneuter Versionsprüfung zusammen gespeichert. Abgebrochene Downloads und Speicherfehler erhalten den vorherigen lokalen Stand.
- Große Übertragungen besitzen eine Zeitbegrenzung; beim Start und beim Laden von Seiten erscheint eine Ladeanzeige.
- Geräte werden bei HA-Updates über einen Entity-Index gefunden. Nicht zugeordnete Lampen, Rollos und Mediengeräte lösen keinen zusätzlichen Renderauftrag mehr aus.
- Die Performance-Anzeige zeigt zusätzlich die CPU-Framezeit des 95. Perzentils; geplante Renderpausen werden als Frameabstand bezeichnet.
- Add-on-Image-Build, WebGL-/Apple-Einstellungen und bestehende Datenformate bleiben kompatibel.

## 0.5.8 – Schnellere Bildschirmvorschau (30.09.2026)

- Modellmonitor und Wohnzimmer-TV laden das PC-Kamerabild alle 10 statt 30 Sekunden.
- Der Screenshot-Helfer (`tools/pc-screen`) sendet standardmäßig alle 10 Sekunden; das Intervall ist im Setup und als `interval` in `config.json` einstellbar (2–300 Sekunden).

## 0.5.7 – PC-Desktop auf dem Wohnzimmer-TV (30.09.2026)

- Steht der Receiver auf dem Eingang PC, zeigt das Fernsehermodell den Desktop der PC-Bildschirmkamera als Hintergrund (mit Beschriftung und HDMI-Badge darüber) statt der bisherigen Grafik. Ohne verfügbares Kamerabild bleibt die Grafik.
- Der Windows-Screenshot-Helfer (`tools/pc-screen`) nimmt den Fernseher auf, solange Windows ihn anzeigt (Gerätekennung `tv_monitor` im Setup), und sonst wie bisher den festen Screen. Die Aufnahmequelle steht im Protokoll.

## 0.5.6 – Kamera-Empfindlichkeit (30.09.2026)

- Neue Regler unter Einstellungen → 3D-Ansicht → Kamerasteuerung → Empfindlichkeit: Drehen (seitlich ziehen), Kippen (hoch/runter ziehen), Zoomen (Mausrad und Pinch) und Verschieben, jeweils 25–300 %. Die Werte gelten pro Gerät; „Empfindlichkeit zurücksetzen“ stellt 100 % wieder her.
- Einheitliche Bezeichnung „Verschieben“ statt „Schwenken“.

## 0.5.5 – Mindesthelligkeit für den Außenbereich (30.09.2026)

- Neuer Regler unter Einstellungen → 3D-Ansicht → Qualität: „Mindesthelligkeit Außenbereich“ (Aus bis 100 %). Er hellt Park, Gelände, Nachbargebäude und Himmel in Dämmerung und Nacht auf; tagsüber bleibt alles wie gehabt. Die Wohnung selbst wird nicht aufgehellt, damit Lampen nachts weiter sichtbar wirken. Der Wert gilt pro Gerät (z. B. heller auf dem iPad).

## 0.5.4 – Neue Geräte schneller eingerichtet (30.09.2026)

- Ein neues Gerät (z. B. ein Tablet), das die gemeinsame Version des Zuhauses geladen hat, startet direkt beim Schritt „Home Assistant verbinden“ mit einem kurzen Hinweis statt bei der Begrüßung.
- Hat der Browser bereits eine gespeicherte Home-Assistant-Verbindung, entfällt der Einrichtungsassistent ganz.

## 0.5.3 – Hellere Dämmerung (30.09.2026)

- Nach Sonnenuntergang fällt das Umgebungslicht nicht mehr schlagartig auf Nachtniveau, sondern geht über die Dämmerung (bis 10° unter dem Horizont) mit bläulichem Ton allmählich zurück. Auch der Himmel bleibt länger hell.
- Bei tiefer Sonne ist die Szene etwas heller, und Bewölkung dunkelt das Umgebungslicht nur noch halb so stark ab wie das direkte Sonnenlicht.

## 0.5.2 – Lesbare Uhr im hellen Theme (30.09.2026)

- Uhr, Sonne und Wetter oben rechts (sowie der Demo-/Simulationshinweis oben links) liegen auf einer halbtransparenten Fläche in Panelfarbe und sind so in beiden Themes über jedem Teil des Modells lesbar – ohne Unschärfe-Effekt, der auf Tablets Leistung kosten würde.

## 0.5.1 – Feinschliff (30.09.2026)

- **Zuordnungs-Assistent** folgt jetzt Theme und Akzentfarbe (auch im hellen Modus lesbar), zeigt das Symbol des jeweiligen Geräts, einen Fortschrittszähler und kurze Hinweise statt langer Absätze (Details zu Türen unter „Mehr zum Verhalten“). Alle Texte sind übersetzbar; im Demo-Modus erscheint eine verständliche Meldung statt eines technischen Fehlers.
- **Geräte-Popups** (Licht, Fernbedienung, Anzeigen, Sensorkarten) haben einen einheitlichen Kopf mit Gerätesymbol, Statuszeile (z. B. „An · 80 %“) und großem Schließen-Knopf; die Entity-ID steht nur noch im Tooltip.
- **Karten:** Löschen fragt einmal nach („Löschen?“), „Abbrechen“ im Karteneditor verwirft die Vorschau, Bearbeiten-/Löschen-Knöpfe sind größer.
- **Leistung:** Zustandsänderungen von Lampen, Lüftern, Rollos, Batterie- und Wassersensoren aktualisieren nur noch die betroffenen Symbole im Plan statt das ganze Dashboard neu aufzubauen.

## 0.5.0 – Aufgeräumte Oberfläche (30.09.2026)

- **Einstellungen neu gegliedert:** vier Bereiche statt acht (Verbindung, Darstellung, 3D-Ansicht, Einrichtung) mit kurzer Beschreibung und Verbindungsstatus. Einheitliche Schalter, Segmente und Knöpfe in Tablet-Größe (mind. 40 px), Hinweise direkt an den Optionen.
- **Entfernt:** wirkungslose Standortfelder, doppelte Texturen-/Zentrieren-Schalter, Debug-Eintrag, Statuschips, Panel-Punkte, Rahmen-, Ecken- und Hintergrund-Optionen sowie die separate Statusfarbe (jetzt ein einheitlicher Look).
- **Schatten:** eine Stufe (Aus/Niedrig/Mittel/Hoch) statt zweier Pixelwerte. Kamerasteuerung als beschriftete Tabelle (Maus/Touch).
- **Seitenpanel:** „Lampen visuell zuordnen“ ist aus dem Panel in Einstellungen → Einrichtung gewandert. Editor und Einstellungen stehen fest unten; ohne Karten gibt es einen Hinweis mit „Karte hinzufügen“. Der eingeklappte Zustand bleibt nach dem Neuladen erhalten.
- **Rundgang:** fünf kurze Schritte statt zwölf, erneut startbar in den Einstellungen. „Überspringen“ öffnet nicht mehr ungefragt den Editor; der defekte Editor-Rundgang ist entfernt.
- **Begrüßung** mit dem neuen HomeTwin3D-Logo statt des alten animierten Logos. Fehler beim Backup-Import werden angezeigt.
- **Texte:** echte Umlaute statt „ae/oe/ue“, bisher fest verdrahtete deutsche Texte übersetzt, Ansichtsmodi auf Deutsch (Übersicht/Gehen/Fliegen).
- **Bedienung:** größere Werkzeugleiste oben rechts und größere Schließen-Knöpfe in den Geräte-Popups. Skript-Karten reagieren ohne 300-ms-Verzögerung, wenn kein Doppeltipp belegt ist. Die Tasten „C“ und „G“ lösen nichts mehr versehentlich aus.
- **Leistung:** Das Dashboard rendert nicht mehr bei jeder Lichtänderung komplett neu (Lampenzähler entfernt), das Debug-Panel wird nur noch bei Bedarf geladen, Karten-Layouts werden nur im Bearbeitungsmodus gespeichert, die Panelbreite wird beim Ziehen nicht mehr bei jeder Bewegung gespeichert, und Tablets verzichten auf den Unschärfe-Hintergrund hinter Dialogen.

## 0.4.7 – Kompakte Wetteranzeige (30.09.2026)

- Sonne und Wetter oben rechts deutlich schmaler: keine Beschriftungen mehr, der Zustand steckt im Symbol, Bewölkung und Niederschlag mit kleinen Symbolen (z. B. „29° ☁ 78%“). Der volle Text bleibt als Tooltip erhalten.

## 0.4.6 – Wetter neben der Uhr (30.09.2026)

- Sonne und Wetter stehen oben rechts in einer Reihe neben Uhrzeit und Datum statt darunter. Die Ansichtsumschaltung rückt entsprechend nach oben.

## 0.4.5 – Neues Logo im Dashboard (30.09.2026)

- Oben links im Dashboard steht jetzt nur noch das neue HomeTwin3D-Logo statt „///3DASH · Live“. Demo- und Simulationsmodus bleiben als Hinweis neben dem Logo sichtbar.

## 0.4.4 – Neues App-Icon (30.09.2026)

- Eigenes HomeTwin3D-Icon statt des alten 3Dash-Logos: isometrisches Haus mit leuchtenden Kanten, beleuchtetem Fenster und Bodenraster (der digitale Zwilling). Für Browser-Tab, iPad-Home-Bildschirm, PWA (inkl. maskable) und die Add-on-Seite in Home Assistant.
- Quelle `branding/*.svg` aus `tools/app-icon.py`, alle Größen per `node tools/render-icons.mjs`.

## 0.4.3 – Wartung (30.09.2026)

- Inhaltlich wie 0.4.2. Die neue Version lässt Home Assistant das vorgebaute Image herunterladen, falls eine Installation nach einem lokalen „Neu bauen“ ohne Image dasteht.

## 0.4.2 – Gemeinsame Startansicht und Texturen (30.09.2026)

- Die Startansicht (Zentrieren-Knopf) gilt für die ganze Installation: „Startansicht ändern“ speichert sie zusätzlich in der gemeinsamen Version; eine eigene Startansicht eines Browsers hat Vorrang.
- Texturierte Darstellung ist Standard; bestehende Browser wechseln einmalig dorthin, danach bleibt die Wahl frei.
- Render-QA-Helfer im Browser (`?qa`): Pixelvergleich der zusammengefassten Meshes und Leerlauf-Prüfung.

## 0.4.1 – Vorgebaute Add-on-Images (30.09.2026)

- Das Add-on wird nicht mehr auf dem Home-Assistant-Gerät gebaut: GitHub baut bei jeder Versionserhöhung Images für amd64 und aarch64 (ghcr.io), Home Assistant lädt sie nur noch herunter (Sekunden statt 20–30 Minuten auf einem Raspberry Pi). Die Web-App wird dabei einmal nativ gebaut und ist für alle Architekturen gleich.
- nginx-Konfiguration: Regex der gemeinsamen Version korrekt gequotet (nginx startete sonst nicht).
- „Web-UI öffnen“ in Home Assistant; armv7 entfernt (von HA abgekündigt); Build-Parameter im Dockerfile statt build.yaml.
- `npm run addon:sync` überträgt die gemeinsame Version per Samba in das Add-on.

## 0.4.0 – Tablet-Performance und Add-on-Betrieb (30.09.2026)

- Tablets (auch iPads mit Tastatur/Trackpad) erhalten eine leichtere Render-Stufe: keine Cluster-Beleuchtung, zwei Lampen pro Fläche, begrenzte Pixeldichte und Texturen, einfachere Sonnenschatten und Glow. iPad Safari: von ~5 auf ~45–50 FPS.
- Weniger Draw Calls: Lampenauswahl pro Batch, Zusammenfassen über Metallic/Roughness per Vertex (pixelgleich), Touch-Zonen als ein Mesh (897 → 537 auf dem Tablet).
- Karten-Icons werden per WebGL im selben Frame wie das Modell gezeichnet; Long-Press führt die Hauptaktion aus (Licht, Rollo, TV, PC, Lüfter, Echo, Kaffee); auf Tablets größere Icons.
- Leerlauf: Die Render-Schleife schläft, solange sich nichts ändert; Diagnose im `?perf`-Overlay (Startphasen, Weckgründe).
- Add-on: HA-WebSocket über `/ha-ws` für HTTPS hinter einem Reverse Proxy, gemeinsame Version im Add-on-Konfigurationsordner (Samba `addon_configs`, Backups), Installationswerte (Entity-Zuordnung, Standort) kommen mit der gemeinsamen Version statt aus dem Build; `npm run addon:export` bereitet den Umzug vor. Kein Service Worker mehr.
- WebGPU mit Snapshot-Rendering bleibt optional (`?engine=webgpu&snapshot=1`).

## 0.2.1 – Datenschutz (28.09.2026)

- Öffentliche Beispiele, Dateinamen und Dokumentation von persönlichen Rechner-/Gerätenamen, LAN-Adressen, Wohnadresse und Standortkoordinaten bereinigt.
- Zentrale private Defaults in eine ignorierte lokale Installationseinstellung ausgelagert; öffentliche Builds verwenden neutrale Werte. Echte HA-Entities und Browserzuordnungen bleiben unverändert.
- PC-Screenshot mit persönlicher UI-Beschriftung entfernt; zwei neutrale QA-Beispielbilder bleiben erhalten.
- Veröffentlichungsregeln in AGENTS.md und Datenschutz-Dokumentation ergänzt; lokale Pre-Push-Prüfung und CI-Prüfung eingeführt.
- Beide öffentlichen Git-Historien einschließlich der Restore-Tags bereinigt und mit abgesicherten Force-Pushes ersetzt. Alte CI-Ausgaben lokal gesichert und entfernt. Externe Kopien und GitHub-Caches können weiterhin alte Daten enthalten.

Validierung: 114 JS-/TS-Tests, 5 Python-Tests, Typprüfung und beide öffentlichen Builds erfolgreich. Lokale Installationswerte bleiben im Entwicklungsmodus verfügbar und sind aus den öffentlichen Builds ausgeschlossen.


## 0.2.0 – 28.09.2026

- Lüfter-/Dyson-Steuerung, Balkon-Rauchstatus, Echo-Geräte und Kaffeeprogramme ergänzt.
- IT-Gruppen mit eigenem Zuordnungseditor, Status/Messwerten, bestätigten Systemaktionen und zustandsabhängigen PC-Materialien integriert.
- Optionale HA-Kamera auf Modellmonitoren, Kamera-Proxy und separaten Windows-/MQTT-Screenshot-Helfer hinzugefügt.
- TV Dial als Event-Anforderung an die bestehende HA-Schaltlogik ergänzt.
- Räumliche Wasserleck- und gerätebezogene Batteriewarnungen hinzugefügt.
- Marker-Verdeckung budgetiert, Marker-Vektoren wiederverwendet, unnötige Schattenkarten- und IT-Materialupdates reduziert; Sonnenschatten nachts deaktiviert.
- Blender-/Importwerkzeuge für Modellstände v94–v100 aufgenommen; lokale Modelle bleiben außerhalb des Repositories.
- Dokumentation um Gerätebedienung, Integrationsgrenzen und zwei QA-Beispielbilder erweitert.
- Neue Testgruppen in npm/CI aufgenommen; Python-Helfertests laufen zusätzlich auf einem Windows-Runner.

Validierung: 112 JS-/TS-Tests, 5 Python-Tests und TypeScript-Prüfung erfolgreich. Normaler Build und Add-on-Build erfolgreich. Verbleibende Hinweise: große Vite-Chunks und veraltete Browserslist-Daten. Keine echte Gerätesteuerung, Desktop-Aufnahme oder Add-on-Bereitstellung in diesem Synchronisierungslauf.

## 0.1.0 – 27.09.2026

Erster eigenständiger HomeTwin3D-Entwicklungsstand, basierend auf dem bisher unter `Raza55/3Dash_webapp`, Branch `featureaddon`, entwickelten Stand `afacdcc` (nach Datenschutzbereinigung).

- Vollständige erreichbare Git-Historie und unveränderte Apache-2.0-Lizenz erhalten.
- Eigene README, Herkunftsdokumentation und NOTICE ergänzt.
- Eigenes Repository, Hauptbranch `main` und Paket-/Add-on-Version `0.1.0` eingerichtet.
- Add-on baut jetzt aus `Raza55/HomeTwin3D`, Branch `main`; eigenständiger Slug `hometwin3d`.
- Seitentitel, Begrüßung, Projektlink, PWA-Identität und Hosting-Pfad auf HomeTwin3D umgestellt.
- PWA-Manifestpfade relativ gestaltet, damit sie sowohl unter `/HomeTwin3D/` als auch im Add-on funktionieren.
- CI für Typprüfung, fünf Testgruppen und beide Frontend-Builds ergänzt; Pages-Veröffentlichung bleibt manuell.
- Bestehende Speicher- und Blender-Manifestkennungen für Kompatibilität beibehalten.

Funktionen und bisherige Messergebnisse: [PROJECT_STATUS.md](PROJECT_STATUS.md). Frühere Änderungen stehen in der Git-Historie und in [FORK_CHANGES.md](FORK_CHANGES.md).

Validierung der Umstellung: TypeScript-Prüfung, alle 82 Tests und beide Frontend-Builds erfolgreich. Nach der letzten Proxy-/Linkkorrektur wurden Typprüfung, Medientests und beide Builds erneut erfolgreich ausgeführt. Dokumentationslinks, PWA-Pfade für Unterpfad und Root sowie die gebaute Seitenidentität wurden zusätzlich geprüft. Vite weist weiterhin auf große Chunks und Browserslist auf ältere Browserdaten hin. Ein Docker-/Supervisor-Deployment ist nicht Bestandteil der Repository-Erstellung.
