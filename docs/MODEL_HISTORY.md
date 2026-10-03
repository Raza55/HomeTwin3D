# Modellhistorie der Referenzwohnung

Dieses Dokument hält die einzelnen Modellstände der Referenzwohnung des Projekts fest (Skripte, Kennzahlen, Import-Seiten,
Backup-Schlüssel). Es ist ein Arbeitsprotokoll für die Weiterentwicklung, keine Anleitung. Wie man ein eigenes Modell
einbindet, steht im [Blender-Workflow](../BLENDER_WORKFLOW.md); der Ablauf für schrittweise Änderungen an einem optimierten
Modell in der [Modell-Pipeline](MODEL_PIPELINE.md).

Die Einträge sind historische Prüfergebnisse und lokale Importzustände; sie bestätigen nicht den aktuellen Inhalt eines
beliebigen Browsers. Neue Einträge kommen oben dazu.

## Schreibtisch Schlafzimmer v111 (03.10.2026) – aktueller Modellstand

Drei Korrekturen am Schreibtisch (`tools/desk-v111.py` auf der v110-Quelle, `node tools/desk-v111.mjs` auf den optimierten v110-GLB):
- Monitor (Bildfläche, Rückseite, Leinwand, Webcam) 8 cm höher: Die Unterkante steckte im Gelenk des V-Standfußes.
- Kopfhörer (Muscheln und Bügel) 1,85 cm höher: Die Muscheln ragten in die Monitorerhöhung.
- Mikrofon neu modelliert: Gitterkorb mit Bändern, Korpus, Zierring, Bügel mit seitlichen Knöpfen, Plakette und dünne Stange (1.032 Dreiecke, neues Material `SZ_Mikrofon_Korb`);
  Standfuß und Wandbrett bleiben. Die alte Kapsel und der Stab (532 Dreiecke) sind entfernt.

Monitor, Standfuß, Kopfhörer und Mikrofon teilen `SZ_Schwarz` und überlappende Boxen. Der Patch ordnet Dreiecke deshalb über ihre Eckpunkte zu
(exakte Blender-Weltvertices, 0,3 mm Raster); Kurvenobjekte (Standfußbeine, Kopfhörerbügel) wurden beim Export anders tesselliert und nehmen die übrigen Dreiecke
in ihrer Box, bei Überschneidung die tiefer liegende Box. Der Standfuß ist als `keep` erfasst, damit nichts von ihm mitwandert.
Der PC-Marker im Manifest steigt mit dem Monitor (+0,08 m). Neueste Dateien: `Wohnung_v111_3Dash_Schreibtisch.blend/.glb` (+52 KB).
Direkt in den gemeinsamen Add-on-Stand übernommen (Revision 260 per `npm run addon:sync`; Backups unter `.private/backups/`).

## Haustür-Öffnungswinkel v108–v110 (02.10.2026)

Die Haustür öffnet nur noch bis 75° statt 90° (Benutzerwahl; Zwischenstände v108 = 80°, v109 = 77°).
`tools/entrance-swing-v1NN.py` setzt `ha_door_geometry.swingDegrees` an den Türteilen und das Maximum der Blender-Steuerung;
`node tools/entrance-swing-v1NN.mjs` überträgt den Wert in `extras.ha_door` des Knotens `Haustuer_Rechts`. Die Geometrie bleibt unverändert.
Neueste Dateien: `Wohnung_v110_3Dash_Haustuer75.blend/.glb`. Direkt in den gemeinsamen Add-on-Stand übernommen (Revision 256; Backups unter `.private/backups/`).

Seit diesem Stand lassen sich HA-Türen (Haustür, Balkon-/Fenstertüren) per Klick auf das Türblatt öffnen und schließen,
im normalen Modus und im Laufmodus (`DoorStatus` stellt `scene.metadata.haDoorClicks` bereit). Das ist eine lokale Darstellung:
Sobald der Türkontakt in HA seinen Zustand ändert, gilt wieder der HA-Zustand.

## Flurschrank v107 (02.10.2026)

Die Haustür schwang beim Öffnen in den Glasschrank daneben (frei waren nur ca. 53°, die Animation öffnet 90°).
`tools/entrance-cabinet-v107.py` (auf der v106-Quelle) schiebt den Schrank entlang seiner Wand bis an die Ecke (Ende der Sockelleiste, 5 mm Abstand, +9,1 cm)
und macht ihn 28 cm schmaler (1,20 → 0,92 m). Jede Glastür verliert 14 cm innerhalb der Verglasung (stetige, stückweise lineare Abbildung entlang der Schrankachse),
so behalten Seitenwände, Rahmen, Ringgriffe, Griffschilder und Schubladenbügel ihre Form. Die Burg auf dem Kranz wird einheitlich entlang der Achse skaliert (77 %);
eine gemeinsame Funktion für alle Burgteile ist nötig, weil der optimierte GLB Vertices zwischen Mauer und Türmen teilt.
Ein 2D-Kollisionstest (Separating Axis, Haustürblatt samt Beschlägen gegen den Schrankgrundriss) ergibt: Die Tür ist bis über 90° frei, `swingDegrees` bleibt 90.

Das Skript speichert `Wohnung_v107_3Dash_Flurschrank.blend` und die Operationen (`map_axis`, `scale_axis`, `translate`) in `.qa/entrance-cabinet-v107.json`.
`node tools/entrance-cabinet-v107.mjs` wendet dieselben Funktionen auf den optimierten v106-GLB an (95 Operationen, 7.676 Dreiecke, bei überlappenden Boxen gewinnt die kleinste;
geteilte Vertices müssen auf dieselbe Position fallen). Kontrolle: Schrankgrenzen im GLB entlang der Achse stimmen auf 0,1 mm mit Blender überein.
Import über `tools/entrance-cabinet-v107-import.html` (Backups `config:before-entrance-cabinet-v107` / `model:before-entrance-cabinet-v107`).
Am 02.10.2026 direkt in den gemeinsamen Add-on-Stand übernommen (Revision 253, Backup der vorherigen `state.json` unter `.private/backups/`).

## Schlafzimmer v106 (29.09.2026)

`tools/bedroom-v106.py` (auf der v105-Quelle) ändert:
- Gepolstertes Kopfteil: Oberkante 1,09 → 0,92 m. Nur die oberen Vertices wandern, die Fase bleibt erhalten; der Hue-Lightstrip auf der Kante folgt.
- Wandschalter: 8,5 cm aus der Türlaibung auf die Wand.
- Wandboard und weiße Rückwand: 1,86 → 1,55 m, bündig mit den äußeren Kanten des Triptychons, 6 cm höher.
  Figuren, Moospolster und Relief behalten ihre relative Position auf dem Board.

Jede Änderung steht als Operation (`translate`, `lift_above`, `squeeze_y`) mit Objekt-Bounds und Materialien in `.qa/bedroom-v106.json`.
Das Skript speichert `Wohnung_v106_3Dash_Schlafzimmer.blend`. `node tools/bedroom-v106.mjs` wendet dieselben Funktionen auf die Vertices des
optimierten v105-GLB an und verschiebt HA-Objekte (Lightstrip) als Knoten mitsamt Manifest-Position und Emittern.
Import über `tools/bedroom-v106-import.html` (Backups `config:before-bedroom-v106` / `model:before-bedroom-v106`).

## Türanbauteile v105 (29.09.2026)

Beim Öffnen von Innentüren blieben Anbauteile in der Luft stehen. Bei der Türtrennung in v91 waren sie in den statischen Batches geblieben:
- Bad: helles Innenfutter und Kapuzenfutter beider Bademäntel (`BAD62_Flauschiges_Innenfutter`)
- Abstellraum: Jackenärmel, innere Türklinke und Rosette

`tools/door-attach-v105.py` markiert in der v104-Quelle alle Objekte auf den Türblättern von Bad, Abstellraum und Zimmer mit
`ha_room_door_attach=<Tür-ID>`. Wand- und Rahmenteile (Scharniere, Schalter, Steckdosen, Zarge) sind ausgenommen. Das Skript speichert
`../blender/Wohnung_v105_3Dash_Tuerteile.blend` und die Objekt-Bounds in `.qa/door-attach-v105.json`.
`node tools/door-attach-v105.mjs` verschiebt statische Dreiecke mit passendem Material, deren drei Vertices in den Bounds eines markierten
Objekts liegen, unverändert in neue `room-door:<id>:attach:*`-Knoten mit der `ha_room_door`-Spezifikation der Tür.
Ergebnis: 8.268 Dreiecke am Bad, 780 am Abstellraum; die Jackentür des Zimmers war bereits vollständig.
Die Werkzeugwand hinter der Stirntür hängt an der Wand und bleibt statisch.
Die Fenster- und Balkontüren (HA-Türen) haben keine losen Anbauteile.
Sichtprüfung: `tools/model-view-qa.html?…&doors=open`. Import: `tools/door-attach-v105-import.html`
(Backups `config:before-door-attach-v105` / `model:before-door-attach-v105`).

