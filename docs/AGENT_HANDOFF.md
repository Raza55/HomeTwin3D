# Übergabe: HomeTwin3D (aktuell 0.5.48)

## Nachtrag 0.5.10–0.5.48 (02.–03.10.2026)

Vor Arbeiten weiterhin `git status`, `origin/main` und `3dash-addon/config.yaml` prüfen (andere Agenten veröffentlichen parallel).
Release-Ablauf unverändert: Version und CHANGELOG erhöhen, `npm run privacy:check`, nach `main` pushen, die Workflows
„Add-on images“ und „Validate HomeTwin3D“ abwarten, dann in HA `check_updates` und `update`.

**Tagesdemo** (`src/services/dayDemo/`): `story.ts` (Beats, Kapitel, Tempo `PACE`, `DAY_REAL_SECONDS` = 183, Shots, `CHAPTER_FRAMING`,
`CHAPTER_MARKERS`), `engine.ts` (Aktionen auf eine `DemoHAConnection`), `controller.ts` (Uhr, Kamera-Rundflug mit Gebäudeschutz
`clearBeta`, Vorbereitung der Shader, Benchmark), `shots.ts` (Ich-Perspektive), `cast.ts` (Rollen aus dem Modell), `energyDemo.ts`
(synthetisches Energie-Dashboard). Fingerbedienung: `src/components/DayDemo/boardTouch.ts`. Tests: `npm run test:daydemo`.
Jedes Kapitel braucht ≥ 5 s Echtzeit (Test); neue Kapitel verschieben die normierte Tagesdauer.

**Energiefluss**: `src/services/energyFlow.ts` (Verbraucher, Leistungssensoren, Zeiträume, Lampen), `src/babylon/EnergyFlowLayer.ts`
(Platzierung, Röhren, Kugeln), `src/components/EnergyFlow/EnergyFlowView.tsx`. Tests: `npm run test:energy`.

**Tiere draußen**: `src/babylon/Wildlife.ts`; Bäume, Bänke, Hindernisse und Gebäudeumrisse kommen als Metadaten aus
`ParkEnvironment.ts`/`CourtyardDetails.ts`. Thin Instances melden ihre Bewegung selbst (`reportsOwnMotion`, `wildlifeAnimating`).

**Markierungsfilter**: `MarkerCategory` in `src/babylon/MarkerLayer.ts`, Kategorie per `MarkerCategoryScope` (useMapMarkers.ts),
sichtbare Kategorien in `scene.metadata.markerCategories`.

**Performance-Pass 0.5.43** (Messung: Demo-Benchmark, Seitenpanel eingeklappt):
- `setSketchTransparency`: `forceDepthWrite` statt `needDepthPrePass` (der Vorlauf ließ Babylon jedes Teilnetz zweimal pro Bild prüfen).
- `ShadowRange.requestShadowRefresh`: Schattenkarten höchstens 4 (Tablet 2) pro Bild; dunkle Lampen warten.
- `MirrorProbes`: eine Würfelseite pro Bild über `getCustomRenderList`; Tablet ohne Kleinteile.
- `OcclusionBVHCache`: Schlüssel aus dem Geometrie-Inhalt.
- Lehre aus 0.5.46: Texturen vor dem Demostart nicht zur Shader-Vorbereitung umschalten – bei dunklen Lampen beleuchteten diese
  danach weniger Flächen (Hue-Sync-Stimmung fehlte). Der Wechsel im laufenden Demo (Energiekapitel) ist unkritisch und liegt hinter einem Schleier.

**Modell**: v111 (Schreibtisch) per `tools/desk-v111.*` (Eckpunkt-Zuordnung, weil Objekte Material und Boxen teilen); direkt im
Add-on-Stand (Revision 260 via `npm run addon:sync`).

**Dokumentation für Nutzer**: [Erste Schritte](GETTING_STARTED.md), [Energie, Demo, Tiere und Filter](ENERGY_DEMO_WILDLIFE.md).

---

# Übergabe: HomeTwin3D 0.5.9

Stand: **01.10.2026**. Diese Datei dokumentiert die Optimierung und Veröffentlichung dieses Stands. Für spätere Arbeiten zuerst `git status`, den aktuellen Branch, `origin/main`, `package.json` und `3dash-addon/config.yaml` prüfen; Versionsangaben und Messungen hier sind ein Snapshot.

## Veröffentlichter Stand

