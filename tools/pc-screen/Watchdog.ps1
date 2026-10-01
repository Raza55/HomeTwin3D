# Started every few minutes by the scheduled task from Autostart.ps1.
# Restarts the helper after it was closed from outside (e.g. by a Python update).
$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $env:LOCALAPPDATA 'HomeTwin-PCScreen'
# An explicit Stop.ps1 stays in force until the next manual Start.ps1.
if (Test-Path -LiteralPath (Join-Path $dataDir 'stop')) { return }
if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'config.json'))) { return }
# Start.ps1 holds a mutex: with a running helper this returns at once.
& (Join-Path $PSScriptRoot 'Start.ps1')