## Schlafzimmer-Skulpturen v104 (29.09.2026)

`tools/sculptures-v104.py` ersetzt auf Basis der v103-Quelle die drei Strichfiguren durch Bronzeskulpturen nach Fotoreferenz.
Die Figuren sind organisch über ein Skin-Modifier-Gerüst mit Subdivision aufgebaut. Materialien: `SZ_Bronze_Skulptur` für die Figuren,
`SZ_Bronze_Patina` für den Sockel.
- Wandboard links: Sprinter in Startposition (22 × 13 cm).
- Wandboard rechts: Vorbeuge auf Felssockel (22 cm hoch).
- Kommode: Schulterstand (24 cm hoch).

Ergebnis ist `../blender/Wohnung_v104_3Dash_Skulpturen.blend` plus der Teil-Export `.qa/sculptures-v104-part.glb`
(Vorschau mit Argument `preview`). `node tools/sculptures-v104.mjs` entfernt die alten Figuren aus dem optimierten v103-GLB
(3 × 808 Dreiecke, Material `SZ_Bronze` innerhalb der alten Bounds), fügt die neuen ein (~25.200 Dreiecke) und optimiert.
Ergebnis: `Wohnung_v104_3Dash_Skulpturen.glb` (77,3 MB). Import über `tools/sculptures-v104-import.html`,
Backups unter `config:before-sculptures-v104` / `model:before-sculptures-v104`.

## Wohnzimmer-Möbel v103 (29.09.2026)

`tools/living-v103.py` (Blender, auf v100-Quelle) erzeugt `../blender/Wohnung_v103_3Dash_Wohnzimmer.blend`:
Bambus-Stehlampe 30 % niedriger (Oberkante 1,53 → 1,07 m; Füße unverändert, Ringe/Bindungen nur verschoben),
Couchtisch 70 cm, Sitzsack 60 cm und POÄNG 50 cm Richtung Sofa (POÄNG zusätzlich 15 cm nach links, frei von Dyson/Audiobox).
Die Maße landen in `.qa/living-v103.json`. `node tools/living-v103.mjs` überträgt dieselben Transformationen auf den
optimierten v102-GLB (gebündelte Möbel pro Vertex innerhalb der alten Objektgrenzen, Lampe per Knotenmatrix, Manifest-Höhe
der Lampe angepasst) und führt `optimizeGlb` aus. v101-Vereinfachung und v102-Schwellenfix bleiben so erhalten.
Import: `tools/living-v103-import.html` (Backup unter `config:before-living-v103` / `model:before-living-v103`).

## Modellstand v100 (28.09.2026)

Die lokale Reihe reicht inzwischen bis `../blender/Wohnung_v100_3Dash_Ohne_Stab.blend` und `.glb`. v94–v100 ergänzen Balkonlüfter, Echo-Geräte, Dyson-Geometrie, Kaffee- und IT-Zuordnungen, PC-Materialien sowie eine gezielte Geometriebereinigung. Die Abschnitte weiter unten beschreiben die einzelnen Schritte. Die Modelle selbst werden nicht mit Git veröffentlicht.

## Historischer Modellstand v93 (27.09.2026)

Die lokale Reihe reicht bis `../blender/Wohnung_v93_3Dash_HuePlay_beide.blend`
und `.glb`. `tools/restore-hueplay-v93.mjs` erstellt den GLB-Stand auf Basis
des v91-Modells: Beide Hue-Play-Objekte bleiben erhalten, Labels und Manifest-
Zuordnungen werden angepasst. Das Skript erzeugt keine Blender-Quelldatei.
`tools/hueplay-v93-import.html` ist der zugehörige lokale Import-Prüfstand.
Modellquellen und QA-Kopien sind nicht Bestandteil des Git-Repositories.


## Verlustfreier Export v90 und Renderoptimierung

`../blender/Wohnung_v90_3Dash_Verlustfrei.glb` entsteht durch verlustfreies
Nachbearbeiten des geprüften v89-GLB. Größe: 99.956.180 → 90.867.400 Bytes.
Unbenutzte Accessors/Bufferdaten werden entfernt, identische Binärblöcke geteilt,
exakt gleiche vollständige Vertexdatensätze zusammengeführt und passende
Indexbuffer auf 16 Bit umgestellt. Dreiecksreihenfolge, Normalen, UV-Nähte,
26 Bilddateien, 1.073 Nodes einschließlich Extras und beide Geräteanimationen
bleiben erhalten. Der unabhängige Prüfer vergleicht alle 7.437.987 Dreiecksecken
bytegenau sowie Texturen, Animationen, Materialien und Manifest.

Reproduzieren (Ausgabedatei muss neu sein):

```powershell
node tools/optimize-glb.mjs ../blender/Wohnung_v89_3Dash_Materialfarben.glb ../blender/wohnung-optimized.glb
node tools/verify-glb.mjs ../blender/Wohnung_v89_3Dash_Materialfarben.glb ../blender/wohnung-optimized.glb
```

Kein Decimate, keine verringerte Texturauflösung und keine neue Quantisierung.
Komprimierte, skinnierte oder Morph-Target-GLBs werden vom Werkzeug ausdrücklich
abgewiesen. Es ist ein Nachbearbeitungsschritt; ein neuer Voll-Export aus Blender
ersetzt nicht automatisch die selektiven, geprüften Modelländerungen früherer Versionen.
Die v90-Blend-Datei ist eine separate Quellkopie. Die Prüfung auf zusätzliche
identische Mesh-Datenblöcke fand keine weiteren Kandidaten; ihre Geometrie wurde
nicht vereinfacht. Der Bericht steht neben ihr in `.mesh-sharing.json`.

Die App bündelt identisch transformierte, statische und opake Geometrien nur für
Sonnenschatten. Originalmeshes bleiben für Bild, Auswahl und Bearbeitung erhalten;
HA-Objekte und Animationen sind ausgeschlossen. Bei Transformation, Sichtbarkeits-
oder relevanten Materialänderungen fällt die betroffene Gruppe auf Originalmeshes
zurück. Schattenproxies sind nur im eigenen Renderdurchgang sichtbar, auch nicht
in Glasbrechungen. Das kostet bei dieser Wohnung zusätzlich rund 22,8 MB
Geometriebuffer und spart 340 Zeichenaufrufe pro Bild.

Der Glas-Hintergrunddurchgang überspringt entsorgte Konstruktionsmeshes und
Geometrie außerhalb seines Kamerafrustums; Instanzfamilien bleiben zusammen.
Gemeinsam sparen beide Änderungen bei drei reproduzierbaren Perspektiven
475, 420 und 461 Zeichenaufrufe (13,8 %, 11,9 %, 13,3 %). In allen drei Fällen
sind die Vergleichsbilder pixelgleich. Das sind Renderaufrufmessungen, keine
garantierte prozentuale FPS-Steigerung.

Browserprüfung: `tools/render-performance-qa.html?model=../.qa/v90.glb`
nach Bereitstellen einer Modellkopie unter `.qa/v90.glb`.
Unit-/Regressionstests: `npm run test:performance`, `npm run test:lighting`,
`npm run test:floorplan`. Der lokal gespeicherte v89-Blob wurde vor Austausch
unter IndexedDB `appart3d/assets`, Schlüssel `model:before-lossless-v90`, gesichert.
Konfiguration und Gerätezuordnungen wurden beim Austausch nicht verändert.

## Türkontakte v86

`../blender/Wohnung_v86_3Dash_Tuerkontakte.glb` enthält vier zuordenbare Öffnungen:
die drei Wohnzimmer-Fenstertürpaare und die Balkontür. Die zugehörige `.blend`
bleibt mit den v85-Reglern bearbeitbar. **Türen, Rollos & Geräte visuell zuordnen**
führt auch durch diese vier Objekte. Kleine Symbole liegen mittig oberhalb der
gesamten geschlossenen Fensteröffnung und bleiben beim Öffnen/Kippen an diesem
Ort. Klick öffnet Status, Dauer des aktuellen Kontaktzustands und **Neu zuordnen**.
Die Kippstellung bleibt als Annahme beschriftet; fehlende/veraltete Verbindung zeigt
keine laufende Dauer. Pro Öffnung wird im Assistenten ein
`binary_sensor`-Tür-/Fensterkontakt zugeordnet.
Bekannte Bewegungs- und andere fachfremde Binärsensorklassen werden ausgefiltert.

