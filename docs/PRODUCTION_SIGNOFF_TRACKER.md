# Cutroom Production Sign-off Tracker & Parallel Build Plan

**Goal:** drive Cutroom to a **real, live, working production sign-off** — the full
multi-provider connect layer (Claude / OpenAI-Codex / Cursor / Ollama + router,
OpenAI-style, Anthropic, OpenRouter keys), image + video generator APIs, Gemini
rendering, the **cinematic Veo-class generation path**, and publishing — delivered
under TDD across **parallel tracks** that different people/agents can run at once.

This is the implementation ledger. It states every goal, the **decision gates** that
must be settled before the gated tracks start, the **dependency graph**, the
**parallel waves**, the **TDD specs** to write first, and the **done-when** gate.
Day-to-day status lives in [../TRACKER.md](../TRACKER.md) (Phase 11, `PS-001+`).

**Companion docs:** [ROADMAP.md](../ROADMAP.md) · [TRACKER.md](../TRACKER.md) ·
[PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) · [GTM_ROADMAP.md](GTM_ROADMAP.md) ·
[PRODUCTIONIZATION.md](PRODUCTIONIZATION.md) · [RELEASE_PLAN.md](RELEASE_PLAN.md) ·
[V3_ROADMAP.md](V3_ROADMAP.md) · [MODELS.md](MODELS.md)

---

## 0. Read this first — boundaries & honesty

The request touches two **standing, enforced** boundaries. They are not refused, but
they are **gated** — the agent will not silently cross them:

