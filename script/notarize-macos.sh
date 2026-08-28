#!/usr/bin/env bash
# Sign + notarize Cutroom macOS artifacts.
# Requires either:
#   APPLE_ID + APPLE_PASSWORD (app-specific) + APPLE_TEAM_ID
# or:
#   APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH
# or a stored notarytool profile:
#   NOTARY_PROFILE=cutroom (created via `xcrun notarytool store-credentials`)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/Cutroom.app"
DMG="$ROOT/src-tauri/target/release/bundle/dmg/Cutroom_0.1.0_aarch64.dmg"
IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: SURYA JAGANNATHA PHANI,SWAROOP,MA KALLAKURI (97ZA7QV77G)}"
TEAM_ID="${APPLE_TEAM_ID:-97ZA7QV77G}"
PROFILE="${NOTARY_PROFILE:-}"

export APPLE_SIGNING_IDENTITY="$IDENTITY"
export APPLE_TEAM_ID="$TEAM_ID"

submit_args=()
if [[ -n "$PROFILE" ]]; then
  submit_args=(--keychain-profile "$PROFILE")
elif [[ -n "${APPLE_API_KEY_PATH:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  submit_args=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" ]]; then
  submit_args=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$TEAM_ID")
else
  cat >&2 <<'EOF'
Notarization credentials are missing (signing alone is not enough for Gatekeeper).

Provide one of:
  1) App-specific password:
       export APPLE_ID='you@example.com'
       export APPLE_PASSWORD='xxxx-xxxx-xxxx-xxxx'   # appleid.apple.com → App-Specific Passwords
       export APPLE_TEAM_ID='97ZA7QV77G'
  2) App Store Connect API key:
       export APPLE_API_KEY='KEY_ID'
       export APPLE_API_ISSUER='ISSUER_UUID'
       export APPLE_API_KEY_PATH='/path/to/AuthKey_XXX.p8'
  3) Stored profile:
       xcrun notarytool store-credentials ledger --apple-id '...' --team-id 97ZA7QV77G --password '...'
       export NOTARY_PROFILE=ledger

Then re-run: npm run desktop:notarize
EOF
  exit 2
fi

echo "==> Building signed Cutroom.app / DMG"
cd "$ROOT"
npm run desktop:build:macos

if [[ ! -d "$APP" ]]; then
  echo "Missing $APP" >&2
  exit 1
fi

ZIP="$ROOT/src-tauri/target/release/bundle/macos/Cutroom.zip"
echo "==> Zipping app for notarization"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

echo "==> Submitting to Apple notary service"
xcrun notarytool submit "$ZIP" --wait "${submit_args[@]}"

echo "==> Stapling ticket to app"
xcrun stapler staple "$APP"

echo "==> Rebuilding DMG from stapled app and stapling DMG"
bash "$ROOT/script/package-macos-dmg.sh"
xcrun stapler staple "$DMG"

echo "==> Gatekeeper assessment"
spctl -a -vv "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
xcrun stapler validate "$APP"
xcrun stapler validate "$DMG"
echo "Notarization complete."
