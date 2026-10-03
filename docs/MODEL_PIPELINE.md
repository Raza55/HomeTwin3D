# Fortgeschritten: ein optimiertes Modell schrittweise ändern

Der normale Weg für eigene Modelle steht im [Blender-Workflow](../BLENDER_WORKFLOW.md): in Blender ändern, neu exportieren,
neu hochladen. Diese Seite beschreibt den Weg für den Fall, dass die GLB **nach** dem Export weiterbearbeitet wurde (etwa
vereinfacht, verlustfrei optimiert oder per Skript korrigiert). Dann würde ein neuer Voll-Export diese Nacharbeit verlieren.
Stattdessen wird jede Änderung zweimal ausgeführt: in Blender und als Patch an der fertigen GLB.

Die Referenzwohnung des Projekts wird so gepflegt. Ihre Skripte unter `tools/` dienen als Vorlagen:

| Vorlage | Muster |
| --- | --- |
| `tools/bedroom-v106.*` | **Allgemeine Vorlage:** jede Änderung als Operation (verschieben, Oberkante absenken, Breite stauchen) mit Objekt-Bounds und Materialien, inklusive HA-Knoten und Manifest |
| `tools/living-v103.*` | Möbel verschieben und skalieren |
| `tools/sculptures-v104.*` | Objekte ersetzen (alte Dreiecke entfernen, neue Teil-GLB anhängen) |
| `tools/door-attach-v105.*` | Teile an bewegliche Türen hängen |
| `tools/desk-v111.*` | Dreiecke über ihre Eckpunkte zuordnen, wenn Objekte Material und Boxen teilen |

Diese Skripte enthalten feste Datei- und Objektnamen der Referenzwohnung. Für ein eigenes Modell kopieren und anpassen.

## 1. Grundsätze

- Die Änderung in Blender ausführen und als **neue** Version speichern (`<modell>_vNN_<thema>.blend`). Die Quelle bleibt so
  aktuell.
- **Dieselbe** Änderung per Node-Skript auf die **neueste optimierte GLB** übertragen.
- Nie eine vorhandene Version überschreiben; Skripte schreiben mit `{flag:'wx'}` und prüfen per `assert` den erwarteten
  Quelldateinamen.
- Modelle, Blend-Dateien und Prüfausgaben (`.qa/`) gehören nicht in ein öffentliches Repository. Skripte unter `tools/` sind
  öffentlich: keine privaten Pfade, Namen oder Entity-IDs hineinschreiben (siehe [Veröffentlichungsregeln](PUBLICATION_PRIVACY.md)).

## 2. Koordinaten

| System | Achsen |
| --- | --- |
| Blender | Z oben, Meter |
| glTF (Export `export_yup`) | `(x, y, z) = (Bx, Bz, -By)` |
| App/Babylon-Welt und Manifest | `(x, y, z) = (-Bx, Bz, -By)` (z. B. Manifest `position`) |

Im Node-Skript für Blender→glTF: `const g=([x,y,z])=>new Vector3(x,z,-y)`.
Die Weltmatrix eines Knotens ergibt sich (Babylon-Konvention) als `local(i).multiply(world(parent))`.

## 3. Blender ohne Oberfläche ausführen

- Aufruf: `blender --background <modell>.blend --python tools/blender_run.py -- tools/<skript>.py [preview]`.
  `tools/blender_run.py` startet das Skript mit `runpy` und schreibt `OK` oder den Traceback nach `.qa/blender-run.log`; diese
  Datei nach jedem Lauf lesen. Ergebnisse (Maße, Dreieckszahlen) schreibt das Skript selbst nach `.qa/<thema>-vNN.json`.
- **Microsoft-Store-Blender unter Windows:** Die `blender.exe` unter `WindowsApps` ist nicht direkt aufrufbar. Stattdessen
  `"$env:LOCALAPPDATA\Microsoft\WindowsApps\blender-launcher.exe"` per `Start-Process -Wait -NoNewWindow` verwenden. Der
  Launcher verwirft stdout und stderr, deshalb die Log-Datei.
- Eine geöffnete Blender-Instanz (z. B. über ein MCP-Add-on) nicht für das Hauptmodell verwenden; dort kann ungespeicherte
  Arbeit offen sein. Die Hintergrundinstanz arbeitet isoliert.