- **Auto-publishing reverses a test-enforced non-goal.** `videos.insert` / YouTube
  auto-upload is a documented non-goal ([ROADMAP.md](../ROADMAP.md) standing
  boundaries, [RELEASE_PLAN.md](RELEASE_PLAN.md) non-goals) and is **actively blocked
  by a contract test** (`server/render-engine.test.ts`: "server routes do not
  implement videos.insert"). Reintroducing it is a **product-direction + ToS +
  safety decision** (`PS-001`), not just code. Until that gate is settled, the guard
  test stays; any publish is **user-initiated and consented**, never an autonomous
  agent action and never unattended-by-default.
- **Live production sign-off needs owner-only resources.** Signed builds, an
  Authenticode cert, a clean Mac, and **billable** provider keys (Veo-class /
  MiniMax quote-then-charge) cannot be produced by the agent. Those items are built
  and tested in code, then **run and recorded by the owner**. They are marked
  `blocked` here, never simulated.

Standing rules that still bind every track: no live-provider or live-billing calls
in automated tests (inject fakes / deterministic fallback); keys never reach the
WebView; loopback-only unless a gate explicitly authorizes a hosted surface **with
an auth design**; every creator claim stays evidence-labeled `inferred`; the agent
never enters credentials, runs a live transaction, deploys, or pushes `main`.

---

## 1. Decisions needed before the gated tracks start

| Gate | Decision | Why it gates | Owner default |
| --- | --- | --- | --- |
| **`PS-001`** | Publishing direction: **(a)** keep excluded · **(b)** user-initiated consented upload (OAuth, confirm per publish) · **(c)** scheduled "auto" (still user-authorized) | Reverses the `videos.insert` non-goal + YouTube ToS + the "publishing = explicit permission" safety rule | **(b)** — consented, never agent-autonomous |
| **`PS-002`** | Cinematic scope: keep **Shorts-first** (≤5 shots, ≤120s/shot) or lift the cap for long-form | Current code caps shots at 5 and sets `usesVeo:false`; long-form is a v3.1 non-goal | Keep Shorts-first; add length only behind an explicit setting |
| **`PS-003`** | Provider semantics: confirm what **"Omnirouter"**, **"Codex"**, and **"Cursor"** mean as inference providers, and which providers are **API-key** vs **OAuth sign-in** | Anthropic/OpenAI/OpenRouter authenticate by **API key**, not consumer "sign-in"; "Codex" = OpenAI models, "Cursor" is an editor with a non-standard inference API. A unified "Connections" UI supports both, but OAuth only where a provider truly offers it | Key-based for all; OAuth only where a provider supports a device/sign-in flow |

These three are **owner decisions**. The plan is written for the defaults above and
adapts cleanly to the alternatives.

---

## 2. What already exists (don't rebuild)

- **Text providers** (`server/ai/`, `AiTextProvider`): `gemini`, `openai_compatible`,
  `ollama`, `openrouter`, `minimax`. Registry: `server/ai/index.ts`
  (`resolveAiProviderId`, `getTextProvider`), env `CUTROOM_AI_PROVIDER`.
- **Image providers** (`AiImageProvider`): `gemini`, `ollama`, `minimax`
  (`*-image-adapter.ts`).
- **Video (cinematic) seed**: `server/minimax-h3.ts` (Hailuo H3, quote-then-charge),
  `server/render-engine.ts` (assemble / slides / cinematic; `usesVeo:false`, shot cap
  `Math.min(5,…)`), gated by `cinematicVeoEnabled` + `CUTROOM_VIDEO_ENABLED`.
- **Secrets**: app-data `.env` → OS keychain, loopback Settings guard, redaction.
- **Evidence contracts**: `inferredEvidenceClassSchema` rejects any non-`inferred`
  creator claim.

So the deltas are: add **Anthropic (Claude)**; a real **video-provider abstraction**;
a unified **Connections** surface (keys + optional OAuth); wire **Gemini rendering**
into the cinematic path; the **publish** track (gated); and the **sign-off** + **QA**
tracks. Most of the connect layer is extension, not greenfield.

---

## 3. Goal statements (Phase 11 — `PS-001+`)

### Track PROV — provider connections & sign-in (extends `server/ai/`)

- **`PS-101` — Anthropic (Claude) text provider.** Add `anthropic` to
  `AI_PROVIDER_IDS` + `anthropic-adapter.ts` conforming to `AiTextProvider` (API key,
  configurable model, JSON completion). Registry + Settings wiring. Fails closed to
  the existing default when unconfigured.
- **`PS-102` — OpenAI / Codex via `openai_compatible`.** Confirm `openai_compatible`
  covers OpenAI + Codex-class models (base URL + key + model id); add presets. No new
  adapter unless Codex needs a distinct surface (`PS-003`).
- **`PS-103` — OpenRouter + router keys hardening.** Verify `openrouter` adapter;
  add the **"Omnirouter"/unified router** as a configurable `openai_compatible` base
  URL + key once `PS-003` confirms its API shape.
- **`PS-104` — Ollama local (no sign-in).** Verify multi-model local use; label it
  key-less/offline in the Connections UI.
- **`PS-105` — Unified Connections surface (Settings).** One panel: per-provider key
  entry + validation + live status; **OAuth "Connect" only where a provider offers a
  device/sign-in flow** (`PS-003`). Keys stored app-data/keychain, never WebView.
- **`PS-106` — Provider conformance kit.** A shared test harness every text/image/
  video provider must pass (shape, error mapping, deterministic fallback), run with
  **fakes only**.

### Track MEDIA — image & video generator APIs (extends `server/ai/`)

- **`PS-201` — Video provider abstraction.** New `AiVideoProvider` +
  `AI_VIDEO_PROVIDER_IDS`, mirroring `AiImageProvider`: `generateClip(request) →
  { clipDataUrl|path, providerId, model, quote }`. Wrap `minimax-h3.ts` as the first
  adapter; **quote-then-charge** surfaced in the type.
- **`PS-202` — Veo-class + additional generators.** Add adapters behind the
  abstraction (e.g. a Veo-class/Gemini-video adapter, Runway-class optional), all
  injectable, all with a deterministic stub for tests.
- **`PS-203` — Image generator breadth.** Confirm `gemini`/`ollama`/`minimax` image
  adapters; add an OpenAI-images adapter under `openai_compatible` if `PS-003` wants
  it. **Gemini stays a first-class rendering image provider.**
- **`PS-204` — Gemini for rendering.** Wire `gemini-image-adapter` into the
  stills/title/caption/card path and the cinematic storyboard stills (respecting the
  existing `storyboardStillsEnabled` Off-by-default).

### Track RENDER — cinematic Veo-class path (extends `server/render-engine.ts`)

- **`PS-301` — Real cinematic pipeline.** stills (image provider) → clips (video
  provider, `PS-201`) → FFmpeg concat → shared consented voice; **quote-before-run**,
  confirm, shot cap per `PS-002`. `usesVeo` becomes `true` **only** when a video
  provider is configured **and** the user enabled it.
- **`PS-302` — Voice + consent.** Shared voice profile; clone requires
  `CUTROOM_VOICE_CONSENT`; never clone research-snapshot voices (existing guard
  stays, extended).
- **`PS-303` — Export.** `render.mp4` into the export pack; `evidenceClass: inferred`.
- **`PS-304` — Live cinematic acceptance** *(= `L-906`, owner-gated)*: MiniMax /
  Veo-class quote-then-charge on a **billable** key; recorded, never simulated.

### Track PUBLISH — publishing (**gated on `PS-001`**)

- **`PS-401` — OAuth upload scope.** Add the YouTube upload scope to the existing
  OAuth Studio mirror, **user-consented**; status + revoke in Settings.
- **`PS-402` — Consented publish flow.** User-initiated upload with a
  **confirm-before-upload** step, quota awareness, and a clear "Cutroom does not
  publish on its own" posture. Updates/retires the `videos.insert` guard test **only
  if `PS-001` approves**, with the ToS note recorded.
- **`PS-403` — Scheduled publish (optional).** Explicit opt-in scheduling; still
  user-authorized per run; never an autonomous agent action. Default Off.

### Track SIGNOFF — release & live sign-off (references `L-9xx`)

- **`PS-501`** branch protection (`L-901`, owner). · **`PS-502`** updater e2e
  (`L-902`, needs signed install). · **`PS-503`** Windows signing (`L-903`, cert). ·
  **`PS-504`** live-provider acceptance (`L-906`, billable key) incl. MiniMax. ·
  **`PS-505`** financial-history purge (`L-907`, owner). · **`PS-506`** run the
  packaging + release checklist ([RELEASE_PLAN.md](RELEASE_PLAN.md)); tag + notes
  (owner).

### Track QA — TDD harness, samples, E2E (builds on GTM `G-101+`/`G-201+`)

- **`PS-601`** provider conformance tests (every adapter, fakes only). ·
  **`PS-602`** media (image/video) contract tests with deterministic stubs +
  quote assertions. · **`PS-603`** cinematic render contract tests (`usesVeo`
  gating, shot cap, quote-before-run). · **`PS-604`** publish contract tests
  (scope/consent gating, mock upload, idempotency). · **`PS-605`** headless E2E
  pipeline + deterministic sample generation (`G-101`/`G-201`). · **`PS-606`** live
  acceptance recording (owner-run).

---

## 4. Dependency graph & parallel waves

```
                 Gates: PS-001 (publish) · PS-002 (cinematic scope) · PS-003 (providers)
                                        │
   ┌───────────────┬──────────────┬─────┴───────┬───────────────┬──────────────┐
   │               │              │             │               │              │
 Track PROV     Track MEDIA    Track RENDER   Track PUBLISH   Track SIGNOFF   Track QA
 PS-101 ─┐      PS-201 ─┐       PS-301 ─┐      (gated PS-001)  L-901..L-907    PS-601 ─┐
 PS-102 ─┤      PS-202 ─┤       PS-302 ─┤       PS-401          PS-501..506    PS-602 ─┤ (runs
 PS-103 ─┤      PS-203 ─┤       PS-303 ─┘       PS-402                          PS-603 ─┤  against
 PS-104 ─┤      PS-204 ─┘          │            PS-403                          PS-604 ─┤  each
 PS-105 ─┤   (needs PROV ids)      │ (needs MEDIA PS-201)                       PS-605 ─┤  track)
 PS-106 ─┘                         ▼                                           PS-606 ─┘
                            cinematic live = PS-304 = L-906 (owner key)
```

| Wave | Run in parallel (disjoint file-sets) | Notes |
| --- | --- | --- |
| **Wave 1 (now, no gate)** | PROV `PS-101`/`PS-104`/`PS-106`, MEDIA `PS-201`/`PS-203`, QA `PS-601`/`PS-602`, SIGNOFF `L-901` | Each adapter is its own file in `server/ai/`; QA adds `*.test.ts`; `L-901` is a GitHub setting. Fully disjoint. |
| **Wave 2 (after gates)** | PROV `PS-102`/`PS-103`/`PS-105` (`PS-003`), MEDIA `PS-202`/`PS-204`, RENDER `PS-301`–`PS-303` (`PS-002`), QA `PS-603` | RENDER needs MEDIA `PS-201`; Connections UI needs the provider ids frozen. |
| **Wave 3 (gated/owner)** | PUBLISH `PS-401`–`PS-403` (`PS-001`), SIGNOFF `PS-502`–`PS-506`, RENDER `PS-304`, QA `PS-604`/`PS-606` | Publish needs `PS-001`; live items need billable keys / signed builds / cert. |

**Single-writer rule:** PROV owns `server/ai/*`; MEDIA owns `server/ai/*-image/*-video*`
+ `minimax-h3.ts`; RENDER owns `render-engine.ts`; PUBLISH owns the OAuth/upload module;
QA owns `*.test.ts`. One writer per file-set; the split is by file precisely so Wave 1
can run three-plus in parallel.

---

## 5. TDD specs (write these first; no live calls)

House rules: `node:test` + `node:assert/strict`; `fs.mkdtemp` roots; **inject fake
providers** or force deterministic fallback; **no live provider or billing calls**;
fixture OAuth/webhook events only.

```
PROV — server/ai/anthropic-adapter.test.ts (PS-101)
  it("conforms to AiTextProvider: returns {text, providerId:'anthropic', model}")
  it("maps an API error to the shared error shape (no throw to caller path)")
  it("is skipped/falls back when no ANTHROPIC key is configured")   // no live call
  it("passes the shared provider conformance kit (PS-106)")

MEDIA — server/ai/video-provider.test.ts (PS-201/PS-202)
  it("AiVideoProvider stub returns a clip ref + a quote without charging")
  it("minimax adapter surfaces quote-then-charge; charge requires explicit confirm")
  it("deterministic stub is used when no video key is configured")  // no live call

RENDER — server/render-engine.test.ts (extend, PS-301/PS-302)
  it("usesVeo is false until a video provider is configured AND enabled")
  it("quotes before running and caps shots per PS-002")
  it("clone requires consent and never uses research-snapshot voices")  // existing, kept

PUBLISH — server/publish.test.ts (PS-401/PS-402; only if PS-001 approves)
  it("requires an explicit user-consent + confirm before any upload call")
  it("refuses to upload without the OAuth upload scope granted")
  it("is idempotent / never auto-uploads unattended by default")
  // until PS-001 approves, the existing 'routes do not implement videos.insert' test STAYS

QA — conformance + E2E (PS-601/PS-605)
  it("every registered provider passes the conformance kit with a fake backend")
  it("headless Research→…→Export produces a valid pack with inferred labels")
```

Live/manual acceptance (`PS-304`/`PS-502`–`PS-506`/`PS-606`) are **runbooks with a
recorded result file**, not unit tests — the no-live boundary forbids them in CI.

---

## 6. Done-when — production sign-off exit criteria

Sign-off is real when **all** hold:

1. `npm run check` · `npm test` · `npm run build` exit 0; `npm audit --omit=dev` 0.
2. Every provider (text/image/video) passes the conformance kit; the Connections UI
   stores keys app-data/keychain, never WebView; unconfigured providers fail closed.
3. Cinematic path produces a `render.mp4` with a quote-before-run and the shot cap of
   `PS-002`; `usesVeo` true only when configured + enabled; every clip `inferred`.
4. **Decision gates settled and recorded:** `PS-001` publishing direction, `PS-002`
   cinematic scope, `PS-003` provider semantics.
5. **If publishing approved (`PS-001`):** consented publish proven by the `PS-402`
   tests; no unattended agent upload; ToS note recorded; otherwise the `videos.insert`
   guard stays green.
6. **Owner-gated, recorded not simulated:** `L-902` updater proof, `L-903` Windows
   signature, `L-906`/`PS-304` MiniMax/Veo quote-then-charge written result, `L-907`
   purge — each real or an accepted, recorded limitation.
7. Release checklist run and tagged by the **owner** (the agent never deploys/tags).

---

## 7. Ownership & gates

| Item | Gate | Who |
| --- | --- | --- |
| PROV / MEDIA / RENDER code + tests | none — code + CI | agent/dev (parallel) |
| `PS-001` publish direction, `PS-002` cinematic scope, `PS-003` providers | decision | **owner** |
| PUBLISH `PS-401`–`PS-403` | `PS-001` = b/c; user-consented; **agent never auto-uploads** | agent builds + tests; **owner authorizes each publish** |
| `PS-304`/`L-906` live cinematic | clean Mac + billable key | owner provides; agent runs + records |
| `L-903` Windows signing | Authenticode cert | owner provides; agent wires |
| `L-907` purge, `PS-506` tag/deploy | owner action | **owner only** |

**Agent boundary (standing):** no credential entry, no live transaction, no flip to
live keys, no auto-publish, no deploy, no push to `main`. Those are owner actions;
the agent builds and verifies in test mode with fakes.

---

## Related

- [../TRACKER.md](../TRACKER.md) — Phase 11 ledger (`PS-001+`)
- [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) · [GTM_ROADMAP.md](GTM_ROADMAP.md) — prior phases
- [V3_ROADMAP.md](V3_ROADMAP.md) — cinematic/render boundaries
- [MODELS.md](MODELS.md) — provider/model plan
- [PRODUCTIONIZATION.md](PRODUCTIONIZATION.md) — readiness blockers
