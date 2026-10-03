# Energiefluss, Tagesdemo, Tiere draußen und Markierungsfilter

Bedienung und Voraussetzungen dieser Funktionen. Einrichtung des Boards insgesamt: [Erste Schritte](GETTING_STARTED.md).

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
- **Markierungen:** Je Tagesabschnitt nur die passenden Kategorien (morgens und abends Licht, Rollos, Medien; tagsüber
  Geräte und Rollos; Gaming Geräte und Licht; nachts Licht). Der Finger schaltet sie an vier Stellen sichtbar um.
- **Bedienung am Board:** Der Finger tippt auf Lampen und Rollos und bedient deren echte Popups – etwa vor dem
  Kochen die Küchenspots (Reiter „Weiß“, kaltweiß, volle Helligkeit) oder später Farbe und Rollos im Wohnzimmer.
  Morgens und abends wählt er im TV-Dial-Popup die Quelle SHIELD, bevor das Bild startet; die Gaming-Session
  beginnt mit einem langen Druck auf die PC-Markierung.
- **Energiekapitel:** Energiefluss *Jetzt* und *Woche*. Die Leistung folgt dem Geschehen der Demo (Waschmaschine mit
  Heizphasen, Trockner, Kaffeemaschine beim Brühen, Fernseher beim Videoabend, PC beim Spielen, Standby sonst);
  Lampengruppen folgen dem Licht der Demo. Die Wochenwerte sind typische Werte einer Wohnung.
- **Einleitung:** Ein Dialog erklärt vor dem Start das Board; optional nennt er den Ersteller aus den Installationswerten (`author`).
- **Benchmark:** Am Ende Bilder pro Sekunde (Durchschnitt, Minimum), 1-%-Tiefs, CPU-Zeit und Draw Calls je Kapitel.

## Tiere draußen

Einstellungen → Qualität → **Tiere draußen** (aus als Standard). Eine Katze besucht ab und zu den Hof:
läuft um Bänke und Bäume, springt auf Bänke und Pfosten und liegt dort, versteckt sich hinter Bäumen und sucht
bei Regen oder Schnee Schutz. Kleine Vögel fliegen über Hof und Wohnung, landen in Baumkronen oder auf dem
Rasen und weichen Gebäuden aus; nachts und bei schlechtem Wetter bleiben sie sitzen.

Die Tiere kosten wenig Leistung (im Code erzeugt, Bewegung im Shader). Vögel fliegen auf Routen, die einmal beim Start gegen
Bäume, Gebäude und Wohnung geprüft werden. Unter WebGPU (`?engine=webgpu`) gleiten die Tiere ohne Bein- und Flügelbewegung.
Hof, Bänke und Bäume gehören zur Beispielumgebung der Referenzwohnung (siehe
[Funktionen, Grenzen und Technik](../PROJECT_STATUS.md#sonne-wetter-und-außenumgebung)).

## Markierungsfilter

Die schmale Leiste rechts unter der Werkzeugleiste blendet Markierungen nach Hauptkategorie aus und ein:
Licht, Rollos, Lüftung, Türen & Fenster, Geräte (Waschmaschine, Trockner, Kaffee, PC) und Medien (TV, Lautsprecher).
Die Auswahl wird pro Browser gespeichert. Warnungen (Wasser, Batterie) bleiben immer sichtbar.

## Leistung prüfen

Am Ende der Tagesdemo stehen Bilder pro Sekunde (Durchschnitt, Minimum, 1-%-Tiefs), CPU-Zeit und Draw Calls je Kapitel. So
lässt sich vergleichen, wie das eigene Modell auf dem eigenen Tablet läuft. Was am meisten kostet: viele gleichzeitig
leuchtende Lampen mit Schatten, sehr detaillierte Modelle und Spiegel. Für die laufende Anzeige `?perf` an die Adresse hängen;
`?device=tablet` erzwingt die sparsamere Tablet-Stufe.
