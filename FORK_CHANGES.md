# Feature-Übersicht des Forks

Deutsch | [English](./FORK_CHANGES.en.md)

Für den Gesamtstand vom 27.09.2026 einschließlich Blender, Medien, Navigation
und Performance siehe [PROJECT_STATUS.md](PROJECT_STATUS.md). Die folgende
Übersicht beschreibt die bisherigen grundlegenden Fork-Erweiterungen.

Diese Datei dokumentiert die Erweiterungen des Branches `featureaddon` gegenüber
`upstream/main` von `Kdcius/3Dash_webapp`. Die Änderungen bleiben mit bestehenden
Konfigurationen kompatibel: Neue Felder sind optional und werden erst durch die
entsprechenden Editor-Funktionen gesetzt.

## 3D-Modell und zusätzliche Objekte

- Das Hauptmodell kann zur Laufzeit in den Einstellungen durch eine neue GLB-Datei
  ersetzt oder erneut geladen werden.
- Vor dem Austausch wird die Datei geprüft. Schlägt das Laden fehl, wird das zuvor
  verwendete Modell wiederhergestellt.
- Eine gemeinsame Szenenskalierung hält Hauptmodell, Lampen, Rollos, Screens,
  Energieflüsse und weitere platzierte Objekte relativ zueinander ausgerichtet.
- Texturen lassen sich im Editor und in der normalen 3D-Ansicht über kompakte
  Icon-Buttons ein- und ausschalten.
- Zusätzliche Modelle können als GLB, glTF, OBJ oder STL importiert werden.
- Importierte Modelle besitzen Position, Rotation und Skalierung und werden getrennt
  vom Hauptmodell gespeichert.
- Unterobjekte des Hauptmodells können ausgewählt und mit lokalen Overrides für
  Position, Rotation und Skalierung feinjustiert werden. Die ursprüngliche GLB-Datei
  wird dabei nicht verändert.
- Beim Ersetzen des Hauptmodells werden nicht mehr zuverlässig passende
  Unterobjekt-Overrides verworfen; platzierte Smart-Home-Objekte bleiben erhalten.

## Editor und Bedienung

- Der Editor öffnet sich aus den Einstellungen (Zahnrad neben dem Logo).
- Die Editor-Kategorien verwenden kompakte Lucide-Icons mit Anzahl, Tooltip und
  zugänglichem `aria-label` statt langer Tab-Texte.
- Die globalen Transformationsmodi Verschieben, Drehen und Skalieren stehen direkt in
  der 3D-Ansicht zur Verfügung.
- Position, Ausrichtung und Skalierung sind in den Objektformularen als eigene Bereiche
  organisiert und für Lampen, Rollos, Screens, Lichtblocker, Smart-Home-Geräte,
  importierte Modelle und Modell-Unterobjekte verfügbar.
- Slider arbeiten in feineren, wertbezogenen Bereichen, damit kleine Änderungen mit
  der Maus weniger empfindlich sind.
- Orbit-Panning, Rechtsklick-Verschieben und Zoom wurden ruhiger abgestimmt.
- Zur besseren Orientierung kann die Modelltextur im Editor direkt umgeschaltet werden.
- Die Editor-Kopfzeile zeigt den Zurück-Button links und den Editor-Titel rechts.
- Deutsch und Englisch wurden für die neuen Oberflächen und geführten Touren ergänzt.

## Lampen und Home Assistant

- Lampen unterstützen Kugel, Würfel, Ellipsoid, mehrteilige Formen, Lichtleisten und
  Nanoleaf-Shapes-ähnliche Paneele.
- Position, Rotation und dreiachsige Skalierung können unabhängig bearbeitet werden.
- Eine eigene Hitbox kann als Kugel, Box oder Ellipsoid positioniert, gedreht und
  skaliert werden.
- Integrierte Leuchtenkörper stehen für Deckenleuchte, Pendelleuchte, Stehleuchte,
  Spot und Lichtleiste zur Verfügung. Dabei handelt es sich um leichte prozedurale
  3D-Geometrie, nicht um externe oder markengebundene GLB-Dateien.
- Optional kann die Hitbox in der Live-Ansicht als halbtransparente Touch-Zone mit
  schwebendem, kamerazugewandtem Licht-Icon angezeigt werden.
- Die Touch-Zone übernimmt Farbe und Zustand der Home-Assistant-Lampe, wird beim
  Darüberfahren hervorgehoben und bleibt im ausgeschalteten Zustand neutral sichtbar.
