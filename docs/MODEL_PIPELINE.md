# Modelländerungen: Blender → GLB → 3D-Twin (Leitfaden für Agenten)

Verbindlicher Ablauf, um das Wohnungsmodell zu ändern und in die laufende App zu übernehmen.
Er gilt für jede Änderung, egal ob Möbel verschieben, Objekte neu modellieren oder Materialien anpassen.
Referenzbeispiele: `tools/living-v103.*` (Transformationen), `tools/sculptures-v104.*` (Objekte ersetzen) und
`tools/door-attach-v105.*` (Teile an bewegliche Türen hängen) und `tools/bedroom-v106.*`
(allgemeines Operationsmuster: verschieben, Oberkante absenken, Breite stauchen, inklusive HA-Knoten und Manifest).
**Für neue Geometrieänderungen `bedroom-v106.*` als Vorlage nehmen**: Das Blender-Skript beschreibt jede Änderung als Operation
mit Objekt-Bounds und Materialien, und das Node-Skript wendet dieselbe Funktion auf die GLB-Vertices an.

## 1. Grundsätze

- **Kein Voll-Export aus Blender.** Der aktuelle GLB ist das Ergebnis einer Patch-Kette. Einige Stufen
  existieren nur im GLB (v90 verlustfreie Optimierung, v93 Hue-Play-Labels, v101 meshopt-Vereinfachung,
  v102 Schwellen-/Bodenfix). Ein Neuexport der .blend würde sie verlieren. Deshalb gilt immer:
  1. Die Änderung in Blender ausführen und als **neue** Version `vNN` speichern. Die Quelle bleibt so aktuell.
  2. **Dieselbe** Änderung per Node-Skript auf den **neuesten optimierten GLB** übertragen.
- Nie eine vorhandene Version überschreiben. Neue Dateien heißen `../blender/Wohnung_vNN_3Dash_<Thema>.blend/.glb`,
  Skripte schreiben mit `{flag:'wx'}`.
- Die neueste Version ist die höchste `vNN` in `../blender/`. Die .blend-Quelle für Blender-Schritte ist die höchste
  vorhandene .blend. Jedes Skript prüft mit `assert` den erwarteten Quelldateinamen.
- Modelle, Blend-Dateien und `.qa/` gehören nicht ins Git (siehe [PUBLICATION_PRIVACY](PUBLICATION_PRIVACY.md)).
  Skripte unter `tools/` sind öffentlich, deshalb keine privaten Pfade, Namen oder Entity-Werte hineinschreiben.

## 2. Koordinaten

| System | Achsen |
| --- | --- |
| Blender | Z oben, Meter |
| glTF (Export `export_yup`) | `(x, y, z) = (Bx, Bz, -By)` |
| App/Babylon-Welt und Manifest | `(x, y, z) = (-Bx, Bz, -By)` (z. B. Manifest `position`) |

Im Node-Skript für Blender→glTF: `const g=([x,y,z])=>new Vector3(x,z,-y)`.
Die Weltmatrix eines Knotens ergibt sich (Babylon-Konvention) als `local(i).multiply(world(parent))`.

## 3. Blender headless ausführen

