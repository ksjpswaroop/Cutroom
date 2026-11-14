# Cutroom Feature Inventory

Canonical list of what Cutroom actually does, as of **2026-10-23** (v2.0.0 release train; v3 Board + render work
committed on `main`). Every row below was read out of the code, not from a plan. Tracker IDs point at
[TRACKER.md](../TRACKER.md); architecture is [ROADMAP.md](../ROADMAP.md); v3 detail is [V3_FEATURES.md](V3_FEATURES.md).

**Status:** shipped unless a row says otherwise.
**Verified on this repo:** `npm test` 243/243 · `npm run check` clean · `npm run build` ok. In CI, `ci.yml` → `verify`
is green; `cargo-check` is red for a job-config reason, not a code reason (see [Known limits](#known-limits)).

One line: an evidence-grounded YouTube research → script → thumbnail → package → board workspace that runs on
loopback inside a Tauri shell — no account, no upload, no invented numbers.

---

## Workflow spine

```
Research (+ captions, comments, quota)
  → Insights (evidence ledger) → Ideas
  → Script (+ throughline DAG / mind map / teleprompter)
  → Thumbnail
  → Package (titles, hooks, description, tags, pace chapters, brief)
  → Board (storyboard, characters, camera tree, shot list)
  → Render  shoot myself | slides + voice | assemble preview | cinematic Shorts
```

Pages: `/` (Research), `/script`, `/thumbnail`, `/package`, `/board`, `/video`, `/calendar`, `/settings`. State carries
through `client/src/lib/workflow-context.tsx`; any workflow is restorable from history at any point.

---

## 1. Research

| Capability | What is true | Tracker |
| --- | --- | --- |
| Topic search | YouTube Data API v3 `search.list`, **1–50** results per query (default 25) | L-301 |
| Channel-first search | `channelId` passed to `search.list` — research a competitor channel instead of a keyword | L-618 |
| Enrichment | `videos.list` stats, duration, tags, caption flag, channel meta for every result | — |
| Missing data | Fields stay **absent**, never zero-filled; the snapshot carries explicit coverage | — |
| Analytics | Overview, momentum / duration / publication charts, coverage panel, full source grid | — |
| Snapshot identity | Deterministic `snapshotId` stamped on the result set; every downstream artifact binds to it | — |
| Caption grounding | `captions.list` pulls **public** captions only (same YouTube key); UI action *Ground with captions* → `captionExcerpts` | L-608 |
| Comment mine | `commentThreads.list` extracts real audience questions into `audienceQuestions` | L-609 |
| Quota meter | Per-session unit accounting (`search.list` = 100 units), used/remaining shown next to search | L-610 |
| Thumbnail inspection | Vision pass over the top-5 snapshot thumbnails; every pixel-level claim is labeled **inferred** | L-616 |

## 2. Insights → Ideas

| Capability | What is true | Tracker |
| --- | --- | --- |
| Insights brief | Scan-first brief: audience questions, opportunity themes, recommended moves, evidence balance | L-306 |
| **Evidence ledger** | The feature name is *Evidence ledger* and survives every rebrand; each claim is Observed / Inferred / Requires Studio | L-603 |
| Caption-grounded claims | Dropped public excerpts are reattached as observed claims; non-Gemini prompts get a compact caption instruction | L-413 |
| Ideas | Generated only after Insights validates; selecting one hands the full evidence context to Script | — |
| Comment fallback | If a model drops mined questions, the package keeps the phrasing as a labeled **observed comment**, never as demand | L-414 |

## 3. Script

| Capability | What is true | Tracker |
| --- | --- | --- |
| Generate / edit | Full script from the selected idea; tone, notes, bounded evidence | — |
| **Throughline DAG** | Promise → sections → claims → source video IDs. Nodes are only what the evidence contains; no invented topics | L-604 |
| Mind map | Radial layout of the **same** node set — a second view, not a second model | L-605 |
| Graph checks | Disconnected nodes, unused idea claims, orphan body sections, `requires_studio` spoken as fact → pass / warn / fail before Thumbnail | L-606 |
| Rebuild on edit | Graph rebuilt after edit, section/paragraph regeneration, or title change | L-607 |
| Evidence overlay | On-promise / tangent / unsupported sentence tagging, from the same graph | L-617 |
| Regeneration | Section, paragraph, and title regeneration on the identical evidence context | — |
| Narration extract | Teleprompter-ready narration text | — |
| Teleprompter | Pace (WPM), text size, cues, undo, play/pause (Space), mirror flip; Tauri fullscreen + always-on-top mode | L-309 |

## 4. Thumbnail

| Capability | What is true | Tracker |
| --- | --- | --- |
| Generate | Outcome-oriented image generation; up to 3 reference images, byte-size budget enforced, and references require explicit `referenceRightsConfirmed` before the request is accepted | — |
| Suggestions | Copy suggestions, optional 2–5 word supporting line | — |
| Critique + variation matrix | Critique of the current render, then a matrix of variations from that feedback | L-304 |
| Brand kit in prompt | `brand-kit.json` style memory feeds thumbnail (and package) prompts | L-308 |
| Provenance | Gemini images keep Google SynthID; the app never claims "no watermark" | — |

## 5. Package

| Capability | What is true | Tracker |
| --- | --- | --- |
| Publish package | Titles, hooks, description, tags, chapters, pre-publish checklist | L-301 |
| Observed vs invented | Snapshot-derived tags/titles marked observed; model copy marked generated | L-611 |
| Title & hook lab | Variant generation and selection on the same evidence | L-302 |
| Pace chapters | Chapters computed from teleprompter WPM × section word counts, not guessed timestamps | L-612 |
| Production brief | Section-by-section production brief from the script | L-303 |
| Clip briefs | Shot groups packaged as Shorts/clip briefs from the long-form board | L-505, L-715 |

## 6. Board (v3)

| Capability | What is true | Tracker |
| --- | --- | --- |
| Storyboard strip | One panel per throughline section, scan-first | L-709 |
| Shot list | Camera, duration hint, b-roll flag, on-screen text, continuity per shot | L-703 |
| Camera tree | `a-cam` / `b-roll` / `screen` / `insert`, derived from shots — not a second model | L-710 |
| Talent / continuity | Wardrobe, recurring props, who is on camera | L-711 |
| Subset rule | Board nodes must be a subset of the throughline graph | L-712 |
| Checks | Orphan shots, shots without claims, `requires_studio` shown as on-screen fact → pass / warn / fail before Render | L-713 |
| Rebuild | Board and brief JSON rebuilt on script edit / regeneration | L-705 |
| Persistence | `{project}/brief/{board,characters,storyboard,shots,camera-tree}.json` in the library folder | L-706 |
| Concept stills (**Off**) | Existing image model renders storyboard stills, labeled `inferred`; Settings default Off | L-716, L-717 |
| Confirmation gate | Board generation requires selected idea + script + matching snapshot | L-708 |

## 7. Render

| Mode | What is true | Tracker |
| --- | --- | --- |
| `assemble` | Title card, thumbnail Ken Burns, narration captions, chapter cards → `preview.mp4` via FFmpeg; default **Off** | L-613, L-614 |
| `shoot` | Filmable export pack + board; the user films. No generative video | L-721 |
| `slides` | Assemble timeline + TTS or consented voice clone → `render.mp4` | L-722, L-723 |
| `cinematic` | **MiniMax Hailuo H3 clips** when a MiniMax key is set (`hailuoH3Enabled()` → `usesH3: true, usesVeo: false`); otherwise stills → FFmpeg concat + shared voice. Quote-before-run, max 5 shots, `evidenceClass: inferred` | L-724, L-725 |
| Voice profile | One consented sample/TTS profile shared by slides and cinematic; never cloned from a research-snapshot creator | L-726 |
| No publish | No `videos.insert`, no publish OAuth scopes, no upload UI anywhere | L-727 |
| Output | `render.mp4` / `preview.mp4` written into the export pack | L-728, L-615 |

## 8. Calendar

| Capability | What is true | Tracker |
| --- | --- | --- |
| Content calendar | Local JSON store (`GET/POST/PUT/DELETE /api/calendar`) written to `content-calendar.json` | L-312 |
| Batch view | Scheduled slots grouped by date; no remote calendar sync | L-504 |

## 9. AI providers

Text: `CUTROOM_AI_PROVIDER` = `gemini` (default) · `openai_compatible` · `ollama` · `openrouter` · `minimax`.
Image: `gemini` · `ollama` · `minimax`. All in `server/ai/` behind one interface.

| Provider | Surface | Notes |
| --- | --- | --- |
| Gemini | Text + image | Model allowlist in `server/gemini-models.ts` (3.7 Flash default, 3.1 Pro preview, Lite tiers) |
| OpenAI-compatible | Text (+ image endpoint) | Any base URL + model, e.g. `https://api.openai.com/v1` + `gpt-4o-mini` |
| OpenRouter | Text | `openrouter/auto` or an explicit model |
| Ollama (local) | Text + image | Probe `127.0.0.1:11434`, installed-model detection, `/api/ai/ollama/status`, local image spike (FLUX.2 Klein / Z-Image) |
| MiniMax | Text + image + TTS | Hailuo H3 BYOK clip path (`server/minimax-h3.ts`) plus voice clone / TTS |
| Provider indicator | UI | Always-visible badge naming the live provider, with an explicit warning when it is cloud (prompts leave the machine, billed per token) |

Unconfigured provider → labeled stub, never a fabricated answer (`server/ai/stubs.ts`).

---

## Evidence contract (the part that does not bend)

- Every request/response crossing the API is zod-validated (`shared/evidence-contracts.ts`, `shared/schema.ts`).
- Every generated artifact carries `snapshotId`; a stale snapshot fails instead of silently re-binding.
- Three evidence classes only: **Observed** (snapshot, public captions, public comments), **Inferred** (model
  judgement, labeled), **Requires Studio** (private metrics the app cannot see — stated as missing, never estimated).
- Throughline and Board are subset-checked against real claims; the checks are pass/warn/fail gates, not advisories.
- Rate limiting: **48 requests / 60 s per address** on generation routes; JSON body validated before the budget is spent.
- Keys never returned to the browser; no request/response bodies in logs; loopback bind by default.

## Storage, library, export

| Piece | What is true |
| --- | --- |
| Workflow history | 8 most recent workflows (`WORKFLOW_HISTORY_LIMIT = 8`); restorable, rename/delete behind explicit confirmation |
| Persistence | IndexedDB in the web build; when a library folder is set, `{library}/workflows/{id}/` also gets `workflow.json`, `script.md`, `publish-package.json`, `production-brief.json`, `brief/*.json` |
| Library folder | Desktop folder picker; set/clear via `/api/settings/library` |
| Export pack | `script.txt`, `preview.mp4`, `render.mp4`, `brief/{board,characters,storyboard,shots,camera-tree}.json` |
| ViMax companion (**Off**) | Optional ViMax-shaped `script2video/` folder; never spawns ViMax, never product truth |
| Zip store | Export packs as a zip whose entries Python's `zipfile` reads (covered by a test) |

## Desktop shell & distribution

| Piece | What is true |
| --- | --- |
| Tauri 2 shell | Free-port sidecar spawn, loopback WebView only, crash/quit terminates the sidecar, single-instance plugin |
| Node sidecar | Bundled as `resources/app/{dist/index.cjs, dist/public, package.json, node_modules}` by `npm run desktop:prepare` |
| App data | `LEDGER_APP_DATA` / Tauri app-data `.env`; secrets in the macOS keychain via `security`, model choices stay in `.env` |
| Updater | `tauri-plugin-updater` → `.../releases/latest/download/latest.json`; no signing key in config |
| First-run | Banner asks for keys and/or library folder, dismissible, returns when the need returns (`shared/first-run-banner.ts`) |
| macOS | Developer ID signed, hardened runtime, entitlements, notarized + stapled, DMG (`spctl`: Notarized Developer ID) |
| Windows | `cutroom-windows-x86_64.exe` (cargo-xwin, unsigned, on Release v2.0.0); NSIS/MSI need a Windows host |
| Linux | `cutroom_2.0.0_arm64.deb` + `cutroom-linux-aarch64` on Release v2.0.0 |

## Settings & optional companions (every toggle defaults **Off**)

| Preference | Default | Effect |
| --- | --- | --- |
| `assemblePreviewEnabled` | false | Optional preview render step after Package |
| `storyboardStillsEnabled` | false | Gemini storyboard stills + best-of-k |
| `vimaxCompanionEnabled` | false | ViMax-shaped `script2video/` export folder |
| `hermesCompanionEnabled` | false | Monday cron digest only; never spawns Hermes, never product truth |

Settings also holds: API keys (write-only), provider + model selection, library folder, brand kit, TTS voice id, and
YouTube Studio OAuth status (`/api/studio/status`; metrics stay `null` until a refresh token exists — no publish scopes).

---

## Known limits

Honest list, current as of this date:

1. **`cargo-check` in CI is red on every push** (16/16 runs, including the initial import). Cause: `bundle.resources:
   ["resources/app/**/*"]` is produced by `npm run desktop:prepare`, which that job never runs, so tauri's build script
   fails on the empty glob. Product code is fine; the job needs a prepare step (or a placeholder file). `verify` is green.
2. **`desktop-packages.yml` has never completed** — all three dispatches died on a GitHub billing lock (2026-08-28).
   The Windows/Linux artifacts on Release v2.0.0 were built locally, not by that workflow.
3. **Version string is still `2.0.0`** in `package.json` and `tauri.conf.json` while Board/render (v3) shipped; the v3
   build exists only as a hand-uploaded notarized DMG asset on the v2.0.0 release. No `v3.0` tag.
4. **Cinematic calls one video model, not a family.** With a MiniMax key it calls Hailuo H3 (`server/render-engine.ts:186`,
   `usesH3: true`); with no key it falls back to FFmpeg stills concat. `usesVeo` is always false — no Google-side video model.
   Quote-before-run is enforced and capped at 5 shots.
5. **Live-key acceptance is manual.** Contract tests never call a paid provider; a real Research → Package → Board run
   with live keys is a human checklist item (`docs/DESKTOP.md`).
6. **Windows installer packaging** (NSIS/MSI) needs a Windows host or hosted CI; only the raw `.exe` ships.
7. **No multi-user hardening.** Single-user, loopback-bound, no auth — do not expose the server to the internet (`SECURITY.md`).

## Not in the product (deliberate)

Timeline editor / CapCut-Descript clone · viral Shorts auto-render farm · Veo-class generative b-roll as a default ·
talking-head · YouTube auto-upload · accounts, login, Pro gate · replacing Express with a Python agent sidecar ·
vendoring `HKUDS/ViMax` runtime / Idea2Video / Novel2Video / AutoCameo · inventing a mind map from free script text ·
cloning research-snapshot creators' voices or likenesses · fake search volume or algorithm scores.

## Verification

```bash
npm test                # 243 tests, 53 suites — contracts, schema, packaging; no live providers
npm run check           # tsc
npm run build           # production client + server bundle
npm run tauri:build     # desktop app
npm run desktop:build:macos   # signed app + DMG
npm run desktop:notarize      # notarize + staple (Apple creds required)
./script/desktop-ci.sh        # full desktop CI path
```
