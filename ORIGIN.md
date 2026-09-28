# Herkunft von HomeTwin3D

HomeTwin3D wird seit dem **27.09.2026** von **Raza55** als eigenständiges Projekt entwickelt. Es entstand aus dem Open-Source-Projekt **3Dash** von **Kdcius und den ursprünglichen Mitwirkenden**. Vielen Dank für diese Grundlage.

## Nachvollziehbare Ausgangspunkte

| Bezug | Repository / Commit |
| --- | --- |
| Originalprojekt | https://github.com/Kdcius/3Dash_webapp |
| Gemeinsamer Ausgangsstand | [`f55a3e14f27d1d3add27ad407ba8963a175ef5b1`](https://github.com/Kdcius/3Dash_webapp/commit/f55a3e14f27d1d3add27ad407ba8963a175ef5b1), 19.06.2026, `chore: bump addon version to 1.2.6` |
| Frühere Entwicklung | Eigene Weiterentwicklung im früheren 3Dash-Fork und anschließend HomeTwin3D |
| Eigenständiges Repository | https://github.com/Raza55/HomeTwin3D, Hauptbranch `main` |

Der Ausgangscommit wurde anhand der lokalen Git-Historie mit `git merge-base` ermittelt. Dieses Repository beginnt aus Datenschutzgründen mit einem bereinigten Snapshot des HomeTwin3D-Stands vom 28.09.2026 und einem neuen Root-Commit. Dieser Commit kennzeichnet den Import; er schreibt fremde Beiträge nicht dem importierenden Autor zu. Die frühere Entwicklungshistorie bleibt in privaten lokalen Backups erhalten und wird nicht erneut veröffentlicht. Der Original-Ausgangscommit verweist auf das unveränderte Upstream-Projekt.

## Eigenständige Entwicklung

HomeTwin3D verfolgt einen eigenen Entwicklungs- und Veröffentlichungszyklus. Es besteht keine Pflicht zur Synchronisierung mit dem Originalprojekt. Allgemeine Verbesserungen können bei Interesse separat vorgeschlagen oder übernommen werden.

Die Weiterentwicklung umfasst insbesondere Blender-Import und stabile Gerätezuordnungen, physische Modellleuchten, gruppierte Lichtsteuerung, Rollos, Türkontakte, Geräteanimationen, Walk-/Flugmodus, TV-Medienanzeigen, Außenumgebung sowie Optimierungen für größere Modelle. Details stehen in [PROJECT_STATUS.md](PROJECT_STATUS.md), [BLENDER_WORKFLOW.md](BLENDER_WORKFLOW.md) sowie in den privaten historischen Backups.

Zur Verselbstständigung wurden README, Projektmetadaten, Paketname/-version, Add-on-Identität und Build-Quelle, Vite-/Proxy-Pfad, PWA-Manifeste, Seitentitel, Begrüßungstexte, Projektlink und GitHub-Workflows angepasst. Betroffen sind unter anderem `package.json`, `package-lock.json`, `repository.json`, `public/manifest-*.json` und `src/i18n/translations.json`; diese JSON-Dateien erlauben keine Kommentarheader. Quelltext- und Konfigurationsdateien dieses Umstellungsschritts tragen dort, wo das Format es erlaubt, zusätzliche Änderungshinweise. Die historische Zuordnung zu Autoren und Zeitpunkten bleibt in den privaten Git-Backups erhalten; neue Änderungen werden in der neuen Git-Historie dokumentiert.

Bestehende Blender-Metadaten wie `3dash_manifest`, Speicherkennungen, historische Modellnamen und das Verzeichnis `3dash-addon/` bleiben kompatibel. Ältere Werkzeuge verwenden jetzt neutrale Beispielpfade; private Modellquellen bleiben lokal.

## Lizenz und Anerkennung

Die übernommene [Apache-2.0-Lizenz](LICENSE) bleibt unverändert erhalten. Vorhandene Urheber-, Lizenz- und Attributionshinweise gelten weiterhin. [NOTICE](NOTICE) ergänzt die Herkunft und die eigenständige Weiterentwicklung; es ersetzt oder verändert die Lizenz nicht.

Im Git-Baum des oben genannten Original-Ausgangscommits ist eine `LICENSE`, aber keine `NOTICE` enthalten. Die NOTICE dieses Projekts wurde für HomeTwin3D ergänzt. Die ursprünglichen Marken und Autorennamen werden zur Beschreibung der Herkunft genannt; daraus folgt keine Unterstützung oder offizielle Zugehörigkeit.

## Alte und neue Ablage

Für neue Veröffentlichungen ausschließlich diesen frischen Klon verwenden. Alte lokale Klone, Bundles, Branches und Tags sind historische Sicherungen und dürfen nicht in dieses Repository gepusht oder gemergt werden. Das Originalprojekt bleibt über den oben genannten Upstream-Link nachvollziehbar.

Persönliche Wohnungsmodelle und Laufzeitdaten des Browsers gehören nicht zum Repository. Private Installationsdaten bleiben lokal und werden nicht mit dem Snapshot übernommen.
