#!/usr/bin/env bash
# Sign + notarize Cutroom macOS artifacts.
# Requires either:
#   APPLE_PASSWORD (app-specific) — APPLE_ID defaults to iamk.swaroop@icloud.com
# or:
#   APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH
# or a stored notarytool profile:
#   NOTARY_PROFILE=cutroom (created via `xcrun notarytool store-credentials`)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/Cutroom.app"
DMG="$ROOT/src-tauri/target/release/bundle/dmg/Cutroom_${CUTROOM_VERSION:-2.0.0}_aarch64.dmg"
IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: SURYA JAGANNATHA PHANI,SWAROOP,MA KALLAKURI (97ZA7QV77G)}"
TEAM_ID="${APPLE_TEAM_ID:-97ZA7QV77G}"
APPLE_ID="${APPLE_ID:-iamk.swaroop@icloud.com}"
PROFILE="${NOTARY_PROFILE:-}"
SKIP_REBUILD="${CUTROOM_NOTARIZE_SKIP_REBUILD:-0}"

export APPLE_SIGNING_IDENTITY="$IDENTITY"
export APPLE_TEAM_ID="$TEAM_ID"
export APPLE_ID

# Optional interactive prompt when running on a local Mac without env password.
if [[ -z "${APPLE_PASSWORD:-}" && -z "$PROFILE" && -z "${APPLE_API_KEY_PATH:-}" && -t 0 ]]; then
  if PASS="$(osascript -e 'display dialog "Paste an Apple app-specific password for Cutroom notarization (" & "'"$APPLE_ID"'" & ")." default answer "" with title "Cutroom notarization" with hidden answer' -e 'text returned of result' 2>/dev/null)"; then
    APPLE_PASSWORD="$PASS"
    export APPLE_PASSWORD
  fi
fi

submit_args=()
if [[ -n "$PROFILE" ]]; then
  submit_args=(--keychain-profile "$PROFILE")
elif [[ -n "${APPLE_API_KEY_PATH:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  submit_args=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
elif [[ -n "${APPLE_PASSWORD:-}" ]]; then
  submit_args=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$TEAM_ID")
else
  cat >&2 <<EOF
Notarization credentials are missing (signing alone is not enough for Gatekeeper).

Apple ID on this Mac: $APPLE_ID
Team ID: $TEAM_ID

Provide one of:
  1) App-specific password (appleid.apple.com → Sign-In and Security → App-Specific Passwords):
       export APPLE_PASSWORD='xxxx-xxxx-xxxx-xxxx'
  2) App Store Connect API key:
       export APPLE_API_KEY='KEY_ID'
       export APPLE_API_ISSUER='ISSUER_UUID'
       export APPLE_API_KEY_PATH='/path/to/AuthKey_XXX.p8'
  3) Stored profile:
       xcrun notarytool store-credentials cutroom --apple-id '$APPLE_ID' --team-id $TEAM_ID --password '...'
       export NOTARY_PROFILE=cutroom

Then re-run: npm run desktop:notarize
EOF
  exit 2
fi

if [[ "$SKIP_REBUILD" != "1" ]]; then
  echo "==> Building signed Cutroom.app / DMG"
  cd "$ROOT"
  npm run desktop:build:macos
else
  echo "==> Skipping rebuild (CUTROOM_NOTARIZE_SKIP_REBUILD=1); using existing $APP"
fi

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
