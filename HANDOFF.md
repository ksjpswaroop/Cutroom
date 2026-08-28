# Maintainer Handoff

Read `README.md` first. It describes the current product, local-first access model, exact input limits, and verification commands.

## Current product map

- `client/src/pages/research.tsx`: continuous Research workspace containing overview, analytics, all returned videos, snapshot-bound AI Insights, and automatically generated grounded Ideas.
- `client/src/pages/script.tsx`: selected-Idea handoff, full script generation, editing, and grounded section or paragraph regeneration.
- `client/src/pages/thumbnail.tsx`: Thumbnail Creator with critique/variation matrix and download state.
- `client/src/pages/package.tsx`: publish package composer, title/hook lab, production brief, export pack.
- `client/src/pages/settings.tsx`: local provider status, replacement keys, and model selection.
- `client/src/lib/workflow-context.tsx`: Research → Script → Thumbnail → Package continuity.
- `server/youtube.ts`: YouTube search, enrichment, provenance, partial-stage warnings, and deterministic snapshot identity.
- `server/gemini.ts`: Gemini text/image operations plus package/brief/critique generators.
- `server/routes.ts`: API surface and in-memory rate limiting.
- `server/settings.ts` + `server/env-path.ts`: local-only Settings policy and app-data-aware `.env` writes.
- `src-tauri/`: Tauri 2 shell with Node sidecar on loopback.
- `shared/schema.ts` and `shared/evidence-contracts.ts`: public request, response, and evidence contracts.

Planned v3 (do not implement until throughline ships): production board contracts and `{project}/brief/` artifacts. See [docs/V3_ROADMAP.md](docs/V3_ROADMAP.md) and [docs/V3_FEATURES.md](docs/V3_FEATURES.md). Do not vendor ViMax or add video-generator keys.

## Standing boundaries

- Preserve the snapshot and evidence contracts through Research, Ideas, Script, and Package (and Board once v3 ships).
- Never return API keys to the browser or log request or response bodies.
- Keep Settings local-only unless a separately authenticated remote secret-management design is implemented.
- The retired login, initial password, Thumbnail unlock, Pro Script Studio, legacy Replit AI proxy, and database/session stack are not part of this product.
- Do not make live provider calls during automated verification.

## Verification

```bash
npm test
npm run check
npm run build
```

For desktop builds:

```bash
npm run tauri:build
```

Or run the full desktop CI script:

```bash
./script/desktop-ci.sh
```

Paid-provider behavior still needs an explicit live-key acceptance pass. Keep that distinct from contract tests and production build success. See `docs/DESKTOP.md` for the live-key acceptance checklist (L-202, L-203, L-208).
