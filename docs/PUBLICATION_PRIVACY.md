# Datenschutz bei jeder Veröffentlichung

HomeTwin3D trennt **öffentliche Beispiele** von **privaten Installationsdaten**. Diese Regeln gelten für jeden Push, auch für reine Dokumentationsupdates.

## Was in Git stehen darf

Neutrale Bezeichnungen wie `desktop_main`, `storage_server`, `media_player.living_room_tv` und `homeassistant.local` beschreiben Rollen statt eine konkrete Installation. Der öffentliche Standort-Default ist `(0, 0)` und muss für eine echte Installation konfiguriert werden. Repository-Besitzer und Herkunft des Originalprojekts bleiben ausdrücklich genannt.

Nicht veröffentlichen: Wohnadresse/echte Koordinaten, private Rechner- und Personennamen, LAN-Adressen, MAC-/Seriennummern, Tokens, Zugangsdaten, persönliche Konfigurationsbackups oder echte Desktop-/Kamerabilder. Modellkennungen ohne Personenbezug bleiben zur Importkompatibilität bestehen.

## Lokale Installation erhalten

`.private/installation.json` kann die neutralen Standard-Entities und den Standort lokal überschreiben:

```json
{
  "entities": {
    "media_player.living_room_tv": "media_player.my_tv",
    "switch.desktop_main_power": "switch.my_desktop"
  },
  "location": { "label": "Eigener Standort", "latitude": 0, "longitude": 0 },
  "mediaProxyTarget": "http://homeassistant.local:8123"
}
```

Die Werte sind Beispiele. Die App verwendet die Entity-Übersetzung an den zentralen TV-, Hue-Sync-, TV-Dial- und Wasserleck-Defaults. Individuell gespeicherte Gerätezuordnungen stammen weiterhin aus dem Browser/Modell und werden nicht automatisch umbenannt. Der Vite-Entwicklungsserver liest die lokale Datei und sperrt den direkten HTTP-Zugriff auf `.private/`.

`npm run build` und der reguläre Add-on-Build ignorieren die private Datei. Nur für eine private lokale Bereitstellung kann ausdrücklich `HOMETWIN_PRIVATE_BUILD=1` gesetzt werden. Ein solcher Build enthält die persönlichen Konfigurationswerte im JavaScript und darf daher nicht öffentlich bereitgestellt werden. Zugangstokens gehören niemals in diese Build-Konfiguration.

Bei dieser Umstellung wurden vorhandene zentrale Defaults lokal gesichert. Die bisherige Helferinstallation bleibt lokal erhalten; die neutrale öffentliche Variante liegt jetzt in `tools/pc-screen/`. Sie wird nicht automatisch installiert oder gestartet. Historische Blender-Skripte enthalten nun neutrale Beispiele und erwarten das Repository als Arbeitsverzeichnis; die privaten Modellquellen und Browserdaten wurden nicht bearbeitet.

## Verbindlicher Ablauf vor einem Push

1. Änderungen und neue Dateien prüfen. Private Angaben in lokalen Dateien belassen; öffentliche Code-/Testbeispiele konsistent anonymisieren.
2. Screenshots visuell prüfen. Nur freigegebene QA-/Demoansichten aufnehmen. Ein Bild mit privaten Beschriftungen entfernen oder durch eine neue neutrale Aufnahme ersetzen.
3. Tests und passenden öffentlichen Build ausführen.
4. Änderungen committen und `npm run privacy:check` ausführen. Die Prüfung liest den Git-Commit, nicht nur den möglicherweise schon bereinigten Arbeitsbaum.
5. Mit installiertem Hook pushen. `npm run privacy:install` richtet ihn in einem neuen Clone ein; ein vorhandener fremder Hook wird nicht überschrieben.

Der Pre-Push-Hook prüft alle neu übertragenen Commits und die Zielspitze. Damit kann ein sensibler Zwischencommit nicht durch einen späteren Löschcommit verdeckt werden. Bei einer neuen Branch-Veröffentlichung werden bereits auf `origin` vorhandene Commits nicht erneut als neu behandelt. Er erlaubt standardmäßig nur das Remote `origin`; eine andere Veröffentlichung muss ausdrücklich geprüft werden.