Bei `on` / `open` öffnet ausschließlich der rechte Flügel eines Paares nach innen.
Die einzelne Balkontür öffnet nach innen links. Bis einschließlich 15 Minuten ist
die Darstellung seitlich geöffnet (90 Grad), danach gekippt (10 Grad). Das ist
eine ausdrücklich beschriftete Darstellungsannahme, kein aus HA gemessener
Kippzustand. Maßgeblich ist `last_changed`; Attributänderungen und Neuladen starten
die Zeit nicht neu. Ein Sekundentimer aktualisiert die Stellung auch ohne neues
HA-Ereignis. Ohne gültigen Zeitpunkt wird keine Kippstellung angenommen.
`off` / `closed` schließt sofort beim nächsten Update. `unknown`, `unavailable`
und Verbindungsabbruch erhalten die letzte bekannte Geometrie. Es werden keine
Tür- oder Gerätebefehle gesendet.

Der Blender-Exporter setzt Türregler für den Export vorübergehend auf geschlossen
und stellt sie anschließend wieder her. Nur bewegliche rechte Flügel (plus die
einzelne Balkontür) tragen `ha_id` und `ha_door` mit den Drehachsen im glTF-System;
dadurch bleiben linke Flügel und feste Rahmen unbewegt. Die Kennungen und
Zuordnungen überleben Reimport und die separate Zuordnungssicherung.
Ältere GLBs besitzen diese getrennte Geometrie noch nicht und müssen durch den
v86-Export ersetzt werden. Vorhandene Lampen-/Rollozuordnungen bleiben erhalten.

`npm run test:lighting` prüft auch die Tür-Zeitgrenze, unbekannte Zustände,
Rückkehr zur geschlossenen Geometrie, Kontaktfilter und Zuordnungssicherung.
`tools/doors-qa.html` prüft das exportierte Modell isoliert mit synthetischen
Kontakten, einschließlich zeitgesteuertem Wechsel nach drei Sekunden.
Der v86-Export wurde mit `doors_v86.py`, `export_doors_v86.py` und
`patch_doors_v86.mjs` aus v85/v84 erstellt: Nur die geänderte Architektur und
die sieben Flügel werden ersetzt/ergänzt. Materialien, Texturen, die 48 bisherigen
Manifestobjekte und Geräteanimationen bleiben aus dem geprüften v84-GLB erhalten.

### Bereits verwendete Entities übernehmen

Für alle Gerätekategorien im visuellen Assistenten ist **Bereits zugeordnete
Entities anzeigen** zunächst ausgeschaltet. Die eigene aktuelle Zuordnung bleibt
wählbar; anderweitig vergebene Entities sind aus Vorschlägen und Suche ausgeblendet.
Bei aktivierter Checkbox nennt die Auswahl die bisherigen Objekte. Bestätigen
verschiebt die Entity exklusiv auf das aktuelle Objekt: Alle bisherigen
Floorplan-Zuordnungen werden in derselben Speicherung explizit geleert,
einschließlich Sicherungseinträgen nicht geladener Modelle. Reimport stellt die
alten Zuordnungen daher nicht wieder her. Abbrechen und Überspringen ändern nichts.
Eine unverändert bestätigte, bereits bestehende gemeinsame Zuordnung bleibt erhalten.

## Fenstertüren v85 und Lichtübersicht

`../blender/Wohnung_v85_3Dash_Fenstertueren.blend` ergänzt die v84 um bewegliche
Originalflügel für alle drei Wohnzimmer-Fenstertürpaare und die Balkontür.
Das ausgewählte Objekt `FENSTERTUEREN__Oeffnen_und_Kippen` bietet unter
**Objekteigenschaften → Benutzerdefinierte Eigenschaften** je Flügel
`Oeffnung` (0–100 Grad) und `Kippen` (0–12 Grad). Links/rechts gilt von innen
gesehen. Die Balkontür öffnet nach innen links. Bei Öffnungswinkeln größer null
wird die Kippbewegung unterdrückt. Die Datei startet geschlossen.
Rahmen bleiben fest; Flügel, Glasscheiben und vorhandene Griffe bewegen sich zusammen.
`tools/openings_v85.py` erstellt diese Version aus v84; `tools/verify_openings_v85.py`
prüft die Treiber nach erneutem Laden und rendert geschlossen/offen/gekippt.
Die Blender-Regler sind noch keine HA-gesteuerten Türanimationen in der Webapp.
Der bestehende Floorplan-Export übernimmt die jeweils eingestellte Geometrie.

Im **Editor → Lampen → Blender-Lichtquellen** stehen alle importierten Leuchten,
einschließlich unzugeordneter. Die Übersicht zeigt Raum, Entity, Punkt-/Spotquellen,
Position, Richtung, Lichtstrom, Reichweite und Winkel aus dem zuletzt geladenen
GLB-Manifest. Lichtstrom und Reichweite sind pro Leuchte kalibrierbar und werden
mit den bestehenden stabilen Objektkennungen für spätere Reimporte gespeichert.
Im normalen Lampenformular werden die importierten Quellen ebenfalls angezeigt
und beim Speichern erhalten. Es besteht keine Live-Verbindung zur Blender-Szene;
geänderte Quellgeometrie wird durch einen erneuten Modellimport aktualisiert.

## Vorbereitete Wohnung v75

Original: `../blender/Wohnung_Fotoreferenz_v75_Dusche.blend` (unverändert).
Bearbeitbare Kopie: `../blender/Wohnung_v75_3Dash.blend`.
Optimierter Export: `../blender/Wohnung_v75_3Dash_final.glb`.

Die vorbereitete Wohnung enthält 27 Leuchtengruppen mit 52 direkten Lichtquellen,
sechs Rollos und sechs weitere Geräteobjekte. Das Schlafzimmerrollo wurde an den
vorhandenen Fensterscheiben ergänzt. Nicht eindeutig belegbare HA-Zuordnungen
bleiben leer. Insbesondere benötigen die vier Wohnzimmerrollos eine räumliche
Bestätigung; ihre Entity-Namen allein unterscheiden die Planfenster nicht sicher.

## Export und Import

1. Blender-Erweiterung `tools/blender_3dash.py` installieren. Für die vorhandene
   Store-Installation ist sie bereits aktiviert. Das Installationsskript lässt sich
   bei Updates mit `blender-launcher.exe --background --python <absoluter Pfad zu tools/install_blender_addon.py>` ausführen.
2. Die bearbeitbare Kopie öffnen. Unter Objekteigenschaften → **3Dash / Home Assistant**
   lassen sich Objektkennung, Gerätetyp, Entity und Raum bearbeiten.
3. **Datei → Exportieren → 3Dash Floorplan (.glb)** wählen. Geometrie wird nur in einer
   temporären Szene vereinfacht und nach Material, Raum und Gerätekennung gebündelt.
   Texturen bleiben erhalten. Rollos werden für den Export vollständig geschlossen,
   anschließend wird der ursprüngliche Reglerwert wiederhergestellt.
4. In 3Dash unter Einstellungen → Modell die GLB laden. Das eingebettete Manifest
   erzeugt Lampen, Rollo-Steuerungen, Gerätesteuerungen und Sensoranzeigen.
   Bestehende GLB-Dateien ohne Manifest bleiben verwendbar.
5. Bei erneutem Import erhalten stabile `ha_id`-Kennungen die Zuordnungen,
   expliziten Leerzuordnungen, Raum-Bestätigungen und App-Lichtkalibrierungen.
   Quellpositionen und Geometrie werden aktualisiert.

## Auto-Match / Guide

Home Assistant verbinden, dann im Blender-Floorplan-Bereich **Auto-Match / Guide** öffnen.
Der Assistent liest Zustände sowie Raum-, Geräte- und Entity-Register. Fehlende
Registerberechtigungen führen zu Vorschlägen mit den übrigen verfügbaren Angaben.

- Kandidaten müssen denselben Gerätetyp haben. HA-Gruppen, deaktivierte und bereits
  zugeordnete Entities werden für automatische Vorschläge ausgelassen.
- Namen werden mit Umlauten, gebräuchlichen Begriffen und Raumpräfixen verglichen.
  Der Anzeigename hat bei Nummern Vorrang vor möglicherweise veralteten Entity-IDs.
- Räume stammen direkt von der Entity oder ihrem HA-Gerät. Ein HA-Raum kann im
  Guide ausdrücklich bestätigt werden, beispielsweise Kinderzimmer → Kinderzimmer.
- Positionen werden anhand bereits eingerichteter 3Dash-Raumflächen mit HA-Räumen
  verglichen. Nahe, zugeordnete Objekte desselben Planraums liefern schwächere
  Hinweise. HA besitzt keine hier verwendeten 3D-Koordinaten. Links/rechts wird
  deshalb nicht aus einer willkürlichen Kameraperspektive geraten.
