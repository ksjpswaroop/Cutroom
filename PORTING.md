# Porting Guide

The app is local-first and has no runtime database or authentication layer. For the current workflow and setup, read `README.md`.

## Portable boundaries

- Research backend: `server/youtube.ts`, `server/provider-errors.ts`, and the Research schemas in `shared/schema.ts`.
- Evidence and AI backend: `server/gemini.ts`, `shared/evidence-contracts.ts`, and `server/script-regeneration-contract.ts`.
- Thumbnail backend: `server/thumbnail-contract.ts`, `server/gemini-models.ts`, and the Thumbnail routes in `server/routes.ts`.
- Client workflow: the Research, Script, Thumbnail, Package, and Settings pages plus `client/src/lib/workflow-context.tsx`.

The browser expects same-origin `/api` routes. The UI uses Wouter, TanStack Query, shadcn/ui primitives, and the design tokens in `client/src/index.css`.

## Security requirements when porting

- Keep Google credentials on the server.
- Preserve strict Zod validation and snapshot identity checks.
- Replace the in-memory limiter with a shared limiter before running multiple instances.
- Local Settings intentionally rejects normal proxy-forwarded requests. Disable it or place it behind separate authenticated administration if the application becomes remote.
- Add authentication before exposing billable provider routes to untrusted users.
- Keep the global body limit large enough for the documented 12 MB decoded thumbnail-reference total, but do not restore an unbounded or 50 MB default.

## Routes

- `GET /api/youtube/search`
- `GET /api/youtube/quota`
- `GET /api/settings/status`
- `PUT /api/settings/api-keys`
- `POST /api/research/insights`
- `POST /api/research/captions`
- `POST /api/research/comment-questions`
- `POST /api/ideas/generate`
- `POST /api/script/generate`
- `POST /api/script/regenerate-titles`
- `POST /api/script/regenerate-section`
- `POST /api/script/regenerate-paragraph`
- `POST /api/script/extract-narration`
- `POST /api/thumbnail/generate`
- `POST /api/thumbnail/suggestions`
- `POST /api/thumbnail/critique`
- `POST /api/package/generate`
- `POST /api/package/production-brief`

The retired login, password unlock, Pro Script Studio, Replit-managed video generation, and database/session routes must not be reintroduced as accidental compatibility code.

## Tauri sidecar architecture

The Tauri 2 desktop shell uses a Node sidecar architecture:

1. Rust finds a free TCP port on 127.0.0.1 at startup
2. Environment variables `PORT`, `HOST`, `LEDGER_APP_DATA`, and `NODE_ENV` are set
3. The Node server is spawned:
   - Development: `tsx server/index.ts` from project root
   - Production: `node dist/index.cjs` from bundled resources
4. Rust polls `/api/settings/status` until HTTP 200 (60s timeout)
5. The WebView navigates to `http://127.0.0.1:{port}/`
6. On window close, the sidecar is terminated

The WebView connects to the loopback server directly, so Settings and all API routes work without modification. `LEDGER_APP_DATA` points secrets at the OS app-data directory. Phase 2 moves primary secret storage to the OS keychain (`L-205`).

Desktop-specific Tauri commands:
- `cmd_get_app_data_dir`: Returns the platform app data directory path
- `cmd_export_project_pack`: Folder picker + write project pack files (L-305)

See [ROADMAP.md](ROADMAP.md), [TRACKER.md](TRACKER.md), and [docs/DESKTOP.md](docs/DESKTOP.md).
