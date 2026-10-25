[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$labRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.lab\vnext-10.10.6'))
$pidFile = Join-Path $labRoot 'server.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Output 'No 10.10.6 lab PID recorded.'; return }
$labProcessId = [int](Get-Content -LiteralPath $pidFile)
$labProcess = Get-Process -Id $labProcessId -ErrorAction SilentlyContinue
if ($null -eq $labProcess) { Write-Output '10.10.6 lab already stopped.'; return }
$expectedExecutable = Join-Path $labRoot 'server\jellyfin\jellyfin.exe'
if ($labProcess.Path -ne $expectedExecutable) { throw 'PID does not belong to the 10.10.6 lab; refusing to stop it.' }
Stop-Process -Id $labProcessId
Write-Output "Stopped only 10.10.6 lab PID $labProcessId."