- Ein kurzer Tap schaltet die Lampe. Langes Drücken öffnet die Detailsteuerung.
- Doppeltippen kann optional eine zweite Entity, etwa einen Deckenventilator, schalten.
- Dimmen, Farbtemperatur, RGB-Farbe und Hue-/Home-Assistant-Szenen stehen in der
  Live-Ansicht zur Verfügung.
- Bedienelemente werden anhand der von Home Assistant gelieferten `supported_color_modes`
  nur angezeigt, wenn die jeweilige Lampe sie tatsächlich unterstützt.
- Helligkeit und Farbe beeinflussen sowohl das emissive Leuchtmaterial als auch die
  Babylon-Lichtquelle. Eine Mindestdarstellung verhindert, dass eingeschaltete, stark
  gedimmte Lampen fälschlich wie ausgeschaltet wirken.
- IR-/Remote-Lichter können Modi und Farben über zusätzliche Entities abbilden.

## Räume und Home-Assistant-Bereiche

- Der Editor besitzt eine eigene Kategorie `Räume`, die Home-Assistant-Bereiche über
  die Area-, Device- und Entity-Registries der WebSocket-API nur lesend synchronisiert.
- Nicht konfigurierte HA-Bereiche können direkt aus der Raumliste übernommen werden;
  ein visueller Raum darf bei Bedarf mehrere HA-Bereiche zusammenfassen.
- Jeder Raum erhält einen im 3D-Modell platzierbaren Mittelpunkt sowie eine anpassbare,
  drehbare Bodenfläche. Der Mittelpunkt besitzt einen eigenen stabilen Griff und folgt
  sowohl Modellklicks als auch den Positionsreglern ohne verzögerte Vorschau.
- Raumflächen können als Rechteck oder als frei geformtes, auch konkaves Polygon
  gespeichert werden. Eckpunkte lassen sich direkt in der 3D-Ansicht auswählen,
  verschieben, hinzufügen und entfernen; ein Reset stellt wieder ein Rechteck her.
- Neue Räume starten ohne vorgeblendete Fläche. Ein Klick auf eine freie Bodenstelle
  wird zuerst auf eine breite horizontale Bodenfläche projiziert. Besitzt das importierte
  Modell eine getrennte Boden-Meshfläche, wird bevorzugt deren tatsächliche Dreiecks-
  Außenkante als Polygon übernommen. Dadurch enden Räume auch an offenen Türen sauber
  an ihrer Bodenmaterialgrenze. Für Modelle ohne getrennte Bodenflächen bleibt die
  Erkennung über hohe, vertikale und über fünf Messhöhen konsistente Wandtreffer als
  Fallback erhalten; niedrige oder kompakte Möbel werden dabei weitgehend ignoriert.
- Für offene Übergänge lassen sich direkt im 3D-Modell virtuelle Begrenzungswände als
  Linie mit Start- und Endpunkt zeichnen. Ihre Endpunkte können einzeln verschoben und
  die komplette Linie kann ausgewählt oder gelöscht werden. Eine erneute Raumerkennung
  behandelt diese endlichen Segmente wie Wände; sie werden dauerhaft pro Raum gespeichert.
- Virtuelle Begrenzungswände können bereits vor der ersten Raumerkennung gezeichnet
  werden. In diesem Zustand zeigt die 3D-Ansicht nur Linien und Endpunkte, keine
  künstliche Startfläche; die Erkennung übernimmt und rebasiert diese Grenzen. Ein
  beschrifteter Button im Raum-Panel macht das Werkzeug vor der Erkennung direkt sichtbar.
- Im Entwicklungsmodus werden alte produktive PWA-Service-Worker automatisch entfernt,
  damit der lokale Editor nach Änderungen keine veraltete Oberfläche aus dem Cache lädt.
- Raumflächen auf derselben Höhenebene dürfen sich nicht überlagern. Die Prüfung arbeitet
  mit den tatsächlichen, auch konkaven Polygonen und erlaubt gemeinsame Kanten und Ecken.
  Konflikte werden rot und mit den betroffenen Raumnamen angezeigt; Raum- und globales
  Speichern bleiben gesperrt, bis die Überschneidung behoben ist. Andere Etagen bleiben
  unabhängig voneinander.
- Im Räume-Modus bleiben alle bereits gespeicherten Nachbarräume auch beim Bearbeiten
  oder Erkennen einer weiteren Fläche sichtbar. Ihre Polygonkanten werden auf derselben
  Ebene automatisch als endliche virtuelle Trennwände für die Raumerkennung verwendet,
  ohne sie als manuelle Wände in den neuen Raum zu kopieren.
