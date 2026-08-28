# Desktop Application Guide

Cutroom ships as a Tauri 2 desktop application with a Node.js sidecar architecture.

## Architecture

The desktop shell uses Tauri 2 with the following architecture:

1. On startup, Rust finds a free TCP port on 127.0.0.1
2. Environment variables are set:
   - `PORT={port}`
   - `HOST=127.0.0.1`
   - `CUTROOM_APP_DATA={app_data_dir}` (legacy `LEDGER_APP_DATA` still accepted)
   - `NODE_ENV=production` (or `development` in dev mode)
3. The Node sidecar is spawned:
   - Production: `node dist/index.cjs` from bundled resources
   - Development: `tsx server/index.ts` from project root
4. Rust polls `http://127.0.0.1:{port}/api/settings/status` until HTTP 200 (timeout 60s)
5. The WebView navigates to `http://127.0.0.1:{port}/`
6. On window close, the sidecar process is terminated

## Build Commands

```bash
npm run tauri:dev              # Development with hot reload
npm run desktop:prepare        # Bundle Node sidecar into src-tauri/resources
npm run desktop:build:macos    # Signed .app + .dmg (Developer ID)
npm run desktop:notarize       # Sign + notarize + staple (needs Apple creds)
```

## Signing and Notarization

### macOS

This machine already has:

- **Signing identity**: `Developer ID Application: SURYA JAGANNATHA PHANI,SWAROOP,MA KALLAKURI (97ZA7QV77G)`
- **Team ID**: `97ZA7QV77G`
- **Entitlements**: `src-tauri/entitlements.plist` (hardened runtime)

Signed artifacts land at:

- `src-tauri/target/release/bundle/macos/Cutroom.app`
- `src-tauri/target/release/bundle/dmg/Cutroom_2.0.0_aarch64.dmg`

**Notarization still needs one of these credential sets** (not stored in the repo):

```bash
# Option A — Apple ID + app-specific password
export APPLE_ID='you@example.com'
export APPLE_PASSWORD='xxxx-xxxx-xxxx-xxxx'   # appleid.apple.com → App-Specific Passwords
export APPLE_TEAM_ID='97ZA7QV77G'

# Option B — App Store Connect API key (.p8)
export APPLE_API_KEY='KEY_ID'
export APPLE_API_ISSUER='ISSUER_UUID'
export APPLE_API_KEY_PATH='/absolute/path/to/AuthKey_XXX.p8'

# Option C — stored notarytool profile
xcrun notarytool store-credentials ledger \
  --apple-id 'you@example.com' \
  --team-id 97ZA7QV77G \
  --password 'xxxx-xxxx-xxxx-xxxx'
export NOTARY_PROFILE=ledger
```

Then run:

```bash
npm run desktop:notarize
# or: ./script/notarize-macos.sh
```

Verify:

```bash
codesign --verify --deep --strict --verbose=2 \
  src-tauri/target/release/bundle/macos/Cutroom.app
spctl -a -vv src-tauri/target/release/bundle/macos/Cutroom.app
xcrun stapler validate src-tauri/target/release/bundle/macos/Cutroom.app
```

Gatekeeper must report `source=Notarized Developer ID` (not `Unnotarized Developer ID`).

### Windows

1. **Code Signing Certificate**: Obtain from a trusted CA
2. **Environment Variables**:
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="path/to/key.pem"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="password"
   ```
3. **Certificate Thumbprint**: Set in `tauri.conf.json`:
   ```json
   {
     "bundle": {
       "windows": {
         "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
         "timestampUrl": "http://timestamp.digicert.com"
       }
     }
   }
   ```

### Linux

Linux builds (AppImage, deb) do not require signing but may benefit from GPG signing for package repositories.

## Updater Configuration

The updater is currently disabled. To enable:

1. Generate update keys:
   ```bash
   npx @tauri-apps/cli signer generate -w ~/.tauri/cutroom.key
   ```
2. Set the public key in `tauri.conf.json`:
   ```json
   {
     "plugins": {
       "updater": {
         "active": true,
         "pubkey": "YOUR_PUBLIC_KEY"
       }
     }
   }
   ```
3. Set the private key in CI:
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="contents of ~/.tauri/cutroom.key"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"
   ```
4. Deploy update manifests to your update server

## Icon Generation

Replace placeholder icons with proper assets:

```bash
npx @tauri-apps/cli icon client/public/cutroom.svg
```

This generates all required icon sizes in `src-tauri/icons/`. Use `cutroom-mark.svg` for favicon/sidebar (two-bar splice).

## Secret storage

Today (L-409):
- **Desktop (CUTROOM_APP_DATA set, macOS):** YouTube / Gemini / OpenRouter / OpenAI secrets live in the OS keychain (`security` generic passwords, service `app.cutroom.desktop`). Non-secret settings (models, provider id, base URLs) stay in app-data `.env` mode `0600`.
- On first Settings save (or sidecar start), plaintext secret lines are migrated out of `.env` into the keychain.
- **Web `npm run dev`:** still uses project-root `.env` unless `CUTROOM_USE_KEYCHAIN=1` (or `CUTROOM_SECRETS_BACKEND=keychain`).
- Force `.env` only with `CUTROOM_SECRETS_BACKEND=env`.
- Settings status returns `secretsBackend: "keychain" | "env"` booleans only — never secret material.

## Live-Key Acceptance Checklist

Before release, verify these items with real API keys:

### L-202: YouTube Data API v3
- [ ] Research search returns expected results
- [ ] Video enrichment includes all metadata fields
- [ ] Rate limiting works correctly
- [ ] Error handling for quota exceeded
- [ ] Invalid key returns appropriate error

### L-203: Gemini API
- [ ] Text generation (Insights, Ideas, Script) works
- [ ] Image generation (Thumbnails) works
- [ ] Model selection respects server allowlist
- [ ] Rate limiting handles burst requests
- [ ] Invalid key returns appropriate error

### L-208: Settings Persistence
- [ ] API keys save to app data directory
- [ ] Keys persist across app restarts
- [ ] Keys are never returned to the browser
- [ ] Settings page shows correct status
- [ ] Model changes take effect immediately

## Bundle Targets

| Platform | Formats |
| --- | --- |
| macOS | `.app`, `.dmg` |
| Windows | `.exe` (NSIS), `.msi` |
| Linux | `.AppImage`, `.deb` |

## Troubleshooting

### Sidecar fails to start
- Check that `npm install` has been run
- Verify Node.js is in PATH
- Check console output for specific errors

### Server timeout
- Increase timeout in `src-tauri/src/lib.rs` if needed
- Check for port conflicts
- Verify the server starts correctly standalone

### Window shows blank/error
- Check DevTools for JavaScript errors
- Verify the sidecar URL is correct
- Check CSP settings if resources fail to load
