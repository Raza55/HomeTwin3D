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

## Verbindung und TV-Bilder

Standardmäßig liefert Nginx HTTP auf Port 8099. HTTPS erfordert eine entsprechende vorgeschaltete Konfiguration; auf einer HTTPS-Seite muss auch die HA-WebSocket-Verbindung sicher erreichbar sein.

Die Route `/ha-media/media_player.…` leitet Bilder an `http://homeassistant:8123` weiter. Sie entfernt Authorization/Cookies und verwendet nur den bildbezogenen URL-Token. Andere Installationsumgebungen müssen diesen Upstream anpassen. Für ADB-Screenshots ist eine funktionierende HA-ADB-Integration erforderlich. Frontend und Nginx-Konfiguration gehören zusammen.

PC-Monitore unterstützen außerdem eine zugeordnete Kamera im IT-Dialog. `/ha-camera/camera.…` nutzt denselben festen HA-Upstream für Einzelbilder. Bei eingeschaltetem PC und verfügbarer Kamera wird die Textur alle 30 Sekunden aktualisiert; unsichtbare Monitore und Hintergrund-Tabs pausieren die Abfragen. Ausgeschaltete oder nicht erreichbare PCs bleiben dunkel. Die Kamera-Zuordnung wird mit den IT-Einstellungen gespeichert und beim Modell-Reimport erhalten.

Ein Push auf GitHub ersetzt keine laufende Installation. Der Build verwendet den jeweiligen Stand von `main`; für veröffentlichte Updates die Add-on-Version erhöhen und den Supervisor-Build auf dem Zielgerät prüfen. Der Add-on-Betrieb wurde bei der Repository-Umstellung nicht neu ausgerollt.

## Weitere Informationen

- [Funktionen und Grenzen](../PROJECT_STATUS.md)
- [Blender-Workflow](../BLENDER_WORKFLOW.md)
- [Fehler und Vorschläge](https://github.com/Raza55/HomeTwin3D/issues)


## Stand 0.2.0

Neue Geräte- und Warnfunktionen sowie die Voraussetzungen für TV Dial und PC-Kamerabilder sind in [Geräte und Warnungen](../docs/DEVICES_AND_ALERTS.md) beschrieben. Die Veröffentlichung enthält App-Code und Proxy-Konfiguration, installiert aber keine privaten HA-Automationen oder MQTT-Helfer. Frontend und Nginx müssen insbesondere für `/ha-camera/` gemeinsam aktualisiert werden.
