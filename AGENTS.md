# Regeln für Arbeiten an HomeTwin3D

## Einstieg und Übergabe

Vor Folgearbeiten [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) lesen. Dort stehen der veröffentlichte Stand 0.5.9, die Änderungen vom 01.10.2026, Prüfnachweise, Grenzen und der bestehende GitHub-/Hassio-Release-Ablauf. Die Übergabe ist ein datierter Snapshot: vor Änderungen aktuellen Branch, Arbeitsbaum, Remote und Add-on-Version prüfen. [PROJECT_STATUS.md](PROJECT_STATUS.md) und [CHANGELOG.md](CHANGELOG.md) ergänzen den Überblick.

## Vor jeder Veröffentlichung verpflichtend

Dieses Repository ist öffentlich. Lies [docs/PUBLICATION_PRIVACY.md](docs/PUBLICATION_PRIVACY.md), bevor du Änderungen synchronisierst, pushst oder neue Bilder/Beispieldaten veröffentlichst.

- Persönliche Namen, Wohnadresse, reale Koordinaten, LAN-Adressen, private Hostnamen, Serien-/MAC-Adressen und konkrete private Gerätekennungen gehören nicht in Git-Dateien, Dateinamen, Commit-Nachrichten oder Bilder.
- Echte lokale Werte bleiben in `.private/`, `.env.local` oder im Browser. Diese Daten niemals hochladen, in Toolausgaben ausgeben oder automatisch durch Beispiele ersetzen. Keine echten HA-Entities umbenennen, um Quelltext zu anonymisieren.
- Vor JEDEM Push `npm run privacy:check` für den zu veröffentlichenden Commit ausführen. Der installierte Pre-Push-Hook prüft zusätzlich jeden neu übertragenen Commit; Fehler blockieren die Veröffentlichung. Den Hook nicht umgehen, `--no-verify` nicht verwenden.
- Neue Entity-Beispiele und Binärdateien benötigen eine inhaltliche bzw. visuelle Prüfung. `public-data-policy.json` erst danach gezielt ergänzen; niemals aus einem ungeprüften Arbeitsbaum automatisch neu erzeugen, um einen Fehler zu unterdrücken.
- Vor Screenshots Demo-/QA-Daten verwenden, sichtbare Beschriftungen prüfen und keine privaten Desktop-/Kamerabilder veröffentlichen. Persönliche Modellquellen bleiben außerhalb von Git.
- Der normale Produktionsbuild verwendet neutrale Defaults. `HOMETWIN_PRIVATE_BUILD=1` ist ausschließlich für lokale private Bereitstellung und darf nicht für öffentliche Artefakte/Pages verwendet werden.
- Wenn persönliche Daten schon in früheren öffentlichen Commits stehen: klar melden. Ein normaler Löschcommit entfernt keine Historie. Historie/Force-Push oder andere Repositories nur mit konkreter Benutzerautorisierung bereinigen.
- Herkunft, ursprüngliche Lizenz und legitime öffentliche Autorenhinweise erhalten; keine fremden Beiträge umetikettieren.

Diese Regeln gelten auch für kleine Dokumentationsänderungen und Folgeaufträge wie „neuesten Stand synchronisieren“.

## Modelländerungen (Blender → 3D-Twin)

Jede Änderung am Wohnungsmodell folgt [docs/MODEL_PIPELINE.md](docs/MODEL_PIPELINE.md): Änderung in Blender als neue Version speichern,
dieselbe Änderung per Node-Skript auf den neuesten optimierten GLB übertragen (kein Voll-Export), im App-Loader prüfen und über
eine Import-Seite mit Backup übernehmen.
