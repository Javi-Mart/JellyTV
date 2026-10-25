param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$JdkHome,
    [Parameter(Mandatory = $true)][string]$SdkHome,
    [string]$Python = 'python',
    [string]$WorkDirectory = (Join-Path $PSScriptRoot '../../.lab/android-tools')
)
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$jdkPath = (Resolve-Path -LiteralPath $JdkHome).Path
$sdkPath = (Resolve-Path -LiteralPath $SdkHome).Path
$workPath = [IO.Path]::GetFullPath($WorkDirectory)
New-Item -ItemType Directory -Force -Path $workPath | Out-Null
& $Python (Join-Path $PSScriptRoot 'theme.py') check $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Source verification failed; build stopped.' }
if ((Get-Content -LiteralPath (Join-Path $jdkPath 'release') -Raw) -notmatch 'JAVA_VERSION="21[.]') {
    throw 'The pinned upstream client requires JDK 21.'
}
$names = @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_USER_HOME', 'GRADLE_USER_HOME')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:JAVA_HOME = $jdkPath
    $env:ANDROID_HOME = $sdkPath
    $env:ANDROID_USER_HOME = Join-Path $workPath 'user'
    $env:GRADLE_USER_HOME = Join-Path $workPath 'gradle-home'
    & (Join-Path $sourcePath 'gradlew.bat') -p $sourcePath --no-daemon --console=plain '-Pjellyfin.version=0.19.10-jellytv.1' assembleDebug lintDebug testDebugUnitTest
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
    # Upstream sets abortOnError=false. A successful Gradle exit alone does not mean lint passed.
    $reports = Get-ChildItem -LiteralPath $sourcePath -Recurse -Filter 'lint-results-debug.xml'
    if (!$reports) { throw 'No lint XML reports were produced.' }
    $errors = @()
    foreach ($report in $reports) {
        [xml]$lint = Get-Content -LiteralPath $report.FullName -Raw
        $errors += @($lint.issues.issue | Where-Object { $_.severity -in @('Error', 'Fatal') })
    }
    if ($errors.Count -gt 0) { throw "Lint reports contain $($errors.Count) Error/Fatal findings. Inspect reports before release." }
    Write-Output 'PASS: assembleDebug, lintDebug (XML error gate), testDebugUnitTest. Device validation is still required.'
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
