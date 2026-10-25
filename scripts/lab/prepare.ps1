[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$labRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.lab'))
$archive = Join-Path $labRoot 'downloads\jellyfin_12.2-amd64.zip'
$expectedHash = 'AB247745B54CEA9AF2460C3D62622F5F30A323B02B92D11CEA501B67B9A8D83F'
$downloadUrl = 'https://repo.jellyfin.org/files/server/windows/stable/v12.2/amd64/jellyfin_12.2-amd64.zip'
@('downloads','server','data','cache','config','logs','media','evidence') | ForEach-Object {
    New-Item -ItemType Directory -Path (Join-Path $labRoot $_) -Force | Out-Null
}
if (!(Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archive -TimeoutSec 300
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'Archive hash mismatch: refusing to execute.'
}
if (!(Test-Path -LiteralPath (Join-Path $labRoot 'server\jellyfin\jellyfin.exe'))) {
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $labRoot 'server')
}
$networkFile = Join-Path $labRoot 'config\network.xml'
if (!(Test-Path -LiteralPath $networkFile)) {
    @'
<?xml version="1.0" encoding="utf-8"?>
<NetworkConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <BaseUrl />
  <EnableHttps>false</EnableHttps>
  <RequireHttps>false</RequireHttps>
  <InternalHttpPort>18996</InternalHttpPort>
  <InternalHttpsPort>18997</InternalHttpsPort>
  <PublicHttpPort>18996</PublicHttpPort>
  <PublicHttpsPort>18997</PublicHttpsPort>
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
Write-Output 'Portable Jellyfin 12.2 prepared. No global install, service, or production configuration was changed.'
