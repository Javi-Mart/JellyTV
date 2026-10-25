[CmdletBinding()]
param([switch]$SkipFixtureCopy)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$labRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.lab\vnext-10.10.6'))
$archive = Join-Path $labRoot 'downloads\jellyfin_10.10.6-amd64.zip'
# Pinned bytes downloaded over HTTPS from Jellyfin's official archive on 2026-10-23.
$expectedHash = '193FEA3AC00A285C5C4D10874EA27FB3B6A503BD99D4DD36C79D30ABB4298428'
$downloadUrl = 'https://repo.jellyfin.org/archive/server/windows/stable/v10.10.6/amd64/jellyfin_10.10.6-amd64.zip'
@('downloads','server','data','cache','config','logs','media','evidence','auth') | ForEach-Object {
    New-Item -ItemType Directory -Path (Join-Path $labRoot $_) -Force | Out-Null
}
if (!(Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri $downloadUrl -OutFile ($archive + '.partial') -TimeoutSec 300
    if ((Get-FileHash -LiteralPath ($archive + '.partial') -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'Official archive bytes differ from the reviewed pin; refusing extraction.'
    }
    Move-Item -LiteralPath ($archive + '.partial') -Destination $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'Archive hash mismatch: refusing extraction or execution.'
}
$exe = Join-Path $labRoot 'server\jellyfin\jellyfin.exe'
if (!(Test-Path -LiteralPath $exe)) {
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $labRoot 'server')
}
if (!(Test-Path -LiteralPath $exe)) { throw 'Official archive did not contain the expected portable server.' }
$networkFile = Join-Path $labRoot 'config\network.xml'
if (!(Test-Path -LiteralPath $networkFile)) {
    @'
<?xml version="1.0" encoding="utf-8"?>
<NetworkConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <BaseUrl />
  <EnableHttps>false</EnableHttps>
  <RequireHttps>false</RequireHttps>
  <InternalHttpPort>18997</InternalHttpPort>
  <InternalHttpsPort>18998</InternalHttpsPort>
  <PublicHttpPort>18997</PublicHttpPort>
  <PublicHttpsPort>18998</PublicHttpsPort>
  <AutoDiscovery>false</AutoDiscovery>
  <EnableUPnP>false</EnableUPnP>
  <EnableIPv4>true</EnableIPv4>
  <EnableIPv6>false</EnableIPv6>
  <EnableRemoteAccess>false</EnableRemoteAccess>
  <LocalNetworkSubnets><string>127.0.0.0/8</string></LocalNetworkSubnets>
  <LocalNetworkAddresses><string>127.0.0.1</string></LocalNetworkAddresses>
  <KnownProxies />
  <IgnoreVirtualInterfaces>true</IgnoreVirtualInterfaces>
  <EnablePublishedServerUriByRequest>false</EnablePublishedServerUriByRequest>
</NetworkConfiguration>
'@ | Set-Content -LiteralPath $networkFile -Encoding utf8
}
if (!$SkipFixtureCopy) {
    $sourceMedia = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.lab\media'))
    foreach ($folder in @('Movies','Shows','Music')) {
        $source = Join-Path $sourceMedia $folder
        $target = Join-Path $labRoot ('media\' + $folder)
        if (!(Test-Path -LiteralPath $source)) { throw "Generate the original laboratory media first: missing $folder." }
        if (!(Test-Path -LiteralPath $target)) {
            Copy-Item -LiteralPath $source -Destination $target -Recurse
        }
    }
}
$manifest = @{
    serverVersion = '10.10.6'; baseURL = 'http://127.0.0.1:18997'; archiveURL = $downloadUrl
    archiveSha256 = $expectedHash.ToLower(); archiveBytes = (Get-Item -LiteralPath $archive).Length
    archivePinKind = 'Observed official HTTPS archive bytes, not a separately signed checksum'
    isolation = 'Separate data, configuration, cache, logs, media and credentials. No service or production changes.'
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $labRoot 'evidence\package.json') -Encoding utf8
Write-Output 'Portable 10.10.6 lab prepared in .lab/vnext-10.10.6. Existing 12.2 laboratory untouched.'
