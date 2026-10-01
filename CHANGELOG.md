# Änderungsverlauf

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
