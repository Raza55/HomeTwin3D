# Geräte, Warnungen und Medien

Diese Seite beschreibt die Geräte neben Licht und Rollos: was sie anzeigen, welche HA-Entities sie brauchen und wie man sie
im eigenen Modell vorbereitet. Kennzeichnung in Blender: [Blender-Workflow](../BLENDER_WORKFLOW.md). Überblick und Grenzen:
[Funktionen, Grenzen und Technik](../PROJECT_STATUS.md).

Alle Geräte werden im Zuordnungsassistenten oder über das Stiftsymbol im Popup zugeordnet. Bewusst leere Zuordnungen und
bestehende Kennungen bleiben beim Reimport erhalten.

## Lüfter und Luftreiniger

Modellobjekt mit `ha_domain = fan`. Marker und Popup zeigen Ein/Aus und – soweit das Gerät es unterstützt – einen
Prozentregler. Fähigkeiten und Schrittweite kommen aus `supported_features` und `percentage_step`; der Regler sendet beim
Loslassen. Bei ausgeschaltetem Gerät erscheint kein Prozentwert am Marker.

## Statusanzeige Rauch

Ein `sensor` oder `binary_sensor` mit `ha_status_indicator = {"kind": "smoke", "activeStates": ["on"]}` erscheint nur, solange
sein Zustand in `activeStates` steht (z. B. `"Ja"` bei einem Textsensor). Fehlende oder unbekannte Daten und eine getrennte
Verbindung blenden ihn aus. Es ist eine reine Anzeige ohne Aktion.

## Echo und andere Lautsprecher

`media_player` mit `ha_echo_kind = dot` oder `show` erhält ein passendes Symbol. Marker zeigen Bereitschaft, Wiedergabe,
Pause, Stummschaltung und Nichterreichbarkeit; das Popup Titel, Lautstärke und die Befehle, die das Gerät laut
`supported_features` unterstützt. Nicht erreichbare Geräte haben keine aktiven Bedienelemente.

## Kaffeevollautomat

Gedacht für Geräte der Home-Connect-Integration. Das Modellobjekt (`switch` für den Hauptschalter) erhält im Popup weitere
Zuordnungen: Betriebszustand, aktives Programm (Select), Endzeit bzw. Fortschritt, Fernstart, Konnektivität, lokale
Bedienung und Stopp-Button.

