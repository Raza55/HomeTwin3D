# Funktionen, Grenzen und Technik

Diese Übersicht beschreibt, wie HomeTwin3D arbeitet, was die einzelnen Funktionen voraussetzen und wo ihre Grenzen liegen.
Einrichtung: [Erste Schritte](docs/GETTING_STARTED.md). Eigenes Modell: [Blender-Workflow](BLENDER_WORKFLOW.md).
Änderungen pro Version: [Änderungsverlauf](CHANGELOG.md).

## Funktionsweise

- ÜLs können ganztägig oder zeitgebunden angelegt und bearbeitet werden. Der Editor bietet passende geladene Stunden des Fachs, Tages und Stundenplaninhabers zur Übernahme von Beginn und Dauer an; eine eigene Uhrzeit ist ebenfalls möglich.

- Marker abonnieren ihre benötigten HA-Entities einschließlich Hue Sync, Gruppenmitgliedern und Gerätesensoren. Batterieanzeigen behalten die dynamische Sensorsuche. Lichtgruppen werden zwischen Zustandsupdates wiederverwendet; Konfigurationsänderungen und veränderte Icon-Verfügbarkeit erneuern die Berechnung. React-Regressionstest: `npm run test:markers`.

- Kalender: Nach drei Minuten ohne Bedienung Rückkehr zu heute (Woche und 7-Tage-Ansicht mit sichtbarem Zeitbereich ab 06:00 Uhr); keine Rückkehr während der Terminbearbeitung. Lokaler Tageswechsel und Rückkehr zum Browser aktualisieren Heute-Markierung und Uhrzeit. Die aktuelle Tagesauswahl folgt über Monats- und Jahresgrenzen; andere gewählte Tage bleiben bestehen.

- Diashow: Pro Bildfläche bleibt nur das aktuelle, vollständig dekodierte Foto im DOM; vorherige Bild-URLs werden beim Wechsel freigegeben.

- Kalenderfotos: Bildstreifen, Kopfbereich, Hintergrund oder Kopfbereich und Hintergrund sind pro Browser wählbar. Hintergrund-Bildstärke, Bildhöhe und Einpassen/Ausfüllen bleiben einstellbar. Immich und lokale Monatsbilder verwenden dieselbe Darstellung.

- Immich: Ein eigener Anmeldeheader ermöglicht die Nutzung hinter Reverse-Proxys, die Authorization entfernen. Die HA-Prüfung unterscheidet ungültige Anmeldung (401) und nicht verfügbare Validierung (503). In beiden Fällen bleiben Fotos gesperrt; Diagnosemeldungen enthalten keine Zugangsdaten.

- Wiederholungen: täglich, wöchentlich, monatlich oder jährlich mit ganzzahligem Intervall ab 1. Weitere vorhandene RRULE-Klauseln bleiben bei einer reinen Intervalländerung erhalten.

- Kalender: `calendarOwners` in den privaten Installationswerten ordnet Kalender-Entities Personen zu, ohne Quelldaten zu verändern. Verknüpfte Kopien (Ref/UID und Beginn) werden in der Anzeige zusammengeführt. Der Google-Kalender unterstützt über die derzeitige HA-Anbindung Lesen und Anlegen, aber keine Änderungen vorhandener Termine; ein vollständiger beidseitiger Hintergrundabgleich ist nicht implementiert.

- Die App läuft vollständig im Browser (React, TypeScript, Babylon.js) und verbindet sich direkt per WebSocket mit Home
  Assistant. Der Zugriff erfolgt mit einem langlebigen Zugriffstoken, der nur im jeweiligen Browser gespeichert wird.
- Das Wohnungsmodell ist eine GLB-Datei. Ein eingebettetes Manifest (`3dash_manifest`) beschreibt die Smart-Home-Objekte;
  es entsteht beim Export mit der Blender-Erweiterung `tools/blender_3dash.py`.
