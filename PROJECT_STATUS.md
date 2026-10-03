# Projektstand, Funktionen und Optimierungen

Stand: **03.10.2026**, eigenständiges Projekt [HomeTwin3D](https://github.com/Raza55/HomeTwin3D), Branch `main` (Herkunft: [ORIGIN.md](ORIGIN.md)). Diese Übersicht beschreibt den vorhandenen Quellcode und unterscheidet ihn von lokalen Modell- und Laufzeitdaten. Einstieg und Build-Befehle stehen in der [README](README.md).

## Aktueller Release 0.5.49 vom 03.10.2026

- Add-on 0.5.49 auf `main`; Images und beide Prüfabläufe erfolgreich. Webapp-Paket weiterhin 0.2.1.
- Neu seit 0.5.9 (Einzelheiten im [Änderungsverlauf](CHANGELOG.md)): Tagesdemo mit 27 Kapiteln, Einleitungsdialog, Fingerbedienung der Popups,
  Ich-Perspektive und Benchmark; Energiefluss aus dem HA-Energie-Dashboard (Zeiträume, Ebenen, einzelne Lampen über PowerCalc);
  optionale Tiere draußen; Markierungsfilter; animierte Türen, Kippfenster, Sieben-Segment-Anzeigen, Spiegel mit Tagesverlauf.
- Performance-Pass 0.5.43: Demo-Benchmark Desktop 2187 → 3514, größtes Einzelbild auf dem Tablet 45 000 → 9 000 Draw Calls
  (siehe [Energie, Demo, Tiere und Filter](docs/ENERGY_DEMO_WILDLIFE.md#leistung)).
- Modellstand v111 (Schreibtisch); Ablauf in [docs/MODEL_PIPELINE.md](docs/MODEL_PIPELINE.md).
- 186 JS-/TS-Tests, Typecheck, Datenschutzprüfung, öffentlicher und Add-on-Build in CI.

Einrichtung für neue Nutzer: [Erste Schritte](docs/GETTING_STARTED.md).

## Release 0.5.9 vom 01.10.2026

- Add-on 0.5.9 ist auf `main` veröffentlicht; die Images für AMD64 und ARM64 sowie beide GitHub-Prüfabläufe sind erfolgreich. Die Paketversion der Webapp bleibt 0.2.1.
- Übertragungen desselben Browsers laufen nacheinander; neue Änderungen während eines Uploads bleiben vorgemerkt. Empfangene Assets werden vor der Übernahme vollständig geladen und zusammen gespeichert; Speicherfehler lösen einen Rollback aus.
- Ein Entity-Index reduziert die Gerätesuche bei HA-Updates. Unzugeordnete Geräte fordern keine zusätzliche 3D-Darstellung allein wegen ihrer Domain an.
- Ladeanzeige und p95-CPU-Framezeit in der Diagnoseanzeige ergänzt. WebGL-/Apple-Einstellungen und das Add-on-Datenformat bleiben kompatibel.
- 145 JS-/TS-Tests, 5 Python-Tests in CI, Typecheck, Datenschutzprüfung, öffentlicher Build und Add-on-Build erfolgreich. Zusätzlich Browserprüfung mit Simulation und echter IndexedDB.

Implementierung, Release-Nachweise, Messbedingungen und verbleibende Grenzen stehen in der [Agentenübergabe](docs/AGENT_HANDOFF.md). Insbesondere ist die neue Warteschlange kein serverseitiger Schutz gegen gleichzeitig schreibende unterschiedliche Geräte. Der tatsächliche Update-/GPU-Test auf der privaten Hassio-/Apple-Installation wurde hier nicht durchgeführt.

Die folgenden Ergänzungen und Prüfungen vom 28. und 27.09.2026 bleiben als historischer Ausgangsstand erhalten. Neuere Funktionsänderungen vom 30.09.2026 stehen im [Änderungsverlauf](CHANGELOG.md).

## Ergänzungen vom 28.09.2026

- Lüfter-/Dyson-Steuerung, zustandsabhängiger Rauchmarker, Echo-Mediengeräte und Kaffeeprogramme.
- PC-/Servergruppen mit eigenem Zuordnungseditor, Messwerten und bestätigten Systemaktionen; RGB-/Bildschirmmaterialien folgen dem Gerätezustand.
- Optionale PC-Kamera auf der Monitorfläche, begrenzter HA-Kameraproxy und separater Windows-/MQTT-Screenshot-Helfer.
- TV Dial fordert Quellenwechsel über ein HA-Event an; die eigentliche Schaltfolge bleibt in der HA-Automation.
- Wasserleck- und Batteriewarnungen an räumlichen Ankern. Batterien werden über HA-Geräteidentität zugeordnet.
- Budgetierte Marker-Verdeckung, weniger Schatten-Neuberechnungen, wiederverwendete Marker-Vektoren und zustandsabhängige IT-Materialupdates.
- Modellwerkzeuge für v94–v111 (Ablauf: [docs/MODEL_PIPELINE.md](docs/MODEL_PIPELINE.md)) sowie zwei dokumentierte QA-Beispielbilder in der README.

Bedienung, Zuordnungen, Installationsabhängigkeiten und Grenzen: [Geräte und Warnungen](docs/DEVICES_AND_ALERTS.md).

### Prüfungen vom 28.09.2026

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript | Erfolgreich |
| Floorplan / Medien | 28 / 9 Tests erfolgreich |
| Balkon / Echo / Kaffee / IT | 3 / 3 / 4 / 5 Tests erfolgreich |
| Beleuchtung / Performance / Walkthrough | 30 / 23 / 3 Tests erfolgreich |
| Batterie / TV Dial | 2 / 2 Tests erfolgreich |
| Windows-Screenshot-Helfer | 5 Python-Tests mit synthetischen Bildern erfolgreich |

Summe: **112 JS-/TS-Tests und 5 Python-Tests**. Keine realen Gerätebefehle und keine Desktop-Aufnahme für diese Prüfung. Die Beispielbilder wurden aus vorhandenen QA-Aufnahmen übernommen und visuell geprüft; es wurde keine neue vollständige Browserprüfung durchgeführt. Normaler Build und Add-on-Build erfolgreich. Verbleibende Hinweise: große Vite-Chunks und veraltete Browserslist-Daten.

## Lieferumfang und Versionsstand

- Webapp: React/TypeScript mit Babylon.js, statischer Vite-Build und direkter Home-Assistant-WebSocket-Verbindung.
- Paketversion in `package.json`: `0.2.1`; Add-on-Version in `3dash-addon/config.yaml`: `0.5.9` (Stand 01.10.2026). Diese Nummern sind unabhängig von den Wohnungsmodell-Versionen.
- Lokale Modellreihe bis `Wohnung_v111_3Dash_Schreibtisch.blend` und `.glb` in `../blender/`. Das Vorhandensein der Dateien beweist nicht, welche Version ein bestimmter Browser gerade geladen hat.
- Das Repository enthält Quellcode, Werkzeuge und Simulationsmodell. Persönliche `.blend`-/GLB-Dateien im Nachbarordner, `.qa/`, `dist/`, `node_modules/` und Browserdaten werden nicht mit Git übertragen.
- Der Add-on-Dockerfile baut aus `Raza55/HomeTwin3D`, Branch `main`. Git-Push und Deployment bleiben getrennte Schritte; siehe README.

## Funktionen und Bedienung

### Modell, Räume und Konfiguration

Ein GLB lässt sich im laufenden Betrieb ersetzen. Importprüfung und Wiederherstellung des vorherigen Modells schützen vor einem fehlgeschlagenen Austausch. Gemeinsame Skalierung, Texturumschaltung und zusätzliche importierte 3D-Objekte werden im Editor verwaltet. Unterobjekte erhalten lokale Transformations-Overrides; nicht mehr passende Overrides werden bei Modellwechsel verworfen.

Home-Assistant-Bereiche liefern Raum- und Gerätezuordnungen. Raumflächen können vom Boden aus erkannt und als Polygon nachbearbeitet werden. Virtuelle Wände unterstützen die Erkennung; separat platzierte Lichtblocker ergänzen fehlende Schattengeometrie. Räume besitzen konfigurierbare Farben und priorisierte Geräte. Das Seitenpanel bietet verschiebbare Karten für Skripte, Statusanzeigen und Verlaufskurven. Energie-/Datenflüsse werden als animierte Pfade dargestellt.

### Blender und stabile Gerätezuordnungen

`tools/blender_3dash.py` exportiert eine temporäre aufbereitete Szene mit stabilen `ha_id`-Kennungen und einem `3dash_manifest` in den glTF-Szenen-Extras. Die Blender-Quelle bleibt bearbeitbar. Das Manifest beschreibt Geräte, Räume, Positionen und Lichtparameter; spezielle Extras beschreiben unter anderem Türen und Geräteanimationen.

`floorplanImport.ts` validiert das Manifest und führt es mit vorhandenen Einstellungen zusammen. `floorplanBindings` hält Entscheidungen unabhängig vom aktuellen Modell fest, einschließlich ausdrücklich leerer Zuordnungen. Ein Reimport übernimmt neue Geometrie, erhält aber passende manuelle Zuordnungen und Kalibrierung. Gleiche IDs mit geändertem Gerätetyp dürfen keine fremden Zuordnungen erben.

Der visuelle Assistent fokussiert und markiert Objekte. Vorschläge berücksichtigen Namen, Räume und Positionen; schwache oder widersprüchliche Treffer werden nicht blind übernommen. Bestätigen speichert sofort, Überspringen verändert nichts, eine leere Zuordnung lässt sich bewusst speichern. Bereits vergebene Entities sind standardmäßig ausgeblendet; exklusive Übernahme ist ausdrücklich auswählbar. Separate Zuordnungsbackups ergänzen den vollständigen ZIP-Export.

### Licht, Gruppen und Hue Sync

Modellleuchten verwenden ihre vorhandenen Meshes und exportierten Emitter. Die Anzeige berücksichtigt HA-Verfügbarkeit, Helligkeit, RGB und Farbtemperatur. Lichtleistung, Reichweite und Ausrichtung sind kalibrierbar; die Echtzeitbeleuchtung ist keine physikalisch vollständige globale Beleuchtung.

Hover öffnet die Schnellsteuerung, ein Klick fixiert sie. Küchenspots besitzen gemeinsame und einzelne Farb-/Helligkeitssteuerung einschließlich Farbverlauf. Die oberen und unteren Ensis-Kanäle teilen sich eine Bediengruppe, bleiben aber getrennte HA-Entities. Normale Bedienung sendet HA-Serviceaufrufe, keinen Hue-Entertainment-Stream.

`src/services/hueSync.ts` enthält eine installationsspezifische Liste von zehn Lampen des Bereichs `TV-Bereich 2`. Bei aktivem `switch.media_sync` und passendem Bereich zeigt die App diese Lampen blassrosa mit Sperrhinweis. Das ist eine Anzeigeanpassung; sie überschreibt keine HA-Farbe. Nach Ende der Synchronisierung erscheint wieder der reguläre Zustand. Die Liste ist statisch und muss nach Änderungen an Entities oder Entertainment-Bereichen gepflegt werden.

### Rollos, Türkontakte, Schloss und Haushaltsgeräte

Rollo-Popups bieten Öffnen/Stopp/Schließen und je nach Fähigkeiten die Position. Raumaktionen berücksichtigen Verfügbarkeit, deduplizieren Entities und melden Befehlsfehler. HA-Raumzuordnungen haben Vorrang vor Blender-Raumlabels; Positionsregler senden beim Loslassen.

Tür-/Fensterkontakte steuern markierte bewegliche Flügel. Die Dauer basiert auf `last_changed`. Bei den dafür vorgesehenen Fenster-/Balkonöffnungen wird nach 15 Minuten Öffnungsdauer eine Kippstellung dargestellt: ausdrücklich eine Visualisierungsannahme, kein gemessener Kippzustand. Die Haustür kippt nie. Kontakt und Schlossstatus sind unabhängig; entriegelt bedeutet nicht geöffnet. Die Schlossanzeige sendet keine Schlossbefehle.

Waschmaschine und Trockner besitzen getrennte GLB-Animationsclips. Zugeordnete Binärsensoren steuern Wiedergabe/Pause, Zusatzsensoren liefern Programm und Restzeit. Animationen und Statusanzeigen schalten die Geräte nicht.

### Navigation und Innentüren

Die Navigation wechselt zwischen normaler Orbitansicht, Walk und Fly. Walk nutzt Bodenprüfung und Wandkollisionen; Fly erlaubt freie Höhenänderung. Die Orbitansicht wird beim Verlassen wiederhergestellt.

| Eingabe | Wirkung |
| --- | --- |
| W/A/S/D oder Pfeiltasten | Bewegen |
| Maus/Pointer ziehen | Umsehen |
| Shift | Schneller bewegen |
| E / Q im Flugmodus | Auf / ab |
| Escape | Zur normalen Ansicht zurück |
| Linksklick / kurzes Antippen im Walk-Modus | Erreichbare Innentür öffnen/schließen |

Innentüren verwenden `ha_room_door`-Scharnierdaten. Ihr Zustand gilt lokal bis zum Neuladen und sendet keine HA-Befehle. Ziehen zum Umsehen löst keinen Tür-Klick aus.

### TV, Medien und Proxy

`LivingRoomTVDisplay.ts` legt eine angepasste Anzeige auf `Fernseher_Bildschirm` (Objekt-ID `4784bb9f-40cd-5e6b-9165-63d8ffbe0dc1`). `TVMediaScreen.ts` rendert Medieninhalt; `tvMedia.ts` entscheidet über die Quelle. Bestehende konfigurierte TV-Displays nutzen denselben Mechanismus. `DisplayConfig.tvMedia` kann die folgenden Standard-Entities überschreiben:

| Feld | Öffentliches Beispiel |
| --- | --- |
| `receiver` | `media_player.living_room_receiver` |
| `shield` | `media_player.streaming_player` |
| `television` | `media_player.living_room_tv` |
| `remote` | `media_player.streaming_remote` |
| `screenshot` | `media_player.streaming_screenshot` |

Der Denon-Eingang ist maßgeblich: `SHIELD Media` zeigt Titel, App, Bild und Fortschritt. `PC` und `Playststion` (vorhandene Eingangsbezeichnung, auch PlayStation/PS5 erkannt) erhalten eigene Illustrationen. Andere Eingänge zeigen ihren Namen ohne alte SHIELD-Metadaten. Ausgeschaltete oder nicht verfügbare Geräte zeigen keine veraltete Wiedergabe. Der Fortschritt läuft lokal sekündlich weiter, pausiert passend und endet an der Mediendauer.

Android TV Remote kann die aktive App ergänzen; Screenshots erfordern eine entsprechend eingerichtete ADB-Integration. Bei SHIELD haben ADB-Bilder Vorrang vor Coverbildern, werden alle zehn Sekunden erneuert und während des Nachladens weiter angezeigt. Quellenwechsel, Ausschalten, Verbindungsverlust und Dispose beenden die Aktualisierung. Es handelt sich nicht um HDMI-Livevideo; geschützte Inhalte können schwarz bleiben.

Bilder verwenden den HA-Medienproxy derselben konfigurierten HA-Origin. Fehlende Bilder fallen auf eine Illustration zurück. Der langlebige HA-Zugriffstoken wird nicht an Bild-URLs angehängt.

- Add-on: `/ha-media/media_player.…` wird in `3dash-addon/nginx.conf` an einen festen lokalen HA-Upstream weitergeleitet. Bildbezogene URL-Tokens werden verwendet, Authorization/Cookies entfernt und Caching/URL-Logging abgeschaltet. Frontend und Nginx-Konfiguration gemeinsam bereitstellen und den installationsbezogenen Upstream prüfen.
- Vite: `/HomeTwin3D/ha-media/media_player.…`; Öffentliches Standardziel `http://homeassistant.local:8123`. Für andere Installationen `HA_MEDIA_PROXY_TARGET` in `.env.local` setzen.
- Andere statische Hosts benötigen eine passende Proxy-/CORS-Konfiguration für Bilder auf Canvas.

### Sonne, Wetter und Außenumgebung

Der Sonnenstand wird aus Zeit, Standort und Nordausrichtung berechnet. Das Dashboard liest die HA-Standortkonfiguration. Der öffentliche Basisstandort ist neutral (0, 0); private Standortwerte können über die lokale Installationskonfiguration eingebunden werden. Wetterdaten von Open-Meteo werden im Zehn-Minuten-Intervall abgefragt und beeinflussen Himmel, Dunst, nasse Wege sowie stilisierten Schnee. Regen/Schnee werden außerhalb der Wohnungsbegrenzung erzeugt.

`ParkEnvironment`, `ParkAtmosphere`, `ResidentialFacade`, `CourtyardDetails` und `SiteLayout` erzeugen die Umgebung. Die Wohnungskoordinaten bleiben stabil, die Umgebung orientiert sich an lokalen Referenzen. Gebäudehöhen, Wege und Gelände sind Annäherungen; keine Vermessung und kein externer Karten-Streamingdienst.

## Umgesetzte Optimierungen

| Bereich | Umsetzung und praktische Wirkung |
| --- | --- |
| GLB-Daten | `optimize-glb.mjs` entfernt ungenutzte Daten, teilt identische Binärblöcke, dedupliziert vollständige Vertexdatensätze und verkleinert geeignete Indizes auf 16 Bit. `verify-glb.mjs` prüft Dreiecksecken, Materialien, Bilder, Animationen und Metadaten. UV-Nähte bleiben erhalten. |
| Sonnenschatten | `ShadowCasterBatch.ts` bündelt geeignete statische, opake und gleich transformierte Schattenwerfer. Originalmeshes bleiben für Bild und Picking erhalten. Bewegte/HA-Objekte sind ausgenommen; Änderungen lösen den Rückfall auf Originalmeshes aus. Zusätzliche Proxy-Geometrie kostet Speicher. |
| Glasdurchgang | `TransmissionCulling.ts` filtert entsorgte, unsichtbare und außerhalb des Sichtvolumens liegende Meshes; Instanzfamilien werden zusammen erhalten. |
| Außenobjekte | `ExteriorMeshPool.ts` verwendet gemeinsame Geometrie/Materialien für gleiche Formen bei unabhängigem Transform. |
| Leuchten | Unveränderte Zustände schreiben weder Meshwerte noch Schattenkarten erneut. Pro empfangendem Mesh werden bis zu sechs relevante direkte Lichtquellen ausgewählt; beitragende Quellen bleiben verschattet. Emissive Oberflächen bleiben zusätzlich sichtbar. |
| Marker | `MarkerProjection.ts` misst Canvas/Viewport einmal pro Frame, nutzt gemeinsame Projektionsmatrizen und vermeidet identische DOM-Style-Schreibzugriffe. |
| Atmosphäre/Pfade | Zustandscaches vermeiden unnötige Farbberechnungen; Pfadinterpolation verwendet vorhandene Vektoren statt laufender Neuallokationen. |
| Navigation | Einstieg stoppt am ersten geeigneten Startpunkt; unnötiges allgemeines Pointer-Picking entfällt in der Ich-Perspektive. Türinteraktion nutzt gezielte Prüfungen. |
| HA-Verlauf | Verbindungsabhängiger 60-Sekunden-Cache, Zusammenfassung identischer gleichzeitiger Anfragen, Begrenzung auf 128 Ergebniseinträge und erneuter Versuch nach Fehlern. |
| Diagramme | Wiederverwendbare Graphgeometrie reduziert wiederholte Arbeit bei großen Verlaufsreihen und erhält SVG-Koordinaten. |
| Icons/Build | Generierte dynamische Lucide-Loader laden Icons nach Bedarf. `predev`/`prebuild` erzeugen die Liste neu. Babylon-/React-Chunks sind getrennt; große 3D-Chunks werden nicht pauschal vorgeladen. |
| PWA | Kleine Installations-Caches, große 3D-Chunks erst bei Verwendung, eigener Icon-Cache. Offline-Caching ersetzt keine HA-Verbindung für Live-Zustände und Befehle. |

### Bereits dokumentierte Messungen

Die [Modellhistorie](docs/MODEL_HISTORY.md) hält frühere v89/v90-Vergleiche fest: GLB-Größe von 99.956.180 auf 90.867.400 Bytes (rund 9,1 % weniger); 7.437.987 Dreiecksecken bytegenau geprüft. Schattenproxies benötigen in diesem Modell rund 22,8 MB zusätzliche Geometriebuffer. Schattenbündelung und Transmission-Culling sparten in drei Perspektiven 475/420/461 Draw Calls (13,8/11,9/13,3 %) bei damals pixelgleichen Bildern.

Diese Zahlen sind historische, modellabhängige Messungen, keine neue Messreihe dieses Dokumentationslaufs und keine garantierte FPS-Steigerung. Aktuelle Unit-Tests prüfen die funktionalen Eigenschaften mit Testdaten. Erneute visuelle Messungen erfordern die jeweiligen lokalen GLBs und einen Browser/GPU-Prüflauf.

## Architektur und Wartung

| Aufgabe | Einstieg im Quellcode |
| --- | --- |
| Szenenaufbau und Laufzeitintegration | `src/pages/Dashboard/Dashboard.tsx`, `src/babylon/SceneManager.ts`, `ModelLoader.ts` |
| Import, Zuordnung, Persistenz | `src/services/floorplanImport.ts`, `floorplanMatching.ts`, `floorplanReassignment.ts`, `configApi.ts`, `storageApi.ts` |
| Licht und Modellzustände | `src/babylon/FloorplanBindings.ts`, `FloorplanLighting.ts`, `src/services/lightClusters.ts`, `hueSync.ts` |
| Türen, Geräte, Kamera | `src/babylon/DoorAnimation.ts`, `ApplianceAnimation.ts`, `RoomDoors.ts`, `WalkthroughCamera.ts` |
| HA und Verläufe | `src/services/haWebSocket.ts`, `haHistoryApi.ts`, `src/utils/graphGeometry.ts` |
| Medien | `src/services/tvMedia.ts`, `src/babylon/TVMediaScreen.ts`, `LivingRoomTVDisplay.ts` |
| Build und Hosting | `vite.config.ts`, `3dash-addon/Dockerfile`, `3dash-addon/nginx.conf` |

Konfiguration und Einstellungen werden in `localStorage`, Binärassets in `IndexedDB` gespeichert. Wechsel von Origin oder Browser trennt diese Datenbestände. Vor Modellwechseln und Umzügen ZIP- sowie Zuordnungsbackup exportieren. Lokale IndexedDB-Sicherungsschlüssel aus früheren Modellarbeiten sind keine versionskontrollierten Backups.

## Historische Validierung am 27.09.2026

Ausgeführt mit Node.js 26.10.0 / npm 12.0.2:

| Prüfung | Ergebnis / Abdeckung |
| --- | --- |
| `npm run typecheck` | Erfolgreich, keine TypeScript-Fehler |
| `npm run test:floorplan` | 28 erfolgreich: Import, Matching, persistente Zuordnung, Lichtgruppen, Hue Sync |
| `npm run test:media` | 9 erfolgreich: Quellenwechsel, Status, Fortschritt und erlaubte Bildquellen |
| `npm run test:lighting` | 27 erfolgreich: Türen, Geräte, Licht, Persistenz, Marker und Renderzustände |
| `npm run test:performance` | 15 erfolgreich: Cache, Graphen, Icons, Instanzen, Schatten, Transmission und GLB |
| `npm run test:walkthrough` | 3 erfolgreich: Türen, Moduswechsel, Kollisionen und Wiederherstellung der Kamera |

Damit sind 82 automatisierte Tests erfolgreich. Unter Node 26 melden einzelne Testläufe eine experimentelle `localStorage`-Warnung; die Prüfungen bestehen trotzdem. Beide Produktionsbuilds (`npm run build` und `npm run build -- --mode addon`) sind ebenfalls erfolgreich. Vite meldet große Chunks und Browserslist veraltete Browserdaten; das sind verbleibende Build-Hinweise, keine Build-Fehler.

Zusätzliche `tools/*.test.mjs` und `tools/*-qa.html` prüfen bestimmte Modellversionen oder visuelle Abläufe. Sie sind nicht alle Bestandteil der fünf npm-Testgruppen und benötigen teilweise Dateien aus `../blender/` oder `.qa/`. Die QA-Seiten werden über den Vite-Entwicklungsserver geöffnet, etwa `/HomeTwin3D/tools/tv-media-qa.html`; sie sind nicht Bestandteil des Produktionsbuilds. Manche Seiten bieten einen ausdrücklichen Importknopf, der lokale Browserdaten verändert.

In diesem Lauf wurden weder echte Geräte geschaltet noch HA/Add-on-Deployment oder eine neue visuelle GPU-Prüfung durchgeführt. Modellhistorie und Reproduktionsskripte stehen in [docs/MODEL_HISTORY.md](docs/MODEL_HISTORY.md).

## Bekannte Grenzen und nächste sinnvolle Arbeiten

- Das eigenständige HomeTwin3D-Add-on vor einem produktiven Umzug testen; ein bestehendes 3Dash-Add-on wird nicht automatisch ersetzt.
- Installationsspezifische Hue-/TV-Entities, Proxyziele und Modellkennungen bei Übernahme in andere Haushalte anpassen; sie werden nicht vollständig automatisch erkannt.
- Individuelle Blender-Quellen und GLBs separat sichern und verteilen; ein Clone stellt sie nicht wieder her.
- GPU-Kosten großer Modelle und der Schattenproxies auf den tatsächlichen Zielgeräten messen. Die dokumentierten Draw-Call-Gewinne ersetzen keine Prüfung auf schwächeren Tablets.
- WebSocket-Verbindung, Medienproxy und Cache-Verhalten nach einer tatsächlichen Bereitstellung separat prüfen. Der erfolgreiche Build bestätigt keine laufende Installation.
