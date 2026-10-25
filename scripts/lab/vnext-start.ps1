[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$labRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.lab\vnext-10.10.6'))
$exe = Join-Path $labRoot 'server\jellyfin\jellyfin.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Run scripts/lab/vnext-prepare.ps1 first.' }
$pidFile = Join-Path $labRoot 'server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $existing = Get-Process -Id ([int](Get-Content -LiteralPath $pidFile)) -ErrorAction SilentlyContinue
    if ($null -ne $existing -and $existing.Path -eq $exe) { Write-Output "10.10.6 lab already running, PID $($existing.Id)."; return }
    if ($null -ne $existing) { throw 'Recorded PID belongs to another process; refusing to reuse it.' }
}
if ($null -ne (Get-NetTCPConnection -LocalPort 18997 -State Listen -ErrorAction SilentlyContinue)) {
    throw 'Port 18997 is occupied; refusing to start another server.'
}
[xml]$network = Get-Content -LiteralPath (Join-Path $labRoot 'config\network.xml')
$settings = $network.NetworkConfiguration
if ($settings.InternalHttpPort -ne '18997' -or @($settings.LocalNetworkAddresses.string).Count -ne 1 -or $settings.LocalNetworkAddresses.string -ne '127.0.0.1' -or $settings.AutoDiscovery -ne 'false' -or $settings.EnableIPv6 -ne 'false' -or $settings.EnableRemoteAccess -ne 'false' -or $settings.EnableHttps -ne 'false' -or $settings.EnableUPnP -ne 'false') {
    throw 'Refusing startup: lab must bind only 127.0.0.1:18997, without discovery, remote access, HTTPS or UPnP.'
}
$ffmpeg = Join-Path $labRoot 'server\jellyfin\ffmpeg.exe'
if (!(Test-Path -LiteralPath $ffmpeg)) { throw 'Expected bundled FFmpeg is missing.' }
$labArgs = @(
    '--datadir', ('"' + (Join-Path $labRoot 'data') + '"'),
    '--configdir', ('"' + (Join-Path $labRoot 'config') + '"'),
    '--cachedir', ('"' + (Join-Path $labRoot 'cache') + '"'),
    '--logdir', ('"' + (Join-Path $labRoot 'logs') + '"'),
    '--webdir', ('"' + (Join-Path $labRoot 'server\jellyfin\jellyfin-web') + '"'),
    '--ffmpeg', ('"' + $ffmpeg + '"'), '--nonetchange'
)
$labProcess = Start-Process -FilePath $exe -ArgumentList $labArgs -WorkingDirectory $labRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $labRoot 'logs\stdout.log') -RedirectStandardError (Join-Path $labRoot 'logs\stderr.log') -PassThru
$labProcess.Id | Set-Content -LiteralPath $pidFile
Write-Output "10.10.6 lab PID $($labProcess.Id): http://127.0.0.1:18997/web/"