- Jede offene Zuordnung zeigt bis zu drei Alternativen, Bewertung und Gründe.
  Die Bewertung ist keine statistische Wahrscheinlichkeit. Nur mindestens 75 Punkte,
  ausreichende Namensähnlichkeit, mindestens 15 Punkte Abstand und konfliktfreie
  Kandidaten gelten als eindeutig. Konkurrieren zwei Objekte um dieselbe Entity,
  wird keine automatische Auswahl getroffen.
- **Eindeutige Vorschläge in Entwurf übernehmen** setzt nur den Entwurf.
  **Zuordnungen übernehmen** speichert und lädt die Darstellung neu. Dabei werden
  keine Geräte geschaltet. Mehrere physische Leuchtflächen derselben Entity können
  bewusst manuell zusammengefasst werden; doppelte Rollo-Zuordnungen sind unzulässig.

Nach dem Speichern kann **Gespeicherte Zuordnungen für Blender exportieren** eine JSON-Datei
erzeugen. Diese in Blender über **3Dash Zuordnungen importieren** im Objektpanel laden
und die Blend-Datei speichern. Die Kennungen verbinden beide Programme; Objektbezeichnungen
können anschließend geändert werden, ohne diese Verbindung zu verlieren.

## Licht und Rollos

In der Live-Ansicht öffnet Hover eine kompakte Lichtkarte; Klick oder Tippen fixiert
sie. Ein/Aus, Helligkeit, Farbe und Weißtemperatur richten sich nach den gemeldeten
HA-Fähigkeiten. Ein Klick auf das Modell schaltet die Lampe nicht mehr unmittelbar.
„Mehr“ öffnet die vollständige Bedienung, einschließlich vorhandener Zusatzfunktionen.

Nahe Spots derselben Namensfamilie (höchstens 85 cm Abstand zum gewählten Spot)
erscheinen gemeinsam als runder Planmarker. Explizite Editor-Gruppen haben Vorrang.
Die vier Küchenspots der v75 bilden eine gemeinsame Steuerung: „Alle 4“ steuert
Helligkeit und Ein/Aus gemeinsam, 1–4 wählen eine einzelne Lampe. Im Farbkreis hat
jeder Spot einen nummerierten, ziehbaren Punkt. Richtung bestimmt Farbton, Abstand
zur Mitte die Sättigung. Gleichfarbige Punkte werden zur besseren Erreichbarkeit
optisch auseinandergezogen. „Warm → Blau“ verteilt einen Farbverlauf über die
nummerierte Reihenfolge; „Gleiche Farbe“ übernimmt die Farbe des ausgewählten Spots
für alle. Es handelt sich um einzelne HA-Lampenbefehle, nicht um einen zeitlich
synchronisierten Hue-Entertainment-Stream. Änderungen werden beim Loslassen gesendet.
„Weiß“ bietet separat den Kelvin-Regler. Esc oder ein Klick außerhalb schließt die Karte.

Die Erweiterung erzeugt Punkt- bzw. Spotquellen an den tatsächlichen Diffusoren.
Längere Stripes und Panels erhalten mehrere Quellen, die sich den Gesamtlichtstrom
teilen. Das Manifest führt Position, Richtung, Lichtstrom, Reichweite und Öffnungswinkel.
`ha_light_lumens`, `ha_light_range`, `ha_light_angle` und optional
`ha_light_direction` (Blender-Weltkoordinaten) erlauben gezielte Anpassungen.
`ha_light_kind` unterstützt `point`, `spot`, `strip` und `panel`.

HA-Zustände steuern gemeinsam Leuchtfläche und Lichtquellen: an/aus, Helligkeit,
RGB/HS/XY und Farbtemperatur. Nicht verfügbare oder getrennte Leuchten strahlen
nicht weiter mit einem alten Zustand. Die HA-Farbfähigkeiten werden beim Aktualisieren
der Entities übernommen. Lichtstrom und Reichweite sind zusätzlich pro Planobjekt
in der App kalibrierbar.

Die Lichtwerte sind Startschätzungen, keine vermessene Lux-Simulation der Wohnung.
Für eine nähere Entsprechung echte Lumenwerte, Abstrahlwinkel und Farben eintragen.
Der Echtzeitrenderer berücksichtigt je Oberfläche bis zu 32 aktive Planlichtquellen
zusätzlich zum Tageslicht. Bei begrenzter GPU-Uniform-Kapazität wird dieser Wert
reduziert. Unabhängig davon werfen höchstens sechs der stärksten aktiven Quellen
Schatten; so bleiben lange Strips sichtbar, ohne das Textursampler-Limit zu
überschreiten. Schatten sind bei maximal 512 Pixeln pro Quelle begrenzt und werden
bei Licht- oder Rolloänderungen aktualisiert. Quellen ohne Schatten bieten keine
Wandabschattung. Strips werden durch verteilte Lichtquellen angenähert, nicht als
kontinuierliche Flächenlichtquelle. Hardware und Modellkomplexität bestimmen die Bildrate.

Rollo-Stellungen folgen HA: 0 = geschlossen, 100 = offen. Die animierten Flächen
ersetzen nur die markierten Lamellen, nicht Fenster und Rahmen. Unbekannte Zustände
erhalten die letzte Geometrie und zeigen keine erfundene Position. Bewegungsmeldungen
ohne Positionswert erzeugen keine künstlichen Zwischenstände.

## Überprüfung

### Zuordnungen unabhängig vom Modell

Die App führt `floorplanBindings` separat von `model.floorplan` in ihrer dauerhaft
gespeicherten Konfiguration. Bestehende Zuordnungen werden automatisch übernommen.
Modellwechsel, fehlende Objekte und ein zwischenzeitlicher Import ohne Manifest
löschen diese Liste nicht. Beim Reimport werden Entity, HA-Raum, Lichttyp und
Lichtkalibrierung über die unveränderte Blender-Objektkennung wiederhergestellt.
Positionen und Geometrie stammen aus dem neuen Plan. Auch eine bewusst geleerte
Entity bleibt leer. Namen und Dateinamen dürfen sich ändern; die `ha_id` muss
erhalten bleiben. Neue Objektkennungen benötigen eine neue Zuordnung.

Unter **Einstellungen → 3D-Modell → Alle Zuordnungen sichern** lässt sich die
vollständige Liste als `3dash-bindings.json` exportieren. **Zuordnungsdatei laden**
stellt sie wieder her und ersetzt bei gleichen Kennungen die gespeicherten
Entscheidungen. Das ZIP-Backup enthält zusätzlich `floorplan-bindings.json`.
Der vorhandene Export **für Blender** bleibt eine separate Datei mit dem aktuellen
Plan. Die Speicherung gilt für diesen Browser und diese App-Adresse; vor einem
Browserwechsel, Löschen der Browserdaten oder vollständigem App-Reset die Datei
sichern. Die Wiederherstellung löst keine HA-Gerätebefehle aus.

### Kompakte Live-Steuerung

Die frühere tabellarische Zuordnung wurde durch den visuellen Assistenten ersetzt.
Unzugeordnete Lampen sind über ein gestricheltes Lampensymbol mit Plus sowie über
ihre Modellfläche anklickbar. Der Assistent öffnet dann nur dieses Objekt.
Unter **Einstellungen → 3D-Modell** starten getrennte Durchgänge für Lampen bzw.
Rollos und andere Geräte. Lichtstrom und Reichweite sind beim jeweiligen Licht im
Assistenten unter **Licht kalibrieren** erreichbar und werden mit der Bestätigung
gespeichert. Die separate Zuordnungssicherung und der Blender-Export bleiben dort
verfügbar.

Die Ensis über dem Esstisch besitzt zwei unabhängige Blender-Objektkennungen und
HA-Entities: `light.hue_ensis_down_1` mit drei nach unten gerichteten Quellen und
`light.hue_ensis_up_1` mit drei nach oben gerichteten Quellen. Der bestehende v75-Export
enthält bereits beide Richtungen. Ein gemeinsames Symbol öffnet die Steuerung mit
**Unten** (Tischlicht) und **Oben** (Deckenlicht); beide bleiben einzeln schaltbar,
dimmbar und farbsteuerbar. Eine gemeinsame Bedienung verbindet die HA-Entities
nicht dauerhaft und ändert ihre separaten Zuordnungen nicht.

