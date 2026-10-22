param(
    [string[]]$Tasks = @(),
    [string]$PreviewOrigin
)

$ErrorActionPreference = 'Stop'
$buildToolRoot = Join-Path $env:LOCALAPPDATA 'DinerDostBuildTools'
$previousJava = $env:JAVA_HOME
$previousSdk = $env:ANDROID_HOME
try {
    if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $buildToolRoot 'jdk'))) {
        $env:JAVA_HOME = (Get-ChildItem -LiteralPath (Join-Path $buildToolRoot 'jdk') -Directory | Select-Object -First 1).FullName
    }
    if (-not $env:ANDROID_HOME -and (Test-Path -LiteralPath (Join-Path $buildToolRoot 'sdk'))) {
        $env:ANDROID_HOME = Join-Path $buildToolRoot 'sdk'
    }
    if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK 17 or open the project in Android Studio.' }
    if ($Tasks.Count -eq 0) {
        $Tasks = foreach ($flavor in @('Master','Pos','Captain','Kitchen','Bar','Command')) {
            ":app:assemble${flavor}Debug"
            ":app:test${flavor}DebugUnitTest"
            ":app:lint${flavor}Debug"
        }
    }
    $arguments = @($Tasks) + @('--console=plain')
    if ($PreviewOrigin) { $arguments += "-PpreviewOrigin=$PreviewOrigin" }
    Push-Location -LiteralPath $PSScriptRoot
    try {
        & (Join-Path $PSScriptRoot 'gradlew.bat') @arguments
        if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE." }
    } finally { Pop-Location }
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousSdk
}