- Blender ist eine Store-Installation. Die `blender.exe` unter `WindowsApps` ist nicht direkt aufrufbar,
  und `execute_blender_code_for_cli` findet keine `blender` im PATH. Aufruf aus PowerShell:
  ```powershell
  Start-Process -Wait -NoNewWindow "$env:LOCALAPPDATA\Microsoft\WindowsApps\blender-launcher.exe" `
    -ArgumentList '-b','..\blender\Wohnung_vNN_….blend','--python','tools\blender_run.py','--','tools\<skript>.py','preview'
  ```
  (Arbeitsverzeichnis ist der Repo-Stamm; absolute Pfade sind ebenso möglich.)
- Der Launcher verwirft stdout und stderr. `tools/blender_run.py` startet das Skript deshalb mit `runpy`
  und schreibt `OK` oder den Traceback nach `.qa/blender-run.log`. Diese Datei nach jedem Lauf lesen. Ergebnisse (Maße,
  Dreieckszahlen) schreibt das Skript selbst nach `.qa/<thema>-vNN.json`.
- **Die interaktive Blender-Instanz (MCP `execute_blender_code`) nicht für die Wohnung verwenden.** Dort kann
  fremde, ungespeicherte Arbeit offen sein. Die Hintergrundinstanz arbeitet isoliert auf einer Kopie.
- Stolperfallen:
  - `bpy.ops.mesh.primitive_*_add` erzeugt Objekte am 3D-Cursor. Lieber `bmesh.ops.create_*` plus `bpy.data.objects.new` verwenden.
  - Der Skin-Modifier heißt `branch_smoothing` (nicht `…ness`).
  - Beim Klonen für den Export bekommen Objekte das Suffix `.001`. Das ist im GLB überall so und harmlos.

## 4. Schritt A – Blender-Skript `tools/<thema>-vNN.py`

Aufbau (siehe `sculptures-v104.py`):
1. `assert` auf den Quelldateinamen.
2. Betroffene Objekte suchen (Namenspräfix, Collection). **Vor** der Änderung ihre Welt-Bounding-Boxen merken;
   der GLB-Patch braucht sie, um die alte Geometrie zu finden.
3. Änderung ausführen:
   - **Verschieben/Skalieren:** `o.matrix_world = Delta @ o.matrix_world`. Für nicht verzerrbare Teile (Ringe, Bänder)
     nur verschieben statt skalieren.
   - **Neu modellieren:** neue Objekte in der passenden Collection. Organische Figuren entstehen über ein Skin-Modifier-Gerüst
     plus `SUBSURF` (Level 2) und Ellipsoid-Köpfe per bmesh. Danach zu einem Objekt pro Figur zusammenführen.
     Polygon-Budget: ca. ≤ 12k Dreiecke für kleine Deko-Objekte. Keine Texturen ohne Not; Materialien als einfache
     Principled-BSDF. Bestehende Materialien per Name wiederverwenden.
   - Nicht mehr benötigte Objekte löschen.
4. Parameter und Bounds als JSON nach `.qa/<thema>-vNN.json` schreiben.
5. Optional `preview`: Workbench-Nahaufnahmen nach `.qa/<thema>-vNN-<ansicht>.png`, per Read ansehen und mit den
   Referenzfotos vergleichen. Kamera nicht in Schränke oder Wände setzen, Vorschau vor dem Export prüfen.
6. Ohne `preview`:
   - Neue Objekte in eine temporäre Szene klonen und als Teil-GLB exportieren: `export_yup=True, export_apply=True,
     export_normals, export_texcoords, export_extras, export_materials='EXPORT'`, ohne Animationen, Kameras und Lichter.
   - Danach `wm.save_as_mainfile` auf `../blender/Wohnung_vNN_3Dash_<Thema>.blend`.

## 5. Schritt B – GLB-Patch `tools/<thema>-vNN.mjs`

Eingabe ist der neueste GLB, die Ausgabe ist `vNN` plus die Kopie `.qa/<thema>-vNN.glb` für den Import. Hilfsfunktionen stehen in
`tools/optimize-glb.mjs` (`readGlb`, `writeGlb`, `accessorBytes`, `optimizeGlb`). Ausführen aus dem Repo-Stamm:
`node tools/<thema>-vNN.mjs`.

Der Exporter bündelt statische Objekte **nach Raum und Materialsatz** zu `Static_####` bzw. zum Namen des ersten
Objekts. Ein Möbelstück liegt daher oft verteilt in mehreren gemeinsamen Meshes. Patch-Muster:

| Aufgabe | Vorgehen | Absicherung |
| --- | --- | --- |
| Gebündelte Geometrie verschieben | Vertices nur dann transformieren, wenn ihr Dreieck **vollständig** in der alten Bounding-Box (+2 mm) liegt. Neuer POSITION-Accessor mit neuem min/max. | `assert`, dass kein bewegter Vertex zu einem Dreieck außerhalb gehört und dass der Accessor nicht geteilt ist. Mehrfach genutzte Meshes klonen. |
| Eigenständige Knoten (eigene Namen, z. B. Lampenteile) | Knotenmatrix: `node.matrix = local.multiply(D)`, TRS entfernen. | Knotenzahl mit der Blender-Objektzahl vergleichen. |
| Alte Geometrie entfernen | Dreiecke im alten Material, deren drei Vertices in derselben alten Box (+3 mm) liegen, aus dem Indexpuffer streichen. | Pro Box muss `removed > 0` sein. Eine Materialfilterung schützt Nachbarobjekte. |
| Neue Geometrie einfügen | Teil-GLB anhängen: bufferViews mit Offset hinter den Basispuffer (4-Byte-Ausrichtung), accessors/meshes/nodes mit Offsets, Materialien per Namen zusammenführen, Knoten in `scene.nodes`. | Keine Texturen, Animationen oder Skins im Teil; Knotennamen prüfen. |
| Teile an bewegliche Türen hängen | Statische Dreiecke (Material des Objekts, alle Vertices in dessen Bounds) unverändert in neue Knoten mit `extras.ha_room_door` der Tür kopieren (Innentüren). Bei HA-Türen (`ha_door`) als Kind des Türknotens einhängen. | Pro Tür eine erwartete Dreieckszahl > 0 prüfen; Wand- und Rahmenteile per Namensregel ausschließen. |
| Manifest | `scene.extras['3dash_manifest']`: `source` auf die neue .blend setzen, geänderte Entity-Positionen, Größen und Emitter nachführen (App-Koordinaten, Abschnitt 2). | – |

Zum Schluss immer `optimizeGlb(writeGlb(d, bin))`. Die Stufe arbeitet verlustfrei: Sie entfernt ungenutzte Daten,
teilt identische Blöcke, dedupliziert Vertices und wählt 16-Bit-Indizes. Neue Geometrie wird **nicht** automatisch
vereinfacht. Bei großen Zugängen kann das v101-Verfahren angewendet werden (`../blender/Wohnung_v101_3Dash_Optimiert.simplify.mjs`,
meshoptimizer mit 0,1 mm Positions- und ~1° Normalentoleranz). **AABB-Extremvertices bleiben dabei gesperrt**, weil die App Mittelpunkt,
Park und Sonne aus den exakten Modellgrenzen ableitet.

