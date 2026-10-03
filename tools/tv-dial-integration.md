# TV Dial einrichten

Das TV-Popup im 3D-Board bietet Quellen wie SHIELD, PC, PlayStation, RetroPie und Aus. Die App schaltet dabei selbst nichts. Sie
sendet über die angemeldete HA-WebSocket-Verbindung das Event `hometwin_tv_dial`; `event_data.source` ist `shield`, `pc`,
`playstation`, `retropie` oder `aus`. Was dann passiert (TV einschalten, Receiver-Eingang wählen, Streaming-Gerät wecken,
alles ausschalten …), legt man in einer eigenen Home-Assistant-Automation fest.

## Automation anlegen

1. In Home Assistant eine Automation anlegen (oder eine vorhandene TV-Automation erweitern).
2. Je Quelle einen Auslöser **Manuelles Ereignis** mit Ereignistyp `hometwin_tv_dial` und Ereignisdaten `source: pc` (usw.)
   hinzufügen und ihm eine Auslöser-ID geben, z. B. `pc`.
3. Die Aktionen mit **Auswählen** (choose) nach Auslöser-ID verzweigen und dort die eigene Schaltfolge hinterlegen.
4. Modus **Neu starten** (restart) wählen, damit ein neuer Wunsch eine laufende Schaltfolge ablöst.

Der Auslöser im YAML-Modus der Automation sieht so aus:

```yaml
triggers:
  - trigger: event
    event_type: hometwin_tv_dial
    event_data:
      source: pc
    id: pc
```

## Mit dem Board verbinden

Das Board prüft, ob die Automation existiert und eingeschaltet ist; sonst sind die Tasten gesperrt. Die App erwartet die
Automation unter der Beispiel-ID `automation.tv_dial_hdmi1`. Heißt die eigene Automation anders, wird sie über die
Installationswerte zugeordnet (siehe [Installationswerte](../PROJECT_STATUS.md#installationswerte-beispiel-entities-umlenken)).

Ein bestätigtes Event bedeutet „angefordert“, nicht „fertig geschaltet“. Welche Quelle aktiv ist, zeigt das Board anhand der
Receiver- und TV-Entities.

## Prüfen

`node --test tools/tv-dial.test.mjs`; die Testseite `/HomeTwin3D/tools/tv-dial-qa.html` im Entwicklungsserver simuliert die
Bedienung, ohne Events an HA zu senden.
