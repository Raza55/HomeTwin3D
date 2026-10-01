# Geräte, Warnungen und Medien – Stand 28.09.2026

Diese Funktionen ergänzen die bisherige Licht-, Rollo- und Raumsteuerung. Die Zuordnungen des Beispielhaushalts dienen als Ausgangspunkt; ein eigener Haushalt benötigt passende Entities. Überblick: [README](../README.md), technische Basis: [PROJECT_STATUS.md](../PROJECT_STATUS.md).

## Lüfter und Balkon

`FanMarkers` und `fanState.ts` zeigen Lüfterzustand und Prozentwert. Ein Klick auf Marker oder Modell öffnet Ein/Aus und, soweit unterstützt, den Prozentregler. Fähigkeiten und Schrittweite folgen `supported_features` und `percentage_step`; der Regler sendet beim Loslassen. Bei ausgeschaltetem Gerät wird kein laufender Prozentwert am Marker eingeblendet.

Das Modell v94 ergänzt Turmventilator und Luftreiniger; v96 ersetzt den bisherigen Platzhalter durch die Dyson-Geometrie unter Beibehaltung der Geräte-ID. Die Beispiel-Entities sind `fan.turmventilator` und `fan.balcony_air_purifier`, im Zuordnungsassistenten änderbar.

Der Rauchmarker folgt `sensor.rauchstatus_balkon` und erscheint nur beim ausdrücklich konfigurierten Zustand `Ja`. Fehlende/unbekannte Daten und Verbindungsverlust blenden ihn aus. Er ist eine Statusanzeige ohne Schaltaktion.

## Echo-Mediengeräte

`EchoMarkers` zeigt Dot-/Show-Symbole sowie Bereitschaft, Wiedergabe, Pause, Stummschaltung und Nichterreichbarkeit. Das Popup bietet Titel, Lautstärke und die vom jeweiligen HA-Mediengerät unterstützten Befehle. Offline-Geräte besitzen keine aktiven Steuerungen.

Die drei Modellobjekte lassen sich über den Assistenten oder das Stiftsymbol neu zuordnen. Bewusst leere Zuordnungen und bestehende IDs bleiben beim Reimport erhalten. Die Beispielzuordnungen sind installationsspezifisch und stehen im [Blender-Verlauf](../BLENDER_WORKFLOW.md).

## Kaffeevollautomat

`CoffeeMarkers` verbindet Hauptschalter, Betriebszustand, aktives Programm, Endzeit/Fortschritt, Fernstart, Konnektivität, lokale Bedienung und Stopp-Button. Das Popup bietet Getränkeauswahl und einen getrennten Start. **Auswahl allein sendet keinen Startbefehl.**

Start benötigt eine verbundene, eingeschaltete, bereite Maschine mit erlaubtem Fernstart und ohne lokale Bedienung. Der Programmstart verwendet die aktive Programm-Select-Entity, Stopp den zugeordneten Button. Ein Verbindungsfehler sperrt Befehle und entfernt veraltete Laufdaten. Restzeiten werden nur aus vorhandenen Angaben berechnet; sonst kann die bisherige Laufzeit erscheinen.

Die zusätzlichen Felder werden mit den Floorplan-Bindings gesichert. `tools/coffee-qa.html` simuliert Bedienung und Fehlerfälle. Die Beispielaufnahme in der README stammt aus dieser Simulation.

## PCs, Server und Bildschirmkamera

IT-Objekte enthalten mehrere Geräte mit Status-, Messwert- und Aktions-Entities in `ha_it`. Das Stiftsymbol öffnet einen eigenen Editor. Hauptschalter bieten An/Aus; konfigurierte Systemaktionen wie Neustart, Schlafen und Herunterfahren verlangen eine Bestätigung. Nicht erreichbare oder ausgeschaltete PCs erhalten keine aktiven MQTT-Systemaktionen.

Die Beispielgruppen umfassen DesktopMain, einen bewusst noch nicht zugeordneten Kinderzimmer-PC und Server/Netzwerk. StorageServer bezeichnet im Beispiel das QNAP und darf nicht mit dem DesktopMain-PC verwechselt werden. Unbekannte Geräte werden nicht anhand ähnlicher Namen automatisch verknüpft.

