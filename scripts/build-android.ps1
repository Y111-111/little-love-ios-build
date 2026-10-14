param([switch]$DebugBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$toolRoot = Join-Path $projectRoot '.tooling'
if (!(Test-Path -LiteralPath (Join-Path $toolRoot 'java-path.txt'))) { throw 'Run scripts/setup-android.ps1 first.' }
$env:JAVA_HOME = [IO.File]::ReadAllText((Join-Path $toolRoot 'java-path.txt'))
$env:ANDROID_HOME = Join-Path $toolRoot 'android-sdk'
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle'
& node scripts/build-mobile.mjs
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
& node node_modules/@capacitor/cli/bin/capacitor sync android
if ($LASTEXITCODE -ne 0) { throw 'Android sync failed' }
$keyDirectory = Join-Path $projectRoot '.local/android-signing'
$keyFile = Join-Path $keyDirectory 'little-love.jks'
$passwordFile = Join-Path $keyDirectory 'password.txt'
if (!$DebugBuild) {
  New-Item -ItemType Directory -Force -Path $keyDirectory | Out-Null
  if (!(Test-Path -LiteralPath $keyFile)) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $password = [Convert]::ToBase64String($bytes)
    [IO.File]::WriteAllText($passwordFile, $password)
    $env:LOVE_SIGN_PASSWORD = $password
    & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $keyFile -storepass:env LOVE_SIGN_PASSWORD -keypass:env LOVE_SIGN_PASSWORD -alias littlelove -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Little Love, O=Personal App, C=CN'
    if ($LASTEXITCODE -ne 0) { throw 'Signing key creation failed' }
  }
  $env:LOVE_SIGN_FILE = $keyFile
  $env:LOVE_SIGN_PASSWORD = [IO.File]::ReadAllText($passwordFile)
}
try {
  Push-Location -LiteralPath (Join-Path $projectRoot 'android')
  $task = if ($DebugBuild) { 'assembleDebug' } else { 'assembleRelease' }
  $localGradle = Join-Path $toolRoot 'gradle-bin/gradle-8.14.3/bin/gradle.bat'
  if (Test-Path -LiteralPath $localGradle) { & $localGradle $task --no-daemon --console=plain }
  else { & .\gradlew.bat $task --no-daemon --console=plain }
  if ($LASTEXITCODE -ne 0) { throw 'Android compilation failed' }
} finally {
  Pop-Location
  Remove-Item Env:LOVE_SIGN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:LOVE_SIGN_FILE -ErrorAction SilentlyContinue
}
$variant = if ($DebugBuild) { 'debug' } else { 'release' }
$artifactDirectory = Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
$destination = Join-Path $artifactDirectory "little-love-android-$variant.apk"
Copy-Item -LiteralPath (Join-Path $projectRoot "android/app/build/outputs/apk/$variant/app-$variant.apk") -Destination $destination -Force
Get-FileHash -LiteralPath $destination -Algorithm SHA256
Write-Output "Android APK ready: $destination"
