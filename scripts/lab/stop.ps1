[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$labRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.lab'))
$pidFile = Join-Path $labRoot 'server.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Output 'No lab PID recorded.'; return }
$labProcessId = [int](Get-Content -LiteralPath $pidFile)
$labProcess = Get-Process -Id $labProcessId -ErrorAction SilentlyContinue
if ($null -eq $labProcess) { Write-Output 'Lab already stopped.'; return }
$expectedExecutable = Join-Path $labRoot 'server\jellyfin\jellyfin.exe'
if ($labProcess.Path -ne $expectedExecutable) { throw 'PID no longer belongs to this laboratory; refusing to stop it.' }
Stop-Process -Id $labProcessId
Write-Output "Stopped only local lab PID $labProcessId."
