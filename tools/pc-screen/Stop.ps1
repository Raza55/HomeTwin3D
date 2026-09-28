$dataDir = Join-Path $env:LOCALAPPDATA 'HomeTwin-PCScreen'
if (Test-Path -LiteralPath $dataDir) {
    Set-Content -LiteralPath (Join-Path $dataDir 'stop') -Value 'stop'
}
Write-Host 'Stop angefordert; der Helfer beendet sich nach dem aktuellen Vorgang.'