- Die automatische Erkennung zieht bereits zugeordnete Raumflächen derselben Etage
  geometrisch von der neuen Kontur ab und behält den freien Teil am angeklickten
  Bodenpunkt. Ist dort keine überlappungsfreie, als einfaches Polygon darstellbare
  Fläche vorhanden, wird die Erkennung abgelehnt statt eine Überschneidung anzulegen.
- Die Etage wird dabei anhand der erkannten Bodenhöhe bestimmt, nicht anhand der Höhe
  des angeklickten Möbels. Die Erkennung läuft anschließend mit den Begrenzungen aller
  Nachbarräume erneut und verwirft defensiv jede verbleibende Überschneidung.
- Mit dem Scheren-Werkzeug lässt sich eine bestehende Raumfläche direkt in der
  3D-Ansicht teilen. Nach dem Schnitt öffnet sich eine Zuordnung für alle Teilflächen:
  Jede Teilfläche kann einem bereits konfigurierten Raum zugewiesen werden, dessen
  alte Fläche dadurch ersetzt wird, oder einem noch freien Home-Assistant-Bereich.
  Freie Bereiche werden als neue Räume samt priorisierter Entities angelegt. Der
  Quellraum wird entfernt, falls ihm kein Teil zugewiesen wird.
- Gemeinsame Schnittkanten gelten nicht als Überschneidung. Bereits vorher vorhandene,
  durch den Schnitt unveränderte Konflikte blockieren die Zuordnung nicht erneut;
  neu entstehende Überschneidungen werden direkt im Zuordnungsdialog angezeigt.
- Solange keine Kontur erkannt wurde, bleiben Transformationswerkzeuge und Speichern
  ausgeblendet beziehungsweise deaktiviert. Erst die anschließende Feinbearbeitung
  blendet kleine Eckpunktgriffe ein; das Gizmo erscheint nur für den gewählten Griff.
- Die globalen Werkzeuge Verschieben, Drehen und Skalieren gelten auch für die gesamte
  Raumfläche. Beim Verschieben eines einzelnen Polygonpunkts bleibt die vertikale
  Raumebene gesperrt.
- Beim Bearbeiten wird nur die aktive Raumfläche angezeigt. Veraltete Vorschauflächen,
  Konturen und Eckpunktgriffe werden vor jedem Neuaufbau vollständig entfernt, damit
  sie sich beim Verschieben nicht überlagern.
- Raumnamen erscheinen als kompakte, raumbezogen skalierte Schilder erst beim
  Darüberfahren oder bei einer aktiven Auswahl. Im Räume-Tab haben Raumflächen beim
  Anklicken Vorrang vor darüberliegenden Lampen und anderen Objekten.
- Zugeordnete Entities werden nach Sicherheit, Hauptsteuerung, Klima, Medien und
  Raumstatus priorisiert. Diagnostik-, Konfigurations- und deaktivierte Entities werden
  standardmäßig ausgeblendet.
- Bereits als Licht, Rollo, Screen, Smart-Home-Gerät oder Energiefluss platzierte
  Entities werden automatisch erkannt und in der Empfehlung höher eingestuft.
- Die wichtigsten Entities können pro Raum einzeln ausgewählt und in fester Reihenfolge
  in der App-Konfiguration gespeichert werden.
- Auf schmalen Editorfenstern weicht die Objektliste während der Bearbeitung, sodass
  3D-Fläche, Transformationswerkzeuge und Formular gleichzeitig bedienbar bleiben.

### Raumfarben

- Jede Raumfläche kann eine eigene Farbe und transparente Deckkraft erhalten.
- Bestehende Räume ohne gespeicherte Farbe bekommen automatisch eine stabile Farbe
  aus einer gut unterscheidbaren Palette.
- Rot bleibt als Warnfarbe für echte Überschneidungen auf derselben Ebene reserviert;
  gemeinsame Kanten und Eckpunkte gelten weiterhin nicht als Konflikt.
- Farbe und Deckkraft werden mit der Raumkonfiguration gespeichert und von Backup und
  Wiederherstellung übernommen.

## Rollos und Cover-Entities

- Die Kategorie Rollos verbindet rechteckige 3D-Rollos mit Home-Assistant-Entities
  aus der Domain `cover`.
- Unterstützt werden Öffnen, Schließen, Stoppen und eine Zielposition in Prozent,
  sofern die Entity die jeweiligen Funktionen bereitstellt.
- Teilweise geöffnete Rollos werden mit sichtbaren Lamellen dargestellt.
- Breite, Höhe, Tiefe, Lamellenzahl, Position, Rotation und Skalierung sind editierbar.
- Der aktuelle Cover-Zustand wird in der Live-Ansicht visualisiert und aktualisiert.