- Stolperfallen:
  - `bpy.ops.mesh.primitive_*_add` erzeugt Objekte am 3D-Cursor. Lieber `bmesh.ops.create_*` plus `bpy.data.objects.new` verwenden.
  - Der Skin-Modifier heißt `branch_smoothing` (nicht `…ness`).
  - Beim Klonen für den Export bekommen Objekte das Suffix `.001`. Das ist harmlos.

## 4. Schritt A – Blender-Skript `tools/<thema>-vNN.py`

1. `assert` auf den Quelldateinamen.
2. Betroffene Objekte suchen (Namenspräfix, Collection). **Vor** der Änderung ihre Welt-Bounding-Boxen merken; der GLB-Patch
   braucht sie, um die alte Geometrie zu finden.
3. Änderung ausführen:
   - **Verschieben/Skalieren:** `o.matrix_world = Delta @ o.matrix_world`. Nicht verzerrbare Teile (Ringe, Bänder) nur
     verschieben.
   - **Neu modellieren:** neue Objekte in der passenden Collection. Organische Figuren entstehen gut über ein
     Skin-Modifier-Gerüst plus `SUBSURF` (Level 2). Polygon-Budget: ca. ≤ 12k Dreiecke für kleine Deko-Objekte. Materialien als
     einfache Principled-BSDF; vorhandene Materialien per Name wiederverwenden.
   - Nicht mehr benötigte Objekte löschen.
4. Parameter und Bounds als JSON nach `.qa/<thema>-vNN.json` schreiben.
5. Optional `preview`: Workbench-Nahaufnahmen rendern, ansehen und mit Referenzfotos vergleichen. Kamera nicht in Schränke oder
   Wände setzen.
6. Ohne `preview`: neue Objekte in eine temporäre Szene klonen und als Teil-GLB exportieren (`export_yup=True,
   export_apply=True, export_normals, export_texcoords, export_extras, export_materials='EXPORT'`, ohne Animationen, Kameras und
   Lichter). Danach die neue Version mit `wm.save_as_mainfile` speichern.

## 5. Schritt B – GLB-Patch `tools/<thema>-vNN.mjs`

Eingabe ist die neueste GLB, Ausgabe die neue Version. Hilfsfunktionen stehen in `tools/optimize-glb.mjs` (`readGlb`,
`writeGlb`, `accessorBytes`, `optimizeGlb`).

Der Exporter bündelt statische Objekte **nach Raum und Materialsatz** zu `Static_####`. Ein Möbelstück liegt daher oft
verteilt in mehreren gemeinsamen Meshes. Patch-Muster:

| Aufgabe | Vorgehen | Absicherung |
| --- | --- | --- |
| Gebündelte Geometrie verschieben | Vertices nur transformieren, wenn ihr Dreieck **vollständig** in der alten Bounding-Box (+2 mm) liegt. Neuer POSITION-Accessor mit neuem min/max. | `assert`, dass kein bewegter Vertex zu einem Dreieck außerhalb gehört und der Accessor nicht geteilt ist. Mehrfach genutzte Meshes klonen. |
| Objekte mit gleichem Material und überlappenden Boxen | Dreiecke über ihre Eckpunkte zuordnen (exakte Blender-Weltvertices, feines Raster). | Unbeteiligte Nachbarn als `keep` erfassen. |
| Eigenständige Knoten | Knotenmatrix: `node.matrix = local.multiply(D)`, TRS entfernen. | Knotenzahl mit der Blender-Objektzahl vergleichen. |
| Alte Geometrie entfernen | Dreiecke im alten Material, deren drei Vertices in der alten Box (+3 mm) liegen, aus dem Indexpuffer streichen. | Pro Box `removed > 0`. Materialfilter schützt Nachbarobjekte. |
| Neue Geometrie einfügen | Teil-GLB anhängen: bufferViews hinter den Basispuffer (4-Byte-Ausrichtung), accessors/meshes/nodes mit Offsets, Materialien per Namen zusammenführen, Knoten in `scene.nodes`. | Keine Texturen, Animationen oder Skins im Teil; Knotennamen prüfen. |
| Teile an bewegliche Türen hängen | Statische Dreiecke in neue Knoten mit `extras.ha_room_door` der Tür kopieren (Innentüren); bei HA-Türen (`ha_door`) als Kind des Türknotens einhängen. In Blender tragen solche Objekte `ha_room_door_attach=<Tür-ID>`. | Pro Tür eine erwartete Dreieckszahl > 0; Wand- und Rahmenteile ausschließen. |
| Manifest | `scene.extras['3dash_manifest']`: `source` auf die neue .blend setzen, geänderte Positionen, Größen und Emitter nachführen (App-Koordinaten, Abschnitt 2). | – |

