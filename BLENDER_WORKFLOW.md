# Eigenes Modell mit Blender einbinden

Diese Anleitung erklärt, wie aus der eigenen Wohnung ein 3D-Modell für HomeTwin3D wird: in Blender von Hand oder mit
einem KI-Agenten wie **Astra** oder **Claude Opus**, der Blender per Skript steuert. Sie beschreibt außerdem, worauf man
achten muss, damit Lampen, Rollos, Türen und Geräte nach dem Import richtig funktionieren.

Den Einstieg ohne eigenes Modell (Demo, Tagesdemo) und die übrige Einrichtung beschreiben die
[Ersten Schritte](docs/GETTING_STARTED.md). Was sich beim Aufbau der Referenzwohnung des Projekts bewährt hat, fasst
[Erfahrungen aus der Praxis](#8-erfahrungen-aus-der-praxis) zusammen.

## Überblick

```text
Blender-Modell ──► Objekte kennzeichnen ──► Export „3Dash Floorplan (.glb)“ ──► Upload in HomeTwin3D ──► Entities zuordnen
      ▲                                                                                                       │
      └──────────────── Änderungen: gleiche .blend weiterbearbeiten, neu exportieren, neu hochladen ◄──────────┘
```

HomeTwin3D braucht eine einzige GLB-Datei. Die Blender-Erweiterung `tools/blender_3dash.py` schreibt beim Export ein
**Manifest** in diese Datei: eine Liste aller Smart-Home-Objekte mit stabiler Kennung, Gerätetyp, Raum, Position, Größe und
bei Lampen den Lichtquellen. Aus dem Manifest erzeugt die App Lampen, Rollo-Steuerungen, Gerätemarker und Sensoranzeigen.
Eine GLB ohne Manifest lässt sich ebenfalls laden, ist dann aber nur Kulisse.

## Voraussetzungen

- Blender 4.2 oder neuer.
- Die Erweiterung `tools/blender_3dash.py` aus diesem Repository: Bearbeiten → Einstellungen → Add-ons →
  „Von Datenträger installieren“. Alternativ ohne Oberfläche:
  `blender --background --python tools/install_blender_addon.py`.
- Eine laufende HomeTwin3D-Installation (Add-on oder lokal), siehe [Erste Schritte](docs/GETTING_STARTED.md).
- Für die KI-gestützte Variante: ein Agent mit Zugriff auf Blender, entweder über ein Blender-MCP-Add-on (steuert eine
  geöffnete Blender-Instanz) oder über die Kommandozeile (`blender --background … --python skript.py`).

## 1. Modell aufbauen

**Maßstab und Achsen.** In Metern modellieren, Z zeigt nach oben. Objekt-Skalierungen vor dem Export anwenden
(Strg+A → Maßstab), sonst stimmen Lichtpositionen und Größen der Gerätemarker nicht. Ein Grundriss mit echten Maßen
als Referenzbild spart viel Nacharbeit.

**Was ins Modell gehört.** Für ein gutes Ergebnis genügen Wände, Böden, Decken, Fenster, Türen und die wichtigsten Möbel.
Jede Lampe, jedes Rollo und jedes Gerät, das später gesteuert oder angezeigt werden soll, braucht eigene Geometrie
(ein eigenes Objekt oder eine Gruppe von Objekten).

**Decken.** Decken mit der benutzerdefinierten Eigenschaft `ha_cutaway = True` markieren. Die Draufsicht blendet sie dann
aus; sie werfen trotzdem Schatten und erscheinen im Laufmodus. Ohne Markierung verdeckt die Decke den ganzen Plan.

**Materialien.** Principled BSDF verwenden; Bildtexturen werden übernommen. Prozedurale Texturen (Noise, Wave usw.) kann
glTF nicht speichern. Bei einer Color Ramp übernimmt der Export eine einfarbige Ersatzfarbe und listet sie im Bericht unter
`proceduralColorFallbacks`; die Farbe lässt sich mit `ha_export_base_color` am Material vorgeben. Für echte Muster die
Textur vorher backen. Ohne Texturen funktioniert auch der Skizzenstil der App.

**Fensterglas.** Glas als transparentes Material anlegen. Sonnenlicht scheint derzeit nur durch Glas mit einem der bekannten
Materialnamen (siehe `isWindowGlassName` in `src/babylon/WindowGlass.ts`, z. B. `Wohnzimmer_Fensterglas_klar`). Wer
Sonneneinfall durch eigene Fenster möchte, benennt das Fensterglas-Material entsprechend; anderes Glas bleibt sichtbar,
wirft aber Schatten.

**Rollos.** Den Behang **vollständig geschlossen** modellieren. Die App fährt ihn ausgehend von dieser Geometrie nach der
HA-Position auf und zu. Das lokale X des Rollo-Objekts sollte entlang der Fensterbreite liegen.

**Türen.** Türen geschlossen exportieren. Für HA-Türen mit Türkontakt (Haustür, Balkon-/Fenstertüren) bewegt die App das
Türblatt, wenn das Objekt `ha_door_geometry` trägt (siehe Abschnitt 2). Bewegliche Innentüren für den Laufmodus und Teile,
die an Türblättern hängen (Haken, Kleidung), entstehen bisher nur über die Patch-Werkzeuge der
[Modell-Pipeline](docs/MODEL_PIPELINE.md#5-schritt-b--glb-patch-toolsthema-vnnmjs).

**Polygonbudget.** Das Modell läuft im Browser, oft auf Tablets. Subdivision- und Bevel-Modifier vervielfachen schnell die
Dreiecke. Der Export reduziert nur Bevel-Segmente und Kurvenauflösung; Subdivision wird so angewendet, wie sie eingestellt
ist. Kleine Deko braucht selten mehr als einige tausend Dreiecke. Unsichtbare Hilfsobjekte ausblenden (Render ausgeschaltet)
oder mit `ha_ignore = True` vom Export ausnehmen. Die Bildrate auf dem Zielgerät zeigt `?perf` in der App-Adresse.

## 2. Smart-Home-Objekte kennzeichnen

Objekt auswählen → Objekteigenschaften → **3Dash / Home Assistant**. Das Panel zeigt die vorhandenen Felder; weitere
Felder legt man als **Benutzerdefinierte Eigenschaft** (Custom Property) am Objekt an.

| Eigenschaft | Bedeutung |
| --- | --- |
| `ha_domain` | Gerätetyp: `light`, `cover`, `switch`, `fan`, `vacuum`, `media_player`, `sensor`, `binary_sensor`, `button`, `climate`, `lock`. Pflicht für jedes Smart-Home-Objekt. |
| `ha_id` | Stabile Kennung. Wird beim Export automatisch vergeben, wenn sie fehlt. **Nie ändern** – an ihr hängen alle Zuordnungen in der App. |
| `ha_label` | Anzeigename, z. B. „Deckenlampe Küche“. |
| `ha_room` | Raum, am besten genau wie der Bereich in Home Assistant benannt. Der Zuordnungsassistent nutzt ihn für Vorschläge. |
| `ha_entity_id` | Optional, z. B. `light.kueche`. Der Präfix muss zum `ha_domain` passen. Leer lassen, wenn unbekannt – die Zuordnung geht bequemer in der App. |
| `ha_ignore` | `True`: Objekt wird nicht exportiert und nicht als Gerät erkannt. |
| `ha_visual_only` | `True`: Objekt wird exportiert, aber nie automatisch als Gerät markiert (z. B. Deko-LEDs). |
| `ha_cutaway` | `True`: Decke, in der Draufsicht ausgeblendet. |
| `ha_door_kind` | Bei Türkontakten (`binary_sensor`): `entrance` (Haustür), `single` (einflügelig) oder `double` (zweiflügelig). |
| `ha_door_lock` | Bei einem `lock`: `ha_id` der zugehörigen Tür, damit Schloss und Tür gemeinsam angezeigt werden. |
| `ha_door_geometry` | Bewegliches Türblatt als JSON: `hinge`, `swingAxis`, `tiltAxis` (je drei Zahlen, glTF-Koordinaten), `swingDegrees`, `tiltDegrees`. |

**Mehrteilige Geräte.** Alle Objekte mit derselben `ha_id` bilden ein Gerät (z. B. Gehäuse, Display und Fernbedienung
eines Luftreinigers). Sie müssen denselben `ha_domain` und höchstens eine Entity haben, sonst bricht der Export mit
„Conflicting group metadata“ ab.

**Achtung beim Duplizieren.** Shift+D kopiert auch `ha_id`. Zwei kopierte Lampen wären danach **ein** Gerät. Am Duplikat
`ha_id` löschen; der nächste Export vergibt eine neue.

### Lampen

- Den **leuchtenden Teil** kennzeichnen (Diffusor, Lichtband, Glas), nicht den ganzen Lampenfuß. Der Export setzt die
  Lichtquellen an die Oberfläche dieser Geometrie; lange Streifen und Flächen erhalten mehrere Quellen, die sich den
  Lichtstrom teilen (höchstens 32 je Lampe).
- `ha_light_kind`: `point`, `spot`, `strip` oder `panel`. Ohne Angabe wird aus dem Namen geschätzt.
- `ha_light_lumens`, `ha_light_range` (Meter), `ha_light_angle` (Grad) sind Startwerte. Feiner kalibriert wird später in
  der App am echten Raum.
- `ha_light_direction` (Blender-Weltkoordinaten, z. B. `[0, 0, -1]` für nach unten): Für Wand-, Steh- und Regalleuchten
  **immer setzen**. Bei waagrechten Flächen zeigt das Licht automatisch nach unten; für senkrechte Flächen ist die
  automatische Richtung auf die Referenzwohnung abgestimmt und bei eigenen Modellen oft falsch.

### Stolperfalle: Blender-Lichtquellen

Der Export markiert jede Blender-Lichtquelle (Punkt, Spot, Fläche – nicht Sonne) automatisch als HA-Lampe. Das gilt auch
für die Standardlampe einer neuen Szene und für Hilfslichter, die nur der Ausleuchtung beim Rendern dienen. Solche Lichter
löschen oder mit `ha_ignore = True` markieren, sonst erscheinen im Plan Lampen ohne Gegenstück. Die Schaltfläche **Lampen
und Geräte erkennen** im Panel arbeitet mit Namensregeln der Referenzwohnung; bei eigenen Modellen deshalb
`ha_domain` selbst setzen und das Ergebnis prüfen.

## 3. Exportieren

**Datei → Exportieren → 3Dash Floorplan (.glb)**. Der Export arbeitet auf einer temporären Kopie: Er wendet Modifier an,
bündelt statische Objekte mit gleichen Materialien und lässt die .blend-Datei unverändert. Neben der GLB entsteht
`<name>.report.json` mit Objektzahlen, Dateigröße, allen Manifest-Einträgen und den Material-Ersatzfarben.

Ohne Oberfläche (für Agenten und Skripte):

```bash
blender --background Wohnung_v01.blend --python tools/blender_3dash.py -- --output Wohnung_v01.glb
```

Bei einem Fehler entsteht stattdessen `Wohnung_v01.error.txt` mit dem Traceback.

**Bericht prüfen:** Stimmt `entities` mit der Zahl der gekennzeichneten Geräte überein? Hat jede Lampe sinnvolle
`emitters` (Position, Richtung)? Gibt es unerwartete Einträge, etwa eine Lampe namens „Light“?

## 4. Hochladen und zuordnen

1. In HomeTwin3D im Einrichtungsassistenten oder unter **Einstellungen → 3D-Modell** die GLB hochladen.
2. **Geräte zuordnen**: Der Assistent schlägt pro Modellobjekt passende Entities vor (Name, Raum, Position) und schaltet
   dabei nichts. Gute `ha_label`- und `ha_room`-Werte machen die Vorschläge deutlich besser.
3. Lampen über **Licht kalibrieren** an die echte Helligkeit anpassen; offene Modellbereiche bei Bedarf im Editor mit
   **Lichtblockern** abschirmen.
4. Mit dem Add-on das Ergebnis als **Gemeinsame Version** veröffentlichen, damit alle Tablets denselben Stand bekommen.

Zuordnungen lassen sich als JSON sichern und in Blender über **3Dash Zuordnungen importieren** zurückspielen. So steht in
der .blend-Datei dieselbe Zuordnung wie in der App.

## 5. Modell weiterentwickeln

- Dieselbe .blend weiterbearbeiten, neu exportieren, neu hochladen. Zuordnungen, bewusst leere Zuordnungen,
  Raumbestätigungen und Lichtkalibrierungen bleiben über die `ha_id` erhalten; Geometrie und Positionen kommen aus der
  neuen Datei. Neue Objekte brauchen eine neue Zuordnung.
- Vor jedem Upload **Einstellungen → 3D-Modell → Alle Zuordnungen sichern**.
- Jede Änderung als neue Version speichern (`Wohnung_v02.blend`, `Wohnung_v03.blend` …), nie die letzte gute Datei
  überschreiben.
- Wer die GLB nach dem Export selbst nachbearbeitet (Vereinfachung, Patches), darf danach nicht einfach neu aus Blender
  exportieren, weil die Nachbearbeitung sonst verloren geht. Für diesen Fall beschreibt die
  [Modell-Pipeline](docs/MODEL_PIPELINE.md) den Weg über Patch-Skripte.

## 6. Mit einem KI-Agenten arbeiten (Astra, Claude Opus)

Ein Agent kann Wohnung, Möbel und Geräte in Blender modellieren, kennzeichnen und exportieren. Bewährt hat sich, dass der
Agent **Python-Skripte** schreibt und ausführt, statt in der Oberfläche zu klicken: Jeder Schritt ist dann nachvollziehbar
und wiederholbar.

### Was der Agent braucht

- **Maße:** Grundriss mit Wandlängen, Raumhöhe, Fenster- und Türpositionen. Ohne Maße rät der Agent.
- **Fotos** der Räume und Geräte als Referenz für Form und Farbe.
- **Geräteliste:** welche Lampen, Rollos, Türkontakte und Geräte es gibt und in welchem Raum. Entity-IDs sind optional;
  der Agent soll keine erfinden, leere Felder ordnet der Assistent in der App zu.
- **Diese Anleitung** und `tools/blender_3dash.py`, damit er die Eigenschaften aus Abschnitt 2 kennt.

### Arbeitsweise

1. **Auf Kopien arbeiten.** Jeder Lauf öffnet die letzte Version und speichert als neue Version. Eine geöffnete
   Blender-Instanz mit ungespeicherter eigener Arbeit nicht vom Agenten verändern lassen; besser ist eine Hintergrundinstanz
   (`blender --background datei.blend --python skript.py`).
2. **In kleinen Schritten:** erst Räume und Wände, dann Fenster und Türen, dann Möbel, zuletzt Lampen und Geräte.
3. **Bilder prüfen lassen.** Nach jedem Schritt Vorschaubilder rendern (Workbench reicht) und mit den Fotos vergleichen.
   Kamera nicht in Wände oder Schränke setzen.
4. **Kennzeichnen** nach Abschnitt 2, inklusive `ha_cutaway` für Decken und `ha_light_direction` für Wandleuchten.
5. **Exportieren** über die Kommandozeile und den Bericht auswerten (Abschnitt 3).
6. Hochladen und Zuordnen übernimmt man selbst in der App; dabei werden keine Geräte geschaltet.

### Typische Fehler von Agenten

- `bpy.ops.mesh.primitive_*_add` legt Objekte am 3D-Cursor an, nicht am Ursprung. Sicherer: `bmesh` plus
  `bpy.data.objects.new`, Position explizit setzen.
- Operatoren hängen vom Modus (Objekt-/Bearbeitungsmodus), vom aktiven Objekt und von der Auswahl ab. Beides vor jedem
  Operator ausdrücklich setzen.
- Objekte dupliziert, ohne `ha_id` zu entfernen (zwei Lampen werden ein Gerät).
- Skalierung nicht angewendet, Zentimeter statt Meter.
- Hilfslichter für Vorschaubilder in der Szene gelassen – sie werden als HA-Lampen exportiert.
- Subdivision auf hohe Stufen gestellt; das Modell wird für Tablets zu schwer.
- Entity-IDs geraten. Lieber leer lassen.

### Beispiel-Auftrag

```text
Lies BLENDER_WORKFLOW.md und tools/blender_3dash.py aus dem HomeTwin3D-Repository.
Öffne wohnung_v03.blend im Hintergrund und speichere das Ergebnis als wohnung_v04.blend.
Ergänze im Wohnzimmer (Raum „Wohnzimmer“) eine Stehlampe nach Foto stehlampe.jpg, 1,60 m hoch,
neben dem Sofa. Kennzeichne nur den Lampenschirm: ha_domain=light, ha_light_kind=point,
ha_light_direction=[0,0,1], ha_room=Wohnzimmer, ha_label="Stehlampe Sofa", keine Entity-ID.
Rendere vorher/nachher ein Vorschaubild, exportiere wohnung_v04.glb mit dem 3Dash-Export
und nenne mir aus dem Bericht die Zahl der Entities und die Emitter der neuen Lampe.
```

## 7. Datenschutz

Modell, Fotos, Grundriss und Entity-Listen beschreiben die eigene Wohnung. Sie gehören nicht in ein öffentliches
Repository oder in öffentliche Issues. Wer am Projekt mitarbeitet, beachtet die
[Veröffentlichungsregeln](docs/PUBLICATION_PRIVACY.md).

## 8. Erfahrungen aus der Praxis

Die Referenzwohnung des Projekts ist über mehr als hundert Modellversionen gewachsen. Daraus folgen einige Regeln, die für
jedes eigene Modell gelten.

**Kennungen sind wichtiger als Namen.** Objekte dürfen umbenannt, verschoben und neu modelliert werden, solange ihre `ha_id`
bleibt. Wird ein Gerät durch ein neues Modell ersetzt (Platzhalter → detailliertes Gerät), die alte `ha_id` auf das neue
Objekt übertragen; dann bleibt die Zuordnung in der App erhalten. Eine neue Kennung bedeutet immer eine neue Zuordnung.

**Doppelte Geräte vermeiden.** Wird eine Lampe ersetzt, auch die alte Leuchte samt Blender-Lichtquelle entfernen. Sonst
leuchtet im Plan an der alten Stelle weiter ein Licht ohne sichtbares Gegenstück.

**Modellgrenzen eng halten.** Die App leitet Mittelpunkt, Kamera, Sonnenschatten und die Ausrichtung der Außenumgebung aus den
Grenzen des Modells ab. Eine überstehende Bodenplatte, vergessene Hilfsobjekte oder einzelne Ausreißer-Vertices weit außerhalb
verschieben das alles. Bodenflächen an der Außenwand enden lassen und verirrte Meshreste löschen.

**Rollos markieren die Fassade.** Die Außenumgebung richtet sich an der Linie der Rollos (`cover`) aus. Rollos deshalb an den
echten Fenstern der Außenwand platzieren, nicht als freie Deko im Raum.

**Was sich bewegt, braucht Platz.** Türen schwenken in der App über ihren vollen Öffnungswinkel. Vor dem Export prüfen, ob
Möbel im Schwenkbereich stehen; sonst den Winkel (`swingDegrees` in `ha_door_geometry`) verkleinern oder das Möbel verschieben.

**Was an Türen hängt, muss mit der Tür verbunden sein.** Klinken, Haken, Kleidung oder Schilder auf einem Türblatt bewegen
sich nur mit, wenn sie im selben beweglichen Knoten liegen. Sonst bleiben sie beim Öffnen in der Luft stehen.

**Der Export bündelt nach Raum und Material.** Statische Objekte mit gleichem Material werden zu großen gemeinsamen Meshes
zusammengefasst. Das ist gut für die Leistung, erschwert aber spätere Einzelkorrekturen an der fertigen GLB. Smart-Home-Objekte
bleiben eigenständig. Möbel, die man später einzeln ändern will, bekommen eigene Materialien.

**Lieber am Original ändern als nachträglich die GLB flicken.** Solange die GLB direkt aus Blender kommt, ist ein neuer
Export die einfachste und sicherste Änderung. Wer die GLB nachbearbeitet (Vereinfachung, Patches), muss jede spätere Änderung
ebenfalls als Patch übertragen; das ist mächtig, aber aufwendig (siehe [Modell-Pipeline](docs/MODEL_PIPELINE.md)).

**Vereinfachen, aber Ränder schützen.** Eine Netzvereinfachung kann die Dateigröße deutlich senken. Dabei die äußersten
Vertices des Modells unverändert lassen, weil die App die Modellgrenzen exakt auswertet (siehe oben).

**Materialien vor dem Export prüfen.** Prozedurale Farben gehen beim glTF-Export verloren, und unpassende Transparenz macht
Glas zu dunklen Flächen. Der Export-Bericht nennt die betroffenen Materialien; im Zweifel einfache Principled-BSDF-Materialien
mit Grundfarbe verwenden.

**Nur Metadaten ändern, wenn sich die Geometrie nicht ändert.** Neue Zuordnungshilfen, Gerätetypen oder Zusatzsensoren
betreffen nur das Manifest. Dafür muss das Modell nicht neu gebaut werden; ein Export mit unveränderter Geometrie oder das
Zurückspielen der Zuordnungen genügt.

**Vor jedem Austausch sichern und danach vergleichen.** Vor dem Upload die Zuordnungen sichern und danach prüfen, ob alle
bisherigen Zuordnungen noch da sind. Neue Geräte zuerst ohne Entity anlegen und in der App zuordnen, statt IDs zu raten.

## Checkliste vor dem Upload

1. Meter, Z oben, Skalierung angewendet.
2. Decken mit `ha_cutaway` markiert.
3. Rollos geschlossen, Türen geschlossen modelliert.
4. Jede Lampe, jedes Rollo und Gerät hat `ha_domain`, `ha_label`, `ha_room`; keine doppelten `ha_id` durch Duplikate.
5. Wand- und Stehleuchten haben `ha_light_direction`.
6. Keine Render-Hilfslichter oder Hilfsobjekte ohne `ha_ignore`.
7. Export-Bericht geprüft (Entities, Emitter, Ersatzfarben).
8. Bestehende Zuordnungen in der App gesichert.
