# HomeTwin3D – Add-on-Dokumentation

HomeTwin3D ist eine Weiterentwicklung von 3Dash. Herkunft: [ORIGIN.md](../ORIGIN.md).

## Installation

1. Unter Einstellungen → Add-ons → Add-on Store die Repository-Verwaltung öffnen.
2. `https://github.com/Raza55/HomeTwin3D` hinzufügen.
3. **HomeTwin3D** installieren und starten.
4. `http://<deine-ha-ip>:8099` öffnen.

Das Add-on hat den Slug `hometwin3d`; das Verzeichnis `3dash-addon/` behält seinen historischen Namen. Ein altes 3Dash-Add-on
wird nicht ersetzt. Laufen beide parallel oder ist Port 8099 auf dem Host schon belegt, unter Konfiguration → Netzwerk einen
freien Host-Port eintragen (z. B. 8199). Ist der Port belegt, bleibt der Netzwerk-Eintrag leer und die App ist nicht
erreichbar.

Updates: Home Assistant bietet ein Update an, sobald eine neue Add-on-Version veröffentlicht ist. Es lädt fertige Images
(`ghcr.io/raza55/{arch}-addon-hometwin3d`) für AMD64 und ARM64.

## Einrichtung

Im Assistenten die HA-Adresse und einen langlebigen Zugriffstoken hinterlegen, ein eigenes GLB importieren und Entities
zuordnen. Alternativ zuerst den Demo-Modus oder die Tagesdemo (`…/?daydemo`) ausprobieren. Den ganzen Weg vom Blender-Modell
bis zum fertigen Dashboard beschreibt [Erste Schritte](../docs/GETTING_STARTED.md).

## Gemeinsame Version für alle Browser

Ohne gemeinsame Version speichert jeder Browser Modell und Einstellungen für sich. Mit ihr liegen Zuordnungen, Räume, Lichter,
das Wohnungsmodell und importierte Objekte zentral im Add-on. Jeder Browser im LAN lädt beim Start die neueste Version und
prüft danach jede Minute auf neuere; ein offenes Dashboard lädt neu, sobald 20 Sekunden niemand bedient. Darstellung, Kamera
und die HA-Verbindung bleiben pro Browser; der HA-Token wird nie übertragen.

- In den Add-on-Optionen `write_pin` setzen (4–64 Zeichen: A–Z, a–z, 0–9, `.`, `_`, `-`). Ohne PIN ist die gemeinsame Version
  nur lesbar.
- Auf dem Gerät mit der fertigen Einrichtung: Einstellungen → System → *Gemeinsame Version (LAN)* → PIN eingeben, speichern,
  *Jetzt veröffentlichen*. Danach veröffentlicht dieser Browser Änderungen automatisch.
- Neue Browser übernehmen die Version beim ersten Öffnen; im Assistenten ist dann nur noch die HA-Verbindung nötig.
- Hat ein Gerät unveröffentlichte Änderungen, während ein anderes eine neuere Version veröffentlicht, wird nichts
  überschrieben. Die Einstellungsseite bietet dann *Jetzt veröffentlichen* (eigene Version gilt) oder *Neueste Version laden*
  (eigene Änderungen verwerfen).
- Das Add-on hat keine HA-Anmeldung (kein Ingress): Jeder, der es erreicht, kann die gemeinsame Version lesen, auch
  Entity-Zuordnungen und Standort. Die PIN schützt nur vor Änderungen. Einen vorgeschalteten Proxy daher nicht ungeschützt ins
  Internet stellen (nur LAN/VPN oder Zugriffsschutz im Proxy).

Die Daten liegen im Konfigurationsordner des Add-ons: auf dem Host `addon_configs/<slug>/shared`, erreichbar über die
Samba-Freigabe **addon_configs** und in HA-Backups enthalten.

## Kalender und API

Ein Tipp auf Uhrzeit und Datum öffnet den Kalender (Jahr, Monat, Woche). Termine liegen in Kalendern von Home Assistant,
am einfachsten in einem *Lokalen Kalender* (Einstellungen → Geräte und Dienste → Integration hinzufügen). Feiertage und
Schulferien kommen für die beim ersten Öffnen gewählten Bundesländer dazu. Zusätzliche Angaben stehen als Zeilen am Ende der
Terminbeschreibung und sind damit auf allen Geräten gleich:

```text
Für: Anna, Ben
Note: 11 Punkte
Ref: eigener-schluessel
```

`Für` ordnet Termine Personen zu (Filter im Kalender), `Note` ist die Punktzahl einer Klausur, `Ref` ein eigener Schlüssel
für die API.

Die API legt Termine per JSON an, ändert und löscht sie, etwa aus Skripten oder Kurzbefehlen. Sie ist aus, bis in den
Add-on-Optionen `calendar_api_token` gesetzt ist (mindestens 16 Zeichen). `calendar_api_default` bestimmt den Kalender, wenn
eine Anfrage keinen nennt; sonst gilt der erste beschreibbare. Jede Anfrage braucht den Schlüssel im Header
`Authorization: Bearer <token>`.

| Anfrage | Zweck |
| --- | --- |
| `GET /api/calendar` | Kalender und Standardkalender |
| `GET /api/calendar/events?start=2026-10-01&end=2026-12-31` | Termine eines Zeitraums, optional `calendar`, `ref` |
| `POST /api/calendar/events` | Termine anlegen oder ändern (einzeln, als Liste oder `{ "calendar": …, "events": [...] }`) |
| `DELETE /api/calendar/events?ref=…` | Termin löschen (oder `uid=…`) |
| `GET /api/calendar/add?token=…&summary=…&start=…` | Ein Termin nur per Adresse, für Werkzeuge ohne eigene Header |

