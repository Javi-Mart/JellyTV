[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$labRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.lab'))
$exe = Join-Path $labRoot 'server\jellyfin\jellyfin.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Run scripts/lab/prepare.ps1 first.' }
$pidFile = Join-Path $labRoot 'server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $existing = Get-Process -Id ([int](Get-Content -LiteralPath $pidFile)) -ErrorAction SilentlyContinue
    if ($null -ne $existing -and $existing.Path -eq $exe) { Write-Output "Local lab already running, PID $($existing.Id)."; return }
    if ($null -ne $existing) { throw 'Recorded PID belongs to another process or its executable cannot be verified.' }
}
$listening = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 18996 -State Listen -ErrorAction SilentlyContinue
if ($null -ne $listening) { throw 'Port 18996 is already in use; refusing to start another server.' }
[xml]$network = Get-Content -LiteralPath (Join-Path $labRoot 'config\network.xml')
$settings = $network.NetworkConfiguration
if ($settings.InternalHttpPort -ne '18996' -or $settings.LocalNetworkAddresses.string -ne '127.0.0.1' -or $settings.AutoDiscovery -ne 'false' -or $settings.EnableIPv6 -ne 'false' -or $settings.EnableRemoteAccess -ne 'false') {
    throw 'Refusing to start: lab network must be loopback only, port 18996, no discovery/remote access/IPv6.'
}
$labArgs = @(
    '--datadir', ('"' + (Join-Path $labRoot 'data') + '"'),
    '--configdir', ('"' + (Join-Path $labRoot 'config') + '"'),
    '--cachedir', ('"' + (Join-Path $labRoot 'cache') + '"'),
    '--logdir', ('"' + (Join-Path $labRoot 'logs') + '"'),
    '--webdir', ('"' + (Join-Path $labRoot 'server\jellyfin\jellyfin-web') + '"'),
    '--ffmpeg', ('"' + (Join-Path $labRoot 'server\jellyfin\ffmpeg.exe') + '"'),
    '--nonetchange'
)
$labProcess = Start-Process -FilePath $exe -ArgumentList $labArgs -WorkingDirectory $labRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $labRoot 'logs\stdout.log') -RedirectStandardError (Join-Path $labRoot 'logs\stderr.log') -PassThru
$labProcess.Id | Set-Content -LiteralPath (Join-Path $labRoot 'server.pid')
Write-Output "Local lab PID $($labProcess.Id): http://127.0.0.1:18996/web/"