### Bewegliche Teile (Türen, Geräte)

Alles, was an einem Türblatt montiert ist (Haken, Bügel, Kleidung, Klinken, Schilder), muss im GLB im Knoten der Tür liegen.
Sonst bleibt es beim Öffnen in der Luft stehen. In Blender tragen solche Objekte `ha_room_door_attach=<Tür-ID>`
(seit v105). Neue Objekte an Türen erhalten diese Markierung ebenfalls, und ihr GLB-Patch muss sie in einen `ha_room_door`-Knoten legen.
Prüfen mit `model-view-qa.html?…&doors=open` (öffnet alle Innentüren im Walk-Modus und alle HA-Türen).

## 6. Schritt C – Sichtprüfung im App-Loader

`tools/model-view-qa.html` rendert GLBs mit dem App-eigenen `loadModel` aus einer festen Kamera:

```
http://127.0.0.1:5187/HomeTwin3D/tools/model-view-qa.html?a=../.qa/alt.glb&b=../.qa/neu.glb&t=-5.3,1.33,1.31&alphas=3.14&beta=1.35&r=1.7&clip=2.2&find=SZ_Skulptur
```

- `t` ist der Zielpunkt in App-Koordinaten. Kamera: `position = t + r·(cos α·sin β, cos β, sin α·sin β)`.
- `clip` blendet alles oberhalb dieser Höhe aus (Decke). `find` listet die Bounds passender Meshes auf, als Kontrolle der Lage.
  `doors=open` schwenkt vor dem Rendern alle Türen. Innentüren, die im Modell offen gespeichert sind (etwa die Stirntür), werden dabei geschlossen.
- Bilder per Screenshot vergleichen. Vite liefert geänderte Dateien unter `.qa/` teils gecacht aus; nach Änderungen
  dort einen neuen Dateinamen verwenden.
- Für Performance-Messungen das Seitenpanel einklappen. Für pixelgenaue Vergleiche mit Kontrolllauf steht `.qa/v101-compare.html` bereit.

## 7. Schritt D – Import in den 3D-Twin

- Import-Seite nach Vorlage kopieren: `tools/<thema>-vNN-import.html/.ts` (z. B. aus `sculptures-v104-import.*`).
  Anzupassen sind Pfad `../.qa/<thema>-vNN.glb`, Texte und Backup-Schlüssel.
- Die Seite lädt den GLB und prüft das Manifest mit `readFloorplanManifest`. Auf Klick:
  1. Sie sichert die Konfiguration nach `localStorage['config:before-<thema>-vNN']` und das bisherige Modell nach IndexedDB
     `model:before-<thema>-vNN` (`saveObjectAsset`).
  2. `uploadModel(blob)` ersetzt das Modell. Der Floorplan-Import führt das Manifest mit den bestehenden Zuordnungen zusammen.
  3. Sie prüft, dass jede vorherige Zuordnung (`id` + `entityId`) erhalten ist. Bei Abweichung oder Fehler stellt
     `restoreModel(previous, before)` den alten Zustand automatisch wieder her.
- **Origin beachten:** Konfiguration und Modell liegen im `localStorage` und in der IndexedDB des Browsers. Deshalb die Seite auf dem
  Origin öffnen, den der Benutzer nutzt. Standard ist der laufende Dev-Server `hometwin-dev` unter
  `http://127.0.0.1:5187/HomeTwin3D/tools/<thema>-vNN-import.html` (Basis `/HomeTwin3D/`). Läuft er schon aus
  einer anderen Sitzung, die Seite direkt per URL öffnen und keinen zweiten Server starten.
- Der Import verändert Benutzerdaten. Er wird nur ausgeführt, wenn der Benutzer darum gebeten hat. Danach den
  Statustext der Seite melden.

## 8. Schritt E – Dokumentieren

- In [BLENDER_WORKFLOW.md](../BLENDER_WORKFLOW.md) oben einen Abschnitt `## <Thema> vNN (Datum)` ergänzen: was sich
  geändert hat, welche Skripte beteiligt sind, Kennzahlen (entfernte/neue Dreiecke, Bytes), Import-Seite und Backup-Schlüssel.
- In [PROJECT_STATUS.md](../PROJECT_STATUS.md) den aktuellen Modellstand anpassen.

## 9. Checkliste

1. Neueste `vNN` bestimmen (.blend und .glb).
2. Blender-Skript mit `preview` ausführen, Bilder prüfen, bei Bedarf nachbessern.
3. Blender-Skript ohne `preview` ausführen: neue .blend und bei neuen Objekten Teil-GLB.
4. Node-Patch ausführen und die Assertions und Kennzahlen prüfen.
5. `model-view-qa.html` mit alt/neu ansehen.
6. Import-Seite auf dem Benutzer-Origin öffnen und übernehmen, Statustext prüfen.
7. Dokumentation nachführen. Vor jedem Push `npm run privacy:check` ausführen.
