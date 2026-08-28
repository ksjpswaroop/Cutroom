#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

has_creds() {
  if [[ -n "${NOTARY_PROFILE:-}" ]]; then return 0; fi
  if [[ -n "${APPLE_API_KEY_PATH:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" && -f "${APPLE_API_KEY_PATH}" ]]; then return 0; fi
  # App-specific passwords are 16 chars, often written as xxxx-xxxx-xxxx-xxxx
  if [[ -n "${APPLE_PASSWORD:-}" && "${APPLE_PASSWORD}" == *-*-*-* && ${#APPLE_PASSWORD} -ge 19 ]]; then return 0; fi
  return 1
}

echo "Waiting for notarization credentials in .notary.env …"
echo "Need an app-specific password (xxxx-xxxx-xxxx-xxxx) from appleid.apple.com"

for i in $(seq 1 120); do
  if [[ -f .notary.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .notary.env
    set +a
  fi
  if has_creds; then
    echo "Credentials look valid — notarizing."
    export CUTROOM_NOTARIZE_SKIP_REBUILD=1
    export APPLE_ID="${APPLE_ID:-iamk.swaroop@icloud.com}"
    export APPLE_TEAM_ID="${APPLE_TEAM_ID:-97ZA7QV77G}"
    mkdir -p src-tauri/target/release/bundle/dmg
    [[ -f dist-release/Cutroom_2.0.0_aarch64.dmg ]] && \
      cp -f dist-release/Cutroom_2.0.0_aarch64.dmg src-tauri/target/release/bundle/dmg/Cutroom_2.0.0_aarch64.dmg
    exec bash "$ROOT/script/notarize-macos.sh"
  fi
  sleep 5
done
echo "Timed out — no app-specific password / API key / NOTARY_PROFILE yet." >&2
exit 2
