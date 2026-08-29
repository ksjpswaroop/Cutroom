# Cutroom Roadmap

Cutroom is the local, evidence-grounded creator desk that turns a public YouTube research snapshot into a publishable package—without a SaaS login.

This document is the product and architecture map. Day-to-day status lives in [TRACKER.md](TRACKER.md).

## Positioning

- Independent Apache 2.0 tool; not affiliated with YouTube or Google.
- Local-first: API keys stay on the machine; workflow history stays in the browser profile / WebView.
- Evidence contracts: Observed vs Inferred vs Requires Studio, bound to snapshot IDs.

## Architecture

```
Tauri 2 shell  →  WebView loads http://127.0.0.1:{port}
       │
       └─ spawns Node sidecar (Express)
              ├─ YouTube Data API v3
              ├─ Gemini text + image
              └─ secrets in app-data (.env) → later OS keychain
```

Portable boundaries (unchanged from [PORTING.md](PORTING.md)):

- Research: `server/youtube.ts`, `shared/schema.ts`
- Evidence / AI: `server/gemini.ts`, `shared/evidence-contracts.ts`
- Thumbnail: `server/thumbnail-contract.ts`, `server/gemini-models.ts`
- Client workflow: Research, Script, Thumbnail, Package, Settings + `workflow-context.tsx`

The WebView must load the Express origin so loopback Settings checks in `server/settings.ts` keep working.

## Phases

| Phase | Goal |
| --- | --- |
| **0** Foundation & rebrand | Cutroom naming, living tracker, green CI |
| **1** Tauri shell MVP | Sidecar lifecycle, loopback WebView, app-data secrets path |
| **2** Production desktop | Bundle Node, sign/notarize, updater, Win/Linux, keychain |
| **3** Dream product v2 | Publish package, hooks lab, production brief, thumb critique, export pack, then deepen research |
| **4** Model freedom & trust | Provider interface, Ollama/OpenRouter, keychain, notarized macOS (see [docs/MODELS.md](docs/MODELS.md), [docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md)) |
| **5** Research depth & optional Studio | Competitor workspace, calendar, clip briefs, OAuth Studio mirror (labeled) |
| **6** Cutroom v0.2 | Cutroom rebrand, script throughline, caption/comment Insights, assemble-only preview ([TRACKER.md](TRACKER.md) `L-601+`) |
| **7** Production board v3 | One Board; shoot / slides+voice / cinematic; no upload ([docs/V3_ROADMAP.md](docs/V3_ROADMAP.md), `L-701+`) |

Strategy baseline (competitors, moat, Hermes decision, investor/user pitches): [docs/STRATEGY.md](docs/STRATEGY.md). v3 Board + render: [docs/V3_ROADMAP.md](docs/V3_ROADMAP.md) · [docs/V3_FEATURES.md](docs/V3_FEATURES.md).

## Platform defaults

1. macOS first (signed + notarized DMG)
2. Windows / Linux after macOS is stable
3. Dynamic free port (never hard-require 5000)
4. Single-instance; kill sidecar on quit

## Standing boundaries

- Preserve snapshot IDs and evidence contracts through Research → Ideas → Script → Package → Board → Render (v3)
- Never return API keys to the WebView or log request/response bodies
- No live provider calls in automated tests
- Do not reintroduce retired login / Pro Script Studio / Replit AI proxy / DB session stack
- Do not bind `0.0.0.0` without a separate auth design

## Deferred (intentionally)

- In-app timeline editor (Descript/CapCut class)
- Viral Shorts auto-render farm (Opus class)
- Fake algorithm scores or invented search volume
- Bulk Studio upload automation that fights YouTube ToS
- Replacing the Node/Express sidecar with Hermes Agent ([docs/HERMES_DECISION.md](docs/HERMES_DECISION.md))
- Vendoring ViMax Python / Idea2Video / OpenCut. Cinematic render is Cutroom TypeScript on `/video` ([docs/V3_ROADMAP.md](docs/V3_ROADMAP.md))
- YouTube auto-upload from Cutroom (`videos.insert`)

## Version pointers

| Version | Doc |
| --- | --- |
| Feature inventory | [docs/FEATURES.md](docs/FEATURES.md) |
| v3 Board + render | [docs/V3_ROADMAP.md](docs/V3_ROADMAP.md) · [docs/V3_FEATURES.md](docs/V3_FEATURES.md) |
| Competitive / moat | [docs/STRATEGY.md](docs/STRATEGY.md) |
| Models plan | [docs/MODELS.md](docs/MODELS.md) |
| Release train | [docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md) |
| Investor brief | [docs/INVESTOR_BRIEF.md](docs/INVESTOR_BRIEF.md) |
| User pitch | [docs/USER_STORY.md](docs/USER_STORY.md) |