```bash
curl -X POST http://<ha-host>:8099/api/calendar/events \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"ref": "klausur-m1-1", "summary": "Klausur Mathematik", "start": "2026-10-26T07:50", "end": "2026-10-26T09:20", "persons": ["Anna"]}'
```

Felder eines Termins: `summary` und `start` sind Pflicht. `start` als Datum (`2026-10-26`) ergibt einen ganztägigen Termin,
dann ist `end` der letzte Tag; sonst Datum und Uhrzeit, `end` oder `durationMinutes` (Standard 60). Optional: `description`,
`location`, `persons`, `grade` (0 bis 15), `rrule` (z. B. `FREQ=WEEKLY`), `calendar`, `ref`, `uid`, `delete: true`.

Mit `ref` wird ein erneut gesendeter Termin aktualisiert statt doppelt angelegt; ohne Änderung meldet die Antwort
`unchanged`. Eine auf dem Tablet eingetragene Note bleibt erhalten, wenn die Anfrage keine `grade` enthält; ebenso Personen
und Beschreibung. Die Antwort nennt pro Termin `created`, `updated`, `unchanged`, `deleted`, `not_found` oder `error`.

Der Schlüssel erlaubt Lesen und Schreiben aller Kalender. Die API daher nur im LAN/VPN oder hinter einem geschützten Proxy
erreichbar machen und den Schlüssel wie ein Passwort behandeln.

## Bestehende Einrichtung übernehmen

**Aus einem anderen Browser oder einer anderen Adresse:** In der bisherigen App eine ZIP-Sicherung exportieren, in der neuen
App importieren und bei Bedarf die separat gesicherten Gerätezuordnungen wiederherstellen. Eine andere Origin (Host, Port oder
Protokoll) hat getrennte Browserdaten.

**Aus einem lokalen Entwicklungsserver:** Im Browser des Dev-Servers die gemeinsame Version veröffentlichen, dann
`npm run addon:export` ausführen. Es entsteht `.private/addon-export/shared` mit Konfiguration, Modell, Objekten und den
Installationswerten aus `.private/installation.json`. Add-on stoppen, den Ordner `shared` in den HomeTwin3D-Ordner der Freigabe
`addon_configs` kopieren, Add-on starten.

Automatisch geht das mit `npm run addon:sync`: einmalig in `.env.local` `HOMETWIN_ADDON_SHARE=\\<ha-host>\addon_configs\<slug>`
eintragen. Der Befehl schreibt `state.json` zuletzt, das Add-on muss dafür nicht gestoppt werden; offene Browser übernehmen
die Version innerhalb einer Minute.

Öffentliche Builds wie das Add-on enthalten keine privaten Installationswerte; sie kommen mit der gemeinsamen Version.

## HTTPS, Verbindung und Bilder

Standardmäßig liefert Nginx unverschlüsseltes HTTP auf Port 8099. **Für Tablets ist HTTPS praktisch Pflicht:** Auf einem iPad
mit Safari läuft die 3D-Ansicht über HTTP deutlich langsamer und ruckelt, weil Safari unsichere Seiten erheblich langsamer
rendert. So geht es:

1. Einen Reverse Proxy mit Zertifikat einrichten, zum Beispiel Nginx Proxy Manager oder ein vorhandener Proxy im Heimnetz.
2. Als Ziel `http://<ha-ip>:8099` eintragen (bzw. den geänderten Host-Port).
3. **WebSocket-Unterstützung** einschalten.
4. Das Board auf allen Tablets nur noch über die `https://` Adresse öffnen und dort als Lesezeichen oder Home-Bildschirm-App
   speichern. Mit `?perf` an der Adresse lässt sich die Bildrate prüfen.

Den Proxy nicht ungeschützt ins Internet stellen (siehe gemeinsame Version oben).

Auf einer HTTPS-Seite verbindet sich die App über `/ha-ws` des
Add-ons mit Home Assistant (fester Upstream `homeassistant:8123`, Anmeldung weiterhin per Token); in der App wird die
HA-Adresse wie gewohnt eingetragen.

Für Bilder auf Modellflächen leitet das Add-on zwei Routen an `http://homeassistant:8123` weiter, entfernt dabei
Authorization/Cookies und verwendet nur den bildbezogenen URL-Token:

- `/ha-media/media_player.…` – Cover und Screenshots für den Fernseher im Modell (Screenshots erfordern eine HA-ADB-Integration).
- `/ha-camera/camera.…` – Kamerabilder für PC-Monitore und den Fernseher am PC-Eingang, höchstens alle 10 Sekunden.

Einzelheiten zu Geräten, Medien und Warnungen: [Geräte und Warnungen](../docs/DEVICES_AND_ALERTS.md).

## Weitere Informationen

- [Erste Schritte](../docs/GETTING_STARTED.md)
- [Eigenes Modell mit Blender einbinden](../BLENDER_WORKFLOW.md)
- [Energiefluss, Tagesdemo, Tiere und Markierungsfilter](../docs/ENERGY_DEMO_WILDLIFE.md)
- [Funktionen, Grenzen und Technik](../PROJECT_STATUS.md)
- [Fehler und Vorschläge](https://github.com/Raza55/HomeTwin3D/issues)
