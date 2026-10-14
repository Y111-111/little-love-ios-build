#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iPhone builds require a macOS machine (local or cloud) with Xcode 26+." >&2
  exit 1
fi
mkdir -p artifacts
xcodebuild -version
xcode_major="$(xcodebuild -version | awk '/^Xcode / { split($2, version, "."); print version[1] }')"
if [[ -z "$xcode_major" || "$xcode_major" -lt 26 ]]; then
  echo "Select Xcode 26 or newer before building." >&2
  exit 1
fi
export CI=1
npm ci
npm run build:mobile
npx cap sync ios
node --test test/mail.test.mjs test/mobile.test.mjs test/period-analysis.test.mjs
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath .tooling/ios-derived \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build \
  2>&1 | tee artifacts/ios-build.log
app_path='.tooling/ios-derived/Build/Products/Release-iphoneos/App.app'
if [[ ! -f "$app_path/App" || ! -f "$app_path/Info.plist" || ! -f "$app_path/public/mobile.js" ]]; then
  echo "Compiled app or bundled mobile interface missing." >&2
  exit 1
fi
# Reject simulator-only output before presenting anything as an installation package.
lipo "$app_path/App" -verify_arch arm64
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist")"
platform="$(/usr/libexec/PlistBuddy -c 'Print :DTPlatformName' "$app_path/Info.plist")"
if [[ "$bundle_id" != 'cn.littlelove.mail' || "$platform" != 'iphoneos' ]]; then
  echo "Wrong application identifier or platform: $bundle_id / $platform" >&2
  exit 1
fi
stage="$(mktemp -d "${TMPDIR:-/tmp}/little-love-ipa.XXXXXX")"
mkdir -p "$stage/Payload"
ditto "$app_path" "$stage/Payload/App.app"
ipa_path='artifacts/little-love-ios-v1.0-unsigned.ipa'
ditto -c -k --keepParent "$stage/Payload" "$ipa_path"
unzip -t "$ipa_path"
shasum -a 256 "$ipa_path" > "$ipa_path.sha256"
cp docs/IOS-INSTALL.md artifacts/IOS-INSTALL.md
printf 'Application: %s\nPlatform: %s\nSigning: unsigned; sign on your device with your Apple account\n' "$bundle_id" "$platform" > artifacts/ios-build-info.txt
echo "Created $ipa_path. Use SideStore or another selected signing tool to sign and install it with your own Apple account."
