# HomeTwin3D – Add-on-Dokumentation

Diese Anleitung wurde für das eigenständige HomeTwin3D angepasst. Herkunft: [ORIGIN.md](../ORIGIN.md).

## Installation

1. Unter Einstellungen → Add-ons → Add-on Store die Repository-Verwaltung öffnen.
2. `https://github.com/Raza55/HomeTwin3D` hinzufügen.
3. **HomeTwin3D** installieren und starten.
4. `http://<deine-ha-ip>:8099` öffnen.

Das Add-on hat den eigenen Slug `hometwin3d`; der Dockerfile baut den `main`-Branch von HomeTwin3D. Das Verzeichnis `3dash-addon/` behält seinen historischen Namen. Ein altes 3Dash-Add-on wird nicht automatisch aktualisiert oder ersetzt. Bei parallelem Betrieb einen anderen Host-Port konfigurieren.

## Einrichtung und Datenübernahme

Im Assistenten die HA-Adresse und einen langlebigen Zugriffstoken hinterlegen, ein eigenes GLB importieren und Entities zuordnen. Alternativ zuerst den Demo-Modus verwenden. Modell und Einstellungen werden im Browser gespeichert.

Für den Umzug zuerst in der bisherigen App eine ZIP-Sicherung exportieren. Die neue App öffnen und die Sicherung importieren; bei Bedarf auch die separat gesicherten Gerätezuordnungen wiederherstellen. Eine andere Origin (Host, Port oder Protokoll) besitzt getrennte Browserdaten. Ein geänderter URL-Unterpfad allein erzeugt keine getrennte Origin. Bestehende Speicherkennungen wurden absichtlich beibehalten.

## Umzug einer bestehenden Einrichtung in das Add-on (ab 0.4.0)

Die gemeinsame Version liegt im Konfigurationsordner des Add-ons: auf dem Host `addon_configs/<slug>/shared`, erreichbar über die Samba-Freigabe **addon_configs** und in HA-Backups enthalten. Daten aus Versionen vor 0.4.0 (`/data/shared`) werden beim ersten Start einmalig dorthin verschoben.

Für den Umzug einer lokalen Einrichtung (Dev-/LAN-Server):

1. Im Browser mit dem aktuellen Stand: Einstellungen → System → *Gemeinsame Version* → *Jetzt veröffentlichen*.
2. Im Projekt `npm run addon:export` ausführen. Es entsteht `.private/addon-export/shared` mit Konfiguration, Modell, Objekten und den Installationswerten (Entity-Zuordnung, Standort) aus `.private/installation.json`.
3. Add-on stoppen, den Ordner `shared` in den HomeTwin3D-Ordner der Freigabe `addon_configs` kopieren (vorhandenen ersetzen), Add-on starten.

Automatisch geht Schritt 2–3 mit `npm run addon:sync`: einmalig in `.env.local` `HOMETWIN_ADDON_SHARE=\\<ha-host>\addon_configs\<slug>` eintragen (der Ordner entsteht beim ersten Start des Add-ons). Der Befehl schreibt Dateien zuerst und `state.json` zuletzt, daher muss das Add-on dafür nicht gestoppt werden; die Revision liegt immer über der des Add-ons, und das Modell gilt nur bei geändertem Inhalt als neu. Offene Browser übernehmen die Version innerhalb einer Minute. Einen PIN braucht der Befehl nicht.

Ist Port 8099 auf dem Host schon belegt, gibt HA ihn für das Add-on nicht frei (Netzwerk-Eintrag leer, die App ist nicht erreichbar). Dann unter Konfiguration → Netzwerk einen freien Host-Port eintragen (z. B. 8199) und den Reverse Proxy auf diesen Port richten.

Öffentliche Builds wie das Add-on enthalten keine privaten Installationswerte; sie kommen mit der gemeinsamen Version und werden im Browser gespeichert.

## Gemeinsame Version für alle Browser (ab 0.3.0)

Zuordnungen, Räume, Lichter, das Wohnungsmodell und importierte Objekte können zentral im Add-on liegen (seit 0.4.0 im Konfigurationsordner, siehe oben). Jeder Browser im LAN lädt beim Start die neueste veröffentlichte Version und prüft danach jede Minute auf neuere; ein offenes Dashboard lädt sich neu, sobald 20 Sekunden niemand bedient. Darstellung, Kamera und die HA-Verbindung bleiben pro Browser; der HA-Token wird nie übertragen.

