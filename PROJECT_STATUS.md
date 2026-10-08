# Funktionen, Grenzen und Technik

Diese Übersicht beschreibt, wie HomeTwin3D arbeitet, was die einzelnen Funktionen voraussetzen und wo ihre Grenzen liegen.
Einrichtung: [Erste Schritte](docs/GETTING_STARTED.md). Eigenes Modell: [Blender-Workflow](BLENDER_WORKFLOW.md).
Änderungen pro Version: [Änderungsverlauf](CHANGELOG.md).

## Funktionsweise

- Die App läuft vollständig im Browser (React, TypeScript, Babylon.js) und verbindet sich direkt per WebSocket mit Home
  Assistant. Der Zugriff erfolgt mit einem langlebigen Zugriffstoken, der nur im jeweiligen Browser gespeichert wird.
- Das Wohnungsmodell ist eine GLB-Datei. Ein eingebettetes Manifest (`3dash_manifest`) beschreibt die Smart-Home-Objekte;
  es entsteht beim Export mit der Blender-Erweiterung `tools/blender_3dash.py`.
- Zuordnungen von Modellobjekten zu HA-Entities, Räume, Lichtkalibrierung und Einstellungen liegen in `localStorage`,
  Modell und zusätzliche Objekte in `IndexedDB`. Beides gehört zum jeweiligen Browser und zur Adresse (Origin).
- Das Home-Assistant-Add-on liefert die App aus und kann eine **gemeinsame Version** (Modell, Zuordnungen, Einstellungen)
  für alle Browser im LAN bereitstellen, siehe [Add-on-Dokumentation](3dash-addon/DOCS.md).

## Funktionen

### Modell, Räume und Konfiguration

Ein GLB lässt sich im laufenden Betrieb ersetzen. Importprüfung und Wiederherstellung des vorherigen Modells schützen vor
einem fehlgeschlagenen Austausch. Gemeinsame Skalierung, Texturumschaltung und zusätzlich importierte 3D-Objekte (GLB, glTF,
OBJ, STL) werden im Editor verwaltet. Teile des Hauptmodells lassen sich verschieben, drehen und skalieren, ohne die GLB zu
verändern.

Raumflächen können vom Boden aus erkannt und als Polygon nachbearbeitet werden; HA-Bereiche liefern Raumzuordnungen.
Lichtblocker ergänzen fehlende Schattengeometrie, wo das Modell offen ist. Optionale Karten zeigen Skripte, Zustände und
Verläufe.

### Gerätezuordnung

Jedes Smart-Home-Objekt im Modell trägt eine stabile Kennung (`ha_id`). Die App speichert die Zuordnung Kennung → Entity
getrennt vom Modell (`floorplanBindings`). Ein Reimport übernimmt neue Geometrie und Positionen, behält aber Zuordnungen,
bewusst leere Zuordnungen, Raumbestätigungen und Lichtkalibrierung. Eine gleiche Kennung mit geändertem Gerätetyp erbt keine
Zuordnung.

Der visuelle Assistent fokussiert jedes Objekt, markiert es im Modell und schlägt Entities vor (Name, HA-Bereich, Position).
Schwache oder widersprüchliche Treffer werden nicht automatisch übernommen. Bereits vergebene Entities sind standardmäßig
ausgeblendet. Zuordnungen lassen sich separat sichern und in Blender zurückspielen.

### Licht

Lampen verwenden ihre Modellgeometrie und die beim Export erzeugten Lichtquellen. Die Darstellung folgt Verfügbarkeit,
Helligkeit, Farbe und Farbtemperatur aus HA. Lichtstrom, Reichweite und Ausrichtung sind pro Lampe kalibrierbar. Es handelt
sich um Echtzeitbeleuchtung, keine physikalisch vollständige Lichtsimulation.

