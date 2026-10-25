[CmdletBinding()]
param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
$credentials = Get-Content -Raw -LiteralPath '.lab/credentials.local.json' | ConvertFrom-Json
if ($credentials.baseURL -ne 'http://127.0.0.1:18996') { throw 'Only the prepared loopback laboratory is allowed.' }
$server = Invoke-RestMethod 'http://127.0.0.1:18996/System/Info/Public'
if ($server.Id -ne $credentials.serverId -or $server.Version -ne '12.2.0') { throw 'Laboratory identity/version mismatch.' }
$webroot = '.lab/server/jellyfin/jellyfin-web'
$commands = [Collections.Generic.List[object]]::new()

function Invoke-Checked([string]$Label, [string]$Program, [string[]]$Arguments) {
    $log = Join-Path $root ".lab/release-$Label.log"
    & $Program @Arguments *> $log
    $exit = $LASTEXITCODE
    $commands.Add(@{ name = $Label; exitCode = $exit })
    Write-Output "$Label : exit $exit"
    if ($exit -ne 0) { throw "Failed: $Label. Inspect $log locally; do not publish raw authenticated diagnostics." }
}

function Invoke-Matrix([string]$Mode, [string]$Browser) {
    $env:JELLYTV_BROWSER = $Browser
    $arguments = @('playwright', 'test', 'tests/e2e/experience.spec.mjs')
    if ($Browser -ne 'chrome') {
        $arguments += @('--project=laptop', '--project=tv-1080')
        if ($Browser -ne 'firefox') { $arguments += '--project=mobile-390' }
    }
    & npx @arguments *> ".lab/release-$Mode-$Browser.log"
    $exit = $LASTEXITCODE
    & node scripts/lab/summarize-e2e.mjs "$Mode-$Browser"
    if ($LASTEXITCODE -ne 0 -or $exit -ne 0) { throw "Failed: $Mode-$Browser. Evidence preserved." }
    $commands.Add(@{ name = "$Mode-$Browser"; exitCode = $exit })
}

Invoke-Checked 'check' 'npm' @('run', 'check')
Invoke-Checked 'install-update' 'node' @('scripts/install.mjs', 'update', '--root', $webroot, '--web-version', '12.2')
Invoke-Checked 'core-install' 'node' @('scripts/lab-core.mjs')
Invoke-Checked 'quick-connect' 'node' @('scripts/fix-quick-connect.mjs', 'apply', '--root', $webroot)
Invoke-Checked 'navigation-patch' 'node' @('scripts/fix-navigation.mjs', 'apply', '--root', $webroot)
Invoke-Checked 'navigation-race' 'node' @('scripts/lab/verify-navigation-race.mjs')
$env:JELLYTV_ENHANCED = '1'
foreach ($browser in @('chrome', 'chromium', 'edge', 'webkit', 'firefox')) { Invoke-Matrix 'enhanced' $browser }
try {
    Invoke-Checked 'enhanced-remove' 'node' @('scripts/install.mjs', 'uninstall', '--root', $webroot)
    $env:JELLYTV_ENHANCED = '0'
    foreach ($browser in @('chrome', 'chromium', 'edge', 'webkit', 'firefox')) { Invoke-Matrix 'core' $browser }
} finally {
    & node scripts/install.mjs install --root $webroot --web-version 12.2
    if ($LASTEXITCODE -ne 0) { throw 'Could not restore the lab Enhanced installation.' }
    $env:JELLYTV_ENHANCED = '1'
}
$env:JELLYTV_BROWSER = 'chrome'
Invoke-Checked 'extended' 'npx' @('playwright', 'test', 'tests/e2e/extended.spec.mjs', '--project=desktop-1080', '--project=mobile-390', '--project=tv-1080')
Invoke-Checked 'extended-summary' 'node' @('scripts/lab/summarize-e2e.mjs', 'extended-chrome')
Invoke-Checked 'lifecycle' 'npx' @('playwright', 'test', '--config', 'playwright.lifecycle.config.mjs')
Invoke-Checked 'lifecycle-summary' 'node' @('scripts/lab/summarize-e2e.mjs', 'enhanced-lifecycle', '.lab/lifecycle-results.json')
Invoke-Checked 'geometry-a11y-zoom-tv' 'node' @('scripts/lab/validate-core.mjs', '--mode=all')
foreach ($name in @('authentication', 'session', 'administration', 'performance')) {
    Invoke-Checked $name 'node' @("scripts/validate-$name.mjs")
}
Invoke-Checked 'native-package' $Python @('android-tv/scripts/test_package.py', '.lab/android-tv')
$report = @{ date = [DateTime]::UtcNow.ToString('o'); status = 'PASS'; commands = $commands.ToArray();
    build = (Get-Content -Raw dist/manifest.json | ConvertFrom-Json);
    scope = 'Sequential local laboratory regression. Native APK runtime/build evidence is checked separately by package-release.py.' }
$report | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 docs/validation/release-check.json
Write-Output 'Release web regression and reversible native package checks PASS.'