Zum Schluss immer `optimizeGlb(writeGlb(d, bin))`. Die Stufe arbeitet verlustfrei. Neue Geometrie wird **nicht** automatisch
vereinfacht. Bei einer Vereinfachung (z. B. meshoptimizer mit 0,1 mm Positions- und ~1° Normalentoleranz) die
**AABB-Extremvertices sperren**, weil die App Mittelpunkt, Außenumgebung und Sonne aus den exakten Modellgrenzen ableitet.

## 6. Schritt C – Sichtprüfung im App-Loader

`tools/model-view-qa.html` rendert GLBs mit dem App-eigenen `loadModel` aus einer festen Kamera:

```
http://127.0.0.1:5187/HomeTwin3D/tools/model-view-qa.html?a=../.qa/alt.glb&b=../.qa/neu.glb&t=-5.3,1.33,1.31&alphas=3.14&beta=1.35&r=1.7&clip=2.2&find=Objektname
```

- `t` ist der Zielpunkt in App-Koordinaten. Kamera: `position = t + r·(cos α·sin β, cos β, sin α·sin β)`.
- `clip` blendet alles oberhalb dieser Höhe aus (Decke). `find` listet die Bounds passender Meshes. `doors=open` öffnet vor
  dem Rendern alle Türen.
- Vite liefert geänderte Dateien unter `.qa/` teils gecacht aus; nach Änderungen einen neuen Dateinamen verwenden.
- Für Leistungsmessungen das Seitenpanel einklappen.

## 7. Schritt D – Import in die App

- Import-Seite nach Vorlage kopieren: `tools/<thema>-vNN-import.html/.ts` (z. B. aus `sculptures-v104-import.*`). Anzupassen
  sind Pfad, Texte und Backup-Schlüssel.
- Die Seite prüft das Manifest mit `readFloorplanManifest`. Auf Klick sichert sie Konfiguration und bisheriges Modell
  (`localStorage['config:before-<thema>-vNN']`, IndexedDB `model:before-<thema>-vNN`), ersetzt das Modell per
  `uploadModel(blob)` und prüft, dass jede vorherige Zuordnung (`id` + `entityId`) erhalten ist. Bei Abweichung stellt
  `restoreModel(previous, before)` den alten Zustand wieder her.
- Konfiguration und Modell liegen im Browser. Die Seite deshalb auf derselben Adresse (Origin) öffnen, die man sonst nutzt.
- Der Import verändert Benutzerdaten; ein Agent führt ihn nur auf ausdrücklichen Wunsch aus.
- Mit dem Add-on danach die gemeinsame Version veröffentlichen (oder `npm run addon:sync`).

## 8. Schritt E – Dokumentieren

Änderung, beteiligte Skripte, Kennzahlen (entfernte/neue Dreiecke, Bytes), Import-Seite und Backup-Schlüssel in einem eigenen,
**nicht öffentlichen** Modellprotokoll festhalten (für die Referenzwohnung: `.private/MODEL_HISTORY.md`, neueste Einträge
oben). Allgemein gültige Erkenntnisse gehören in den Abschnitt „Erfahrungen aus der Praxis“ im
[Blender-Workflow](../BLENDER_WORKFLOW.md#8-erfahrungen-aus-der-praxis).

## 9. Checkliste

1. Neueste Version bestimmen (.blend und .glb).
2. Blender-Skript mit `preview` ausführen, Bilder prüfen, bei Bedarf nachbessern.
3. Blender-Skript ohne `preview` ausführen: neue .blend und bei neuen Objekten Teil-GLB.
4. Node-Patch ausführen, Assertions und Kennzahlen prüfen.
5. `model-view-qa.html` mit alt/neu ansehen.
6. Import-Seite auf der genutzten Adresse öffnen und übernehmen, Statustext prüfen.
7. Protokoll nachführen. Vor jedem Push `npm run privacy:check`.