Hover öffnet eine Schnellsteuerung, Klick fixiert sie. Nahe Spots derselben Namensfamilie bilden einen gemeinsamen Marker mit
gemeinsamer und einzelner Farb- und Helligkeitssteuerung; im Editor lassen sich eigene Gruppen festlegen. Mehrere Entities
können sich eine Bediengruppe teilen und bleiben dabei getrennte HA-Entities. Die App sendet normale HA-Lichtbefehle.

**Hue Sync:** Läuft eine Hue-Sync-Box (Schalter, Bereichsauswahl und Helligkeit als Entities), zeigt die App die beteiligten
Lampen mit Sperrhinweis an, statt alte Farben vorzutäuschen. Welche Lampen dazugehören, ist eine feste Liste von
Beispiel-Entities (`src/services/hueSync.ts`), die über die Installationswerte auf eigene Entities umgelenkt wird (siehe
unten).

### Rollos, Türen, Fenster und Schloss

Rollo-Popups bieten Öffnen, Stopp, Schließen und je nach Gerät einen Positionsregler; Raumaktionen steuern alle Rollos
eines Raums. Die Behang-Geometrie folgt der HA-Position.

Tür- und Fensterkontakte bewegen die markierten Türblätter im Modell. Die Dauer des aktuellen Zustands kommt aus
`last_changed`. Bei Fenster- und Balkontüren kann nach längerer Öffnung eine Kippstellung dargestellt werden; das ist eine
beschriftete Annahme, kein gemessener Zustand. Türschloss und Türkontakt werden getrennt angezeigt; die Schlossanzeige
sendet keine Schlossbefehle. Türen lassen sich zusätzlich per Klick lokal öffnen und schließen, bis HA einen neuen Zustand
meldet.

### Haushalts- und weitere Geräte

Lüfter, Luftreiniger, Saugroboter, Echo-Geräte, Kaffeevollautomat (Home Connect), Waschmaschine und Trockner sowie PC-/
Servergruppen haben eigene Marker und Popups. Einzelheiten und Voraussetzungen: [Geräte und Warnungen](docs/DEVICES_AND_ALERTS.md).

### Navigation

Orbitansicht, Laufmodus (Walk) mit Boden- und Wandkollision und Flugmodus.

| Eingabe | Wirkung |
| --- | --- |
| W/A/S/D oder Pfeiltasten | Bewegen |
| Maus/Pointer ziehen | Umsehen |
| Shift | Schneller bewegen |
| E / Q im Flugmodus | Auf / ab |
| Escape | Zur normalen Ansicht zurück |
| Linksklick / kurzes Antippen im Laufmodus | Erreichbare Innentür öffnen/schließen |

Innentüren mit Scharnierdaten (`ha_room_door`) öffnen sich lokal und senden keine HA-Befehle.

### TV und Medien

Ein Fernseher im Modell kann Medieninformationen zeigen: Titel, App, Cover oder Screenshot und Fortschritt. Maßgeblich ist der
Eingang des AV-Receivers: Beim Streaming-Eingang (z. B. NVIDIA SHIELD) erscheinen dessen Metadaten, beim PC-Eingang
optional ein Desktop-Bild, bei anderen Eingängen der Eingangsname. Screenshots des Streaming-Geräts benötigen eine
eingerichtete ADB-Integration in HA; sie werden etwa alle zehn Sekunden erneuert und sind kein Livevideo (geschützte Inhalte
bleiben schwarz). Ohne Bild zeichnet die App für bekannte Apps einen Hintergrund mit App-Namen.

Die Fernseher-Anzeige hängt am Modellobjekt `Fernseher_Bildschirm`. Receiver, Streaming-Gerät, TV, Fernbedienung und
Screenshot-Quelle sind Beispiel-Entities in `src/services/tvMedia.ts`, die über die Installationswerte auf eigene Entities
umgelenkt werden. Bilder laufen über den Medienproxy des Add-ons; der Zugriffstoken wird nicht an Bild-URLs gehängt.

### Sonne, Wetter und Außenumgebung

Der Sonnenstand wird aus Uhrzeit, Standort (aus der HA-Konfiguration) und Nordausrichtung berechnet. Wetterdaten von
Open-Meteo steuern Himmel, Dunst, nasse Wege, Regen und Schnee.

