# Erste Schritte: vom eigenen Blender-Modell zum 3D-Dashboard

Diese Anleitung führt vom ersten Start bis zum fertig angepassten Dashboard. Sie setzt eine laufende
Home-Assistant-Installation voraus. Ein eigenes Modell ist für den Einstieg nicht nötig: Demo-Modus und
Tagesdemo zeigen alle Funktionen ohne Einrichtung.

## 1. Installieren

**Als Home-Assistant-Add-on (empfohlen):** Einstellungen → Add-ons → Add-on Store → Repositorys →
`https://github.com/Raza55/HomeTwin3D` hinzufügen, **HomeTwin3D** installieren und starten, dann
`http://<deine-ha-ip>:8099` öffnen. Details (Port, HTTPS, gemeinsame Version): [Add-on-Dokumentation](../3dash-addon/DOCS.md).

**Lokal zum Entwickeln:** `npm install`, `npm run dev`, dann `http://127.0.0.1:5187/HomeTwin3D/` (siehe [README](../README.md#schnellstart)).

Für Tablets HTTPS über einen Reverse Proxy einrichten (mit WebSocket-Unterstützung); Safari ist auf
unsicheren Seiten deutlich langsamer.

## 2. Ausprobieren ohne eigenes Modell

- **Demo-Modus:** Im Einrichtungsassistenten „Demo“ wählen. Eine Beispielwohnung mit simulierten Lichtern,
  Rollos und Geräten lässt sich wie eine echte bedienen; nichts wird in Home Assistant geschaltet.
- **Tagesdemo:** `…/?daydemo` öffnen. Ein simulierter Tag von 5:30 bis 5:30 in rund drei Minuten:
  Aufstehen mit Lichtwecker und Rollos, Kaffee, Bad mit Lüftung, Frühstück mit Nachrichten,
  Abwesenheit mit Haustür und Schloss, Waschmaschine und Trockner, Besuch der Hofkatze, Gewitter mit
  Anwesenheitssimulation, Kochen mit wechselnder Lichtfarbe, Lüften, das Board als Fernbedienung,
  Videoabend mit Hue-Sync-Licht, Energiefluss (jetzt und Woche), Gaming, Nachtlicht und Schnee.
  Ein Einleitungsdialog erklärt das Board, eine Zeitleiste erlaubt Springen, Pausieren und Tempo.
  Ein sichtbarer Finger bedient dabei die echten Popups und die Filterleiste.
  Parameter: `&from=HH:MM` (Startzeit), `&speed=2` (Tempo). Am Ende zeigt die Demo einen
  Leistungswert (Bilder pro Sekunde, CPU-Zeit) – ein praktischer Test für das eigene Tablet.
  Die Demo läuft auch mit dem eigenen Modell: Sie sucht sich Lichter, Rollos, Türen und Geräte
  anhand ihrer Namen und Räume aus und lässt fehlende Rollen weg.

## 3. Eigenes Modell in Blender vorbereiten

1. **Wohnung modellieren** in Metern, Z nach oben. Für eine gute Darstellung genügen Wände, Böden,
   Fenster/Türen und die wichtigsten Möbel; Texturen sind optional (es gibt auch einen Skizzenmodus).
2. **Blender-Erweiterung installieren:** In Blender unter Bearbeiten → Einstellungen → Add-ons
   „Von Datenträger installieren“ und `tools/blender_3dash.py` wählen (Blender 4.2 oder neuer).
3. **Objekte kennzeichnen:** Objekt auswählen → Objekteigenschaften → **3Dash / Home Assistant**.
   Dort Gerätetyp (`light`, `cover`, `switch`, `fan`, `media_player`, `sensor`, `binary_sensor`, `lock`,
   …), Raum und – wenn schon bekannt – die Entity eintragen. Jedes gekennzeichnete Objekt erhält eine
   stabile Kennung (`ha_id`); sie hält spätere Zuordnungen auch bei Umbenennungen und Reimporten.
   - **Leuchten:** Leuchtkörper (Spot, Streifen, Punkt, Fläche) als `light` kennzeichnen. Helligkeit
     und Reichweite lassen sich als `ha_light_*`-Eigenschaften schätzen und später in der App kalibrieren.
   - **Rollos:** Behang als `cover` kennzeichnen; für den Export wird er geschlossen dargestellt.
   - **Türen/Fenster:** Türblätter als `binary_sensor` (Türkontakt) bzw. `lock` (Schloss) kennzeichnen.
4. **Exportieren:** Datei → Exportieren → **3Dash Floorplan (.glb)**. Der Export vereinfacht und bündelt
   nur eine temporäre Kopie; die Blender-Datei bleibt bearbeitbar. Ein eingebettetes Manifest beschreibt
   Lampen, Rollos, Geräte und Sensoren.

Ausführlich, mit allen Eigenschaften, Stolperfallen und der Arbeit mit KI-Agenten: [Eigenes Modell mit Blender einbinden](../BLENDER_WORKFLOW.md).

## 4. Verbinden und Modell laden

Der Einrichtungsassistent fragt nacheinander:

1. **Home Assistant:** Adresse und einen langlebigen Zugriffstoken (HA-Profil → Sicherheit → Token erstellen).
2. **Modell:** die exportierte GLB-Datei hochladen. Aus dem Manifest entstehen Lampen, Rollo-Steuerungen,
   Gerätesteuerungen und Sensoranzeigen.
3. **Standort:** Koordinaten für Sonnenstand, Tageslicht und Wetter.

## 5. Geräte zuordnen

Unter **Einstellungen → Geräte zuordnen** (oder per Tipp auf eine noch nicht zugeordnete „?“-Markierung im Plan):
Der Zuordnungsassistent liest Zustände sowie Raum-, Geräte- und
Entity-Register von Home Assistant und schlägt pro Modellobjekt passende Entities vor – mit Bewertung,
Begründung und bis zu drei Alternativen. Eindeutige Vorschläge lassen sich gesammelt übernehmen, die
übrigen per Auswahl. Dabei wird nichts geschaltet.

Die gespeicherten Zuordnungen lassen sich als JSON exportieren und in Blender über
**3Dash Zuordnungen importieren** übernehmen. So bleibt die Blender-Datei die vollständige Quelle.

## 6. Anpassen

**Editor** (Zahnrad oben links neben dem Logo → *Editor öffnen*):

| Bereich | Wofür |
| --- | --- |
| Lichter | Leuchten hinzufügen, gruppieren, Lichtwirkung (Helligkeit, Reichweite, Farbe) kalibrieren |
| Rollos | Rollos platzieren und zuordnen, Raumaktionen für alle Rollos eines Raums |
| Screens/Computer | TV- und PC-Bildschirme, Quellenwahl, PC-/Servergruppen mit Messwerten und Aktionen |
| Lichtblocker | Unsichtbare Wände, die Licht dort abschirmen, wo das Modell offen ist |
| Smart-Home-Geräte | Lüfter, Saugroboter, Kaffeemaschine, Echo, Waschmaschine/Trockner und weitere |
| Energie & Flüsse | Eigene animierte Fluss-/Leitungsdarstellungen |
| Räume | Raumflächen für Zuordnung, Raumaktionen und Kamerafahrten |
| Modell | Modellteile verschieben, drehen, skalieren, zurücksetzen |

**Einstellungen** (Zahnrad oben links): Texturen oder Skizzenstil, Schattenqualität, Wettereffekte,
Mindesthelligkeit draußen, **Tiere draußen** (Katze und Vögel, optional), Perspektive, Sprache, Theme
und die gemeinsame Version für alle Geräte.

**Auf dem Plan:** Die Leiste oben rechts schaltet zwischen Texturen, **Energiefluss**, Lauf-/Flugmodus
und der Startansicht um. Die schmale Leiste darunter **filtert die Markierungen** nach Hauptkategorie
(Licht, Rollos, Lüftung, Türen & Fenster, Geräte, Medien). Der Plan nutzt die ganze Breite; ein Seitenpanel
gibt es nicht.

Mehr zu Energiefluss, Tagesdemo, Tieren und Filter: [Energie, Demo, Tiere und Filter](ENERGY_DEMO_WILDLIFE.md).
Geräte und Warnungen im Detail: [Geräte und Warnungen](DEVICES_AND_ALERTS.md).

## 7. Auf allen Geräten gleich

Mit dem Add-on lassen sich Modell, Zuordnungen und Einstellungen einmal veröffentlichen
(Einstellungen → System → *Gemeinsame Version*, mit PIN aus den Add-on-Optionen). Jedes Tablet und jeder
Browser im LAN übernimmt sie beim Öffnen; nur die HA-Verbindung wird pro Gerät eingerichtet.
Details: [Add-on-Dokumentation](../3dash-addon/DOCS.md#gemeinsame-version-für-alle-browser).

## 8. Später am Modell weiterarbeiten

Kleine Änderungen (Möbel umstellen, Objekte ergänzen) in Blender vornehmen und erneut exportieren und
hochladen: Zuordnungen, Raum-Bestätigungen und Lichtkalibrierungen bleiben über die `ha_id` erhalten.
Für größere oder schrittweise Änderungen an einem optimierten Modell beschreibt die
[Modell-Pipeline](MODEL_PIPELINE.md) das Vorgehen mit Patch-Skripten, Sichtprüfung und Backup.

## Hilfreiche Adressparameter

| Parameter | Wirkung |
| --- | --- |
| `?daydemo` (`&from=HH:MM`, `&speed=2`) | Tagesdemo starten |
| `?perf` | Leistungsanzeige (Bilder/s, CPU-Zeit, Draw Calls) |
| `?device=tablet` / `?device=desktop` | Leistungsstufe erzwingen |
| `?wildlife` | Hofkatze erscheint sofort (wenn „Tiere draußen“ an ist) |
