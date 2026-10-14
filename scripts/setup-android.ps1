$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.tooling'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
function Download-Checked($url, $destination, $checksum) {
  if (!(Test-Path -LiteralPath $destination)) {
    & curl.exe --fail --location --retry 2 --output $destination $url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
  }
  if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLower() -ne $checksum.ToLower()) { throw "Checksum mismatch: $destination" }
}
if (!(Test-Path -LiteralPath (Join-Path $toolRoot 'java-path.txt'))) {
  $archive = Join-Path $toolRoot 'microsoft-jdk21.zip'
  Download-Checked 'https://aka.ms/download-jdk/microsoft-jdk-21.0.12.1-windows-x64.zip' $archive '192441a9d27da813bada974bb88b4cf64d37a9589ed37f204374d411ca5ce07f'
  $jdkRoot = Join-Path $toolRoot 'jdk'
  New-Item -ItemType Directory -Force -Path $jdkRoot | Out-Null
  & tar.exe -xf $archive -C $jdkRoot
  if ($LASTEXITCODE -ne 0) { throw 'JDK extraction failed' }
  $jdk = Get-ChildItem -LiteralPath $jdkRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/javac.exe') } | Select-Object -First 1
  if (!$jdk) { throw 'JDK not found' }
  [IO.File]::WriteAllText((Join-Path $toolRoot 'java-path.txt'), $jdk.FullName)
}
$env:JAVA_HOME = [IO.File]::ReadAllText((Join-Path $toolRoot 'java-path.txt'))
$env:ANDROID_HOME = Join-Path $toolRoot 'android-sdk'
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle'
$sdkmanager = Join-Path $env:ANDROID_HOME 'cmdline-tools/latest/bin/sdkmanager.bat'
if (!(Test-Path -LiteralPath $sdkmanager)) {
  $archive = Join-Path $toolRoot 'android-commandline.zip'
  Download-Checked 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $archive '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
  $unpack = Join-Path $toolRoot 'android-unpack'
  New-Item -ItemType Directory -Force -Path $unpack | Out-Null
  & tar.exe -xf $archive -C $unpack
  if ($LASTEXITCODE -ne 0) { throw 'SDK extraction failed' }
  $target = Join-Path $env:ANDROID_HOME 'cmdline-tools/latest'
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $unpack 'cmdline-tools/*') -Destination $target -Recurse -Force
}
(1..100 | ForEach-Object { 'y' }) | & $sdkmanager "--sdk_root=$env:ANDROID_HOME" --licenses
if ($LASTEXITCODE -ne 0) { throw 'SDK license setup failed' }
& $sdkmanager "--sdk_root=$env:ANDROID_HOME" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
if ($LASTEXITCODE -ne 0) { throw 'SDK installation failed' }
Write-Output 'Android build tools ready in .tooling/'
