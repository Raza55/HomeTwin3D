# Hinweise für Mitwirkende und Agenten

Einstieg für Folgearbeiten am Code. Regeln für Veröffentlichungen: [AGENTS.md](../AGENTS.md) und
[Veröffentlichungsregeln](PUBLICATION_PRIVACY.md). Funktionsüberblick: [Funktionen, Grenzen und Technik](../PROJECT_STATUS.md).

Vor jeder Arbeit `git status`, `origin/main` und die Version in `3dash-addon/config.yaml` prüfen; andere Mitwirkende und
Agenten veröffentlichen parallel.

## Release-Ablauf

1. App ändern, passende Tests und beide Builds ausführen (`npm run build`, `npm run build -- --mode addon`).
2. Für einen **App-Release** die Version in `3dash-addon/config.yaml` erhöhen und einen Eintrag in `CHANGELOG.md` ergänzen.
   Reine Dokumentation braucht keine neue Version.
3. Commit erstellen, `npm run privacy:check` ausführen. Den Pre-Push-Hook nicht umgehen.
4. Regulär nach `origin/main` pushen, kein Force-Push.
5. `.github/workflows/addon-image.yml` baut bei Änderungen unter `3dash-addon/**` die Images für `amd64` und `aarch64` und
   veröffentlicht sie in GHCR (`ghcr.io/raza55/{arch}-addon-hometwin3d`). Ohne Versionserhöhung gibt es kein Update.
6. Workflows „Add-on images“ und „Validate HomeTwin3D“ abwarten. Danach bietet Home Assistant das Update an
   (`check_updates`, dann `update`).

Der Add-on-Build verwendet relative Asset-Pfade, `VITE_HA_WS_PROXY=1` und `HOMETWIN_NO_SERVICE_WORKER=1`. Nginx mit den festen
HA-Proxy-Pfaden ist Teil desselben Images. Gemeinsame Daten liegen im Add-on-Konfigurationsordner, nicht in Git.

## Einstiegspunkte im Code

| Bereich | Dateien | Tests |
| --- | --- | --- |
| Gemeinsame Version | `src/services/sharedStore.ts` (serialisierte Übertragungen, Web Lock `hometwin-shared-transfer`, Vormerkung per Änderungsstempel), `storageApi.ts` (`replaceAssets()` in einer IndexedDB-Transaktion) | `npm run test:shared` |
| HA-Zustände | `src/pages/Dashboard/Dashboard.tsx`, `src/utils/entityIndex.ts` (Index Entity → Geräte, Render nur für relevante Entities) | `npm run test:performance` |
| Installationswerte | `src/services/installationConfig.ts` (Beispiel-Entities → eigene Entities, Standort) | – |
| Tagesdemo | `src/services/dayDemo/`: `story.ts` (Kapitel, Tempo, Shots, Markierungen), `engine.ts` (Aktionen auf eine simulierte HA-Verbindung), `controller.ts` (Uhr, Kamera, Benchmark), `shots.ts`, `cast.ts` (Rollen aus dem Modell), `energyDemo.ts`; Fingerbedienung `src/components/DayDemo/boardTouch.ts` | `npm run test:daydemo` |
| Energiefluss | `src/services/energyFlow.ts`, `src/babylon/EnergyFlowLayer.ts`, `src/components/EnergyFlow/EnergyFlowView.tsx` | `npm run test:energy` |
| Tiere draußen | `src/babylon/Wildlife.ts`; Hindernisse und Landeplätze aus `ParkEnvironment.ts`/`CourtyardDetails.ts` | – |
| Markierungsfilter | `MarkerCategory` in `src/babylon/MarkerLayer.ts`, `useMapMarkers.ts`, `scene.metadata.markerCategories` | – |
| Diagnose | `src/babylon/PerfOverlay.ts` (`?perf`: FPS, CPU-Zeit, p95, Draw Calls) | – |

Neue Demo-Kapitel brauchen mindestens 5 s Echtzeit (Test) und verschieben die normierte Tagesdauer.

## Erkenntnisse zur Leistung

- Durchsichtige Modelle: `forceDepthWrite` statt `needDepthPrePass`; der Vorlauf ließ Babylon jedes Teilnetz zweimal pro Bild
  prüfen.
- Schattenkarten verteilt neu berechnen (`ShadowRange.requestShadowRefresh`), dunkle Lampen warten.
- Spiegel (`MirrorProbes`) rendern eine Würfelseite pro Bild.
- Verdeckungsbäume der Marker (`OcclusionBVHCache`) am Geometrie-Inhalt festmachen, damit Texturwechsel sie nicht neu bauen.
- Texturen nicht vor dem Demostart zur Shader-Vorbereitung umschalten: Bei dunklen Lampen beleuchten diese danach weniger
  Flächen.
- Leistung immer mit eingeklapptem Seitenpanel und auf dem Zielgerät messen; NullEngine-Tests ersetzen keine GPU-Messung.

## Offene Grenzen

- Die gemeinsame Version ist kein atomarer Serverspeicher: Das Nginx/DAV-Protokoll hat kein Compare-and-Swap, Modell und
  Objekte werden unter festen Dateinamen ersetzt, bevor `state.json` erscheint. Gleichzeitig veröffentlichende Geräte können
  kollidieren. Abhilfe wären unveränderliche Asset-Versionen plus serverseitig abgesicherter Manifestwechsel.
- IndexedDB und localStorage bilden keine gemeinsame Transaktion. Erkannte Fehler werden zurückgerollt, ein Abbruch genau
  zwischen beiden Schritten nicht.
- Hue Sync, Wasserleck, TV-Medien und TV Dial hängen an Beispiel-Entities (Installationswerte); eine Zuordnung im Editor fehlt.
- Die Außenumgebung ist auf die Referenzwohnung zugeschnitten.
- Der Babylon-Chunk ist groß (mehrere MB); Vite meldet große Chunks.

## Lokale Artefakte

- `.qa/` enthält Logs, Prüfprogramme und Modellkopien; nicht versioniert.
- Beide Build-Varianten schreiben nach `dist/`. Vor Nutzung eines vorhandenen `dist/` die Variante prüfen.
- Modellarbeit: [Modell-Pipeline](MODEL_PIPELINE.md); das Protokoll der Referenzwohnung liegt privat unter
  `.private/MODEL_HISTORY.md`.