`ITVisuals` und `ITMaterialUpdates` koppeln dedizierte Bildschirm-/LED-Materialien an den bekannten Einschaltzustand. RGB-Komponenten erhalten einen langsamen Farbzyklus; unveränderte nicht animierte Materialien werden nicht pro Frame neu geschrieben. Die Modellreihe v99 ergänzt diese Beleuchtungsflächen und transparente PC-Seitenmaterialien.

### Optionales Kamerabild auf dem Modellmonitor

Das Feld `screenshotEntityId` verweist auf eine HA-Kamera. `ITCameraScreen.ts` lädt nur den exakt zugeordneten `/api/camera_proxy/camera.…`-Pfad der konfigurierten HA-Origin. Die App verwendet im Entwicklungsserver `/HomeTwin3D/ha-camera/…`, im Add-on `/ha-camera/…`. Frontend und neue Nginx-Route müssen gemeinsam bereitgestellt werden. Die Route entfernt Authorization/Cookies, übernimmt den bildbezogenen URL-Token und deaktiviert Caching.

Ein sichtbarer, eingeschalteter PC erhält höchstens alle 10 Sekunden ein neues Bild. Verdeckter Browsertab, fehlende Verbindung, nicht verfügbare Kamera oder ein außerhalb des Kamerasichtvolumens liegender Monitor stoppen das Nachladen. Es gibt maximal eine laufende Bildanfrage, einen Timeout und eine wiederverwendete GPU-Textur mit maximal 1920 × 1080 Pixeln. Das ist eine periodische Vorschau, kein Livestream. Sichtvolumenprüfung bedeutet hier nicht vollständige Verdeckungsprüfung durch Wände.

Der separate [Windows-/MQTT-Helfer](../tools/pc-screen/README.md) veröffentlicht bei ausdrücklichem Start Desktop-JPEGs an den eingerichteten MQTT-Broker. Er verwendet HA-Discovery, maximal 200.000 Bytes je Bild, QoS 0 und keine retained Bildnachrichten. Optional kennt er die Windows-Gerätekennung des Fernsehers (`tv_monitor`): Solange Windows den Fernseher anzeigt, nimmt er dessen Bild auf, sonst den festen Screen. Er pausiert bei gesperrtem Desktop; bereits empfangene Bilder können trotzdem in HA-/Browser-Caches stehen. Zugangsdaten liegen benutzer-/rechnergebunden verschlüsselt außerhalb des Repositories. Der Helfer ist optional und wurde in diesem Dokumentationslauf weder gestartet noch installiert; getestet wurden nur synthetische Bilder und Mock-Publisher.

### Desktop als Hintergrund des Wohnzimmer-TVs

Steht der Receiver auf dem Eingang `PC`, nutzt `resolveTVScreen` die Kamera `pcScreenshot` der TV-Route (Beispiel `camera.desktop_main_bildschirm`, dieselbe Kamera wie auf dem Modellmonitor) als Hintergrund des Fernsehermodells; Beschriftung und HDMI-Badge bleiben darüber. Das Bild wird nur bei verfügbarer Kamera geladen (nicht bei `off`, `standby`, `unknown`, `unavailable`) und läuft wie das Monitorbild über `/api/camera_proxy/…` bzw. die `ha-camera`-Route; die Aktualisierung folgt dem 10-Sekunden-Takt des Helfers. Gespeicherte Wohnzimmer-Routen erben die Kamera automatisch.

### App-Hintergrund ohne Bild

Liefert die SHIELD weder Screenshot noch Cover (etwa bei geschützter Netflix-Wiedergabe), zeichnet `TVMediaScreen` für bekannte Apps (Netflix, YouTube, Plex, Prime Video, Disney+, Spotify) einen Hintergrund mit App-Schriftzug in Markenfarbe. Ohne Medientitel wird der App-Name zum Titel; vorhandene Titel, Serien-/Interpretenangaben und Fortschritt erscheinen wie gewohnt darüber. Unbekannte Apps behalten die neutrale Grafik.

## TV Dial

