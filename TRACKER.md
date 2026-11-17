# Cutroom Tracker

Status values: `todo` | `doing` | `done` | `blocked` | `cancelled`

Update this file when work starts or finishes. See [ROADMAP.md](ROADMAP.md) for architecture.

**Next version:** [v2.1 Creator Suite GA](#phase-9--production-ga-v21) (`L-801+`, `L-901+`). Plan: [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md). Version map: [docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md).
**After GA:** [v2.2 Go-to-market](#phase-10--go-to-market-v22-market-readiness) (`G-001+`) — release blockers, commercial model (Gate 0), samples + testing. Plan: [docs/GTM_ROADMAP.md](docs/GTM_ROADMAP.md).

> Phases 0–7 are the shipped evidence desk + v3 Board (all `done`). The **open
> work** is Phase 8 (creator suite to production depth) and Phase 9 (production
> GA blockers). Those are the only `todo` items below; see
> [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md) for goals, parallel tracks,
> dependencies, and TDD test specs.

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
| L-410 | done | macOS notarization complete + Gatekeeper green (`spctl` Notarized Developer ID; stapled app+DMG) |
| L-411 | done | Windows binary smoke — `cutroom-windows-x86_64.exe` cross-built via cargo-xwin; on GitHub Release v2.0.0 (unsigned; NSIS/MSI need Windows host/CI) |
| L-412 | done | Linux AppImage/deb smoke — `cutroom_2.0.0_arm64.deb` + `cutroom-linux-aarch64` on GitHub Release v2.0.0 |
| L-413 | done | Caption-grounded Insights with cheap/local models: dropped public excerpts are reattached as observed claims, and non-Gemini prompts get a compact caption instruction (`shared/caption-grounding.ts`) |
| L-414 | done | Comment mine follow-up: if a model drops mined public questions, the package keeps the phrasing labeled as an observed comment, not demand (`shared/comment-mine-fallback.ts`) |
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
| L-508 | done | Optional Hermes companion: Monday cron digest only, Settings default Off, never spawns Hermes, not product truth (`server/hermes-companion.ts`, `docs/experiments/hermes-companion.md`) |

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
| L-616 | done | Competitor thumbnail inspection: Gemini vision on the top 5 snapshot thumbs; claims must be inferred (`/api/research/thumbnail-inspection`) |
| L-617 | done | Script evidence overlay: on-promise / tangent / unsupported sentences from the L-604 throughline graph |
| L-618 | done | Channel-first Research: `search.list` with `channelId` (thin slice of L-311) |
| L-619 | done | Export buttons show Insights… / Ideas… while that stage runs, and Download/Building once it is clear |
| L-620 | done | Launch-video Remotion side project in `launch-video/` (shot-list timeline, not an in-app route) |

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

Theme: One Board after Package; user picks **shoot myself**, **slides + voice**, or **cinematic**. No YouTube upload. ViMax = Script2Video blueprint in TypeScript, not a Python sidecar.

Docs: [docs/V3_ROADMAP.md](docs/V3_ROADMAP.md) · [docs/V3_FEATURES.md](docs/V3_FEATURES.md). **3.0** = Board + shoot + slides; **3.1** = cinematic Shorts ([docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md)).

Depends on v0.2 throughline (`L-604`–`L-607`). P0 schema work may land as a 1.x minor.

Workflow after this phase:

```
Research → Insights / Ideas → Script + Throughline → Thumbnail
  → Package → Board
  → Render (shoot | slides | cinematic) → Review (no upload)
```

Board is not a Research sidebar item. Render stays on `/video`.

### Decision

| ID | Status | Item |
| --- | --- | --- |
| L-701 | done | Write v3 roadmap + feature inventory (`docs/V3_ROADMAP.md`, `docs/V3_FEATURES.md`) |
| L-702 | done | ViMax: borrow planning (+ cinematic stages in TS); do not vendor Python/Idea2Video/upload |

### P0 — Contracts (may ship in 1.x)

| ID | Status | Item |
| --- | --- | --- |
| L-703 | done | Extend production brief schema: `characters[]`, `storyboardPanels[]`, `camera` on shots |
| L-704 | done | Each panel/shot cites `evidenceClaimIds` or explicit `inferred` + limitations; copy active `snapshotId` |
| L-705 | done | Rebuild board/brief JSON after script edit or regeneration (same rule as L-607) |
| L-706 | done | Persist `{project}/brief/{characters,storyboard,shots,camera-tree}.json` in the library folder |
| L-707 | done | Contract tests for board schema (stale snapshot, unknown claims, camera-tree vs shots); no live providers |
| L-708 | done | Confirmation gate: board generate only after selected idea + script + matching snapshot |

### P1 — Board surface (required for 3.0)

| ID | Status | Item |
| --- | --- | --- |
| L-709 | done | Board view after Package (tab or `/board`): scan-first storyboard strip |
| L-710 | done | Camera tree filter: `a-cam` \| `b-roll` \| `screen` \| `insert` (derived from shots, not a second model) |
| L-711 | done | Continuity rail from characters (wardrobe, recurring props, who is on camera) |
| L-712 | done | Board nodes must be a subset of throughline (L-604); no invented topics |
| L-713 | done | Checks: orphan shots; shots without claims; `requires_studio` as on-screen fact; pass / warn / fail before Render |

### P2 — Duration, clips, optional stills (3.0 if time, else 3.1)

| ID | Status | Item |
| --- | --- | --- |
| L-714 | done | Shot `durationHintSec` from teleprompter WPM × section words (L-612); label inferred if model-guessed |
| L-715 | done | Group shots into Shorts/clip briefs (implements a slice of L-313 / L-505) |
| L-716 | done | Optional storyboard stills via existing Gemini image model; Settings default **Off**; `evidenceClass: inferred` |
| L-717 | done | Best-of-k stills using thumbnail critique pattern (L-304); do not port ViMax selector Python |

Stills pipeline stays Off: Settings `storyboardStillsEnabled` default false, so Gemini stills and best-of-k do not run. Selector Python was not ported.

### P3 — Companion export (optional, 3.1 ok)

| ID | Status | Item |
| --- | --- | --- |
| L-718 | done | Export pack includes `script.txt` + `brief/` JSON; optional ViMax-shaped `script2video/` tree behind a flag |
| L-719 | done | Document optional external ViMax handoff; Cutroom Settings may hold TTS/clone/video keys, never `VIMAX_*` sidecar env |
| L-720 | done | Companion flag default **Off** (same rule as L-508 Hermes); never spawn ViMax; never product truth |

### P4 — Render modes (3.0 shoot + slides; 3.1 cinematic)

| ID | Status | Item |
| --- | --- | --- |
| L-721 | done | `/video` engine picker: `assemble` \| `shoot` \| `slides` \| `cinematic` (cinematic disabled until 3.1) |
| L-722 | done | Slides+voice: mux TTS or clone onto assemble timeline → `{topic}/render.mp4` |
| L-723 | done | Voice profile: consented user sample or TTS; never clone research-snapshot creators |
| L-724 | done | Cinematic Shorts in TS: stills → Veo-class clips → FFmpeg concat + shared voice (3.1) |
| L-725 | done | Quote estimated clip count/cost; confirm; default max 5 shots |
| L-726 | done | Shared voice profile for slides and cinematic |
| L-727 | done | No YouTube upload UI, OAuth publish scopes, or `videos.insert` in v3 |
| L-728 | done | `render.mp4` in export pack; `evidenceClass: inferred` |

Cinematic watch file is stills → FFmpeg concat + shared voice (quote/confirm, max 5). Veo-class clip generation is not invoked; output `usesVeo` is false. No `videos.insert`.

### Non-goals for v3

- Vendor `HKUDS/ViMax` `agent_runtime`, Idea2Video, Novel2Video, AutoCameo
- OpenCut / timeline editor / unattended Shorts farm
- YouTube auto-upload (`videos.insert`)
- Cloning third-party voices or likenesses from the research grid
- Replacing Express with a Python agent sidecar
- Long-form cinematic (10+ min Veo) in 3.1 — Shorts-first only

---

## Phase 8 — Creator suite to production depth

Theme: the four CreatorForge modules folded into `main` (Channels, Audience,
Operations, Humanize) ship today as **deterministic thin slices** (Humanize is
already provider-routed). Phase 8 brings them to production depth —
provider-grounded, workflow-connected, still evidence-labeled `inferred` with a
deterministic fallback. Full goals, dependencies, and TDD specs:
[docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md).

Standing boundary: no creator finding is ever `observed` (there is no snapshot
behind it); unlabeled claims are rejected by contract. Not ported, and still
non-goals: CreatorForge's store, credits, Claude-only engine, fake publish API,
collaboration, and third-party integrations.

### Track CS — module depth (parallelizable by file-set)

| ID | Status | Item |
| --- | --- | --- |
| L-801 | done | Provider-grounded channel intelligence: `generateChannelIntelligence` with injectable provider, grounded in `channelMemory`; deterministic fallback; label code-controlled so a model can never emit `observed`/unlabeled (`server/creator-ai.ts`; wired at `/api/channels/intelligence`) |
| L-802 | done | Provider-grounded audience personas: `generatePersona`/`generateAvatarMarkdown` with injectable provider; deterministic fallback; avatar keeps "synthesized, not measured" line (wired at `/api/personas`, `/api/audience/avatar`) |
| L-803 | done | Operations wired to workflow: optional `snapshotId` + `dueDate` on `productionItem`; move to `published` gated on a cited snapshot (`shared/creator-modules.ts`, `server/creator-store.ts`) |
| L-804 | done | Humanize evidence surfacing: `humanizeSummary` pure fn; renders `changes: -1` as "fully rewritten"; deterministic-fallback notice (`shared/creator-modules.ts`, `client/src/pages/humanize.tsx`) |
| L-805 | done | Creator suite UX hardening: Channels / Audience / Operations carry empty + error + loading states; Humanize shows the provider/fallback notice; no route throws with zero channels (each page guards `!active`) |

### Track INT — integration (after CS contracts frozen)

| ID | Status | Item |
| --- | --- | --- |
| L-806 | done | Channel → Research → Operations flow: `/api/channels/intelligence` grounds in `channelMemory` via optional `channelId`; a `productionItem` can be spawned with a `snapshotId` (L-803, tested); the Research search box prefills once from the active channel's niche when empty (`client/src/pages/research.tsx`) |
| L-807 | done | Unified evidence ledger: `buildCreatorLedger` aggregates channel-intel + personas + avatar, every entry `inferred`, throws on any unlabeled entry; served at `/api/creator/ledger` and surfaced as an **Evidence ledger** panel on the Audience page (`server/creator-ledger.ts`, `client/src/pages/audience.tsx`; browser-verified) |
| L-808 | done | Creator artifacts for export pack: `buildCreatorArtifacts` emits `creator/{channel-intelligence,persona}.json` + `creator/avatar.md`, each carrying `evidenceClass`; opt-in (empty input → no files); no new key (`server/creator-export.ts`). **Wired:** `collectCreatorExport` gathers the active channel's inferred intel/persona/avatar behind the `creatorExportEnabled` Settings toggle (default Off), served at `GET /api/creator/export` and pulled into the client export pack (`client/src/lib/export-pack.ts`, Package + Video pages); `server/creator-export.test.ts` covers the gate; browser-verified |

## Phase 9 — Production GA (v2.1)

Theme: close the productionization blockers from
[docs/PRODUCTIONIZATION.md](docs/PRODUCTIONIZATION.md) so the build is shippable
to strangers. Release engineering runs **in parallel** with Phase 8; live
acceptance and the history purge are env/owner-gated and cannot be simulated.

### Track REL — release engineering (independent; parallel with Phase 8)

| ID | Status | Item |
| --- | --- | --- |
| L-901 | done | CI stop-the-line policy documented in `CONTRIBUTING.md` (+ admin branch-protection note). **Owner action:** enable branch protection on `main` in GitHub settings — a repo setting, not a code change |
| L-902 | blocked | Updater end-to-end proof: the `latest.json` endpoint is covered by `server/updater-endpoint.test.ts`; the remaining real `v2.0.0 → v2.0.x` upgrade on a signed install needs a signed build + a prior install (env/release-gated). Closes PRODUCTIONIZATION P2 #9 when run |
| L-904 | done | Rate-limit assumption guard: explicit single-user/loopback comment at `server/rate-limit.ts` + `warnIfNonLoopbackHost` wired at startup (`server/index.ts`); closes PRODUCTIONIZATION P1 #7 |
| L-905 | done | Reproducible desktop build runbook (`npm ci` from a clean checkout) documented in `CONTRIBUTING.md`; closes PRODUCTIONIZATION P2 #10 |

### Track ACC — live acceptance & trust (env/owner-gated; **do not simulate**)

| ID | Status | Item |
| --- | --- | --- |
| L-903 | blocked | Windows signing: Authenticode cert + Windows host/runner wired into `desktop-packages.yml`; stays open until a real signature exists (needs cert) |
| L-906 | blocked | Live-provider acceptance pass on a clean Mac with a throwaway billable key (Gemini, YouTube 10k ceiling, keychain, OAuth Studio, **MiniMax Hailuo H3 quote-then-charge**). Does not close until a written MiniMax result exists (needs Mac + key) |
| L-907 | blocked | Financial history purge: owner runs `filter-repo` + GitHub support purge from [docs/FINANCIAL_PURGE_REQUEST.md](docs/FINANCIAL_PURGE_REQUEST.md) + rotation (**owner only**) |

### Non-goals for v2.1

- Reintroducing any excluded CreatorForge surface (store, credits, Claude-only
  engine, fake publish API, collaboration, integrations)
- A second renderer (scene-motion-ai stays the renderer); the June local video
  editor
- Telemetry (diagnostics stay opt-in, local-only, one user-chosen file)
- Any `observed` creator claim, or a claim with no evidence label
- YouTube auto-upload (`videos.insert`)

## Phase 10 — Go-to-market (v2.2 "Market readiness")

Theme: take the code-GA build to *shippable to strangers and sellable*. Full
goals, dependency graph, parallel waves, and TDD specs:
[docs/GTM_ROADMAP.md](docs/GTM_ROADMAP.md).

Gate 0 (`G-001`) is an **owner decision** that bifurcates the commercial tracks;
nothing in Track COMM starts before it. The samples + testing tracks are
buildable now and model-independent. The `L-9xx` release blockers are the
distribution gate (owner/env-gated; **not simulated**). Standing exclusion:
fake-publish and the retired store/credits stay out regardless of the model.

### Gate 0 — commercial model (owner decision)

| ID | Status | Item |
| --- | --- | --- |
| G-001 | todo | Decide the commercial model: **A** free/OSS · **B** licensed desktop (signed license key, BYO provider keys, Stripe checkout — *recommended default*) · **C** hosted/managed keys (metered billing; breaks local-first, needs auth design). Record in [docs/STRATEGY.md](docs/STRATEGY.md). Gates Track COMM |

### Track SMPL — samples generation (buildable now; model-independent)

| ID | Status | Item |
| --- | --- | --- |
| G-101 | todo | Deterministic sample dataset generator (`npm run samples:generate`): byte-stable channel + personas + research snapshot + script + package + board + full export pack incl. `creator/*`; deterministic fallbacks only (no live keys); goldens under `test/fixtures/samples/` |
| G-102 | todo | "Load sample project" onboarding: first-run seeds the demo workflow; artifacts labeled sample/`inferred`; Settings toggles stay Off |
| G-103 | todo | Marketing/demo sample set: curated export pack + screenshots for landing, `USER_GUIDE.md`, `launch-video/`; no new key |

### Track QA — testing (buildable now)

| ID | Status | Item |
| --- | --- | --- |
| G-201 | todo | Headless E2E acceptance harness: deterministic Research→…→Package→Export, asserting a valid pack and preserved snapshot/evidence labels; no live keys |
| G-202 | todo | Browser-smoke coverage over Settings toggles + export (closes the PR risk-taxonomy "UI without browser coverage" signal); tooling (Playwright/preview) is a dev call |
| G-203 | todo | Sample-driven regression: wire `G-101` goldens into `npm test` so contract drift fails a golden compare |
| G-204 | blocked | Live-provider acceptance pass — **same item as `L-906`** (clean Mac + throwaway billable key; incl. MiniMax quote-then-charge). Recorded, never simulated |
| G-205 | todo | Reference-set / analyzer fixtures (also answers the ECC "reference set readiness" audit); low priority |

### Track COMM — commercialization (gated on `G-001` = B or C; **test-mode only**)

| ID | Status | Item |
| --- | --- | --- |
| G-301 | blocked | Entitlement/licensing: public-key-signed license key — issuance, offline verify (signature + expiry + tamper reject), pro-feature gate; no account server for Model B. Gated on `G-001` |
| G-302 | blocked | Stripe integration (**test-mode first**): Checkout → webhook → license issuance; built/tested with Stripe test keys + published test cards only; **owner flips live keys / performs any real payment**. Gated on `G-001` |
| G-303 | todo | Pricing & packaging (owner): tiers, free-vs-paid boundary, trial; record in [docs/STRATEGY.md](docs/STRATEGY.md) |
| G-304 | blocked | Managed-key proxy — only if `G-001` = C; hosted proxy + metered billing + the auth/security design the standing boundary requires. Likely deferred to 3.x |

### Track DIST — distribution & legal

| ID | Status | Item |
| --- | --- | --- |
| G-401 | blocked | Download channel + landing: signed macOS DMG + signed Windows (needs `L-903`) on a real download surface with the updater proven (`L-902`); landing states the local-first/evidence posture |
| G-402 | blocked | Legal pack (**owner/legal**): ToS, Privacy Policy, EULA, refund policy; YouTube Data API ToS review for distribution |
| G-403 | todo | Support path: document the shipped opt-in diagnostics bundle as the support channel; define a contact/intake flow |

### Non-goals for v2.2

- Fake-publish, the retired CreatorForge store/credits, or any `observed` creator claim
- A hosted/non-loopback surface **without** an explicit auth + security design (gated behind `G-001` = C only)
- The agent entering payment credentials, running a live transaction, flipping Stripe to live, or publishing to production (all **owner actions**)
- Telemetry (diagnostics stay opt-in, local-only, one user-chosen file)
