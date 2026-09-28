# TV Dial im 3D-Board

Das Symbol am Wohnzimmer-TV sendet `hometwin_tv_dial` über die authentifizierte HA-WebSocket-Verbindung. `event_data.source` ist einer von `shield`, `pc`, `playstation`, `retropie`, `aus`. In `automation.tv_dial_hdmi1` wurden fünf Event-Trigger mit identischen Trigger-IDs ergänzt. Die bisherigen acht MQTT-Geräte-Trigger, Aktionen, Variablen und der restart-Modus bleiben erhalten.

Die Schaltlogik lebt weiterhin vollständig in Home Assistant. Die Anzeige der aktiven Quelle folgt dem Denon und dem TV-Zustand. Deaktivierte Automation oder fehlende HA-Verbindung sperrt die Tasten. Die Bestätigung eines Events bedeutet „angefordert“, nicht „Hardware bereits fertig geschaltet“.

Vorherige Automationskonfiguration: `.qa/tv-dial-before-board.json`. Zur Rücknahme nur die fünf Trigger mit `event_type: hometwin_tv_dial` entfernen, die sonstige Konfiguration beibehalten.

Prüfung: `node --test tools/tv-dial.test.mjs`; UI-Simulation unter `/HomeTwin3D/tools/tv-dial-qa.html` sendet keine HA-Befehle.