Das Popup bietet Getränkeauswahl und einen getrennten Start. **Die Auswahl allein startet nichts.** Gestartet wird nur bei
verbundener, eingeschalteter, bereiter Maschine mit erlaubtem Fernstart und ohne lokale Bedienung; dann setzt die App das
Programm per `select.select_option`. Stopp drückt den zugeordneten Button. Verbindungsfehler sperren die Befehle. Restzeiten
werden nur aus vorhandenen Angaben berechnet. Hintergrund: [Home Connect in HA](https://www.home-assistant.io/integrations/home_connect/).

## Waschmaschine und Trockner

Objekte mit `ha_appliance` (`washer` bzw. `dryer`) können eine Blender-Animation (z. B. drehende Trommel) mitbringen. Ein
zugeordneter Binärsensor oder Leistungssensor startet und pausiert sie; Zusatzsensoren liefern Programm und Restzeit. Die
Animation schaltet das Gerät nicht.

Optional zeigt eine **Fertig-Anzeige**, dass Wäsche wartet: Solange die zugeordnete Entity (Helfer oder Binärsensor) `on`
meldet und das Gerät nicht läuft, wird der Marker rot, leuchtet langsam pulsierend und trägt den Hinweis „Fertig“. Wann
„fertig“ beginnt und endet, legt eine HA-Automation fest, etwa: Ende eines gültigen Laufs setzt den Helfer, Öffnen der Tür,
Abschalten (Leistung des Zwischensteckers fast null) oder ein neuer Start setzt ihn zurück. Ist ein `input_boolean`
zugeordnet, lässt sich die Anzeige im Popup mit „Ausgeräumt“ beenden. Das hilft bei Geräten, die sich nach Programmende selbst
abschalten und ein späteres Öffnen der Tür nicht mehr melden.

## PCs und Server

Ein IT-Objekt (`ha_it`) fasst mehrere Geräte zusammen, jeweils mit Hauptschalter, Status-, Messwert- und Aktions-Entities
(z. B. Neustart, Schlafen, Herunterfahren über MQTT-Buttons). Das Stiftsymbol öffnet dafür einen eigenen Editor.
Systemaktionen verlangen eine Bestätigung und sind gesperrt, solange der PC aus oder nicht erreichbar ist. Bildschirm- und
LED-Materialien des Modells können dem Einschaltzustand folgen.

### Kamerabild auf dem Modellmonitor

Im IT-Editor lässt sich eine HA-Kamera als `screenshotEntityId` zuordnen. Ihr Bild erscheint auf dem Monitor im Modell,
höchstens alle zehn Sekunden erneuert und nur, solange der PC an, der Monitor sichtbar und der Browsertab aktiv ist. Die
Bilder laufen über die Route `/ha-camera/` des Add-ons; Frontend und Nginx-Konfiguration gehören zusammen. Es ist eine
periodische Vorschau, kein Livestream.

Eine passende Kamera liefert der optionale [Windows-/MQTT-Screenshot-Helfer](../tools/pc-screen/README.md).

### Desktop auf dem Fernseher

Steht der AV-Receiver auf dem PC-Eingang, kann der Fernseher im Modell dieselbe Kamera als Hintergrund zeigen. Dafür wird die
Kamera in den Installationswerten als `camera.desktop_main_bildschirm` hinterlegt (siehe
[Installationswerte](../PROJECT_STATUS.md#installationswerte-beispiel-entities-umlenken)).

## TV Dial

Das TV-Popup bietet Quellen wie SHIELD, PC, PlayStation, RetroPie oder Aus. Die App schaltet dabei nichts selbst, sondern
sendet über die bestehende HA-Verbindung das Event `hometwin_tv_dial` mit `event_data.source` (`shield`, `pc`,
`playstation`, `retropie` oder `aus`). Die eigentliche Schaltfolge (TV an, Receiver-Eingang, Streaming-Gerät wecken …)
legt man in einer eigenen HA-Automation fest. Anleitung: [TV Dial einrichten](../tools/tv-dial-integration.md).

## Wasserleck

Ein Leckmarker erscheint, sobald ein zugeordneter Wassersensor `on` meldet und HA verbunden ist; er bleibt auch durch Wände
sichtbar. Unterstützt sind zwei Sensoren mit festen Ankern: an der Waschmaschine (Objekt mit `ha_appliance = washer`) und an
der Spüle (Objekt namens `Spuelschwamm`). Die Entities sind Beispielwerte, die man über die
[Installationswerte](../PROJECT_STATUS.md#installationswerte-beispiel-entities-umlenken) auf die eigenen Sensoren umlenkt. Ein
fehlender Marker bei Verbindungsverlust bedeutet nicht, dass kein Leck vorliegt.

## Batteriewarnungen

Die App sucht in der HA-Entity-Registry Batterie-Entities **desselben Geräts** (`device_id`) wie das zugeordnete
Modellobjekt; ähnliche Namen oder derselbe Raum zählen nicht. Ein Batteriestand von 0 bis 20 % oder ein aktiver
Batterie-Binärsensor erzeugt eine Warnung am Objekt. Deaktivierte Entities, andere Einheiten und unbekannte Werte werden
ignoriert. Das gilt für Sensoren, Kontakte, Schlösser und Wassersensoren.

## Simulation ohne echte Geräte

Die meisten Funktionen haben eine Testseite unter `/HomeTwin3D/tools/…-qa.html` im Entwicklungsserver (z. B.
`coffee-qa.html`, `water-leak-qa.html`, `battery-warning-qa.html`). Sie simulieren Zustände und Befehle, ohne Geräte zu schalten;
für die volle Darstellung brauchen sie ein passendes lokales Modell.