## Screens und Computer

- Der frühere Display-Bereich heißt `Screens/Computer`.
- Verfügbare Typen sind Informationsanzeige, TV, PC, Konsole und QNAP/NAS.
- Der TV-Modus kann eine `media_player`-Entity verbinden und zeigt unter anderem
  Ein/Aus-Zustand, Quelle, App, Lautstärke und verfügbare Medieninformationen.
- Der ausgeschaltete Bildschirm wird dunkel dargestellt; aktive Screens erhalten eine
  passende Leuchtwirkung.
- Größe, Position, Ausrichtung und Skalierung sind im rechten Editor-Panel einstellbar.
- Neue Screens und andere platzierte Objekte verwenden relativ zur Modellgröße
  berechnete Standardmaße.

## Lichtblocker

- Die frühere Kategorie `Wände` heißt `Lichtblocker`.
- Lichtblocker sind unsichtbare Geometrien für Stellen, an denen das importierte Modell
  keine geeignete schattenwerfende Wand, Decke oder Fläche enthält.
- Position, Größe, Rotation und Skalierung können im Editor angepasst werden.

## Smart-Home-Geräte

- Eine eigene Kategorie bündelt platzierbare Smart-Home-Geräte in funktionalen Gruppen.
- Vorhandene Gruppen sind Küche, Klima/Luft, Reinigung, Unterhaltung, Sicherheit,
  Netzwerk und Sonstiges.
- Vorlagen umfassen unter anderem Kaffeemaschine, Ventilator, Luftreiniger,
  Luftqualitätssensor, Saugroboter, Lautsprecher, Kamera und allgemeines Gerät.
- Geräte können mit einer Home-Assistant-Entity verbunden werden und je nach Typ
  Aktionen wie Umschalten, Einschalten, Starten, Zurückkehren zur Basis oder Drücken
  auslösen.
- Zustand, Farbe und Animation der 3D-Markierung reagieren auf die Entity.
- Position, Rotation und Skalierung sind editierbar.

## Energie und Flüsse

- Die frühere Kategorie `Tubes` heißt `Energie & Flüsse`.
- Flusstypen sind Netzwerk, Strom, Wasser, Gas und frei definierte Messflüsse.
- Vorlagen erzeugen passende Messquellen für Netzwerk, Smart Plug, Stromzähler,
  Wasserzähler und Gaszähler.
- Unterstützte Einheiten umfassen unter anderem Bit/s, Byte/s, W, kW, kWh, MWh, V,
  A, L/min, m³ und m³/h.
- SI-Einheiten können automatisch skaliert werden. Diese Funktion lässt sich für
  Sensoren deaktivieren, die bereits eine Einheit wie `kWh` oder `m³` liefern.
- Animierte Partikel zeigen Richtung und Intensität des Messflusses.
- Ein Smart Plug wird zum Schalten unter Smart-Home-Geräte angelegt; seine Leistungs-,
  Energie-, Spannungs- und Stromsensoren werden unter Energie & Flüsse visualisiert.

## Daten, Backup und Kompatibilität

- Die Konfiguration enthält zusätzliche optionale Blöcke für Modellskalierung,
  Unterobjekt-Overrides, importierte Objekte, Rollos, Smart-Home-Geräte,
  Leuchtenmodelle, Touch-Zonen, Räume und Energieflusstypen.
- Konfiguration und Einstellungen werden weiterhin im Browser gespeichert. Große
  Modelldateien liegen in IndexedDB.
- Backup und Wiederherstellung umfassen Modell, Einstellungen, platzierte Objekte und
  die neu hinzugefügten Konfigurationsbereiche.
- Alte Lampen- und Tube-Konfigurationen bleiben gültig und verwenden ihre bisherigen
  Standardwerte, solange keine neue Darstellung gewählt wird.

## Noch nicht enthalten

- Der Leuchteneditor lädt noch kein individuelles GLB direkt als Lampenkörper. Eigene
  Modelle können bereits als zusätzliche 3D-Objekte importiert und zusammen mit einer
  Lampe sowie deren Touch-Zone platziert werden.
- Lokale Unterobjekt-Overrides werden nicht in die GLB-Datei zurückgeschrieben und es
  gibt noch keinen GLB-Export der bearbeiteten Szene.

## Technische Prüfung

Die Änderungen werden vor dem Commit mit folgenden Befehlen geprüft:

```bash
npx tsc --noEmit
npm run build
```

Der Entwicklungsbranch ist `featureaddon` im Fork
[`Raza55/3Dash_webapp`](https://github.com/Raza55/3Dash_webapp).
