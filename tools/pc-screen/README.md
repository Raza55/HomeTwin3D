# DesktopMain: kleiner Desktop-Screenshot per MQTT

Windows 10/11, Python 3.10+ (Befehl `python`). Auf **DesktopMain im angemeldeten Benutzerkonto** ausfuehren, nicht als Windows-Dienst. HASS.Agent-Screenshot-Sensor deaktiviert lassen. Dieser Helfer veraendert keine HASS.Agent-Einstellungen.

1. Diesen ganzen Ordner auf DesktopMain an einem dauerhaften Ort ablegen.
2. PowerShell in diesem Ordner oeffnen und ausfuehren:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup.ps1`

   Setup installiert drei Python-Pakete in eine eigene `.venv`. MQTT-Host, Port, TLS und Zugangsdaten wie in HASS.Agent angeben. Bei TLS muss der Host zum Zertifikat passen; eine eigene CA kann als PEM-Datei angegeben werden. Die Zertifikatspruefung bleibt aktiv. Screen 0 ist der erste Monitor der angezeigten Liste (die Reihenfolge kann von HASS.Agent abweichen).

3. Starten:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\Start.ps1`

   In Home Assistant unter Einstellungen > Geraete & Dienste > MQTT erscheint **DesktopMain Screenshot**, Kamera **Bildschirm**, vorgeschlagene ID `camera.desktop_main_bildschirm` (bei Namenskonflikt mit Suffix). Keine YAML-Aenderung, kein HA-Neustart. Erstes Bild nach erfolgreicher Verbindung; weitere alle 30 Sekunden. Dieses Fenster zum Testen offen lassen, Strg+C beendet den Helfer.

4. Optional danach bei Windows-Anmeldung automatisch im Hintergrund starten:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\Autostart.ps1`

   Den Ordner danach nicht verschieben. Es wird nur eine Verknuepfung im Benutzer-Autostart erstellt. Zum Entfernen denselben Befehl mit `-Remove` ausfuehren.

## Betrieb

- Maximal 1920 x 1080 (Full HD), Seitenverhaeltnis bleibt erhalten, kleinere Quellen werden nicht hochskaliert. JPEG Qualitaet 65 mit Rueckfall 50/35/25/15/8 fuer besonders detailreiche Bilder. Harte Nutzlastgrenze 200.000 Bytes, groessere Bilder werden verworfen. Aufloesung und Bytezahl stehen im Protokoll.
- Eigene Client-ID `hometwin-pc-screen`; nur fuer **einen** PC verwenden. HASS.Agent bleibt parallel nutzbar.
- Bilder binaer, ohne Base64, QoS 0, ohne Retain. Keine Bilddateien auf Disk; keine wartende Bildsammlung bei Verbindungsabbruch. Discovery und Online/Offline-Status werden retained veroeffentlicht.
- Bei Sperrbildschirm/unerreichbarem Desktop pausiert die Aufnahme, Kamera wird offline markiert. Das letzte Bild kann trotzdem noch im HA-/Browser-Cache stehen. Bei PC-Aus markiert das MQTT-Last-Will die Kamera offline.
- Verbindungsaufbau mit Rueckfallintervall 5 bis 60 Sekunden. Neue Aufnahme erst bei Verbindung, maximal alle 30 Sekunden (ausser HA-Neustart/Reconnect).
- `Stop.ps1` beendet den Helfer. Das Stop-Signal bleibt bis zum naechsten expliziten Start liegen.
- Daten unter `%LOCALAPPDATA%\HomeTwin-PCScreen`: `config.json`, benutzer-/rechnergebunden verschluesselte Zugangsdaten `mqtt.xml`, rotierende `screen.log`. Setup erneut ausfuehren, um Einstellungen zu aendern; Helfer anschliessend neu starten.
- Kein Live-Screenshot oder Versand wurde beim Erstellen dieser Dateien ausgefuehrt. Tests verwenden synthetische Bilder. Die App unterstuetzt inzwischen die Verbindung zur 3D-Monitor-Textur: Im IT-Editor die Kamera als screenshotEntityId zuordnen. Die Kamera muss in der eigenen HA-Installation vorhanden sein. Details: [Geraete und Kamerabilder](../../docs/DEVICES_AND_ALERTS.md).

## Tests

`.\.venv\Scripts\python.exe -m unittest discover -s . -p test_screen.py`

## Grundlagen

- [Home Assistant MQTT Camera / Discovery, binaere JPEGs](https://www.home-assistant.io/integrations/camera.mqtt/)
- [Eclipse Paho MQTT Client](https://eclipse.dev/paho/files/paho.mqtt.python/html/client.html)
- [Windows Export-Clixml Credential-Verschluesselung](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml)
