<# Starts a temporary HTTPS address for the local Vite app. #>
$projectTunnel = Join-Path $PSScriptRoot "..\tools\cloudflared.exe"
$tunnel = $projectTunnel
if (-not (Test-Path $tunnel)) {
  $installedTunnel = Get-Command cloudflared -ErrorAction SilentlyContinue
  $tunnel = if ($installedTunnel) { $installedTunnel.Source } else { $null }
}
if (-not $tunnel) {
  Write-Host "cloudflared is not installed. Install the official Cloudflare Tunnel client, then run this script again." -ForegroundColor Yellow
  Write-Host "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/"
  exit 1
}

Write-Host "Starting a temporary HTTPS link for BlockWarranty. Keep this window open while the demo is in use." -ForegroundColor Cyan
& $tunnel tunnel --url http://127.0.0.1:5173