- Repository: [Raza55/HomeTwin3D](https://github.com/Raza55/HomeTwin3D), Release-Branch `main`.
- Add-on-Version: **0.5.9**. Paketversion der Webapp: **0.2.1**. Diese Nummern sind unabhängig voneinander und von Modellversionen.
- Release-Commit: [`ad1d935e29853c8cf8348983b9561faf3e15ac1f`](https://github.com/Raza55/HomeTwin3D/commit/ad1d935e29853c8cf8348983b9561faf3e15ac1f), Nachricht: `Add-on 0.5.9: robust shared sync and indexed device updates`.
- [Add-on-Image-Build](https://github.com/Raza55/HomeTwin3D/actions/runs/36832556498): erfolgreich für AMD64 und ARM64; beide Versionstags nach Veröffentlichung im Registry geprüft.
- [GitHub-Validierung](https://github.com/Raza55/HomeTwin3D/actions/runs/36832556424): erfolgreich, einschließlich Tests, öffentlichem Build, Add-on-Build und Python-Screenshot-Helfer.
- Images: `ghcr.io/raza55/amd64-addon-hometwin3d:0.5.9` und `ghcr.io/raza55/aarch64-addon-hometwin3d:0.5.9`.

Das Update ist veröffentlicht. Ob der Benutzer 0.5.9 inzwischen auf seiner tatsächlichen Hassio-Installation installiert hat, wurde in diesem Lauf nicht geprüft. Der Benutzer beschreibt den bestehenden GitHub-/Add-on-Ablauf sowie die Laufzeit auf Apple-Geräten als gut funktionierend.

## Auftrag und Entscheidungen

Der Auftrag war, den stark weiterentwickelten Stand zu prüfen, sinnvolle Optimierungen umzusetzen und ihn über den bestehenden Add-on-Ablauf bereitzustellen. Der Schwerpunkt lag auf nachgewiesenen Synchronisierungsfehlern und unnötiger CPU-Arbeit bei HA-Ereignissen. Vorhandene Apple-/WebGL-Einstellungen, Schattenqualität und Modellgeometrie wurden dafür nicht verändert.

Zuerst wurden Fehler mit synthetischen Daten reproduziert. Danach wurden Änderungen samt Regressionstests umgesetzt und lokal geprüft. Auf ausdrücklichen Wunsch des Benutzers wurde der Release nach `main` gepusht; beide GitHub-Workflows wurden bis zum erfolgreichen Abschluss verfolgt.

## Technische Änderungen

### Synchronisierung

Einstieg: `src/services/sharedStore.ts`.

1. **Überlappende Veröffentlichungen:** Zuvor konnten zwei Veröffentlichungen desselben Browsers dieselbe Ausgangsrevision lesen, dieselbe neue Revision erzeugen und in umgekehrter Reihenfolge fertig werden. Dabei konnte die ältere Konfiguration die neuere auf dem Server überschreiben, obwohl beide Aufrufe Erfolg meldeten.
2. **Neue Änderungen während eines Uploads:** Die Vormerkung `shared:pending` wurde zuvor am Ende eines Uploads vollständig gelöscht, auch wenn zwischenzeitlich weitere lokale Änderungen hinzugekommen waren.
3. **Abgebrochener Empfang:** Ein neues Modell wurde zuvor bereits lokal gespeichert, bevor alle zusätzlichen Objekte geladen waren. Ein späterer Downloadfehler konnte neues Modell und alte Konfiguration zurücklassen.

Umsetzung in 0.5.9:

- `transfer()` serialisiert Empfang, Veröffentlichung und explizites Laden der letzten gemeinsamen Version innerhalb einer Modulinstanz. Eine fehlgeschlagene Operation blockiert die Warteschlange nicht dauerhaft.
- Wenn `navigator.locks` verfügbar ist, schützt zusätzlich der originbezogene Web Lock `hometwin-shared-transfer` mehrere Tabs. Ohne diese API bleibt die Warteschlange innerhalb der Modulinstanz wirksam.
- `markSharedChange()` vergibt einen neuen UUID-Stempel in `shared:change`. Ein Upload löscht die Vormerkungen nur, wenn dieser Stempel noch zu seinem Snapshot gehört. Später entstandene Änderungen bleiben für die nächste Übertragung vorgemerkt.
- Der automatische Debounce bleibt bei 1,5 Sekunden. Ein bereits erledigter Debounce veröffentlicht keine weitere identische Revision.
- Empfangene Blobs werden zunächst vollständig geladen. Die Modellgröße wird mit dem Manifest verglichen. Vor lokalen Änderungen werden Manifestrevision, `updatedAt` und der lokale Änderungsstempel erneut geprüft.
- `replaceAssets()` in `src/services/storageApi.ts` schreibt Modell, geänderte Objekte und Löschungen zusammen in einer IndexedDB-Transaktion. Auch synchrone Fehler beim Anlegen der Schreiboperationen brechen diese Transaktion ab.
- Falls die nachfolgende Speicherung der Konfiguration/Metadaten fehlschlägt, werden vorherige Assets und Metadaten wiederhergestellt. Dabei wird auch das bereits geladene Installationsobjekt im Modul zurückgesetzt.
- Modell-/Objektdownloads und PUTs haben jeweils 120 Sekunden Timeout. Manifestabfragen behalten standardmäßig 4 Sekunden. Sehr langsame oder außergewöhnlich große Übertragungen können deshalb einen erneuten Versuch benötigen.
- Der Update-Watcher räumt seinen verzögerten Reload-Timer beim Beenden auf und unterdrückt einen späteren Reload nach seiner Entsorgung.

Bestehende Speicherkennungen, IndexedDB-Datenbankversion und das gemeinsame Datenformat `format: 1` bleiben erhalten. Es gibt keine neue Migration. Schreib-PIN und HA-Zugangsdaten werden nicht in den öffentlichen Build eingebettet.

### CPU-Arbeit bei HA-Updates

Einstieg: `src/pages/Dashboard/Dashboard.tsx`, Hilfsfunktion `src/utils/entityIndex.ts`.

- `indexByEntity()` erzeugt einen Index von Entity-ID auf alle zugehörigen Geräte-Einträge. Mehrere Geräte mit derselben Entity bleiben erhalten; Einträge ohne Entity werden ausgelassen.
- `rebuildEntityIndexes()` baut diesen Index mit den anderen Dashboard-Indizes neu auf. Sowohl einzelne Zustandsereignisse als auch der Empfang aller Anfangszustände verwenden ihn.
- Dadurch entfällt die bisherige Schleife über sämtliche Smart Devices für jeden empfangenen HA-Zustand.
- `requestRender()` wird bei Zustandsereignissen nur für konfigurierte Entities, registrierte Display-Abhängigkeiten oder Hue-Sync-Steuerung angefordert. Eine beliebige unzugeordnete Lampe, ein Rollo oder Mediengerät weckt die Szene nicht allein aufgrund seiner Domain.
- Der vollständige HA-Zustandsbestand wird weiterhin geführt; die Filterung betrifft den zusätzlichen Renderauftrag, nicht den Empfang von HA-Zuständen.

### Start und Diagnose

- `src/main.tsx` zeigt während des anfänglichen gemeinsamen Abgleichs eine Ladeanzeige.
- Die lazy geladenen Seiten in `src/App.tsx` verwenden dieselbe Anzeige statt einer leeren Suspense-Ausgabe. Gestaltung: `src/App.css`, mit der Textfarbe des jeweiligen Themes.
- `src/babylon/PerfOverlay.ts` zeigt unter `?perf` zusätzlich das 95. Perzentil der CPU-Framezeiten. Die Stichprobe ist auf 512 Werte pro Messfenster begrenzt und existiert nur bei aktivierter Diagnoseanzeige.
- Der Abstand zwischen gerenderten Frames heißt dort `gap`. Er enthält auch beabsichtigte Renderpausen und darf nicht pauschal als Ruckler interpretiert werden. CPU/p95 sind keine direkten GPU-Zeitmessungen.

## Prüfnachweise

### Automatisierte Prüfungen

| Suite | Erfolgreiche Tests |
| --- | ---: |
| Datenschutz | 2 |
| Floorplan / Matching / Lichtgruppen / Hue Sync | 28 |
| Balkon | 3 |
| Kaffee | 4 |
| IT | 5 |
| Echo | 3 |
| Batterie | 2 |
| TV Dial | 2 |
| Medien | 10 |
| Beleuchtung | 36 |
| Performance | 38 |
| Walkthrough | 3 |
| Gemeinsame Installation | 9 |
| **JS-/TS-Gesamt** | **145** |

Zusätzlich bestanden die **5 Python-Tests** des Screenshot-Helfers in GitHub CI. Typecheck, beide Build-Varianten und die Datenschutzprüfung bestanden lokal und in CI. Der veröffentlichte Commit wurde erneut geprüft; der Pre-Push-Hook blieb aktiv.

Neue Regressionstests liegen in `tools/shared-sync.test.ts` und `tools/data-performance.test.ts`. Sie prüfen insbesondere:

- Reihenfolge überlappender Uploads, Erhalt neuer Vormerkungen und Ausbleiben eines überflüssigen Debounce-Uploads;
- Erhalt des vorherigen Modells, seiner Objekte und Konfiguration bei einem fehlgeschlagenen Objektdownload;
- Abbruch vor lokalen Änderungen, wenn sich das Manifest während des Downloads ändert;
- Zurückweisung eines zu kurzen Modells sowie Rollback und erneuten Versuch nach einem localStorage-Fehler;
- Wiederherstellung des Installationsobjekts im Speicher;
- mehrere Ziele je Entity sowie Entfernung alter Ziele beim Neuaufbau des Entity-Index.

`tools/mocks/storage-memory.ts` bildet die neue Asset-Schreibschnittstelle für die Node-Tests ab. Zusätzlich wurde `replaceAssets()` mit **echter IndexedDB im Browser** geprüft: Ein künstlicher Schreibfehler nach bereits vorgemerkten Änderungen erhielt das alte Modell und das alte Objekt; ein anschließender vollständiger Schreibvorgang war erfolgreich. Dieser manuelle Browsercheck ist kein zusätzlicher CI-Test.

### Performance-Messungen und Grenzen

| Messung | Beobachtung |
| --- | --- |
| Synthetische Gerätesuche, 10.000 HA-Zustände / 500 Geräte, Median aus 7 Läufen nach Aufwärmen | vorher ca. 12,6 ms, danach ca. 0,22 ms; dieselben 500 Ziele |
| Browser-Simulation vor der Änderung | ca. 30 FPS, ca. 1,3 ms CPU pro gerendertem Frame, ca. 171 Draw Calls |
| Abschließende Browser-Simulation des Add-on-Builds, fünf Messfenster | 29,5–30,5 FPS, 1,0–1,4 ms CPU, p95 1,4–2,0 ms, 171–174 Draw Calls |

Die Browsermessungen liefen unter Chromium/Windows mit WebGL auf einer NVIDIA RTX 5090 bei 1630 × 720 Renderauflösung und mit dem öffentlichen Simulationsmodell. Die wechselnden Simulationszustände machen Draw Calls und CPU-Zeit variabel. Daraus folgt weder ein allgemeiner Faktor für die gesamte App noch ein nachgewiesener FPS-Gewinn für das reale Wohnungsmodell.

Es wurde **kein neuer Test auf echter Apple-Hardware** und keine Prüfung der realen Hassio-Installation durchgeführt. Es wurden keine realen Geräte geschaltet, keine private Wohnung geändert und keine echten Desktop-/Kamerabilder aufgenommen oder veröffentlicht.

Der Babylon-Chunk bleibt groß: im Add-on-Build etwa 8,09 MB, gzip etwa 1,76 MB. Eine umfassende Änderung der Babylon-Imports oder des Chunkings wurde bewusst nicht Bestandteil dieses Releases. Die funktionierenden Render- und Apple-Einstellungen bleiben bestehen.

## Verbleibende Grenzen für Folgearbeiten

- Die Serialisierung ist **kein serverseitiger Schreibschutz zwischen unterschiedlichen Geräten**. Das unveränderte Nginx/DAV-Protokoll besitzt keinen atomaren Compare-and-Swap für die Manifestrevision. Exakt gleichzeitig veröffentlichende Geräte können weiter kollidieren. Das nicht als vollständig gelöst dokumentieren.
- Modell und Objekte werden auf dem Server weiterhin unter festen Dateinamen ersetzt, bevor `state.json` veröffentlicht wird. Die erneute Manifestprüfung beim Empfang reduziert Inkonsistenzen, liefert aber keine Garantie für einen atomaren Snapshot mehrerer Serverdateien. Dafür wären etwa unveränderliche Asset-Versionen plus ein serverseitig abgesicherter Manifestwechsel nötig.
- IndexedDB und localStorage bilden zusammen keine gemeinsame Datenbanktransaktion. Der neue Rollback behandelt erkannte Fehler; ein Browser-/OS-Abbruch genau zwischen Asset-Commit und Metadatenspeicherung ist nicht vollständig abgesichert.
- Die Ladeanzeige hat keinen separaten Abbrechen-Knopf. Die einzelnen Übertragungen sind zeitlich begrenzt; bei vielen großen Objekten kann der komplette Start trotzdem länger dauern.
- Die meisten Performance-Tests verwenden Babylon NullEngine und synthetische Daten. Sie ersetzen keine GPU-/Safari-Messung mit dem tatsächlichen Wohnungsmodell.
- Große Vite-Chunks und veraltete Browserslist-Daten bleiben Build-Hinweise. In GitHub erschienen außerdem Hinweise zu älteren Action-Versionen mit Node-20-Ziel sowie dem bevorstehenden Wechsel von `ubuntu-latest`; beide Release-Workflows waren erfolgreich. Änderungen daran separat prüfen.

## Bestehender Add-on-Release-Ablauf

1. [AGENTS.md](../AGENTS.md) und [Veröffentlichungsregeln](PUBLICATION_PRIVACY.md) lesen. Private Installation, Modelle und Zugangsdaten bleiben außerhalb von Git.
2. App ändern, passende Tests und öffentliche Builds ausführen. Für einen **neuen App-Release** Add-on-Version in `3dash-addon/config.yaml` und Eintrag in `CHANGELOG.md` erhöhen. Reine Dokumentation braucht keine neue Add-on-Version.
3. Commit erstellen und `npm run privacy:check` auf dem zu veröffentlichenden Commit ausführen. Pre-Push-Hook aktiv lassen.
4. Für eine autorisierte Veröffentlichung regulär nach `origin/main` pushen. Kein Force-Push und kein Umgehen der Prüfungen.
5. `.github/workflows/addon-image.yml` startet auf `main`, wenn `3dash-addon/**` oder der Workflow geändert wurde. Ein App-Code-Push allein ohne Versionserhöhung in diesem Pfad erzeugt **kein neues Update-Image**. Eine reine Dokumentationsänderung außerhalb dieser Pfade startet den Image-Build ebenfalls nicht.
6. Der Dockerfile baut die Webapp nativ auf der Buildmaschine. CI übergibt den genauen Commit als `SOURCE_REF`; die Laufzeitimages entstehen für `amd64` und `aarch64` und werden nach GHCR veröffentlicht. `config.yaml` verweist auf diese fertigen Images; Hassio muss die Webapp nicht selbst bauen.
7. Beide Architektur-Jobs und den Validierungsworkflow bis zum Ergebnis prüfen. Bei Bedarf Versionstags mit `docker buildx imagetools inspect` prüfen.
8. Der Benutzer aktualisiert das bereits installierte HomeTwin3D-Add-on in Home Assistant. Git-Push allein ersetzt die laufende Installation nicht.

Der Add-on-Build verwendet relative Asset-Pfade, `VITE_HA_WS_PROXY=1` und `HOMETWIN_NO_SERVICE_WORKER=1`. Nginx und seine festen HA-Proxy-Pfade bleiben Teil desselben Images. Shared-Daten liegen im Add-on-Konfigurationsverzeichnis und werden nicht durch Git ersetzt. Details: [Add-on-Dokumentation](../3dash-addon/DOCS.md).

## Wiedereinstieg und lokale Artefakte

- Für die Implementierung: zuerst `sharedStore.ts`, `storageApi.ts`, Dashboard-Indizes und ihre oben genannten Tests lesen.
- Für Releases: `3dash-addon/config.yaml`, `3dash-addon/Dockerfile`, `.github/workflows/addon-image.yml` und `.github/workflows/ci.yml` lesen.
- `.qa/` enthält lokal die Test-/Build-Logs und temporäre Prüfprogramme. Diese Dateien werden nicht versioniert und können in einem anderen Clone fehlen; die Regressionstests und GitHub-Nachweise sind die dauerhaften Referenzen.
- Die beiden Build-Varianten überschreiben normalerweise dasselbe `dist/`. Bei Abschluss der Optimierung enthielt `dist/` den Add-on-Build; der letzte öffentliche Vergleichsbuild lag unter `.qa/public-dist/`. Vor Nutzung eines vorhandenen `dist/` immer seine Build-Variante prüfen.
- Der temporäre lokale QA-Server wurde beendet. Keine persönliche Konfiguration wurde als Demo veröffentlicht.
- Die lokale Arbeit lag zwischenzeitlich auf `perf/render-optimizations`. Zur Veröffentlichung wurde der ältere lokale `main` ohne Konflikte auf den Release fast-forwarded. Remote `main` erhielt dabei nur den neuen Release-Commit; die vorherigen Remote-Commits wurden nicht neu veröffentlicht oder überschrieben.

Weiterer Projektkontext: [Projektstand](../PROJECT_STATUS.md), [Änderungsverlauf](../CHANGELOG.md), [Modellpipeline](MODEL_PIPELINE.md), [Geräte und Warnungen](DEVICES_AND_ALERTS.md).