**Lampen visuell zuordnen** startet direkt in der Live-Ansicht den geführten
Matching-Durchgang. Die Kamera fokussiert jede Lampe, die Modellfläche wird türkis
markiert und ein nummerierter Marker zeigt ihre Position. Der Assistent geht alle
Lampenmodelle raumweise durch, einschließlich bereits zugeordneter Leuchten.
Vorschläge berücksichtigen Namen, HA-Räume und die vorhandenen Positionshinweise.
Unpassende Vorschläge mit sehr niedriger Bewertung werden ausgeblendet; eine andere
Entity kann über die Suche gewählt werden. Gruppen werden nicht vorgeschlagen.

**Bestätigen & weiter** speichert die Entscheidung sofort in der separaten
Zuordnungsliste. **Überspringen** verändert nichts; übersprungene Lampen lassen sich
am Ende erneut prüfen. **Ohne Entity speichern** entfernt die Zuordnung bewusst.
Eine schon anderweitig verwendete Entity wird vor der Bestätigung gekennzeichnet.
Beim Schließen werden die gespeicherten Änderungen in der Live-Szene geladen.
Während des Durchgangs bleiben Gerätesteuerungen durch Klick auf das Modell aus;
die Kamera kann weiterhin gedreht werden. Der isolierte UI-Test
`tools/visual-matching-qa.html` prüft den Ablauf einschließlich Speicherfehlern
ohne Home Assistant oder Änderungen an der echten Konfiguration.

Hover zeigt die Lampensteuerung, Klick fixiert sie. Die vier Küchenspots erscheinen
als gemeinsamer runder Marker. Der Farbkreis hat vier einzeln verschiebbare,
nummerierte Punkte. „Alle 4“ steuert die gemeinsame Helligkeit; die Nummern wählen
einen einzelnen Spot. „Warm → Blau“ erzeugt einen Verlauf über die vier Leuchten,
„Gleiche Farbe“ vereinheitlicht sie. „Weiß“ wechselt zur Farbtemperatur.
Die App sendet reguläre HA-Befehle je Entity, keinen synchronen Hue-Entertainment-Stream.

### TV-Wand v76

