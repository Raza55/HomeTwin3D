# Änderungsverlauf

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
