# Cutroom Pro — M0

**Branch:** `cutroom-pro-m0` (local only — not pushed, no PR)
**Base:** `ksjpswaroop/Cutroom` HEAD `26e842a` · **Version unchanged:** 2.0.0
**Date:** 2026-11-18

M0 is the Pro skeleton from the
[Cutroom Pro plan](../../your_files/Cutroom-Pro-Rebrand-Rebuild-Plan-2026-11-17.md):
a local Pro toggle (default Off), the FilmCraft web build vendored as the
Edit tab, OTIO export from the Board, and a command registry v1 that the
Pro actions go through. No payment, no account, no cloud code. Nothing in
`business/` was touched.

## What was built

### 1. Pro tier toggle (default Off)
- `server/preferences.ts` — new `cutroomProEnabled` boolean, default
  `false`, in the same `preferences.json` persistence as the other local
  toggles (assemble preview, storyboard stills, …). Fresh settings state
  reads Off.
- `client/src/pages/settings.tsx` — "Cutroom Pro" card in the Library tab
  (`button-toggle-cutroom-pro`). Flipping it dispatches `pro.set-enabled`
  through the client command registry; the server re-dispatches it through
  the server registry, so the flip is validated and audit-logged on both
  sides.
- When Off: the sidebar Edit item shows a "Pro" badge and opens the Edit
  page, which explains Pro is off and links to Settings; the Board's OTIO
  button is disabled with a note that it is a Pro feature. When On: Edit
  appears normally and OTIO export is enabled.

### 2. Edit tab — FilmCraft v0.20.1, vendored unmodified
- `client/public/filmcraft-web/` — the unmodified contents of
  `filmcraft-web-0.20.1.zip` from
  https://github.com/storytold/filmcraft/releases/tag/v0.20.1
  (published 2026-11-12). Zip: 15,630,847 bytes, SHA-256
  `1cf3072e3f3b6535fcd024d6f6ab2a16cf7776345d868037dc630de0ad0dbbb8`
  (verified against the release page on download). Extracted: ~49 MB.
- FilmCraft's own UI, name, and ArtCraft marks are left exactly as shipped.
  The build already ships `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, and
  `README.md`; `ATTRIBUTION.md` (not in the zip) was fetched from the
  `v0.20.1` tag and added alongside. `CUTROOM-PRO-NOTE.md` records the
  pinned version, checksum, source, and licence. **Do not edit files in
  this directory** — upgrade by replacing it with a newer release zip and
  updating the pinned version here and on the Edit page.
- Licence: dual MIT *or* Apache-2.0. The ArtCraft marks are trademarks, not
  covered by that licence; they are untouched here because this is the
  unmodified upstream build, not a fork. Do not present FilmCraft as
  Cutroom's own work.
- `client/src/pages/edit.tsx` (`/edit`) — header states "FilmCraft
  v0.20.1 by the ArtCraft team, used under MIT/Apache-2.0", links to the
  repo and to the vendored NOTICE / Attribution / MIT / Apache-2.0 files,
  and frames `/filmcraft-web/index.html` in a same-origin iframe
  (`sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"`,
  per FilmCraft's HOSTING.md). When Pro is off it shows the Pro-off note
  instead of the iframe.
- `server/index.ts` — the production CSP now has a scoped variant for
  `/filmcraft-web/*` only: FilmCraft's page uses inline `<script>`/`<style>`
  and WASM needs `wasm-unsafe-eval`, so the app-wide CSP would block it.
  The scoped policy also sets `frame-ancestors 'self'` (the app-wide
  policy is `'none'`) so Cutroom's own Edit tab can frame it. The rest of
  Cutroom keeps the strict policy. In dev (Vite) no CSP is set, so the
  iframe loads without the override.

### 3. OTIO export from the Board
- `shared/otio.ts` — `buildOtioTimeline(board, { fps?, mediaByShotIndex? })`
  produces an OpenTimelineIO 1.0 `Timeline.1`: one video track `V1`, clips
  in Board (shot) order, 24 fps default, durations from
  `durationHintSec` (8 s default when absent), clip names + metadata
  carrying the Board node id, throughline section, camera, evidence class,
  claim ids, and snapshotId. The Board schema carries no media paths, so a
  shot with no supplied media becomes a placeholder clip
  (`MissingReference`) with its shot name — **no file path is invented**.
  Callers that do have media pass `mediaByShotIndex` and get an
  `ExternalReference` with exactly that URL. The result also reports
  `placeholders`, `durationSeconds`, and `fps`.
- `server/pro-commands.ts` + `server/routes.ts` — `POST /api/board/otio`
  (local-only) dispatches `pro.export-otio` through the server registry,
  which enforces the Pro gate (403 with a plain message when Pro is off)
  and validates the Board with `productionBoardOutputSchema`. Response:
  `{ success, timeline, placeholders, durationSeconds, fps, filename }`
  where the filename is `cutroom-board-<snapshotId>.otio.json`.