- Zuordnungen von Modellobjekten zu HA-Entities, Räume, Lichtkalibrierung und Einstellungen liegen in `localStorage`,
  Modell und zusätzliche Objekte in `IndexedDB`. Beides gehört zum jeweiligen Browser und zur Adresse (Origin).
- Das Home-Assistant-Add-on liefert die App aus und kann eine **gemeinsame Version** (Modell, Zuordnungen, Einstellungen)
  für alle Browser im LAN bereitstellen, siehe [Add-on-Dokumentation](3dash-addon/DOCS.md).

## Funktionen

### Handy-Startseite

- Der Einstieg erfolgt automatisch auf kleinen Bildschirmen, ohne zusätzlichen Handy-Button im Desktop-Board. Auf der Handy-Startseite führt die Kachel „3D-Board“ zur vollständigen Ansicht.
- `#/mobile` bietet große Kacheln für Einkaufsliste, Kalender, Hauswarnungen und 3D-Board. Bei der normalen Startadresse wird sie bis 600 px Bildschirmbreite automatisch gewählt; unter „Startseite auf diesem Gerät“ lassen sich Automatik, Handy oder 3D festlegen.
- `#/board` öffnet ausdrücklich die 3D-Ansicht. Desktop und Simulation behalten standardmäßig das Board. Kalender und Warnliste verwenden eine eigene HA-Verbindung und benötigen keine 3D-Szene.
- Lokale Einkaufsanzahl ist auch ohne HA nutzbar. Die ausgewählte HA-Liste zeigt ihre vom Server gemeldete Anzahl offener Artikel. Hausstatus und Kontakt-/Lichtzahlen werden nur nach erfolgreichem Laden der HA-Zustände angezeigt; Wiederaufnahme nach Hintergrundbetrieb erneuert die Verbindung.
- Voraussetzung für Kalender und Hausstatus bleibt die HA-Anmeldung im jeweiligen Browser. „Keine aktiven Warnungen“ bezieht sich ausschließlich auf die bekannten Warnklassen; die Übersicht ist kein vollständiger Sicherheitscheck.
- Prüfung: `npm run test:mobile`, Browserprüfung mit simulierten HA-Zuständen und Smartphone-/Tablet-Abmessungen.

### Einkaufsliste

- Über 150 zweisprachige Katalogartikel und acht Einkaufssets stehen unter „Artikelkatalog & Einkaufssets“ bereit. Auswahl wird vor dem Speichern in der Eingabe gesammelt und ist frei anpassbar. Offene bzw. vorgemerkte Produkte werden auch mit üblichen führenden Mengenangaben übersprungen. Suche toleriert Umlaute/ASCII-Schreibweisen; persönliche Häufigkeit bleibt vorrangig.

- Unter „Hintergrund & Immich-Album“ stehen dieselben Darstellungsoptionen wie im Kalender bereit. Anfangswerte stammen aus dem Kalender; danach bleiben sie getrennt pro Browser. Das Album stammt aus der vorhandenen Add-on-Konfiguration. Ohne Foto bleibt die normale Oberfläche bedienbar; keine Immich-Anfragen im Simulationsmodus.

- Automatische Gruppierung in elf Warengruppen mit Icons. Mengen bleiben im Artikelnamen erhalten; lokale Korrekturen über das Etikett werden auch bei anderen Mengen wiederverwendet und können auf Automatik zurückgesetzt werden. Unbekannte Produkte stehen unter Sonstiges; Zuordnungen werden nicht mit Google synchronisiert.
- Einkaufsmodus blendet Eingabe, Vorschläge und Einstellungen aus und vergrößert Abhakflächen. Fortschritt zählt alle offenen und erledigten Einträge der ausgewählten Liste, keine gesonderten Einkaufstouren.

