$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $env:LOCALAPPDATA 'HomeTwin-PCScreen'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    python -m venv (Join-Path $PSScriptRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ benoetigt (python.org). Dann Setup erneut starten.' }
}
& $python -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Installation fehlgeschlagen.' }
& $python (Join-Path $PSScriptRoot 'screen.py') --list
if ($LASTEXITCODE -ne 0) { throw 'Monitorliste konnte nicht gelesen werden.' }
Write-Host 'MQTT-Daten wie in HASS.Agent eingeben. Der alte Screenshot-Sensor bleibt deaktiviert.'
$broker = Read-Host 'MQTT-Hostname (ohne mqtt:// oder https://)'
if ([string]::IsNullOrWhiteSpace($broker) -or $broker.Contains('://')) { throw 'Gueltigen Hostnamen eingeben.' }
$tls = (Read-Host 'TLS verwenden? [J/n]') -notmatch '^(n|nein)$'
$portDefault = if ($tls) { 8883 } else { 1883 }
$portInput = Read-Host "MQTT-Port [$portDefault]"
$port = if ($portInput) { [int]$portInput } else { $portDefault }
if ($port -lt 1 -or $port -gt 65535) { throw 'Ungueltiger Port.' }
$ca = ''
if ($tls) {
    $ca = Read-Host 'Eigene CA-Datei (.pem) falls benoetigt; sonst Enter'
    if ($ca -and -not (Test-Path -LiteralPath $ca)) { throw 'CA-Datei nicht gefunden.' }
    if ($ca) { $ca = (Resolve-Path -LiteralPath $ca).Path }
}
$screenInput = Read-Host 'Screen aus obiger Liste [0]'
$screen = if ($screenInput) { [int]$screenInput } else { 0 }
if ($screen -lt 0) { throw 'Screen muss mindestens 0 sein.' }
$tvMonitor = (Read-Host 'Kennung des Fernsehers in eckigen Klammern (z. B. DON0074); leer = immer obiger Screen').Trim().ToUpperInvariant()
if ($tvMonitor -and $tvMonitor -notmatch '^[A-Z0-9]{3,8}$') { throw 'Kennung besteht aus 3-8 Buchstaben/Ziffern.' }
$mqttUser = Read-Host 'MQTT-Benutzer'
$mqttPassword = Read-Host 'MQTT-Passwort' -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential($mqttUser, $mqttPassword)
$credential | Export-Clixml -LiteralPath (Join-Path $dataDir 'mqtt.xml')
@{ host=$broker; port=$port; tls=$tls; ca_file=$ca; screen=$screen; tv_monitor=$tvMonitor } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir 'config.json') -Encoding UTF8
Write-Host 'Gespeichert. Start.ps1 startet die Kamera; Stop.ps1 beendet sie.'
Write-Host 'Passwort ist fuer diesen Windows-Benutzer verschluesselt gespeichert.'