Die **Außenumgebung** (Park, Wege, Bäume, Nachbargebäude, Hof) ist prozedural erzeugt und orientiert sich an der Umgebung der
Referenzwohnung. Sie wird an den Modellgrenzen und an den Rollos als Fassade ausgerichtet, bildet aber nicht die eigene
Umgebung ab. Mit `?off=exterior` in der Adresse lässt sie sich zum Vergleich ausschalten.

### Kalender

Ein Tipp auf das Datum öffnet einen Kalender (Jahr, Monat, Woche) über dem Modell. Termine kommen per WebSocket Abo aus den
Kalendern von Home Assistant und werden dort angelegt, geändert und gelöscht. Feiertage werden für die gewählten Bundesländer
berechnet, Schulferien von der OpenHolidays API geladen und im Browser zwischengespeichert. Freitext und Sprache werden in
Tag, Uhrzeit und Dauer zerlegt; Vorschläge entstehen aus früheren Terminen. Personen, Klausurnoten und ein API Schlüssel
stehen als Zeilen in der Terminbeschreibung. Das Add-on bietet dazu eine Kalender API für JSON (siehe Add-on-Dokumentation).

## Installationswerte: Beispiel-Entities umlenken

Einige Funktionen verwenden im Quelltext feste **Beispiel-Entity-IDs**, weil sie keine eigene Zuordnung im Editor haben:

| Funktion | Datei | Beispiele |
| --- | --- | --- |
| Hue-Sync-Anzeige | `src/services/hueSync.ts` | `switch.media_sync`, beteiligte Lampen |
| Wasserleck | `src/services/waterLeak.ts` | `binary_sensor.laundry_water_leak`, `binary_sensor.kitchen_water_leak` |
| TV-Medien | `src/services/tvMedia.ts` | `media_player.living_room_receiver`, `media_player.streaming_player`, … |
| TV Dial | `src/services/tvDial.ts` | `automation.tv_dial_hdmi1` |

Die eigenen Entities trägt man in `.private/installation.json` ein (wird nicht mit Git veröffentlicht):

```json
{
  "entities": { "media_player.living_room_receiver": "media_player.avr" },
  "location": { "label": "Zuhause", "latitude": 52.5, "longitude": 13.4 },
  "author": "Name im Einleitungsdialog der Tagesdemo"
}
```

`npm run addon:export` bzw. `npm run addon:sync` überträgt diese Werte mit der gemeinsamen Version in das Add-on; jeder
Browser übernimmt sie von dort. Öffentliche Builds enthalten keine Installationswerte.

## Umgesetzte Optimierungen

| Bereich | Umsetzung |
| --- | --- |
| GLB-Daten | `tools/optimize-glb.mjs` entfernt ungenutzte Daten, teilt identische Binärblöcke, dedupliziert Vertexdaten und verkleinert geeignete Indizes auf 16 Bit, verlustfrei. `tools/verify-glb.mjs` prüft das Ergebnis. |
| Sonnenschatten | `ShadowCasterBatch.ts` bündelt statische, opake Schattenwerfer. Originalmeshes bleiben für Bild und Auswahl erhalten; bewegte und HA-Objekte sind ausgenommen. |
| Glasdurchgang | `TransmissionCulling.ts` lässt unsichtbare und außerhalb des Sichtvolumens liegende Meshes weg. |
| Außenobjekte | `ExteriorMeshPool.ts` teilt Geometrie und Materialien gleicher Formen. |
| Leuchten | Unveränderte Zustände schreiben weder Meshwerte noch Schattenkarten neu. Pro Mesh zählen bis zu sechs relevante Lichtquellen. Schattenkarten werden verteilt neu berechnet (höchstens 4 pro Bild, Tablet 2); dunkle Lampen warten. |
| Marker | Gemeinsame Projektion pro Bild, budgetierte Verdeckungsprüfung, keine identischen DOM-Schreibzugriffe. Sortierung und Texturkoordinaten werden nur bei Änderungen erneuert, Farbwerte einmal pro Puffergröße gesetzt; Positionen und Trefferprüfung bleiben pro Bild aktuell. |
| Saugroboter | Wiederverwendbare Vektoren und Quaternionen für die Bewegung aller Modellteile; unveränderte Interpolation und Schattenaktualisierung. |
| Spiegel | Umgebung wird über sechs Bilder aufgenommen, eine Würfelseite pro Bild. |
| Rendern | Ohne Bewegung ruht die Render-Schleife. Tablets erhalten eine eigene Leistungsstufe (`?device=tablet`). |
| HA-Verlauf | 60-Sekunden-Cache, Zusammenfassung gleichzeitiger Anfragen, Begrenzung der Ergebnismenge. |
| Build/PWA | Icons und große 3D-Chunks werden nach Bedarf geladen; Babylon- und React-Chunks sind getrennt. |

