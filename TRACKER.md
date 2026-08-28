# Cutroom Tracker

Status values: `todo` | `doing` | `done` | `blocked` | `cancelled`

Update this file when work starts or finishes. See [ROADMAP.md](ROADMAP.md) for architecture.

**Next version:** [v0.2 Cutroom](#phase-6--cutroom-v02) (`L-601+`). Version map: [docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md).

---

## Phase 0 — Foundation & rebrand

| ID | Status | Item |
| --- | --- | --- |
| L-001 | done | Create `ROADMAP.md` + `TRACKER.md` with all IDs |
| L-002 | done | Rebrand strings/assets/package name → `ledger` / `Cutroom` |
| L-003 | done | Migrate storage keys (IndexedDB / localStorage) with one-time rename |
| L-004 | done | Confirm `npm test` / `check` / `build` green post-rebrand |
| L-005 | done | Document Node 20.19+, keys, loopback-only policy under Cutroom |

## Phase 1 — Tauri shell MVP

| ID | Status | Item |
| --- | --- | --- |
| L-101 | done | Scaffold Tauri 2 (`src-tauri`, icons, bundle id `app.cutroom.desktop`) |
| L-102 | done | Sidecar launcher: free port, spawn Node, health-wait `/api/settings/status` |
| L-103 | done | WebView loads `http://127.0.0.1:{port}` only |
| L-104 | done | Quit / crash: terminate sidecar; single-instance |
| L-105 | done | App-data `.env` path when `LEDGER_APP_DATA` / Tauri env set |
| L-106 | done | Scripts: `tauri:dev`, `tauri:build`; keep web `dev` for CI |
| L-107 | done | Desktop smoke paths wired (Research, Settings, Script, Thumbnail, Package) |

## Phase 2 — Production desktop

| ID | Status | Item |
| --- | --- | --- |
| L-201 | done | Bundle config + Node sidecar production spawn path documented |
| L-202 | done | macOS sign/notarize/DMG targets documented in `docs/DESKTOP.md` |
| L-203 | done | Tauri updater plugin stub + release endpoint placeholders |
| L-204 | done | First-run onboarding banner when keys missing |
| L-205 | done | App-data secrets path live; keychain migration documented as next hardening |
| L-206 | done | Windows + Linux package targets in `tauri.conf.json` |
| L-207 | done | Desktop CI script + cargo-check job in GitHub Actions |
| L-208 | done | Live-key acceptance checklist in `docs/DESKTOP.md` |

## Phase 3 — Dream product v2

### Ship first (public API / local only)

| ID | Status | Item |
| --- | --- | --- |
| L-301 | done | Publish package composer (5th workflow step) |
| L-302 | done | Title & hook variant lab |
| L-303 | done | Production brief from script |
| L-304 | done | Thumbnail critique + variation matrix |
| L-305 | done | One-click project export pack |

### Deepen research (quota-aware)

| ID | Status | Item |
| --- | --- | --- |
| L-306 | done | Caption/transcript-grounded Insights/Ideas — **v0.2: L-608** |
| L-307 | done | Public comment question mine — **v0.2: L-609** |

### Desktop-native polish

| ID | Status | Item |
| --- | --- | --- |
| L-308 | done | Brand kit + style memory (`brand-kit.json`; Settings UI; prompts for thumbnail/package) |
| L-309 | done | Teleprompter desktop mode (Tauri fullscreen + always-on-top; mirror flip) |
| L-310 | done | Post-publish measurement checklist (in publish package) |

### Later / optional

| ID | Status | Item |
| --- | --- | --- |
| L-311 | done | Competitor/series workspace — channel-first Research (`channelId` on search; L-618) |
| L-312 | done | Content calendar / batch pipeline (`/calendar` + local JSON store) |
| L-313 | done | Shorts/clip briefs from long script (inferred planning cards; L-505) |
| L-314 | done | Optional YouTube OAuth Studio mirror (status + labeled stubs; metrics null until refresh token) |

## Phase 4 — Strategy follow-through (v1.1 → v1.2)

Product strategy baseline: [docs/STRATEGY.md](docs/STRATEGY.md), [docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md).

| ID | Status | Item |
| --- | --- | --- |
| L-401 | done | Competitive research + moat docs (`docs/STRATEGY.md`, `FEATURES.md`) |
| L-402 | done | Investor + user pitch docs (`INVESTOR_BRIEF.md`, `USER_STORY.md`) |
| L-403 | done | Multi-provider / OSS model plan (`docs/MODELS.md`) |
| L-404 | done | Hermes backend decision (`docs/HERMES_DECISION.md`) — **do not replace Express** |
| L-405 | done | Version progression plan (`docs/RELEASE_PLAN.md`) + roadmap link-up |
| L-406 | done | Extract `server/ai` provider interface (Gemini adapter only) |
| L-407 | done | OpenAI-compatible + Ollama + OpenRouter Settings wiring |
| L-408 | done | Local image provider spike (Ollama FLUX.2 Klein / Z-Image via OpenAI-compatible `/images/generations`; `CUTROOM_IMAGE_PROVIDER`) |
| L-409 | done | OS keychain secrets migration (from app-data `.env`; macOS `security`, models stay in `.env`) |
| L-410 | todo | macOS notarization complete + Gatekeeper green (needs Apple notary creds) |
| L-411 | done | Windows binary smoke — `cutroom-windows-x86_64.exe` cross-built via cargo-xwin; on GitHub Release v2.0.0 (unsigned; NSIS/MSI need Windows host/CI) |
| L-412 | done | Linux AppImage/deb smoke — `cutroom_2.0.0_arm64.deb` + `cutroom-linux-aarch64` on GitHub Release v2.0.0 |
| L-413 | todo | Caption-grounded Insights with cheap/local models (after L-608 YouTube-captions path) |
| L-414 | todo | Comment mine follow-up if L-609 needs local/cheap-model fallback |
| L-415 | cancelled | Replace Node sidecar with Hermes — rejected; see L-404 |

## Phase 5 — Next major themes (v1.3 → v2.0)

| ID | Status | Item |
| --- | --- | --- |
| L-501 | done | Brand kit + style memory (L-308) |
| L-502 | done | Teleprompter desktop mode (L-309) |
| L-503 | done | Competitor/series workspace (L-311) — channel-first Research |
| L-504 | done | Content calendar / batch (L-312) |
| L-505 | done | Shorts/clip briefs (L-313) — inferred section→clip cards; no renderer |
| L-506 | done | Optional Studio OAuth mirror with strict labeling (L-314) |
| L-507 | done | Auto-updater endpoint live (GitHub `latest.json` + Settings check) |
| L-508 | todo | Optional Hermes *companion* experiment (cron digest only; off by default) |

## Phase 6 — Cutroom v0.2

Theme: Cutroom identity, inspectable script throughline, caption/comment-grounded Research, honest packaging, optional **assemble-only** preview after Package.

Workflow after this phase:

```
Research (+ captions, comments, quota)
  → Insights / Ideas (transcript + comment grounded)
  → Script + Throughline graph / mind map
  → Thumbnail
  → Package (observed tags, pace chapters)
  → Preview render (optional, assemble)
```

Keep **Evidence ledger** as the Insights feature name. Do not add a fifth research-style sidebar item for the graph — it lives on Script Writer.

### P0 — Must ship

#### Identity

| ID | Status | Item |
| --- | --- | --- |
| L-601 | done | Rebrand remaining Cutroom strings/assets/package/bundle/env/export names → `cutroom` / `Cutroom` (Evidence ledger name preserved; legacy IndexedDB/key aliases intentionally kept) |
| L-602 | done | Cutroom app icon: 16:9 frame, vertical splice, right half offset; keep rounded-square blue shell (`client/public/cutroom.svg` + `cutroom-mark.svg`) |
| L-603 | done | Preserve Insights **Evidence ledger** feature name through the rebrand |

#### Script throughline

| ID | Status | Item |
| --- | --- | --- |
| L-604 | done | Throughline DAG on `/script` after generate: Promise → sections → claims → source videos (IDs only; no invented nodes) |
| L-605 | done | Radial mind map of the **same** nodes as L-604 (layout only, not a second model) |
| L-606 | done | Checks: disconnected nodes; unused idea claims; orphan body sections; `requires_studio` spoken as fact |
| L-607 | done | Rebuild graph after edit/regeneration; pass / warn / fail before Thumbnail |

#### Research depth

| ID | Status | Item |
| --- | --- | --- |
| L-608 | done | Caption-grounded Insights/Ideas via YouTube `captions.list` (same YouTube key; public captions only). Implements L-306. Research UI: Ground with captions → `captionExcerpts` |
| L-609 | done | Public comment question mine via `commentThreads.list`. Implements L-307. Research UI: Mine comment questions → `audienceQuestions` |
| L-610 | done | Session YouTube quota meter (`search.list` = 100 units; show remaining/used). Research UI shows used/remaining near search |

#### Packaging honesty

| ID | Status | Item |
| --- | --- | --- |
| L-611 | done | Publish Package: observed vs invented tags/titles (snapshot tags vs Gemini copy) |
| L-612 | done | Pace-accurate chapters from teleprompter WPM × section word counts |

#### Preview video (assemble only)

| ID | Status | Item |
| --- | --- | --- |
| L-613 | done | Optional `/video` step after Package; Settings default **Off**; engine `assemble` only |
| L-614 | done | Assemble preview: title card + thumbnail Ken Burns + narration captions + chapter cards (FFmpeg) |
| L-615 | done | Write `preview.mp4` into the project export pack; no new API key |

### P1 — Same version if time

| ID | Status | Item |
| --- | --- | --- |
| L-616 | todo | Competitor thumbnail inspection: Gemini vision on top N snapshot thumbs; claims labeled inferred |
| L-617 | todo | Script evidence overlay: highlight on-promise / tangent / unsupported sentences (same graph as L-604) |
| L-618 | done | Channel-first Research: `search.list` with `channelId` (thin slice of L-311) |
| L-619 | todo | Export buttons: show Insights… / Ideas… while pipeline runs; stop saying “PDF/XLS/CSV waiting” |
| L-620 | todo | Launch-video Remotion **side project** from `docs/launch-video/` (not an in-app renderer) |

### Non-goals for v0.2

- Timeline editor, CapCut/Descript clone, viral Shorts auto-render farm
- Veo / generative B-roll, talking-head, auto-upload to YouTube
- Replit-style “prompt → full video”
- A mind map that invents topics from free script text
- New Settings keys for OpenAI / Runway / Whisper (transcripts = YouTube captions first)
- Brand kit (`L-308` / `L-501`), teleprompter desktop (`L-309` / `L-502`), calendar (`L-312`), Studio OAuth (`L-314`)
- Ollama / OpenRouter / local FLUX (`L-406`–`L-408`) — stays on the 1.2/1.3 train

---

## Phase 7 — Production board v3

Theme: ViMax-inspired **planning** (characters, storyboard, shots, camera tree) after Package. No renderer, no video-generator keys.

Docs: [docs/V3_ROADMAP.md](docs/V3_ROADMAP.md) · [docs/V3_FEATURES.md](docs/V3_FEATURES.md). Version: **3.0** ([docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md)).

Depends on v0.2 throughline (`L-604`–`L-607`). P0 schema work may land as a 1.x minor; 3.0 exit is P1 Board UI.

Workflow after this phase:

```
Research → Insights / Ideas → Script + Throughline → Thumbnail
  → Package → Board (characters, storyboard, shots, camera tree)
  → Preview (assemble only)
```

Board is not a Research sidebar item.

### Decision

| ID | Status | Item |
| --- | --- | --- |
| L-701 | done | Write v3 roadmap + feature inventory (`docs/V3_ROADMAP.md`, `docs/V3_FEATURES.md`) |
| L-702 | done | ViMax decision: borrow planning schemas; do not vendor Python/runtime/Veo |

### P0 — Contracts (may ship in 1.x)

| ID | Status | Item |
| --- | --- | --- |
| L-703 | todo | Extend production brief schema: `characters[]`, `storyboardPanels[]`, `camera` on shots |
| L-704 | todo | Each panel/shot cites `evidenceClaimIds` or explicit `inferred` + limitations; copy active `snapshotId` |
| L-705 | todo | Rebuild board/brief JSON after script edit or regeneration (same rule as L-607) |
| L-706 | todo | Persist `{project}/brief/{characters,storyboard,shots,camera-tree}.json` in the library folder |
| L-707 | todo | Contract tests for board schema (stale snapshot, unknown claims, camera-tree vs shots); no live providers |
| L-708 | todo | Confirmation gate: board generate only after selected idea + script + matching snapshot |

### P1 — Board surface (3.0 exit)

| ID | Status | Item |
| --- | --- | --- |
| L-709 | todo | Board view after Package (tab or `/board`): scan-first storyboard strip |
| L-710 | todo | Camera tree filter: `a-cam` \| `b-roll` \| `screen` \| `insert` (derived from shots, not a second model) |
| L-711 | todo | Continuity rail from characters (wardrobe, recurring props, who is on camera) |
| L-712 | todo | Board nodes must be a subset of throughline (L-604); no invented topics |
| L-713 | todo | Checks: orphan shots; shots without claims; `requires_studio` as on-screen fact; pass / warn / fail before Preview |

### P2 — Duration, clips, optional stills (3.0 if time, else 3.1)

| ID | Status | Item |
| --- | --- | --- |
| L-714 | todo | Shot `durationHintSec` from teleprompter WPM × section words (L-612); label inferred if model-guessed |
| L-715 | todo | Group shots into Shorts/clip briefs (implements a slice of L-313 / L-505) |
| L-716 | todo | Optional storyboard stills via existing Gemini image model; Settings default **Off**; `evidenceClass: inferred` |
| L-717 | todo | Best-of-k stills using thumbnail critique pattern (L-304); do not port ViMax selector Python |

### P3 — Companion export (optional, 3.1 ok)

| ID | Status | Item |
| --- | --- | --- |
| L-718 | todo | Export pack includes `script.txt` + `brief/` JSON; optional ViMax-shaped `script2video/` tree behind a flag |
| L-719 | todo | Document external Script2Video handoff; no video API keys in Cutroom Settings |
| L-720 | todo | Companion flag default **Off** (same rule as L-508 Hermes); never product truth |

### Non-goals for v3

- Vendor `HKUDS/ViMax`, `agent_runtime`, Idea2Video, Novel2Video
- Veo / Runway / Kling / generative B-roll or talking-head
- Timeline editor, Shorts auto-render farm, auto-upload
- New Settings keys for video generators
- Replacing Express with a Python agent sidecar
