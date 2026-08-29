# Cutroom Feature Inventory

Canonical list of product capabilities as of 2026-08-29. Status: **shipped** unless noted. v3 Board + render: [V3_FEATURES.md](V3_FEATURES.md).

## Workflow spine

| Step | Capability | Notes |
| --- | --- | --- |
| Research | Topic search (1–50 videos) | YouTube Data API v3 |
| Research | Enrichment (stats, duration, tags, captions flag, channel meta) | Missing fields never zero-filled |
| Research | Overview, analytics charts, coverage, source grid | Snapshot ID stamped |
| Insights | AI research brief | Evidence ledger; Observed / Inferred / Requires Studio |
| Ideas | Auto-generate after valid Insights | Select one → proceed to Script |
| Script | Full script generate + edit | Tone, notes, bounded evidence |
| Script | Throughline DAG / mind map | Promise → sections → claims → sources; pass/warn/fail checks |
| Script | Section / paragraph / title regenerate | Same evidence context |
| Script | Narration extract | Teleprompter-ready text |
| Script | Teleprompter UI | Pace, size, cues, undo, playback |
| Thumbnail | Outcome-oriented generate | Up to 3 references; size limits enforced |
| Thumbnail | Suggestions + critique | Variation matrix support |
| Package | Publish package composer | Titles, hooks, description, tags, chapters, checklist |
| Package | Production brief | From script |
| Package | Project export pack | Desktop folder export via Tauri dialog when available |
| Board | Production board | Storyboard, characters, camera tree; throughline subset checks |
| Render | Mode picker | Shoot myself / slides + voice / cinematic Shorts / assemble preview |
| Render | Shoot / slides / cinematic | Filmable pack or inferred `render.mp4`; quote-before-run for cinematic |
| Settings | API keys + model allowlist | Loopback-only; keys never returned; optional TTS/clone; no upload |
| Workflows | Multi-project history | IndexedDB / local; rename, delete, restore |

## Platform

| Capability | Status |
| --- | --- |
| Web local server (`npm run dev`) | Shipped |
| Tauri 2 desktop shell + Node sidecar | Shipped |
| App-data `.env` via `LEDGER_APP_DATA` | Shipped |
| macOS Developer ID signing path | Shipped (notarization needs Apple notary creds) |
| Windows / Linux bundle targets | Configured; polish backlog |
| First-run banner when keys missing | Shipped |
| Rate limit (10/min per address) | Shipped |
| Contract tests / CI | Shipped |

## Privacy & trust

- No login / Pro gate  
- No request/response body logging  
- Loopback bind default  
- SynthID: Gemini images retain Google provenance; app does not fake “no watermark”

## v3 Board + chosen render

Shipped (3.0 + 3.1 stills path). Inventory: [V3_FEATURES.md](V3_FEATURES.md). Architecture: [V3_ROADMAP.md](V3_ROADMAP.md).

| Step | Capability | Notes |
| --- | --- | --- |
| Board | Storyboard + camera tree | Subset of script throughline; no invented nodes |
| Render | Mode picker | Shoot myself / slides + voice / cinematic |
| Render | Shoot myself | Export pack; user films; no generative video |
| Render | Slides + voice | Assemble + consented clone or captions → `render.mp4` |
| Render | Cinematic | Quote-before-run Shorts; stills concat; inferred |
| Export | `brief/` + `render.mp4` | Generated pixels labeled inferred |
| Settings | Optional TTS/clone/video keys | Loopback; **no** YouTube upload |

v3 does **not** add Idea2Video, OpenCut, YouTube publish, or a ViMax Python sidecar. v0.2 assemble preview remains the no-key template.

## Explicit non-features (deferred)

- Timeline editor, Shorts auto-render farm  
- Fake algorithm / search-volume invention  
- Bulk Studio upload automation against ToS  
- Cloud team sync (not default)
- YouTube auto-upload from Cutroom; cloning third-party voices from the research grid
- Vendoring ViMax `agent_runtime` / Idea2Video