- In den Add-on-Optionen `write_pin` setzen (4–64 Zeichen: A–Z, a–z, 0–9, `.`, `_`, `-`). Ohne PIN ist die gemeinsame Version nur lesbar.
- Auf dem Gerät, das die aktuelle Einrichtung hat: Einstellungen → System → *Gemeinsame Version (LAN)* → PIN eingeben, speichern, *Jetzt veröffentlichen*. Danach werden Änderungen dieses Browsers automatisch veröffentlicht.
- Neue Browser übernehmen die Version beim ersten Öffnen; im Assistenten ist dann nur noch die HA-Verbindung nötig.
- Hat ein Gerät mit PIN unveröffentlichte Änderungen, während ein anderes eine neuere Version veröffentlicht, wird nichts überschrieben. Die Einstellungsseite bietet dann *Jetzt veröffentlichen* (eigene Version gilt) oder *Neueste Version laden* (eigene Änderungen verwerfen).
- Das Add-on hat keine HA-Anmeldung (kein Ingress): Jeder, der es erreicht, kann die gemeinsame Version lesen, auch Entity-Zuordnungen und Standort. Die PIN schützt nur vor Änderungen. Einen vorgeschalteten Proxy daher nicht ungeschützt ins Internet stellen (nur LAN/VPN oder Zugriffsliste/Anmeldung im Proxy).

Im Dev-Server gilt dasselbe unter `/HomeTwin3D/shared/`; die Daten liegen in `.private/shared`, die PIN in `.env.local` als `HOMETWIN_SHARED_PIN`.

## Verbindung und TV-Bilder

Standardmäßig liefert Nginx HTTP auf Port 8099. Für Tablets wird HTTPS dringend empfohlen: Safari rendert auf unsicheren Seiten deutlich langsamer. Dazu einen Reverse Proxy (z. B. Nginx Proxy Manager) mit Zertifikat auf `http://<ha-ip>:8099` einrichten und **WebSocket-Unterstützung** aktivieren. Auf einer HTTPS-Seite verbindet sich die App über `/ha-ws` des Add-ons mit Home Assistant (fester Upstream `homeassistant:8123`, Anmeldung weiterhin per Token); in der App wird die HA-Adresse wie gewohnt eingetragen.

Die Route `/ha-media/media_player.…` leitet Bilder an `http://homeassistant:8123` weiter. Sie entfernt Authorization/Cookies und verwendet nur den bildbezogenen URL-Token. Andere Installationsumgebungen müssen diesen Upstream anpassen. Für ADB-Screenshots ist eine funktionierende HA-ADB-Integration erforderlich. Frontend und Nginx-Konfiguration gehören zusammen.

PC-Monitore unterstützen außerdem eine zugeordnete Kamera im IT-Dialog. `/ha-camera/camera.…` nutzt denselben festen HA-Upstream für Einzelbilder. Bei eingeschaltetem PC und verfügbarer Kamera wird die Textur alle 30 Sekunden aktualisiert; unsichtbare Monitore und Hintergrund-Tabs pausieren die Abfragen. Ausgeschaltete oder nicht erreichbare PCs bleiben dunkel. Die Kamera-Zuordnung wird mit den IT-Einstellungen gespeichert und beim Modell-Reimport erhalten.

Ein Push auf GitHub ersetzt keine laufende Installation. Der Build verwendet den jeweiligen Stand von `main`; für veröffentlichte Updates die Add-on-Version erhöhen und den Supervisor-Build auf dem Zielgerät prüfen. Der Add-on-Betrieb wurde bei der Repository-Umstellung nicht neu ausgerollt.

## Weitere Informationen

- [Funktionen und Grenzen](../PROJECT_STATUS.md)
- [Blender-Workflow](../BLENDER_WORKFLOW.md)
- [Fehler und Vorschläge](https://github.com/Raza55/HomeTwin3D/issues)


## Stand 0.2.0

Neue Geräte- und Warnfunktionen sowie die Voraussetzungen für TV Dial und PC-Kamerabilder sind in [Geräte und Warnungen](../docs/DEVICES_AND_ALERTS.md) beschrieben. Die Veröffentlichung enthält App-Code und Proxy-Konfiguration, installiert aber keine privaten HA-Automationen oder MQTT-Helfer. Frontend und Nginx müssen insbesondere für `/ha-camera/` gemeinsam aktualisiert werden.