- Einkaufswagen neben den Einstellungen öffnet `#/shopping`. Die direkte Route benötigt keine 3D-Szene und lässt sich auf dem Smartphone als Lesezeichen öffnen.
- Artikel per Text, Komma-/Zeilenliste oder optionaler Browser-Spracherkennung hinzufügen. Auf iPad/iPhone kann das systemeigene Tastatur-Diktat verwendet werden. Browser-Diktat benötigt HTTPS, Unterstützung und Mikrofonfreigabe; Text wird vor dem Speichern geprüft.
- Große Abhakflächen, aufklappbare erledigte Artikel und erneutes Hinzufügen ohne offene Doppeleinträge. Vorschläge lernen pro Browser und Liste aus erfolgreichen Eingaben; diese Historie bleibt lokal.
- Auswahl vorhandener `todo`-Entities über die HA-Verbindung des Browsers. Google-Konto über **Einstellungen → Geräte & Dienste → Google Tasks** in HA autorisieren und auf allen Geräten dieselbe Liste auswählen. Einrichtung: https://www.home-assistant.io/integrations/google_tasks/.
- Google Tasks erhält Änderungen aus HA unmittelbar; externe Änderungen pollt die Integration standardmäßig alle 30 Minuten. Der Aktualisieren-Button fordert `homeassistant.update_entity` an. Die geöffnete Ansicht liest den HA-Stand alle 15 Sekunden und nach Änderungen neu.
- Offline bleibt ein gespeicherter Stand lesbar, Online-Änderungen sind ohne Verbindung gesperrt. Keine Offline-Warteschlange. Die explizite lokale Liste bleibt gerätegebunden; Listenwechsel übertragen keine Inhalte. Unterwegs wird ein erreichbarer HA-Zugang benötigt.
- Prüfung: `npm run test:shopping`; Browserprüfung mit simuliertem HA für Hinzufügen, UID-basiertes Abhaken, Fehler und nicht verfügbare Listen. Reales iPad-Diktat und echter Google-OAuth-Abgleich benötigen einen Gerätetest.

### Kalender: Immich-Bilder

