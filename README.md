# HomeTwin3D

**Dein Zuhause als interaktives 3D-Dashboard für Home Assistant.**

HomeTwin3D verbindet einen eigenen 3D-Grundriss mit den Geräten und Zuständen deines Smart Homes. Du kannst durch die Wohnung gehen, Leuchten und Rollos direkt am Modell bedienen und Türkontakte, Haushaltsgeräte sowie Medieninformationen an ihrem räumlichen Platz sehen. Es läuft als **Home-Assistant-Add-on**; das 3D-Board selbst läuft im Browser – auf aktuellen iPads und Samsung-Tablets ebenso wie auf Windows-PCs – und eignet sich als Wand-Dashboard.

**Ausprobieren ohne Einrichtung:** `…/?daydemo` spielt einen simulierten Tag im Zeitraffer – vom Lichtwecker über Kaffee, Gewitter und Kochen bis zum Videoabend mit Hue-Sync-Licht und dem Energiefluss der Woche. **Eigenes Zuhause:** Wohnung in Blender modellieren, mit der mitgelieferten Erweiterung exportieren, im Assistenten verbinden und zuordnen – Schritt für Schritt in [Erste Schritte](docs/GETTING_STARTED.md).

Das Projekt wird von **Raza55** unabhängig weiterentwickelt. Es entstand aus [3Dash von Kdcius und seinen Mitwirkenden](https://github.com/Kdcius/3Dash_webapp). Die Apache-2.0-Lizenz und die ursprünglichen Autorenhinweise bleiben erhalten. Dieses Repository beginnt aus Datenschutzgründen mit einem bereinigten Quelltext-Snapshot ohne die frühere Git-Historie. Einzelheiten: [Herkunft und Danksagung](ORIGIN.md).

> **Entwicklungsstand:** Add-on 0.5.49 · Webapp-Paket 0.2.1 · Stand 03.10.2026. HomeTwin3D wächst aus einer konkreten Wohnungsinstallation heraus. Einige Hue-/TV-Zuordnungen, Standortwerte und Modellwerkzeuge sind noch installationsspezifisch. Diese Stellen sind in der [technischen Dokumentation](PROJECT_STATUS.md) beschrieben. Die [Agentenübergabe](docs/AGENT_HANDOFF.md) dokumentiert den aktuellen Release, seine Prüfungen und Grenzen.

## Was HomeTwin3D kann

- **Dein eigener Grundriss:** GLB-Modelle importieren und zur Laufzeit austauschen, Räume bearbeiten, zusätzliche Objekte platzieren und Modellteile verschieben, drehen oder skalieren.
- **Blender als Arbeitsgrundlage:** Export mit stabilen Gerätekennungen, Lichtquellen und Animationen. Ein visueller Assistent verbindet Modellobjekte mit Home-Assistant-Entities; Zuordnungen bleiben bei passenden Reimporten erhalten.
- **Licht direkt im Raum:** Schalten, Dimmen, Farbe und Farbtemperatur, einzelne und gruppierte Leuchten, kalibrierbare Lichtwirkung und Hue-Sync-Statusanzeige.
- **Rollos und Öffnungen:** Rollo-Positionen und Raumaktionen, animierte Tür-/Fensterkontakte, Öffnungsdauer und getrennte Anzeige des Haustürschlosses.
- **Begehbare Wohnung:** Orbit-, Walk- und Flugmodus mit lokal bedienbaren Innentüren.
- **Neue Gerätebedienung:** Lüfter mit Prozentsteuerung, Echo-Mediengeräte, Kaffeeprogramm mit explizitem Start/Stopp sowie PC-/Serverstatus mit konfigurierbaren Aktionen.
- **Warnungen am richtigen Ort:** Wasserleckmarker und gerätebezogene Batteriewarnungen.
- **Geräte und Medien:** Waschmaschinen-/Trockneranimationen, Programm-/Restzeitsensoren und TV-Anzeigen mit Quellenwahl, SHIELD-Metadaten, Fortschritt sowie optionalen ADB-Screenshots.
- **Lebendige Umgebung:** Sonnenstand, Tag/Nacht, Wettereffekte, Spiegel und eine prozedurale Außenumgebung – optional mit einer Hofkatze und Vögeln, die auf Wetter und Tageszeit reagieren.
- **Energiefluss:** Die Verbraucher aus dem HA-Energie-Dashboard als leuchtende Linien und Kugeln am Modell, mit Anteilen pro Raum, Live-Leistung und Verbrauch von heute bis zum Jahr; Lampen ohne Messung über PowerCalc.
- **Übersichtlich bleiben:** Markierungsfilter nach Licht, Rollos, Lüftung, Türen & Fenster, Geräten und Medien.
- **Tagesdemo und Benchmark:** Ein vollständiger Tag mit Kamerafahrten, Bedienung per Fingertipp auf die eigenen Popups und einer Leistungsmessung am Ende – auch mit dem eigenen Modell.
- **Anpassbares Dashboard:** Status-, Skript- und Diagrammkarten, deutsche/englische Oberfläche, Themes, Demo-Modus, gemeinsame Version für alle Geräte und installierbare PWA.

Die Darstellung verwendet Echtzeit-Näherungen. TV-Screenshots sind kein HDMI-Livestream; Tür-Kippstellungen können als Annahme dargestellt werden. Details und Grenzen stehen in [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Beispielbilder

Aufnahmen aus den lokalen QA-Simulationen vom 28.09.2026. Die Zustände sind simuliert; die Bilder zeigen das individuelle Beispielmodell, das nicht im Repository enthalten ist. Keine echten Desktop-Screenshots. [Bildnachweise und zugehörige Prüfseiten](docs/images/README.md).

**Grundriss mit simulierten Batteriewarnungen**

![3D-Grundriss mit gerätebezogenen Batteriewarnungen](docs/images/floorplan-battery-warnings.png)

**Kaffeeprogramm mit Status, Restzeit und Stopp-Aktion**

![Simulierte Kaffeemaschinensteuerung im 3D-Raum](docs/images/coffee-controls.png)


## Schnellstart

Voraussetzung: **Node.js 22.18 oder neuer** und npm.

```bash
git clone https://github.com/Raza55/HomeTwin3D.git
cd HomeTwin3D
npm ci
npm run dev
```

Öffne **http://127.0.0.1:5187/HomeTwin3D/**. Der Entwicklungsserver verwendet fest Port 5187 und weicht bei einem belegten Port nicht automatisch aus. Modell und Gerätezuordnungen werden pro Browser und Adresse gespeichert: Ein anderer Port oder `localhost` statt `127.0.0.1` verwendet einen separaten Datenbestand. Starte bei einer neuen Installation mit dem Demo-Modus oder verbinde im Einrichtungsassistenten deine Home-Assistant-Instanz und importiere ein eigenes GLB.

Das Repository enthält ein Simulationsmodell. Die persönliche Wohnung samt Blender-Quellen ist nicht enthalten. Einige historische Blender-Skripte setzen lokale Dateien und Pfade voraus; sie sind Beispiele der bisherigen Modellarbeit und keine universellen Installationsschritte.

## Selbst hosten

```bash
npm run build                  # dist/, für /HomeTwin3D/
npm run build -- --mode addon  # dist/, mit relativen Asset-Pfaden
npm run preview                # zuletzt gebauten Stand ansehen
```

Stelle `dist/` mit einem statischen Webserver bereit. Beide Build-Varianten schreiben in dasselbe Verzeichnis. Für Live-Funktionen muss Home Assistant vom Browser erreichbar sein; bei HTTPS ist eine passende sichere WebSocket-Verbindung erforderlich.

### Home-Assistant-Add-on

Füge `https://github.com/Raza55/HomeTwin3D` unter **Einstellungen → Add-ons → Add-on Store → Repositories** hinzu. Das Repository liefert ein eigenes Add-on **HomeTwin3D** mit der Kennung `hometwin3d`. Der Dockerfile baut den `main`-Branch dieses Projekts.

Die Oberfläche verwendet standardmäßig Port **8099**. Falls das bisherige 3Dash-Add-on parallel läuft, benötigt eines der Add-ons einen anderen Host-Port. Ein bestehendes 3Dash-Add-on wird nicht automatisch ersetzt. Anleitung: [Add-on-Dokumentation](3dash-addon/DOCS.md).

Ein Repository-Push installiert kein Add-on-Update. Der Docker-/Supervisor-Betrieb muss auf der Zielinstallation separat geprüft werden.

### TV-Bilder und GitHub Pages

Der Add-on-Nginx enthält einen HA-Medienproxy. Für lokale Entwicklung lässt sich dessen Ziel über `HA_MEDIA_PROXY_TARGET` in `.env.local` konfigurieren. Der aktuelle Standard ist installationsspezifisch; siehe [TV- und Proxy-Dokumentation](PROJECT_STATUS.md#tv-medien-und-proxy).

Ein GitHub-Pages-Workflow liegt bei, wird aber erst manuell über **Actions → Deploy to GitHub Pages** ausgeführt. Zuvor muss Pages im Repository für GitHub Actions eingerichtet sein. Es wird keine bereits veröffentlichte Demo vorausgesetzt.

## Datenschutz bei Veröffentlichungen

Öffentliche Beispiele enthalten neutrale Gerätekennungen; persönliche Defaults bleiben in einer ignorierten lokalen Konfiguration. Vor jedem Push gilt die [Veröffentlichungsprüfung](docs/PUBLICATION_PRIVACY.md). In einem neuen Clone einmal `npm run privacy:install` ausführen. Normale Produktionsbuilds enthalten keine privaten lokalen Defaults.

## Daten und Sicherung

Einstellungen und Gerätezuordnungen liegen in `localStorage`, Modelle und Objektdateien in `IndexedDB`. Diese Daten gehören zum jeweiligen Browser und zur jeweiligen Origin. Vor einem Wechsel von Host, Port oder Browser die Konfiguration als ZIP und bei Bedarf die Gerätezuordnungen separat exportieren.

Git enthält den App-Quellcode, keine persönliche HA-Konfiguration und keine lokalen Wohnungsdateien. Bestehende Speicher- und Blender-Manifestkennungen bleiben aus Kompatibilitätsgründen erhalten; nicht jede interne Bezeichnung wurde umbenannt.

## Entwicklung und Prüfungen

```bash
npm run privacy:check
npm run test:privacy
npm run typecheck
npm run test:floorplan
npm run test:media
npm run test:balcony
npm run test:echo
npm run test:coffee
npm run test:it
npm run test:battery
npm run test:tv-dial
npm run test:lighting
npm run test:performance
npm run test:walkthrough
npm run test:shared
npm run test:daydemo
npm run test:energy
npm run build
npm run build -- --mode addon
```

Der Stand 0.5.49 besteht 186 JavaScript-/TypeScript-Tests sowie 5 Python-Tests des optionalen Screenshot-Helfers. Der CI-Workflow prüft diese Schritte bei Änderungen auf `main` und bei Pull Requests. Die Tests laufen mit synthetischen Daten und benötigen keine echte HA-Installation. Modellabhängige Zusatztests und visuelle QA-Seiten sind in [BLENDER_WORKFLOW.md](BLENDER_WORKFLOW.md) beschrieben; die aktuellen Prüfnachweise und Messbedingungen stehen in der [Agentenübergabe](docs/AGENT_HANDOFF.md).

Technik: **React 18 · TypeScript · Babylon.js 9.28 · Vite 6 · Home Assistant WebSocket API**.

| Verzeichnis | Inhalt |
| --- | --- |
| `src/babylon/` | Szene, Licht, Animationen, Navigation, Umgebung |
| `src/components/`, `src/pages/` | Bedienoberfläche, Dashboard, Editor und Onboarding |
| `src/services/` | HA-Verbindung, Import, Zuordnungen, Speicherung und Medien |
| `tools/` | Tests, QA-Seiten und Blender-/GLB-Werkzeuge |
| `public/` | Simulationsmodell, Schriften, Icons und PWA-Manifeste |
| `3dash-addon/` | HomeTwin3D-Add-on; historischer Verzeichnisname |

## Dokumentation

- [Erste Schritte: Installation, Demo, eigenes Blender-Modell, Zuordnen und Anpassen](docs/GETTING_STARTED.md)
- [Energiefluss, Tagesdemo, Tiere draußen und Markierungsfilter](docs/ENERGY_DEMO_WILDLIFE.md)
- [Agentenübergabe: aktueller Stand, Änderungen, Prüfungen und Folgearbeiten](docs/AGENT_HANDOFF.md)
- [Projektstand, wichtige Funktionen und Performance-Optimierungen](PROJECT_STATUS.md)
- [Neue Geräte, Warnungen, TV Dial und PC-Screenshots](docs/DEVICES_AND_ALERTS.md)
- [Optionaler Windows-/MQTT-Screenshot-Helfer](tools/pc-screen/README.md)
- [Blender-Workflow und Modellhistorie](BLENDER_WORKFLOW.md)
- [Änderungsverlauf](CHANGELOG.md)
- [Herkunft, Ausgangscommits und Weiterentwicklung](ORIGIN.md)
- [Historische Erweiterungen des früheren Forks](FORK_CHANGES.md) · [English](FORK_CHANGES.en.md)

Fehlerberichte und Vorschläge: [HomeTwin3D Issues](https://github.com/Raza55/HomeTwin3D/issues).

## KI-Unterstützung

Bei der Weiterentwicklung von HomeTwin3D wurde OpenAI Codex mit GPT-Modellen für Code, Dokumentation und Testarbeiten eingesetzt. Die Projektverantwortung liegt bei Raza55. Die Erwähnung bedeutet keine offizielle Beteiligung oder Unterstützung durch OpenAI.

## Lizenz und Herkunft

HomeTwin3D wird unter der **[Apache License 2.0](LICENSE)** veröffentlicht. Die ursprüngliche Arbeit von Kdcius und den 3Dash-Mitwirkenden bildet die Grundlage. HomeTwin3D ist eine eigenständig gepflegte Weiterentwicklung und wird nicht als offizielles Projekt des ursprünglichen Autors dargestellt. Siehe auch [NOTICE](NOTICE) und [ORIGIN.md](ORIGIN.md).
