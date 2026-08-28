#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export APPIMAGE_EXTRACT_AND_RUN=1
apt-get update
apt-get install -y curl build-essential pkg-config libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf libssl-dev file desktop-file-utils
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
cd /work
npm ci
npm run desktop:prepare
export TAURI_SIGNING_PRIVATE_KEY="$(cat /keys/updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-cutroom-v2-updater}"
# deb first (no FUSE); AppImage with extract-and-run for Docker
npx tauri build --bundles deb
npx tauri build --bundles appimage