- Optionale Album-Diashow über die private Add-on-Konfiguration (`immich_url`, `immich_api_key`, `immich_album_id`). API-Schlüssel bleiben auf dem Server, jeder Bildabruf erfordert einen gültigen HA-Token.
- Zufällige Fotos mit Überblendung und 10–300 Sekunden Wechselintervall; bei Fehlern fällt die Ansicht auf das lokale Monatsbild zurück. Nur das serverseitig freigegebene Album wird abgefragt, keine öffentlichen Freigabelinks und keine Bilddateien im Repository.
- Einrichtung und Grenzen: [Add-on-Dokumentation](3dash-addon/DOCS.md#private-immich-album-diashow). Tests: `npm run test:immich`.

### Kalender: ÜL-Termine

- Kategorie „ÜL“ mit ganztägigen Terminen und fester Schülerzuordnung über `calendarStudent` in den privaten Installationswerten; ohne Vorgabe wird ein eindeutiger Stundenplaninhaber verwendet. Die Fächer stammen aus dessen geladenen Stundenplaneinträgen.
- Klausuren und ÜL unterstützen 0–15 Punkte sowie „Clear“. Auch das Entfernen der letzten Beschreibungszeile wird an Home Assistant übertragen.

### Waschmaschinensteuerung

- Das Waschmaschinen-Popup bietet die von HA gelieferten Programme sowie Start und Stopp/Reset über `select.select_option` und `button.press`.
- Eindeutige Steuerungen werden über die Gerätezusammengehörigkeit des zugeordneten Programm-/Restzeitsensors erkannt; über die Zuordnung lassen sich Programmauswahl und Befehlstasten explizit auswählen.
- Häufig über das Popup gestartete Programme stehen zuerst. Gezählt werden erfolgreich gesendete Startbefehle lokal pro Browser; keine rückwirkende Gerätehistorie.
- Bei fehlender Verbindung sind die Befehle gesperrt. Während eines laufenden Waschgangs bleiben Programmauswahl und erneuter Start gesperrt; Stopp bleibt erreichbar. Fehler erscheinen im Popup.

### Kioskbedienung und Hausstatus

- Allgemeine QNAP-Statusmeldungen `warning` werden über die HA-Registry erkannt und aus Hausrahmen und Warnliste ausgefiltert. `error`/`fault` und separate Problemsensoren bleiben wichtig.
- Unter Einstellungen → Darstellung: automatische Größe für Touch-Geräte oder manueller Regler von 100–180 %, pro Browser gespeichert. Filter, Ansichtsbuttons, Haus-/Einstellungstaste sowie Einstellungen und Warnliste skalieren; die 3D-Auflösung bleibt unverändert.
- Ein Klick auf das Haus öffnet die aktuellen Warnursachen mit Gerätename, Zustand und Entity. Die Liste umfasst dieselben HA-Zustände wie der Rahmen, auch Geräte außerhalb des Plans; Verbindungs- und Anmeldefehler werden gesondert erklärt.
- Im Kioskmodus verhindert die Oberfläche die Browserauswahl beim langen Drücken; Textfelder bleiben bearbeitbar.
- Der Rahmen am Haus-Icon zeigt Anwesenheit grün und Abwesenheit grau. Personen und die Home-Zone liefern den Zustand; ohne verwertbare Daten bleibt er grau.
- Aktive HA-Warnzustände und Verbindungsfehler haben Vorrang und färben den Rahmen rot. Dazu zählen Problemsensoren, Sicherheitsalarme, Batterieprozente bis einschließlich 20 % und explizite Gerätefehler. Beliebige nicht verfügbare Einzelgeräte werden nicht pauschal als Alarm gewertet.

### Kalenderansichten und Gestaltung

- Jahres-, Monats-, Wochen- und Sieben-Tage-Ansicht; die Sieben-Tage-Suche durchsucht Titel, Ort und Personen im angezeigten Zeitraum und berücksichtigt die Personenfilter.
- Tagesleiste mit nächstem oder laufendem zeitgebundenem Termin des ausgewählten Tages und einklappbarem Stundenplan. Volle Monatsfelder öffnen über „weitere“ eine Tagesübersicht.
- Terminanzahl im Monatsraster richtet sich nach dem verfügbaren Platz; kleine Bildschirme können das Monatsraster vertikal scrollen.
- Eigene Monatsbilder mit kompakter/großer Höhe und vollständiger/flächenfüllender Darstellung. Bildeinstellungen und Stundenplan-Aufklappzustand bleiben im jeweiligen Browser gespeichert.

### Modell, Räume und Konfiguration

Ein GLB lässt sich im laufenden Betrieb ersetzen. Importprüfung und Wiederherstellung des vorherigen Modells schützen vor
einem fehlgeschlagenen Austausch. Gemeinsame Skalierung, Texturumschaltung und zusätzlich importierte 3D-Objekte (GLB, glTF,
OBJ, STL) werden im Editor verwaltet. Teile des Hauptmodells lassen sich verschieben, drehen und skalieren, ohne die GLB zu
verändern.

Raumflächen können vom Boden aus erkannt und als Polygon nachbearbeitet werden; HA-Bereiche liefern Raumzuordnungen.
Lichtblocker ergänzen fehlende Schattengeometrie, wo das Modell offen ist. Optionale Karten zeigen Skripte, Zustände und
Verläufe.

### Gerätezuordnung

Jedes Smart-Home-Objekt im Modell trägt eine stabile Kennung (`ha_id`). Die App speichert die Zuordnung Kennung → Entity
getrennt vom Modell (`floorplanBindings`). Ein Reimport übernimmt neue Geometrie und Positionen, behält aber Zuordnungen,
bewusst leere Zuordnungen, Raumbestätigungen und Lichtkalibrierung. Eine gleiche Kennung mit geändertem Gerätetyp erbt keine
Zuordnung.

Der visuelle Assistent fokussiert jedes Objekt, markiert es im Modell und schlägt Entities vor (Name, HA-Bereich, Position).
Schwache oder widersprüchliche Treffer werden nicht automatisch übernommen. Bereits vergebene Entities sind standardmäßig
ausgeblendet. Zuordnungen lassen sich separat sichern und in Blender zurückspielen.

### Licht

Lampen verwenden ihre Modellgeometrie und die beim Export erzeugten Lichtquellen. Die Darstellung folgt Verfügbarkeit,
Helligkeit, Farbe und Farbtemperatur aus HA. Lichtstrom, Reichweite und Ausrichtung sind pro Lampe kalibrierbar. Es handelt
sich um Echtzeitbeleuchtung, keine physikalisch vollständige Lichtsimulation.

Hover öffnet eine Schnellsteuerung, Klick fixiert sie. Nahe Spots derselben Namensfamilie bilden einen gemeinsamen Marker mit
gemeinsamer und einzelner Farb- und Helligkeitssteuerung; im Editor lassen sich eigene Gruppen festlegen. Mehrere Entities
können sich eine Bediengruppe teilen und bleiben dabei getrennte HA-Entities. Die App sendet normale HA-Lichtbefehle.

**Hue Sync:** Läuft eine Hue-Sync-Box (Schalter, Bereichsauswahl und Helligkeit als Entities), zeigt die App die beteiligten
Lampen mit Sperrhinweis an, statt alte Farben vorzutäuschen. Welche Lampen dazugehören, ist eine feste Liste von
Beispiel-Entities (`src/services/hueSync.ts`), die über die Installationswerte auf eigene Entities umgelenkt wird (siehe
unten). Das Schnell-Popup jeder zugehörigen Lampe bietet „Sync stoppen“ oder „Weiterlaufen lassen“; Letzteres schließt
nur das Popup. Nach dem Stoppen wartet die Oberfläche auf den tatsächlichen HA-Status. Bei inaktivem Sync lassen sich
alle erreichbaren Sync-Lampen gemeinsam ein-/ausschalten, mit vier eingebauten Licht-Presets oder einer eigenen Farbe
einstellen. HA-Szenen werden nur angeboten, wenn ihre explizite Entity-Liste ausschließlich Lampen dieser Zone enthält.
„Sync starten“ verwendet den Light-Sync-Schalter und ist nur bei passender Bereichsauswahl verfügbar. Die Gruppenbefehle
ändern keine weiteren Wohnzimmerlampen. Fehlende Lampen und fehlgeschlagene Befehle werden angezeigt.

### Rollos, Türen, Fenster und Schloss

Der Sammelbutton in jedem Rollo-Popup bietet „Alle schlafen“ (Mond) zum Schließen oder „Alle aufwachen“ (Sonne) zum Öffnen, sobald alle erreichbaren zugeordneten Rollos geschlossen sind. Bei gemischten Stellungen bietet er Schließen; während der Fahrt ist er gesperrt. `cover.living_room_balcony` (über die Installationswerte auf das echte Balkonrollo abgebildet) bleibt in beiden Richtungen ausgenommen. Ohne aufgelöste Ausnahme bleibt der Button gesperrt. Verfügbarkeit, Fähigkeiten und Befehlsfehler werden wie bei Raumaktionen berücksichtigt.

Rollo-Popups bieten Öffnen, Stopp, Schließen und je nach Gerät einen Positionsregler; Raumaktionen steuern alle Rollos
eines Raums. Die Behang-Geometrie folgt der HA-Position.

Tür- und Fensterkontakte bewegen die markierten Türblätter im Modell. Die Dauer des aktuellen Zustands kommt aus
`last_changed`. Bei Fenster- und Balkontüren kann nach längerer Öffnung eine Kippstellung dargestellt werden; das ist eine
beschriftete Annahme, kein gemessener Zustand. Türschloss und Türkontakt werden getrennt angezeigt; die Schlossanzeige
sendet keine Schlossbefehle. Türen lassen sich zusätzlich per Klick lokal öffnen und schließen, bis HA einen neuen Zustand
meldet.

### Haushalts- und weitere Geräte

Lüfter, Luftreiniger, Saugroboter, Echo-Geräte, Kaffeevollautomat (Home Connect), Waschmaschine und Trockner sowie PC-/
Servergruppen haben eigene Marker und Popups. Einzelheiten und Voraussetzungen: [Geräte und Warnungen](docs/DEVICES_AND_ALERTS.md).

### Navigation

Orbitansicht, Laufmodus (Walk) mit Boden- und Wandkollision und Flugmodus.

| Eingabe | Wirkung |
| --- | --- |
| W/A/S/D oder Pfeiltasten | Bewegen |
| Maus/Pointer ziehen | Umsehen |
| Shift | Schneller bewegen |
| E / Q im Flugmodus | Auf / ab |
| Escape | Zur normalen Ansicht zurück |
| Linksklick / kurzes Antippen im Laufmodus | Erreichbare Innentür öffnen/schließen |

Innentüren mit Scharnierdaten (`ha_room_door`) öffnen sich lokal und senden keine HA-Befehle.

### TV und Medien

Ein Fernseher im Modell kann Medieninformationen zeigen: Titel, App, Cover oder Screenshot und Fortschritt. Maßgeblich ist der
Eingang des AV-Receivers: Beim Streaming-Eingang (z. B. NVIDIA SHIELD) erscheinen dessen Metadaten, beim PC-Eingang
optional ein Desktop-Bild, bei anderen Eingängen der Eingangsname. Screenshots des Streaming-Geräts benötigen eine
eingerichtete ADB-Integration in HA; sie werden etwa alle zehn Sekunden erneuert und sind kein Livevideo (geschützte Inhalte
bleiben schwarz). Ohne Bild zeichnet die App für bekannte Apps einen Hintergrund mit App-Namen.

Die Fernseher-Anzeige hängt am Modellobjekt `Fernseher_Bildschirm`. Receiver, Streaming-Gerät, TV, Fernbedienung und
Screenshot-Quelle sind Beispiel-Entities in `src/services/tvMedia.ts`, die über die Installationswerte auf eigene Entities
umgelenkt werden. Bilder laufen über den Medienproxy des Add-ons; der Zugriffstoken wird nicht an Bild-URLs gehängt.

### Sonne, Wetter und Außenumgebung

Der Sonnenstand wird aus Uhrzeit, Standort (aus der HA-Konfiguration) und Nordausrichtung berechnet. Wetterdaten von
Open-Meteo steuern Himmel, Dunst, nasse Wege, Regen und Schnee.

Die **Außenumgebung** (Park, Wege, Bäume, Nachbargebäude, Hof) ist prozedural erzeugt und orientiert sich an der Umgebung der
Referenzwohnung. Sie wird an den Modellgrenzen und an den Rollos als Fassade ausgerichtet, bildet aber nicht die eigene
Umgebung ab. Mit `?off=exterior` in der Adresse lässt sie sich zum Vergleich ausschalten.

### Kalender

Im Kioskmodus bleibt das Datum als Kalenderbutton sichtbar, während die Uhrzeit der Systemleiste überlassen wird. Wetter,
Ansichtsbuttons und Markierungsfilter passen ihre Anordnung an die verfügbare Breite an; der Kalenderbutton und die
Ansichtsbuttons haben dort mindestens 44 Pixel große Touchflächen.

Unter Kalender-Einstellungen → Monatsbilder lässt sich für jeden Kalendermonat ein eigenes Bild hochladen, ersetzen oder
entfernen. Das Motiv erscheint über der Monats- und Wochenansicht und wird in kommenden Jahren wiederverwendet. JPG, PNG
und WebP bis 20 MB werden beim Import auf maximal 1920 Pixel Kantenlänge verkleinert. Die Bilder liegen ausschließlich in
einer eigenen IndexedDB des jeweiligen Browsers; sie sind nicht Bestandteil der gemeinsamen Version oder der Modellexporte.

Ein Tipp auf das Datum öffnet einen Kalender (Jahr, Monat, Woche) über dem Modell. Termine kommen per WebSocket Abo aus den
Kalendern von Home Assistant und werden dort angelegt, geändert und gelöscht. Feiertage werden für die gewählten Bundesländer
berechnet, Schulferien von der OpenHolidays API geladen und im Browser zwischengespeichert. Freitext und Sprache werden in
Tag, Uhrzeit und Dauer zerlegt; Vorschläge entstehen aus früheren Terminen. Personen, Klausurnoten und ein API Schlüssel
stehen als Zeilen in der Terminbeschreibung. Das Add-on bietet dazu eine Kalender API für JSON (siehe Add-on-Dokumentation).

## Installationswerte: Beispiel-Entities umlenken

Einige Funktionen verwenden im Quelltext feste **Beispiel-Entity-IDs**, weil sie keine eigene Zuordnung im Editor haben:

| Funktion | Datei | Beispiele |
| --- | --- | --- |
| Hue-Sync-Anzeige | `src/services/hueSync.ts` | `switch.media_sync`, beteiligte Lampen |
| Wasserleck | `src/services/waterLeak.ts` | `binary_sensor.laundry_water_leak`, `binary_sensor.kitchen_water_leak` |
| TV-Medien | `src/services/tvMedia.ts` | `media_player.living_room_receiver`, `media_player.streaming_player`, … |
| TV Dial | `src/services/tvDial.ts` | `automation.tv_dial_hdmi1` |

Die eigenen Entities trägt man in `.private/installation.json` ein (wird nicht mit Git veröffentlicht):

```json
{
  "entities": { "media_player.living_room_receiver": "media_player.avr" },
  "location": { "label": "Zuhause", "latitude": 52.5, "longitude": 13.4 },
  "author": "Name im Einleitungsdialog der Tagesdemo"
}
```

`npm run addon:export` bzw. `npm run addon:sync` überträgt diese Werte mit der gemeinsamen Version in das Add-on; jeder
Browser übernimmt sie von dort. Öffentliche Builds enthalten keine Installationswerte.

## Umgesetzte Optimierungen

| Bereich | Umsetzung |
| --- | --- |
| GLB-Daten | `tools/optimize-glb.mjs` entfernt ungenutzte Daten, teilt identische Binärblöcke, dedupliziert Vertexdaten und verkleinert geeignete Indizes auf 16 Bit, verlustfrei. `tools/verify-glb.mjs` prüft das Ergebnis. |
| Sonnenschatten | `ShadowCasterBatch.ts` bündelt statische, opake Schattenwerfer. Originalmeshes bleiben für Bild und Auswahl erhalten; bewegte und HA-Objekte sind ausgenommen. |
| Glasdurchgang | `TransmissionCulling.ts` lässt unsichtbare und außerhalb des Sichtvolumens liegende Meshes weg. |
| Außenobjekte | `ExteriorMeshPool.ts` teilt Geometrie und Materialien gleicher Formen. |
| Leuchten | Unveränderte Zustände schreiben weder Meshwerte noch Schattenkarten neu. Pro Mesh zählen bis zu sechs relevante Lichtquellen. Schattenkarten werden verteilt neu berechnet (höchstens 4 pro Bild, Tablet 2); dunkle Lampen warten. |
| Marker | Gemeinsame Projektion pro Bild, budgetierte Verdeckungsprüfung, keine identischen DOM-Schreibzugriffe. Sortierung und Texturkoordinaten werden nur bei Änderungen erneuert, Farbwerte einmal pro Puffergröße gesetzt; Positionen und Trefferprüfung bleiben pro Bild aktuell. |
| Saugroboter | Wiederverwendbare Vektoren und Quaternionen für die Bewegung aller Modellteile; unveränderte Interpolation und Schattenaktualisierung. |
| Spiegel | Umgebung wird über sechs Bilder aufgenommen, eine Würfelseite pro Bild. |
| Rendern | Ohne Bewegung ruht die Render-Schleife. Tablets erhalten eine eigene Leistungsstufe (`?device=tablet`). |
| HA-Verlauf | 60-Sekunden-Cache, Zusammenfassung gleichzeitiger Anfragen, Begrenzung der Ergebnismenge. |
| Build/PWA | Icons und große 3D-Chunks werden nach Bedarf geladen; Babylon- und React-Chunks sind getrennt. |

Die Bildrate hängt vor allem von Modellgröße, Anzahl leuchtender Lampen und Zielgerät ab. `?perf` zeigt Bilder pro Sekunde,
CPU-Zeit und Draw Calls; die Tagesdemo misst am Ende einen Leistungswert.

## Architektur

| Aufgabe | Einstieg im Quellcode |
| --- | --- |
| Szenenaufbau und Laufzeit | `src/pages/Dashboard/Dashboard.tsx`, `src/babylon/SceneManager.ts`, `ModelLoader.ts` |
| Import, Zuordnung, Persistenz | `src/services/floorplanImport.ts`, `floorplanMatching.ts`, `floorplanReassignment.ts`, `configApi.ts`, `storageApi.ts` |
| Gemeinsame Version | `src/services/sharedStore.ts`, `3dash-addon/nginx.conf` |
| Licht und Modellzustände | `src/babylon/FloorplanBindings.ts`, `FloorplanLighting.ts`, `src/services/lightClusters.ts`, `hueSync.ts` |
| Türen, Geräte, Kamera | `src/babylon/DoorAnimation.ts`, `ApplianceAnimation.ts`, `RoomDoors.ts`, `WalkthroughCamera.ts` |
| HA und Verläufe | `src/services/haWebSocket.ts`, `haHistoryApi.ts` |
| Medien | `src/services/tvMedia.ts`, `src/babylon/TVMediaScreen.ts`, `LivingRoomTVDisplay.ts` |
| Tagesdemo, Energiefluss | `src/services/dayDemo/`, `src/services/energyFlow.ts`, `src/babylon/EnergyFlowLayer.ts` |
| Build und Hosting | `vite.config.ts`, `3dash-addon/Dockerfile`, `3dash-addon/nginx.conf` |

## Bekannte Grenzen

- HomeTwin3D ist aus einer konkreten Wohnung heraus entstanden. Hue Sync, Wasserleck, TV-Medien und TV Dial brauchen die
  Installationswerte (oben), die Außenumgebung ist eine Beispielumgebung.
- Die automatische Erkennung beim Blender-Export ist auf die Namen der Referenzwohnung abgestimmt; bei eigenen Modellen
  Objekte selbst kennzeichnen (siehe [Blender-Workflow](BLENDER_WORKFLOW.md)).
- Daten liegen pro Browser und Origin. Vor einem Wechsel von Adresse, Port oder Browser ZIP- und Zuordnungsbackup
  exportieren oder die gemeinsame Version des Add-ons nutzen.
- Die gemeinsame Version erkennt Konflikte zwischen Geräten, ist aber kein atomarer Serverspeicher: Exakt gleichzeitiges
  Veröffentlichen von zwei Geräten ist nicht abgesichert.
- Das Add-on hat keine HA-Anmeldung (kein Ingress). Wer es erreicht, kann die gemeinsame Version lesen; nicht ungeschützt ins
  Internet stellen.
- Große Modelle kosten auf Tablets spürbar Leistung. Auf dem Zielgerät mit `?perf` prüfen.
