$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $env:LOCALAPPDATA 'HomeTwin-PCScreen'
$mutex = New-Object System.Threading.Mutex($false, 'Local\HomeTwinPCScreen')
$ownsMutex = $false
try {
    try { $ownsMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { Write-Host 'DesktopMain Screen laeuft bereits.'; return }
    $credential = Import-Clixml -LiteralPath (Join-Path $dataDir 'mqtt.xml')
    $env:DESKTOP_MQTT_USER = $credential.UserName
    $env:DESKTOP_MQTT_PASSWORD = $credential.GetNetworkCredential().Password
    $stopFile = Join-Path $dataDir 'stop'
    if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
    & (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') (Join-Path $PSScriptRoot 'screen.py') --config (Join-Path $dataDir 'config.json')
} finally {
    Remove-Item Env:\DESKTOP_MQTT_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\DESKTOP_MQTT_USER -ErrorAction SilentlyContinue
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