- `client/src/pages/board.tsx` — "Export OTIO" button
  (`button-export-otio`) dispatches `pro.export-otio` through the client
  registry and downloads the `.otio.json`. Disabled with a Pro note when
  Pro is off; the toast names the placeholder count.

### 4. Command registry v1
- `shared/commands.ts` — `createCommandRegistry()`:
  `register(id, { description, paramsSchema, enabled?, handler })`,
  `dispatch(id, params)` (validates params with Zod, checks `enabled`,
  runs the handler), `has` / `ids`, and `auditLog()` — an append-only,
  in-memory log (seq, command, JSON-safe params, ISO timestamp, ok,
  error). No I/O; callers supply handlers.
- Server registry (`server/pro-commands.ts`): `pro.set-enabled`,
  `pro.export-otio`, `pro.open-edit`. `GET /api/pro/audit` (local-only)
  returns the server audit log. The log resets when the server restarts —
  M0 does not persist it.
- Client registry (`client/src/lib/pro-commands.ts`):
  `createProClientRegistry(navigate, isProEnabled?)` with the same three
  commands; handlers call the server endpoints / navigate. `useProEnabled()`
  reads the toggle from `/api/settings/status`.

## Where files live

| Area | Files |
|---|---|
| Pro toggle | `server/preferences.ts`, `server/preferences.test.ts`, `client/src/pages/settings.tsx` |
| Edit tab | `client/public/filmcraft-web/` (vendored), `client/src/pages/edit.tsx`, `client/src/App.tsx` (`/edit`), `client/src/components/app-sidebar.tsx` (Edit item), `server/index.ts` (scoped CSP) |
| OTIO | `shared/otio.ts`, `shared/otio.test.ts`, `server/pro-commands.ts`, `server/routes.ts` (`POST /api/board/otio`, `GET /api/pro/audit`), `client/src/pages/board.tsx` |
| Registry | `shared/commands.ts`, `shared/commands.test.ts`, `client/src/lib/pro-commands.ts` |
| Docs | `docs/CUTROOM_PRO_M0.md` (this file), `TRACKER.md` Phase 11 entry |

## How to run / verify

```sh
npm ci            # if node_modules is missing
npm run check     # tsc — must pass
npm test          # 314 tests, 0 fail (baseline was 299; M0 adds 15)
npm run build     # vite + server bundle; dist/public/filmcraft-web/ must exist
npm run dev       # then open http://127.0.0.1:5000
```

Manual checks (all local, no keys, no live calls):
1. Fresh settings: `GET /api/settings/status` → `preferences.cutroomProEnabled`
   is `false`; the sidebar Edit item shows a "Pro" badge and `/edit` shows
   the Pro-off note.
2. Settings → Cutroom Pro → On. `GET /api/pro/audit` shows the
   `pro.set-enabled` dispatch. The Edit tab now frames FilmCraft.
3. On the Board, generate a board, then Export OTIO: a
   `cutroom-board-<snapshotId>.otio.json` downloads; it is a `Timeline.1`
   with one `V1` track, clips in shot order, and `MissingReference` for
   every shot without media.
4. With Pro off, `POST /api/board/otio` returns 403 "Cutroom Pro is off…".

## Known limits — read before trusting M0

- **The FilmCraft web build was verified as static files only, not as a
  live browser render.** The zip's SHA-256 matches the release, it
  extracts cleanly, `index.html` + `filmcraft_web.js` +
  `filmcraft_web_bg.wasm` (48 MB) are present, and the production build
  copies the vendored directory into `dist/public/filmcraft-web/`. No
  browser was available in this VM to watch the editor actually start
  (WebGPU/WebGL2 in a real browser is the remaining check — run it on a
  Mac/Windows machine and confirm the loading screen clears).
- **No project is handed to FilmCraft yet.** The Edit tab opens the stock
  editor; wiring a Board/OTIO into it is M1 (assembler). Saves/exports
  inside FilmCraft download in the browser, as upstream intends.
- **FilmCraft is alpha** (its own estimate: ~56% ready for real work).
  Pinned at v0.20.1; never make it the only path to a deliverable.
  Codec patents (H.264/HEVC) still need a lawyer's note before any
  commercial product encodes with its codecs.
- **"Cutroom Pro" is not trademark-cleared.** It is a tier name in-app
  only; do not use it in a public listing, domain, or store until
  clearance is done.
- **Audit log is in-memory** on both sides and resets on restart.
- The vendored build adds ~49 MB to the repo and to every desktop build.
  If that becomes a problem, the fallback is to download it at install
  time instead of vendoring — that is a distribution decision, not an M0
  change.
