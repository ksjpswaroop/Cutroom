#!/usr/bin/env bash
# Create a signed UDZO DMG for Cutroom without create-dmg AppleScript
# (avoids stuck rw.*.dmg mounts under low disk / modern macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${CUTROOM_VERSION:-2.0.0}"
APP="$ROOT/src-tauri/target/release/bundle/macos/Cutroom.app"
OUT_DIR="$ROOT/src-tauri/target/release/bundle/dmg"
DMG_OUT="$OUT_DIR/Cutroom_${VERSION}_aarch64.dmg"
IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: SURYA JAGANNATHA PHANI,SWAROOP,MA KALLAKURI (97ZA7QV77G)}"

if [[ ! -d "$APP" ]]; then
  echo "Missing $APP — run npm run desktop:build:macos first (app bundle)." >&2
  exit 1
fi

# Detach leftover create-dmg scratch images
for v in /Volumes/dmg.*; do
  [[ -e "$v" ]] && hdiutil detach "$v" -force >/dev/null 2>&1 || true
done
rm -f "$ROOT"/src-tauri/target/release/bundle/macos/rw.*.dmg

mkdir -p "$OUT_DIR"
STAGE="$(mktemp -d /tmp/cutroom-dmg-XXXX)"
cleanup() { rm -rf "$STAGE"; rm -f "$OUT_DIR/Cutroom_${VERSION}_aarch64.rw.dmg"; }
trap cleanup EXIT

cp -R "$APP" "$STAGE/Cutroom.app"
ln -sf /Applications "$STAGE/Applications"

DMG_RW="$OUT_DIR/Cutroom_${VERSION}_aarch64.rw.dmg"
rm -f "$DMG_RW" "$DMG_OUT"
hdiutil create -volname "Cutroom" -srcfolder "$STAGE" -ov -format UDRW "$DMG_RW"
hdiutil convert "$DMG_RW" -format UDZO -imagekey zlib-level=9 -o "$DMG_OUT"
codesign --force --timestamp --sign "$IDENTITY" "$DMG_OUT"
codesign --verify --verbose=2 "$DMG_OUT"
echo "Signed DMG: $DMG_OUT"
