# PC-Desktop als HA-Kamera (Screenshot per MQTT)

Optionaler Helfer: Er veroeffentlicht in regelmaessigen Abstaenden ein verkleinertes Bild des Windows-Desktops als MQTT-Kamera in Home Assistant. HomeTwin3D zeigt es auf dem PC-Monitor im 3D-Modell und – wenn der Receiver auf dem PC-Eingang steht – auf dem Fernseher.

Windows 10/11, Python 3.10+ (Befehl `python`), ein MQTT-Broker mit eingerichteter MQTT-Integration in HA. Auf dem PC **im angemeldeten Benutzerkonto** ausfuehren, nicht als Windows-Dienst. Wer HASS.Agent nutzt, laesst dessen Screenshot-Sensor deaktiviert. Der Helfer veraendert keine HASS.Agent-Einstellungen.

1. Diesen ganzen Ordner auf dem PC an einem dauerhaften Ort ablegen.
2. PowerShell in diesem Ordner oeffnen und ausfuehren:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup.ps1`

   Setup installiert drei Python-Pakete in eine eigene `.venv`. MQTT-Host, Port, TLS und Zugangsdaten des Brokers angeben. Bei TLS muss der Host zum Zertifikat passen; eine eigene CA kann als PEM-Datei angegeben werden. Die Zertifikatspruefung bleibt aktiv. Screen 0 ist der erste Monitor der angezeigten Liste (die Reihenfolge kann von anderen Programmen abweichen). In eckigen Klammern steht die Windows-Geraetekennung des Monitors (aus dem EDID: Herstellerkuerzel plus Nummer, z. B. `ABC1234`). Haengt am PC auch ein Fernseher, kann dessen Kennung als **Fernseher** eingetragen werden: Dann nimmt der Helfer den Fernseher auf, solange Windows ihn anzeigt ("Nur zweiter Bildschirm", Erweitern oder Duplizieren), sonst den festen Screen. So zeigt der Fernseher im 3D-Modell, was tatsaechlich auf dem TV laeuft.

3. Starten:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\Start.ps1`

   In Home Assistant unter Einstellungen > Geraete & Dienste > MQTT erscheint das Geraet **DesktopMain Screenshot** mit der Kamera **Bildschirm**, vorgeschlagene ID `camera.desktop_main_bildschirm` (bei Namenskonflikt mit Suffix). Name und ID sind im Helfer fest vorgegeben und lassen sich in HA umbenennen. Keine YAML-Aenderung, kein HA-Neustart. Erstes Bild nach erfolgreicher Verbindung; weitere im eingestellten Intervall (Standard 10 Sekunden). Dieses Fenster zum Testen offen lassen, Strg+C beendet den Helfer.

4. Optional danach bei Windows-Anmeldung automatisch im Hintergrund starten:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\Autostart.ps1`

   Den Ordner danach nicht verschieben. Es werden eine Verknuepfung im Benutzer-Autostart und eine geplante Aufgabe im eigenen Benutzerkonto erstellt (ohne Adminrechte). Die Aufgabe startet alle 5 Minuten unsichtbar `Watchdog.ps1` und startet den Helfer neu, falls er von aussen beendet wurde, z. B. durch ein Python-Update. Nach `Stop.ps1` bleibt er aus, bis `Start.ps1` wieder ausgefuehrt wird. Zum Entfernen denselben Befehl mit `-Remove` ausfuehren.

## Betrieb

- Jeder Wechsel der Aufnahmequelle steht als `Capture source: TV …` bzw. `Capture source: screen …` im Protokoll. Die Kennung kann auch direkt als `tv_monitor` in `config.json` gesetzt werden (leer = keine Umschaltung).
- Maximal 1920 x 1080 (Full HD), Seitenverhaeltnis bleibt erhalten, kleinere Quellen werden nicht hochskaliert. JPEG Qualitaet 65 mit Rueckfall 50/35/25/15/8 fuer besonders detailreiche Bilder. Harte Nutzlastgrenze 200.000 Bytes, groessere Bilder werden verworfen. Aufloesung und Bytezahl stehen im Protokoll.
- Eigene Client-ID `hometwin-pc-screen`; nur fuer **einen** PC verwenden. HASS.Agent kann parallel laufen.
- Bilder binaer, ohne Base64, QoS 0, ohne Retain. Keine Bilddateien auf Disk; keine wartende Bildsammlung bei Verbindungsabbruch. Discovery und Online/Offline-Status werden retained veroeffentlicht.
- Bei Sperrbildschirm/unerreichbarem Desktop pausiert die Aufnahme, Kamera wird offline markiert. Das letzte Bild kann trotzdem noch im HA-/Browser-Cache stehen. Bei PC-Aus markiert das MQTT-Last-Will die Kamera offline.
- Verbindungsaufbau mit Rueckfallintervall 5 bis 60 Sekunden. Neue Aufnahme erst bei Verbindung, im Intervall `interval` aus `config.json` (Standard 10 Sekunden, erlaubt 2-300; ausser HA-Neustart/Reconnect).
- `Stop.ps1` beendet den Helfer. Das Stop-Signal bleibt bis zum naechsten expliziten Start liegen.
- Daten unter `%LOCALAPPDATA%\HomeTwin-PCScreen`: `config.json`, benutzer-/rechnergebunden verschluesselte Zugangsdaten `mqtt.xml`, rotierende `screen.log`. Setup erneut ausfuehren, um Einstellungen zu aendern; Helfer anschliessend neu starten.
- In HomeTwin3D die Kamera im IT-Editor des PCs als `screenshotEntityId` zuordnen. Details: [Geraete und Kamerabilder](../../docs/DEVICES_AND_ALERTS.md#kamerabild-auf-dem-modellmonitor).

## Tests

`.\.venv\Scripts\python.exe -m unittest discover -s . -p test_screen.py`

## Grundlagen

- [Home Assistant MQTT Camera / Discovery, binaere JPEGs](https://www.home-assistant.io/integrations/camera.mqtt/)
- [Eclipse Paho MQTT Client](https://eclipse.dev/paho/files/paho.mqtt.python/html/client.html)
- [Windows Export-Clixml Credential-Verschluesselung](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml)
