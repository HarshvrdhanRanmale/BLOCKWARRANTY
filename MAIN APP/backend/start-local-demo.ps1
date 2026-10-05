# Starts the database and BlockWarranty backend outside Codex on port 5001 so
# Groq can use the computer's normal internet connection without conflicting
# with any prior development process on port 5000.
$ErrorActionPreference = 'Stop'
$mongoExe = 'C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe'
$dataPath = Join-Path $env:LOCALAPPDATA 'BlockWarranty\mongo-data'
$logPath = Join-Path $env:LOCALAPPDATA 'BlockWarranty\mongod.log'

if (-not (Test-Path $mongoExe)) {
  throw "MongoDB was not found at $mongoExe"
}

New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
if (-not (Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $mongoExe -ArgumentList @(
    '--dbpath', $dataPath,
    '--bind_ip', '127.0.0.1',
    '--port', '27017',
    '--logpath', $logPath,
    '--logappend',
    '--setParameter', 'diagnosticDataCollectionEnabled=false'
  ) -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

# The local Ganache chain contains the no-cost BlockWarranty demo contract.
# Start it only when no chain is already listening.
if (-not (Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'chain:start') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Set-Location $PSScriptRoot
npm run dev