## Prüfregeln und Grenzen

`tools/check-public-data.mjs` blockiert private IP-Adressen, absolute Arbeitsplatzpfade, gängige Credential-Muster, lokale Dateien sowie neue/unbestätigte Entity-Kennungen. `public-data-policy.json` enthält die geprüften öffentlichen Entity-Beispiele und SHA-256-Prüfsummen freigegebener Binärdateien. Neue oder geänderte Bilder müssen vor Aufnahme in diese Liste visuell geprüft werden. Die Liste ist kein Freibrief für persönliche Daten.

Eine lokale `.private/public-denylist.json` enthält zusätzlich die persönlich zu vermeidenden Begriffe. Sie wird niemals veröffentlicht; deshalb kennt GitHub Actions diese lokale Liste nicht. CI prüft die allgemeinen Regeln und Freigabelisten. Freier Text, Metadaten, neue persönliche Namen werden durch Musterprüfungen nicht vollständig erkannt: Die manuelle Prüfung und die Regeln in [AGENTS.md](../AGENTS.md) bleiben erforderlich.

Ein frischer Clone muss den Hook selbst installieren; Git überträgt keine lokalen Hooks. Direkte Änderungen über die GitHub-Weboberfläche werden erst durch die nachfolgende CI-Prüfung erfasst. Hooks und CI ersetzen keine organisatorische Zugriffskontrolle.

## Bereits veröffentlichte Historie

Am 28.09.2026 wurden nach ausdrücklicher Autorisierung beide öffentlichen Historien bereinigt und mit exakten Force-with-lease-Abgleichen veröffentlicht:

- HomeTwin3D: `main`, 91 bestehende Commits geprüft und bereinigt.
- Bisheriger Fork: `main`, `featureaddon` und beide `restore-before-room-*`-Tags, zusammen 87 bestehende Commits geprüft und bereinigt.
- Alle erreichbaren Git-Objekte auf die bekannten privaten Begriffe und allgemeinen Erkennungsmuster geprüft; persönliche Autorenangaben des Eigentümers auf den öffentlichen Account umgestellt, Originalautoren erhalten.
- Den betroffenen Screenshot aus der Historie entfernt. Frühere CI-Ausgaben lokal gesichert und auf GitHub entfernt; in einem Lauf waren private Kennungen enthalten. Es waren keine Release-Dateien oder Actions-Artefakte vorhanden.

Lokale Bundles und Zuordnungstabellen liegen ausschließlich im ignorierten privaten Verzeichnis. Sie enthalten absichtlich den alten Stand und dürfen niemals veröffentlicht werden. Bestehende Klone anderer Nutzer sollten neu geklont werden. Alte Branches/Tags nicht zurückpushen oder in die bereinigte Historie mergen. Die neue Veröffentlichung beginnt mit einem bereinigten Snapshot ohne diese Historie. Alte Klone und Referenzen bleiben ausschließlich als lokale Sicherungen erhalten.

Die Bereinigung des aktuellen Dateibaums allein entfernt keine Angaben aus älteren Commits, früheren Forks, Klonen, heruntergeladenen Artefakten oder GitHub-Caches. Eine vollständige Historienbereinigung benötigt einen separat abgestimmten Umfang, Backups und einen Force-Push der betroffenen Referenzen. Der bisherige Fork ist ein separates Repository und wird durch einen Push auf HomeTwin3D nicht verändert.

## Neustart als bereinigter Snapshot

Dieses Repository beginnt mit einem neuen Root-Commit aus dem bereinigten Quelltextstand vom 28.09.2026. Lizenz, Herkunft und ursprüngliche Autorenhinweise bleiben erhalten. Alte Git-Objekte, lokale Installationsdateien und historische Tags werden nicht übernommen. Für weitere Veröffentlichungen diesen frischen Klon und den Datenschutz-Hook verwenden.

Auch das Löschen und Neuerstellen eines GitHub-Repositories garantiert keine Entfernung früherer Cache-Ansichten oder fremder Klone. Die Entfernung alter sensibler Objekte und Ansichten muss separat durch GitHub Support geprüft werden.
