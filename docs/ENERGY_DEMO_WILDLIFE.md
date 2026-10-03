# Energiefluss, Tagesdemo, Tiere draußen und Markierungsfilter

Stand: Add-on 0.5.48 (03.10.2026). Bedienung und Voraussetzungen der Funktionen, die seit 0.5.20 dazugekommen
sind. Einrichtung des Boards insgesamt: [Erste Schritte](GETTING_STARTED.md).

## Energiefluss

Der Blitz in der Leiste oben rechts schaltet in den Skizzenstil und zeigt, wohin der Strom fließt:
leuchtende Linien von der Zuleitung zu jedem Verbraucher, Kugeln an den Geräten (Größe = Anteil) und ein
Panel mit Summe, Anteilen pro Raum und einer nach Verbrauch sortierten Liste. Das Modell wird dabei leicht
durchsichtig, Linien und Beschriftungen bleiben voll sichtbar.

- **Quelle:** die Verbraucher im **Energie-Dashboard von Home Assistant** (`device_consumption`). Die aktuelle
  Leistung kommt aus `stat_rate` oder aus einem Leistungssensor desselben Geräts (W/kW). Sind Zähler
  ineinander enthalten (`included_in_stat`), wird nichts doppelt gezählt. Ein Verbraucher mit „Main Switch“,
  „Zähler“ o. Ä. im Namen gilt als Zuleitung.
- **Platzierung:** am passenden Modellobjekt (Fernseher, PC, Waschmaschine, Kaffeemaschine, Kühlschrank, …
  über Namen und HA-Bereich), sonst im Raum des HA-Bereichs.
- **Zeiträume:** *Jetzt* (Live-Leistung) sowie *Heute, Woche, Monat* und die gleitenden *Quartal, Halbjahr,
  Jahr* (letzte 3/6/12 Monate). Für Zeiträume liest das Board die Langzeitstatistik des Recorders;
  sie ist bis zu einer Stunde im Rückstand. Auch Kugeln, Linien und Beschriftungen zeigen dann kWh.
- **Ebenen:** Geräte, Rollos (Motoren) und Licht lassen sich ein- und ausblenden. **Lampen einzeln** ersetzt die
  Licht-Gruppen durch jede Lampe an ihrer Position (Beschriftung nur, solange sie leuchtet).
- **Lampen ohne Messung (z. B. Hue):** Mit der HACS-Integration **PowerCalc** erhalten Lampen geschätzte
  Leistungs- und Energiesensoren (aus der Lampenbibliothek, mit Modell und Länge bei Lichtstreifen).
  Übersichtlich wird es mit einer PowerCalc-Gruppe je Raum („Licht Küche“, …) im Energie-Dashboard;
  die einzelnen Lampen erkennt das Board trotzdem für die Ebene *Lampen einzeln*.

## Tagesdemo

`…/?daydemo` spielt einen ganzen Tag mit 27 Kapiteln (siehe [Erste Schritte](GETTING_STARTED.md#2-ausprobieren-ohne-eigenes-modell)).
Sie arbeitet mit einer simulierten HA-Verbindung: Es wird nichts geschaltet, die eigenen Einstellungen
bleiben unverändert.

- **Darsteller:** Die Demo ordnet Lichter, Rollos, Türen, Schloss, Lüfter, Geräte, TV und PC des eigenen
  Modells anhand von Namen, Entity-IDs und Räumen ihren Rollen zu. Fehlt eine Rolle, entfällt der Schritt.
- **Kamera:** Rundflug je Kapitel und Ich-Perspektive an Fenstern, Kaffeemaschine, Küchenzeile, Esstisch,
  TV und PC. Die Kamera bleibt außerhalb von Nachbarhäusern.
- **Markierungen:** Jedes Kapitel zeigt nur die Kategorien, um die es geht (z. B. Bad: Licht und Lüftung);
  der Finger der Demo schaltet sie sichtbar in der Filterleiste um.
- **Bedienung am Board:** Der Finger tippt auf Lampen und Rollos und bedient deren echte Popups – etwa vor dem
  Kochen die Küchenspots (Reiter „Weiß“, kaltweiß, volle Helligkeit) oder später Farbe und Rollos im Wohnzimmer.
- **Energiekapitel:** Energiefluss *Jetzt* und *Woche*. Die Leistung folgt dem Geschehen der Demo (Waschmaschine mit
  Heizphasen, Trockner, Kaffeemaschine beim Brühen, Fernseher beim Videoabend, PC beim Spielen, Standby sonst);
  Lampengruppen folgen dem Licht der Demo. Die Wochenwerte sind typische Werte einer Wohnung.
- **Einleitung:** Ein privater Installationswert `installation.author` erscheint als Autor im Einleitungsdialog.
- **Benchmark:** Am Ende Bilder pro Sekunde (Durchschnitt, Minimum), 1-%-Tiefs, CPU-Zeit und Draw Calls je Kapitel.

## Tiere draußen

Einstellungen → Qualität → **Tiere draußen** (aus als Standard). Eine Katze besucht ab und zu den Hof:
läuft um Bänke und Bäume, springt auf Bänke und Pfosten und liegt dort, versteckt sich hinter Bäumen und sucht
bei Regen oder Schnee Schutz. Kleine Vögel fliegen über Hof und Wohnung, landen in Baumkronen oder auf dem
Rasen und weichen Gebäuden aus; nachts und bei schlechtem Wetter bleiben sie sitzen.

Alles wird im Code erzeugt (keine Asset-Dateien), Bewegung im Vertex-Shader: drei Draw Calls. Der Render-Loop
ruht weiter, solange sich nichts Sichtbares bewegt. Unter WebGPU (`?engine=webgpu`) gleiten die Tiere ohne
Bein- und Flügelbewegung. Die Außenanlage selbst ist eine prozedurale Beispielumgebung.

## Markierungsfilter

Die schmale Leiste rechts unter der Werkzeugleiste blendet Markierungen nach Hauptkategorie aus und ein:
Licht, Rollos, Lüftung, Türen & Fenster, Geräte (Waschmaschine, Trockner, Kaffee, PC) und Medien (TV, Lautsprecher).
Die Auswahl wird pro Browser gespeichert. Warnungen (Wasser, Batterie) bleiben immer sichtbar.

## Leistung

Messung mit dem Benchmark der Tagesdemo (Desktop, Version 0.5.43): Score 2187 → 3514, 1-%-Tiefs 5,8 → 15,8 Bilder/s,
CPU je Bild 13,7 → 9,1 ms. Wesentliche Maßnahmen:

- Durchsichtiges Skizzenmodell ohne Tiefen-Vorlauf (Babylon prüfte sonst jedes Teilnetz zweimal pro Bild).
- Schattenkarten der Lampen nach Tür-, Fenster- und Rollobewegungen verteilt (höchstens 4 pro Bild, Tablet 2);
  dunkle Lampen warten, bis sie leuchten. Größtes Einzelbild: 45 000 → 9 000 Draw Calls (Tablet).
- Spiegel nehmen ihre Umgebung über sechs Bilder auf, eine Würfelseite pro Bild.
- Verdeckungsbäume der Markierungen hängen am Geometrie-Inhalt und überstehen das Umschalten der Texturen.