Das TV-Popup fordert SHIELD, PC, PlayStation, RetroPie oder Aus an. `tvDial.ts` sendet dazu das authentifizierte HA-WebSocket-Event `hometwin_tv_dial` mit `event_data.source` gleich `shield`, `pc`, `playstation`, `retropie` oder `aus`.

Die konkrete Schaltfolge bleibt in der HA-Automation. Das Beispiel erwartet `automation.tv_dial_hdmi1` mit passenden Event-Triggern. Eine deaktivierte Automation oder fehlende Verbindung sperrt die Bedienung. Ein bestätigtes Event bedeutet nur, dass die Auswahl angefordert wurde; der tatsächlich angezeigte Zustand folgt den TV-/Receiver-Entities.

[Integrationsnotizen](../tools/tv-dial-integration.md) dokumentieren die vorhandene lokale Einrichtung. Die Automation und deren private Sicherung werden nicht durch einen Git-Clone installiert. In diesem Lauf wurden keine HA-Automationen geändert.

## Wasserleck und Batterie

Wasserleckmarker erscheinen nur bei verbundenem HA und Sensorzustand `on`, derzeit an Waschmaschine und Spüle. Die Entity-Liste in `src/services/waterLeak.ts` und die Modellanker sind installationsspezifisch. Ein ausgeblendeter Marker bei Verbindungsverlust ist kein Nachweis, dass kein Leck vorliegt.

Batteriewarnungen verwenden die HA-Entity-Registry: Nur Batterie-Entities desselben `device_id` wie das zugeordnete Gerät zählen. Es gibt keine Zuordnung anhand ähnlicher Namen oder desselben Raums. Ein numerischer Batterie-Prozentwert von **0 bis einschließlich 20 %** oder ein aktiver Batterie-Binärsensor erzeugt eine Warnung. Deaktivierte Entities, andere Einheiten, fehlende Geräteidentität und unbekannte Werte werden ignoriert; bei Verbindungsverlust erscheinen keine Warnungen. Das betrifft die unterstützten Sensor-/Kontakt-/Schlossobjekte und die beiden Wassersensoren, nicht pauschal jedes HA-Gerät.

Beide Anzeigen sind Ergänzungen zum HA-Dashboard. Ihre simulierten Zustände lassen sich mit `water-leak-qa.html` und `battery-warning-qa.html` prüfen.

## Weitere Renderoptimierungen

- **Marker-Verdeckung:** `MarkerOcclusion.ts` verteilt CPU-Strahltests fair auf registrierte Marker, höchstens zwei Strahlen je Update mit weichem 1-ms-Budget. Stationäre Szenen lösen keine neuen Strahltests aus. Änderungen an Meshes werden bis zu zehnmal pro Sekunde geprüft; einzelne Marker frühestens nach 200 ms erneut. Das Zeitbudget kann durch einen einzelnen Strahl überschritten werden.
- **Grundrissübersicht:** Ab etwa 45° Blickwinkel nach unten wird die Verdeckung für die Übersicht ausgesetzt; eine Rückschaltgrenze bei 43° verhindert Flackern. Persistente Bedienelemente können die Verdeckung gezielt umgehen. Transparente Scheiben blockieren Marker nicht.
- **Markerpositionen:** Gemeinsame Projektion und wiederverwendete Vektoren vermeiden wiederholte Canvas-Messungen, DOM-Schreibzugriffe und temporäre Vektoren.
- **Schatten:** Geänderte Lichtfarbe/Helligkeit erfordert keine neue Tiefenkarte. Aktivieren einer Lichtquelle und tatsächlich bewegte Rollo-Geometrie invalidieren relevante Karten. Sonnenschatten werden nachts abgeschaltet.
- **IT-Materialien:** Nur aktive RGB-Animationen benötigen fortlaufende Farbänderungen. Statische An-/Aus- und Bildschirmzustände werden bei Änderungen aktualisiert.
- **Kamerabedienung:** Panning-Empfindlichkeit und Nachlauf wurden angepasst.

Diese Änderungen sind mit Regressionstests abgedeckt. Für den Stand vom 28.09.2026 wurde keine neue FPS- oder Draw-Call-Messreihe erhoben; ältere Vergleichswerte bleiben in der technischen Dokumentation ausdrücklich historisch.