Die Bildrate hängt vor allem von Modellgröße, Anzahl leuchtender Lampen und Zielgerät ab. `?perf` zeigt Bilder pro Sekunde,
CPU-Zeit und Draw Calls; die Tagesdemo misst am Ende einen Leistungswert.

## Architektur

| Aufgabe | Einstieg im Quellcode |
| --- | --- |
| Szenenaufbau und Laufzeit | `src/pages/Dashboard/Dashboard.tsx`, `src/babylon/SceneManager.ts`, `ModelLoader.ts` |
| Import, Zuordnung, Persistenz | `src/services/floorplanImport.ts`, `floorplanMatching.ts`, `floorplanReassignment.ts`, `configApi.ts`, `storageApi.ts` |
| Gemeinsame Version | `src/services/sharedStore.ts`, `3dash-addon/nginx.conf` |
| Licht und Modellzustände | `src/babylon/FloorplanBindings.ts`, `FloorplanLighting.ts`, `src/services/lightClusters.ts`, `hueSync.ts` |
| Türen, Geräte, Kamera | `src/babylon/DoorAnimation.ts`, `ApplianceAnimation.ts`, `RoomDoors.ts`, `WalkthroughCamera.ts` |
| HA und Verläufe | `src/services/haWebSocket.ts`, `haHistoryApi.ts` |
| Medien | `src/services/tvMedia.ts`, `src/babylon/TVMediaScreen.ts`, `LivingRoomTVDisplay.ts` |
| Tagesdemo, Energiefluss | `src/services/dayDemo/`, `src/services/energyFlow.ts`, `src/babylon/EnergyFlowLayer.ts` |
| Build und Hosting | `vite.config.ts`, `3dash-addon/Dockerfile`, `3dash-addon/nginx.conf` |

## Bekannte Grenzen

- HomeTwin3D ist aus einer konkreten Wohnung heraus entstanden. Hue Sync, Wasserleck, TV-Medien und TV Dial brauchen die
  Installationswerte (oben), die Außenumgebung ist eine Beispielumgebung.
- Die automatische Erkennung beim Blender-Export ist auf die Namen der Referenzwohnung abgestimmt; bei eigenen Modellen
  Objekte selbst kennzeichnen (siehe [Blender-Workflow](BLENDER_WORKFLOW.md)).
- Daten liegen pro Browser und Origin. Vor einem Wechsel von Adresse, Port oder Browser ZIP- und Zuordnungsbackup
  exportieren oder die gemeinsame Version des Add-ons nutzen.
- Die gemeinsame Version erkennt Konflikte zwischen Geräten, ist aber kein atomarer Serverspeicher: Exakt gleichzeitiges
  Veröffentlichen von zwei Geräten ist nicht abgesichert.
- Das Add-on hat keine HA-Anmeldung (kein Ingress). Wer es erreicht, kann die gemeinsame Version lesen; nicht ungeschützt ins
  Internet stellen.
- Große Modelle kosten auf Tablets spürbar Leistung. Auf dem Zielgerät mit `?perf` prüfen.