`../blender/Wohnung_v76_3Dash_TV.blend` ergänzt v75 um sechs getrennt zuordenbare
Lichtbereiche: zwei liegende Hue Play Bars hinter der Dekoration oben auf den
Vitrinen, einen rückseitigen TV-Rahmen, je einen Rahmen an den beiden hohen
Lautsprechern und einen Strip an der oberen Lowboard-Kante. Die vorhandenen
Wallwasher bleiben erhalten. Form und Maße der Play Bars orientieren sich an
[Philips Hue](https://www.philips-hue.com/en-gb/p/hue-white-and-colour-ambiance-play-light-bar-single-pack/7820131P7).

`tools/update_tv_wall_v76.py` erzeugt die Ergänzungen reproduzierbar in der
Sammlung `3Dash_TV_Wand_v76` und exportiert `Wohnung_v76_3Dash_TV.glb`.
Alle Segmente eines Strips teilen sich eine feste Objektkennung. Die sechs
neuen Bereiche beginnen ohne HA-Entity und können im visuellen Zuordnungsmodus
oder direkt im Live-Plan zugeordnet werden. Bestehende Kennungen und separat
gespeicherte Zuordnungen werden beim erneuten Import übernommen.

Die Lichtquellen strahlen zur Rückwand; die Play Bars zusätzlich nach oben.
Farbe und Helligkeit folgen nach der Zuordnung dem HA-Zustand. Lichtleistung
und Reichweite sind Startwerte zur Kalibrierung am echten Raum. Importierte
Geräte verwenden ausschließlich ihre Modellgeometrie: Dadurch entfällt auch
der zuvor oberhalb des Fernsehers sichtbare leuchtende Lautsprecher-Platzhalter.

`node --test tools/tv-wall.test.mjs` prüft beide Exportdateien auf stabile IDs,
Positionen, Strahlrichtungen, Lichtleistung und Erhalt der Zuordnungen.
`tools/tv-wall-qa.html` lädt `.qa/v76.glb` für die visuelle Einzelprüfung mit
simulierten Zuständen; erst der ausdrückliche Importknopf übernimmt das Modell.

### Schlafzimmer v77

`../blender/Wohnung_v77_3Dash_Schlafzimmer.blend` und der gleichnamige GLB ergänzen
v76 um zwei Hue-Lightstrip-Bereiche: 1,78 m an der hinteren Oberkante des
gepolsterten Bettkopfteils und 0,79 m an der hinteren Oberkante des Nachttischs
hinter den Büchern. Die Sammlung `3Dash_Schlafzimmer_v77` enthält sechs bzw.
drei Diffusorsegmente, jeweils mit gemeinsamer fester Objektkennung. Die Quellen
strahlen nach oben zur Wand. Die zwei Bereiche beginnen ohne HA-Zuordnung;
alle 45 bisherigen Objektkennungen bleiben unverändert.

`tools/update_bedroom_v77.py` lädt auf Basis der geöffneten v76-Datei die Ergänzungen
in Blender und erstellt den vollständigen Export. `node --test tools/bedroom.test.mjs`
prüft die beiden Exportdateien, Striplängen, Richtungen und den Zuordnungserhalt.
`tools/bedroom-qa.html` lädt `.qa/v77.glb` mit ausschließlich simulierten Lichtzuständen.
Der Importknopf prüft vor und nach dem Import die zu diesem Zeitpunkt gespeicherten
Zuordnungen einschließlich bewusst leer gelassener Entities.

### Allgemeine Prüfungen

Rollo-Symbole im Live-Plan öffnen eine kompakte Steuerung mit Öffnen, Stopp,
Schließen und – sofern vom Gerät unterstützt – einem Positionsregler.
Raumbefehle werden bei mehreren zugeordneten Rollos eingeblendet. Aktuelle
HA-Raumzuordnungen haben Vorrang vor Blender-Raumlabels; nicht zugeordnete Rollos
zeigen ein Plus für den visuellen Assistenten. Raumaktionen berücksichtigen nur
verfügbare Geräte mit der erforderlichen Funktion, deduplizieren Entity-IDs und
melden fehlgeschlagene Befehle. Der Positionsregler sendet beim Loslassen.
Die Befehle entsprechen den [HA-Cover-Aktionen](https://www.home-assistant.io/integrations/cover/).
`node --test tools/cover-controls.test.mjs` prüft Gruppierung und Fähigkeiten;
`tools/cover-qa.html` prüft die Bedienung mit protokollierten Testbefehlen ohne HA.

`npm run typecheck`, `npm run test:floorplan`, `npm run test:lighting`, `npm run build -- --mode addon`.
Mit `FLOORPLAN_GLB` als Umgebungsvariable prüft der Test zusätzlich den echten Export.
Node 22.18 oder neuer wird für das direkte Einlesen der TypeScript-Testmodule benötigt.

Der lokale Prüfstand `tools/floorplan-qa.html` lädt `.qa/v75.glb` und prüft alle
Objektkennungen, Koordinaten, Lichtleistung und Rollo-Stellungen. Seine Testzustände
existieren nur in der Szene. `tools/matching-qa.html` prüft den echten Dialog mit
simulierten HA-Registerantworten im Arbeitsspeicher. Diese Seiten sind Entwicklungstools
und nicht Bestandteil des Produktions-Builds. Reale Geräte wurden nicht zum Test geschaltet.


### Wohnzimmer-Korrektur v78
`tools/update_living_lamps_v78.py` auf `Wohnung_v77_3Dash_Schlafzimmer.blend` ausführen.
Die beiden bisherigen Quadratspots werden bei unveränderten Objekt-IDs ersetzt:
Hue Go neben dem Sofa am Boden (mit Abstand zur Pflanze) und Hue Play hinter der
Deko auf der Fenstervitrine. Alte Spotgehäuse, Halter und ihr Deckenkabel entfallen.
Quelle/Export: `blender/Wohnung_v78_3Dash_Wohnzimmer.blend` / `.glb`.
`tools/living-lamps-qa.html` prüft beide Lichtquellen und importiert erst nach einem
Vergleich aller aktuellen Zuordnungen; es sendet keine HA-Schaltbefehle.
Regression: `node --experimental-strip-types --test tools/living-lamps.test.mjs`.


### Hue-Go-Duplikat v79
`tools/remove_duplicate_go_v79.py` auf v78 entfernt ausschließlich die ältere
`Kabelbox_Hue_*`-Leuchte einschließlich Gehäuse, Rand, Zuleitung und Blender-Licht.
Die neue bodennahe Hue Go behält ihre ID und HA-Zuordnung. Das Modell enthält
46 Objekte. Die andere Hue Go am gegenüberliegenden Sofaende bleibt unverändert.
`tools/huego-cleanup-qa.html` importiert das GLB und prüft alle verbleibenden
Zuordnungen sowie das Entfernen des alten aktiven Lichtpunkts. Der separate
Zuordnungs-Verlauf bleibt für alte Planversionen erhalten.
Prüfung: `node --experimental-strip-types --test tools/huego-cleanup.test.mjs`.


### Fenster und Park v80
`update_windows_v80.py` speichert auf Basis von v79 die Blender-Fenstermaterialien
als transparentes Glas. `patch_windows_glb.py` übernimmt die Materialänderung in
das v79-GLB; dessen Binärgeometrie bleibt unverändert. Der Blender-Export verwendet
Transmission, die Echtzeitdarstellung Alpha-Blending ohne doppelte Abdunklung.
Nur ausdrücklich benannte Fensterscheiben werden in `WindowGlass.ts` von den
Schattenwerfern ausgenommen; Wände, Rahmen und bewegliche Rollos bleiben erhalten.
`ParkEnvironment.ts` erzeugt eine dekorative Umgebung außerhalb des Modells und
einen Tages-/Nachthimmel. Sie beeinflusst weder Modellgröße noch Entity-Picking.
Dashboard liest HA `get_config` für Standortkoordinaten und behält bei Fehlern
den gespeicherten Standort. Kein festes Überschreiben mehr. Sonnenstand wird
minütlich aus Datum, Uhrzeit, Koordinaten und der bestehenden Nordausrichtung
berechnet. Diffuses Umgebungslicht bleibt eine Echtzeit-Näherung, keine Raum-GI.
HA-Referenzen: https://developers.home-assistant.io/docs/api/websocket/#fetching-config
und https://www.home-assistant.io/integrations/sun/ .
`tools/windows-qa.html`: lokale Tests für Tag/Nacht, offene/geschlossene Rollos,
gezielten Sonneneinfall und Import mit Erhalt aller übrigen Zuordnungen.
Tests: `node --experimental-strip-types --test tools/window-glass.test.mjs tools/huego-cleanup.test.mjs`.


### Außenblick v81
`remove_window_photo_v81.py` entfernt `SZ_Fensterausblick_Fotoreferenz` aus Blender.
`patch_window_photo_v81.py` entfernt ausschließlich dessen exportiertes Mesh und
korrigiert GLB-Meshindizes; alle 46 Entity-Objekte bleiben identisch.
Die alte Bildtextur wird von keiner aktiven Geometrie mehr verwendet.
Die prozedurale Außenumgebung orientiert sich an den vom Nutzer gelieferten
Karten: Wohnung am Rand von Hauptgebäude, Grünzug auf der Hauptfensterseite,
geschwungene Wege und benachbarte Baukörper 101/95/93/97/91. Distanzen,
Höhen und die Anbindung an den Modellgrundriss sind angenähert, nicht vermessen.
Keine externen Kartendaten oder Texturen werden nachgeladen.
`tools/exterior-qa.html` prüft Schlafzimmerfenster, Übersicht und Import.
Test: `node --experimental-strip-types --test tools/exterior.test.mjs`.

### Hauptgebäude: Integration und Fassadenausrichtung
Die Wohnung ist Bestandteil des gemeinsamen Hauptgebäude-Grundrisses. Die restliche
Gebäudefläche wird als niedriger Schnitt dargestellt, ohne die Wohnung zu überbauen.
Die markierte Fensterfassade dient als Bezug: Außenumgebung um angenähert 20 Grad
zur Modellachse ausgerichtet (`SiteLayout.ts`). Die tatsächliche Cover-Linie ersetzt
überstehende Import-Bounds als Fassadenanker. Apartmentkoordinaten, GLB und
Entity-Zuordnungen bleiben unverändert; diese Korrektur ist rein prozedural in der App.
Prüfung: `node --experimental-strip-types --test tools/site-layout.test.mjs`.

### Korrektur der Gebäudeecke und des Gesamtmaßstabs
Hauptgebäude beginnt jetzt bündig an der Stirnseite der Wohnung, entsprechend der
orange/roten Nutzermarkierung. `SITE_SCALE = 1.35` vergrößert die gesamte
Außenumgebung einschließlich Nachbargebäuden, Wegen, Bäumen und Abständen um 35 %.
Dreh-/Skalierungsanker ist die Fassadenecke der Wohnung. Der Hausgrundriss verwendet
denselben Faktor; die ausgesparte Wohnungsfläche behält ihre bisherigen Koordinaten.
Dadurch entspricht die relative Wohnungsgröße etwa 74 % des vorherigen Maßstabs.
Es werden keine Entity-Zuordnungen oder Modellkoordinaten verändert.

### Maßgebliche Grundrissvorlage: rosa Wohnung unterhalb des Zugangs
Die frühere Eckplatzierung ist durch die neue Nutzerskizze ersetzt. Hauptgebäude wird
anhand der fünf Außenkanten der Vorlage aufgebaut. Die rosa Wohnung liegt am
rechten Fassadenabschnitt unterhalb des Hauszugangs. Die Größenverhältnisse folgen
der Vorlage: gesamte Gebäudetiefe zu Wohnungs-Fassadenlänge 537:147, Gebäudebreite
zu Wohnungsbreite 427:170. Keine Vermessungsgenauigkeit ohne reale Maße.
Der Zugangsweg endet oberhalb der Wohnung; der Hauptweg läuft mit Abstand parallel
zur Fassade. Nachbargebäude und Park behalten den gemeinsamen Außenmaßstab 1.35.
Diese Skizze ersetzt die vorherige Annahme einer Wohnung an der oberen Gebäudeecke.

### Fassadenkante und Bodenbeschnitt v82
`trim_ground_v82.py` schneidet nur `ground_1` an der äußeren Stirnfassade zurück,
in `Bestand_Grundriss_Fenster_weitere_Raeume` und der Originalgeometrie
`Original_gesamte_Wohnung`. Je 10 Bodenpolygone betroffen, keine Wände oder Entities.
Quelle: Wohnung_v82_3Dash_Fassadenkante.blend. Der selektive Blender-GLB-Export der
Bodenfläche wird durch `patch_ground_v82.mjs` in das geprüfte v81-GLB eingesetzt.
Node-Transformationen müssen identisch sein; andere Primitive und Binärdaten bleiben
unverändert. Die Außenkontur wird nun anhand der äußersten schrägen Fensterfassade
statt der überstehenden Bounding Box kalibriert. Die letzte Standortkarte bestätigt
die rechte Gebäudespitze entlang des Wegs. Die Umgebung bleibt eine Annäherung.
Tests: `node --experimental-strip-types --test tools/ground-v82.test.mjs tools/site-layout.test.mjs`.

Wegekorrektur: Der vom Nutzer gelb markierte Querweg (park-north-link) existiert nicht und wurde aus der prozeduralen Umgebung entfernt. Gebäudeausrichtung und GLB v82 bleiben unverändert.

Platanengruppe: Drei große prozedurale Platanen (angenäherte Höhe 16–18 m) im blau markierten Bereich östlich des Hauptwegs. Eigene helle, gefleckte Rinde, verzweigte Stämme und unregelmäßige breite Kronen. Teil der App-Außenumgebung, ohne Modellimport oder Änderung der Entity-Zuordnungen.

Fassaden nach Referenzfoto: Prozedurale Putz-/Fenstertextur mit dunklen Rahmen, französischen Geländern und einzelnen Rollos; umliegende Gebäude mit zurückgesetztem Obergeschoss. Keine eingebrannte Fotobeleuchtung. Wohnung im 1. OG: Außengelände 3,2 m unter der bisherigen Wohnungsebene, Erdgeschossfassaden unter Hauptgebäude ergänzt. Entity- und GLB-Koordinaten bleiben stabil; Geschosshöhe angenähert.

Nachbargebäude: vier Geschosse je Baukörper (drei Vollgeschosse plus ein Staffelgeschoss). Höhe und Texturwiederholungen sind auf vollständige Fensterreihen abgestimmt.
Korrektur: insgesamt fünf Geschosse (vier Vollgeschosse plus Staffelgeschoss), gemäß letzter Nutzerangabe.
Dachetage dezenter: Staffelgeschosshöhe von 2,7 auf 2,0 Szenenmeter reduziert (rund 26 %), vier Vollgeschosse unverändert. Eine vollständige Fensterreihe wird auf die niedrigere Höhe angepasst.

Hauszugang verkürzt: Abstand Hauptweg–Fassade halbiert (9,45 auf 4,725 m bis Wegmitte). Hauptweg näher an Hauptgebäude, Anschluss bündig. Platanen behalten unabhängig vom Weg ihre bisherigen Positionen.

Wetterdarstellung: vorhandene Open-Meteo-Abfrage am gespeicherten HA-Standort (10-Minuten-Intervall) steuert nun auch Außenhimmel, Dunst, nasse Wege und eine stilisierte Schneeauflage. Regen/Schnee starten außerhalb der Wohnungsbegrenzung mit Sicherheitsabstand. Wetter-Schalter setzt Himmel/Boden/Dunst zurück; Tag/Nacht bleibt erhalten. Lokale Vorschau über Wetterauswahl in exterior-qa.html, ohne HA-Befehle.

Bodenrand v83: ground_1 auch entlang der rückwärtigen Wandkontur inkl. Versatz beschnitten. Aktuelles und enthaltenes Originalmesh in Wohnung_v83_3Dash_Bodenrand.blend geändert. Selektiver GLB-Export ersetzt ausschließlich das Bodenprimitive; alle Entities und übrige Mesh-Primitive geprüft unverändert. Reproduktion: trim_ground_v83.py auf v82, dann patch_ground_v83.mjs.

Erdgeschossdecke geschlossen: durchgehende Platte über dem gesamten Hauptgebäude-Grundriss unterhalb des importierten Wohnungsbodens. Die frühere rechteckige Aussparung und dadurch nach Bodenbeschnitt sichtbare Lücke entfallen.


## v84: Waschmaschine und Trockner
- Blender source: `../blender/Wohnung_v84_3Dash_Waesche.blend`; GLB with two independent loop clips, stable UUIDs and appliance manifest entries.
- Reproduce geometry with `tools/appliances_v84.py` against v83, merge the small Blender export using `tools/patch_appliances_v84.mjs`. Existing v83 geometry/binary bytes remain unchanged. `tools/appliances_v84_bindings.py` saves the confirmed entity IDs and auxiliary sensors to Blender.
- `blender_3dash.py` now preserves tagged appliance actions and excludes animated objects from static batching. Supplemental entity settings are carried in `ha_appliance_config`.
- Binary sensors control playback only; no HA services are sent. Rest-time and program entities appear in compact live markers. Click marker or drum to edit mappings. The separate binding archive includes appliance settings.
- QA: `tools/appliance-qa.html` tests independent playback/pause and guarded import. Both new objects imported; all 41 prior occupied mappings preserved.
# Haustür und Schloss (v87)

`blender/Wohnung_v87_3Dash_Haustuer.blend` ergänzt die bestehende Wohnung um die bewegliche Haustür. Am Objekt `FENSTERTUEREN__Oeffnen_und_Kippen` öffnet `Haustuer_Rechts_Oeffnung` das Türblatt samt Klinke, Knauf und Spion von innen gesehen nach rechts in den Flur. Die Zarge bleibt fest. Die Haustür hat keine Kippstellung.

`Wohnung_v87_3Dash_Haustuer.glb` einmal im Programm importieren. Vorhandene Zuordnungen bleiben über ihre IDs erhalten. Im Geräte-Assistenten sind **Haustür** (`binary_sensor`, Türkontakt) und **Haustür Schloss** (`lock`) getrennt zuzuordnen. Das Symbol oberhalb der Tür zeigt Kontaktstatus und Dauer sowie ein Schlosszeichen. Sein Popup enthält den Schlossstatus und getrennte Aktionen zur Neuzuordnung. Entriegelt bedeutet nicht, dass das Türblatt offen steht; unbekannte oder nicht verfügbare Schlosszustände werden ausdrücklich angezeigt. Es werden keine Schlossbefehle gesendet.

Das Schloss nutzt ebenfalls den standardmäßig ausgeschalteten Filter „Bereits zugeordnete Entities anzeigen“ mit exklusiver Übernahme. Die Verknüpfung mit der Haustür bleibt in Zuordnungsbackups erhalten. `tools/entrance_v87.py`, `tools/patch_entrance_v87.mjs` und `tools/verify_entrance_v87.py` bauen und prüfen die Dateien. Der Teil-Export ersetzt die 328 Tür-Dreiecke im vorhandenen GLB; übrige Materialien, Texturen, Objekte und Geräteanimationen bleiben erhalten.

## v91: Zimmertüren im Walk-Modus

`../blender/Wohnung_v91_3Dash_Zimmertueren.glb` trennt vier Innentüren aus den statischen v90-Batches. Türblätter, Innenflächen, Beschläge, Beschriftung und Türhaken samt Kleidung behalten ihre vorhandenen Vertexdaten und Materialien. Rahmen bleiben statisch. `ha_room_door` enthält die Scharnierposition in glTF-Elternkoordinaten sowie relative Offen-/Geschlossenwinkel; diese lokalen Animationen senden keine HA-Befehle. Der Zustand gilt bis zum Neuladen.

Reproduktion: `tools/prepare-room-doors.py` in der geöffneten v89-Blender-Datei ausführen (nur temporäre Kopien), dann `node tools/patch-room-doors.mjs` im Webapp-Verzeichnis. Das Werkzeug prüft die Anzahl der extrahierten Dreiecke, erhält alle übrigen Indizes und schreibt eine neue Datei. Die abweichende ältere Bademantelgeometrie des v90-Exports wird aus ihrem eigenen Materialbatch übernommen. Das Originalmodell und die Blender-Datei bleiben erhalten.

In der lokalen App ist v91 importiert; IndexedDB enthält die vorherige Datei unter `model:before-room-doors-v91`. Im Walk-Modus öffnet/schließt ein Linksklick oder kurzes Antippen die erreichbare Innentür. Ziehen zum Umsehen löst keinen Tür-Klick aus. Tests: `npm run test:walkthrough`.
## Balkon v94 (28.09.2026)

`Wohnung_v94_3Dash_Balkon.blend` und `.glb` ergänzen die beiden vorhandenen
Balkonlüfter mit stabilen IDs sowie einen reinen Rauchstatusmarker:

- Turmventilator: `fan.turmventilator`.
- Weißes Standgerät/Luftreiniger: `fan.balcony_air_purifier` (im Wizard änderbar).
- Rauch: `sensor.rauchstatus_balkon`, nur bei `Ja` sichtbar. `Nein`, fehlende
  Daten, `unknown`, `unavailable` und eine getrennte HA-Verbindung blenden ihn aus.

Lüfter im Geräte-Assistenten zuordnen. Ein Klick auf Objekt oder Lüftersymbol
öffnet Ein/Aus und den Prozentregler. Der Regler berücksichtigt
`percentage_step` und `supported_features` aus HA und sendet beim Loslassen.
Im Plan steht die Stärke unter dem Symbol nur bei eingeschaltetem Lüfter.
Der Rauchmarker besitzt keine Aktion und erzeugt kein dauerhaftes Sensordisplay.

Reproduktion: `tools/balcony-v94.py` in Blender mit v93 ausführen, anschließend
`node tools/balcony-v94.mjs`. Der binäre GLB-Geometrieblock bleibt bytegleich;
bei älteren, nach Material zusammengefassten Lüfterflächen erzeugt die App
unsichtbare Klickvolumen aus den in Blender gemessenen Abmessungen.
Ein späterer Voll-Export erhält die Lüfter-IDs durch `blender_3dash.py`.

Lokale Prüfung: `/HomeTwin3D/tools/balcony-qa.html` simuliert Zustände und Befehle
ohne echte Geräte zu schalten. Der gesonderte Importknopf übernimmt v94 in den
Browserplan; vorher werden Konfiguration (`config:before-balcony-v94`) und Modell
(IndexedDB `appart3d/assets`, `object:model:before-balcony-v94`) gesichert.
Der Import erhält vorhandene Zuordnungen. Die Seite gehört nicht zum Produktionsbuild.

Validierung: `npm run test:balcony`, `npm run test:floorplan`,
`npm run test:lighting`, `npm run typecheck` und Produktionsbuild.
Browserprüfung: Ein/Aus, Prozentregler, Wizard und Ausblenden des Rauchmarkers
bei `Nein` bzw. Verbindungsverlust. Kein HA-Deployment und keine realen Schaltbefehle.
## Echo-Geräte v95 (28.09.2026)

`Wohnung_v95_3Dash_Echos.blend` / `.glb` ergänzt die drei vom Nutzer markierten
Geräte: `SZ_Kugel_Uhr` + `SZ_Uhrzeit` als Echo Dot Schlafzimmer,
`F41_Rundes_Messgeraet` + `F41_Messgeraet_Skala` als Echo Dot Wohnzimmer und
`KZ_Tabletgehaeuse` / Display / Uhrzeit als Echo Show Kinderzimmer.
Vorbelegung: `media_player.bedroom_speaker`, `media_player.schlafzimmer_echo`
(aktueller HA-Name: Wohnzimmer Echo), `media_player.room_display`.

Kleine 24-px-Marker mit eigenen Dot-/Show-Silhouetten zeigen Bereitschaft,
Wiedergabe (cyan), Pause (amber), Stummschaltung und Nichterreichbarkeit.
Klick auf Marker oder Objekt öffnet Status, Titel, Lautstärke und die vom
Gerät per `supported_features` unterstützten HA-Medienbefehle. Nicht verbundene
Geräte bieten keine aktiven Bedienelemente. Zuordnung ist im Geräte-Wizard und
über das Stiftsymbol möglich; leere Zuordnungen und bestehende IDs bleiben erhalten.

Reproduktion: `tools/echo-v95.py` in Blender, danach `node tools/echo-v95.mjs`.
Geometrie bleibt bytegleich zu v94. `tools/echo-v95-import.html` übernimmt das
Modell mit Konfigurationsbackup `config:before-echo-v95` und Modellbackup
`object:model:before-echo-v95` in IndexedDB. Bestehende Zuordnungen werden geprüft.
Tests: `npm run test:echo`, `npm run test:floorplan`, `npm run test:lighting`,
`npm run typecheck`, `npm run build`. HA-Eigenschaften wurden read-only geprüft;
kein realer Medienbefehl wurde zum Testen gesendet.


## Dyson Balkon v96 (28.09.2026)

`Wohnung_v96_3Dash_DysonBalkon.blend` / `.glb` ersetzt den vom Nutzer markierten
Platzhalter `B37_Klapptisch_gefaltet` samt Fuge neben dem Grill durch einen Dyson
mit offenem Luftring, Filterperforation, Display, Sockel und Fernbedienung (1,054 m).
Bestätigte Entity: `fan.balcony_air_purifier`. Die bisher dem weißen Standgerät
zugewiesene UUID `f0240660-07cb-52ed-93a3-c5770c4acc21` bleibt erhalten und wandert
zum tatsächlichen Dyson. Das Standgerät hat keine Lüfter-Zuordnung mehr.

Reproduktion: v95 in Blender öffnen; im nächsten Aufruf `tools/dyson-v96.py`
ausführen, danach `node tools/patch-dyson-v96.mjs`. Partieller Export ersetzt
exakt 88 alte Dreiecke. Alle 60 anderen Manifestobjekte und beide Animationen
bleiben unverändert. Neue Dyson-Geometrie trägt die Geräte-ID für Mesh-Klicks.

`tools/dyson-v96-import.html` importiert mit Backup (`config:before-dyson-v96`,
IndexedDB `object:model:before-dyson-v96`). Import im lokalen Browser durchgeführt.
`tools/dyson-qa.html` prüft Modell, Wizard und Steuerung ohne echte HA-Befehle.
Geprüft: Darstellung, Prozentänderung 70 auf 80 und Ausblenden der Prozentzahl
bei Aus, korrekte Service-Entity, Manifestintegrität, `npm run typecheck`.

## Siemens Kaffeevollautomat v97 (28.09.2026)

Bestehendes Modell TI9558, UUID `4ecb50d9-06f8-5abb-8d1b-6fb8e42e1205`,
Raum Wohnzimmer, `switch.kaffeevollautomat_power`. Coffee-Metadaten verbinden
Betriebszustand, aktives Programm, Endzeit, Fortschritt, Fernstart, Konnektivität,
lokale Bedienung und Stopp-Button. Zusatzzuordnungen werden mit Bindings gesichert.

Grünes Kaffeesymbol nur bei Betriebszustand run. Programm und verbleibende Zeit
stehen am Marker; ersatzweise Zeit seit Beginn des laufenden Zustands.
Popup: Ein/Aus, Getränkeauswahl, expliziter Start, Stopp, Programm und Zeiten.
Auswahl allein sendet keinen Befehl. Start nutzt select.select_option auf dem
aktiven Programm, Stopp button.press. Start benötigt Verbindung, eingeschaltete
bereite Maschine, Fernstart und keine lokale Bedienung. Ausfall sperrt Befehle
und blendet veraltete Laufdaten aus. Keine künstliche Restzeit bei fehlenden Werten.
Semantik: https://www.home-assistant.io/integrations/home_connect/#select

Reproduktion aus v96: tools/coffee-v97.py in Blender, node tools/coffee-v97.mjs.
Nur Manifest geändert, GLB-Binärgeometrie bleibt identisch. v97 im lokalen Browser
über tools/coffee-v97-import.html übernommen; Backups config:before-coffee-v97
und IndexedDB object:model:before-coffee-v97. Andere Zuordnungen erhalten.

Validierung: test:coffee (4), test:floorplan (28), Typecheck, Produktionsbuild;
UI-Simulation von Auswahl, Start, Countdown, Stopp und Verbindungsverlust in
tools/coffee-qa.html. Keine realen Kaffeebefehle zum Testen.
# PCs und Server (v98)

## PC-Beleuchtung nach Fotoreferenz (v99)

`tools/pc-v99.py` ergänzt CPU-Block-Kontur, beleuchtete Anschlüsse und 36 Front-LED-Segmente. Es ersetzt das zuvor undurchsichtige Seitenfenster durch ein schwach getöntes Alpha-Glas und korrigiert Acryl sowie Kühlmittel. Bestehende RAM-, Lüfter-, GPU- und Gehäuse-Leuchtflächen werden mit dem PC-Status gekoppelt; Violett/Pink ist die Startfarbe des langsamen Farbzyklus (etwa 79 Sekunden). `tools/pc-v99.mjs` hängt nur neue Geometrie an v98 an und tauscht die dedizierten PC-Materialien aus. Alle 63 Objektkennungen, vorhandenen Geometriedaten und beide Animationen bleiben erhalten. Modellmaterialien werden beim Reimport aktualisiert, individuelle HA-Zuordnungen bleiben bestehen. Lokale Sicherungen heißen `config:before-pc-v99` und `model:before-pc-v99`.

`tools/it-v98.py` ergänzt drei logische IT-Objekte in der Blender-Datei: DesktopMain im Schlafzimmer, einen noch nicht zugeordneten PC im Kinderzimmer sowie eine gemeinsame Server-/Netzwerkgruppe im Abstellraum. `ha_it` speichert die Geräte, Status-, Messwert- und Aktionsentitäten. Im Popup erlaubt der Stift das Zuordnen aller Felder; IT-Geräte verwenden daher ihren eigenen Editor statt der generischen Ein-Entity-Zuordnung.

Die Hauptschalter stammen aus dem HA-Dashboard **PCs & NAS** (`fritzbox-netzwerk/systeme`): `switch.desktop_main_power`, `switch.desktop_secondary_power` und `switch.storage_server`. DesktopMain und DesktopMain-satellite sind derselbe PC; StorageServer ist ausschließlich das QNAP. Der zweite PC enthält absichtlich keine geratenen Entity-IDs. MQTT-Buttons bleiben bei ausgeschalteten oder nicht erreichbaren PCs gesperrt. Neustart-/Schlaf-/Herunterfahren-Buttons werden wie im HA-Dashboard bestätigt; Hauptschalter bieten An und Aus.

`ITVisuals` klont die dedizierten Bildschirm-/LED-Materialien: `SZ_monitor`, `SZ_PC67_LED_Gruen`, `KZ_Monitor_Dunkelglas`. Bildschirm und LEDs sind nur bei bekanntem An-Status aktiv; DesktopMain-RGB durchläuft den Farbkreis in etwa 58 Sekunden. Die frühere unzugeordnete PC-RGB-Lichtkennung wird zugunsten dieser PC-Steuerung entfernt. `ha_visual_only` verhindert erneutes automatisches Tagging dieser LEDs.

`tools/it-v98.mjs` übernimmt die v97-Geometrie unverändert und ergänzt das Manifest. Der lokale Import über `tools/it-v98-import.html` sichert Konfiguration und Modell unter `config:before-it-v98` bzw. `model:before-it-v98` und prüft alle bisherigen Zuordnungen außer der bewusst ersetzten PC-RGB-Kennung. `npm run test:it` prüft Status, Befehlsauswahl, Offline-Sperren und den Erhalt der Zuordnungen beim Reimport. `tools/it-qa.html` ist eine Simulation ohne echte HA-Befehle.

## Modellstand v100 – Wohnzimmer ohne Stab
Entfernt die 27 am falschen Ort stehenden Aquaduct-Meshreste (Drehregler und überlagerte Kühlrippen) bei Blender-Weltposition (9.418, -5.4584, 0). Die übrigen Aquaduct-Teile bleiben erhalten. Quelle: ../blender/Wohnung_v100_3Dash_Ohne_Stab.blend. tools/remove-rod-v100.mjs entfernt ausschließlich die 1.236 Dreiecke in diesem kleinen Bereich aus Static_0330 des v99-GLB; alle 63 Zuordnungen bleiben erhalten. tools/rod-v100-import.html übernimmt das Modell mit Backup.
