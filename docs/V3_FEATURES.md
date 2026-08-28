# Cutroom v3 Feature Inventory — Production Board

Canonical list of **planned** 3.0 capabilities. Shipped product remains [FEATURES.md](FEATURES.md). Architecture and non-goals: [V3_ROADMAP.md](V3_ROADMAP.md). Tracker: [TRACKER.md](../TRACKER.md) `L-701+`.

**As of:** 2026-08-28  
**Status:** Planned (not shipped).

Inspiration: [HKUDS/ViMax](https://github.com/HKUDS/ViMax) Script2Video **planning** stages only. Runtime, renderers, and Idea2Video / Novel2Video are out of scope.

---

## Workflow spine (v3 additions)

| Step | Capability | Notes | Tracker |
| --- | --- | --- | --- |
| Package | Enriched production brief | Characters, storyboard panels, camera on shots; still Gemini JSON | L-703 |
| Board | Storyboard strip | One panel per throughline section; scan-first | L-709 |
| Board | Shot list (decomposition) | Camera, duration hint, b-roll, on-screen text, continuity | L-703, L-710 |
| Board | Camera tree | Filter `a-cam` / `b-roll` / `screen` / `insert` | L-710 |
| Board | Talent / continuity | Wardrobe, recurring props, who is on camera | L-711 |
| Board | Evidence checks | Orphan shots; invented topics; Studio-as-fact on screen | L-713 |
| Board | Rebuild on script edit | Same graph rebuild rule as throughline | L-705 |
| Package | Clip briefs from shot groups | Optional Shorts packages from long-form board | L-715 |
| Board | Concept stills (optional) | Existing image model; inferred; Settings Off | L-716, L-717 |
| Export | Planning folder in pack | `brief/*.json` + `script.txt`; optional ViMax-shaped tree | L-706, L-718 |

Existing Research → Insights → Ideas → Script → Thumbnail → Package → assemble Preview are unchanged. Board does not replace the evidence ledger, throughline, or teleprompter.

---

## What ships vs what does not

### In scope (Cutroom-native)

- Structured **text** planning derived from the selected script and idea package  
- Zod contracts + one repair pass (same pattern as publish package / brief today)  
- Library persistence under `{project}/brief/`  
- UI to inspect and lightly edit shots before filming  
- Duration hints from teleprompter WPM × word counts (depends on `L-612`)  
- Optional inferred stills on the **current** image allowlist  

### Out of scope (ViMax runtime)

| ViMax feature | Cutroom stance |
| --- | --- |
| Director / Producer agent loop | Do not port `agent_runtime/` |
| Idea2Video | Idea package already exists; no film from a prompt |
| Novel2Video | Wrong corpus |
| Frame prompts, keyframes, Veo clips | Never product path |
| Character portrait bank + identity lock for AI cast | Not a YouTube talking-head desk |
| TUI / Web UI from ViMax | Cutroom UI stays React + Tauri |
| `VIMAX_LLM_API_KEY` / image / video env trio | No new Settings video keys |

### Companion only (P3, flag Off)

- Write files a user could feed to ViMax Script2Video themselves  
- README snippet: “Cutroom stops at planning; render elsewhere if you want”  
- Must not call ViMax, spawn Python, or store video-provider secrets  

---

## Contract sketch (P0)

Names are indicative. Final fields live in Zod; this is the product shape.

### `characters[]`

| Field | Rule |
| --- | --- |
| `id` | Stable within the workflow |
| `role` | e.g. host, guest, on-screen demo, voice-only |
| `onScreen` | boolean |
| `wardrobeOrLook` | Optional; inferred unless the creator supplied it in notes |
| `evidenceClass` | `observed` only if grounded in idea/script notes; else `inferred` |

Do not invent named real people from the research snapshot (competing YouTubers) as cast without labeling inferred.

### `storyboardPanels[]`

| Field | Rule |
| --- | --- |
| `id` | Stable |
| `section` | Must match a script / throughline section |
| `visual` | What the viewer sees |
| `onScreenText` | Optional; max length like current brief |
| `evidenceClaimIds` | Subset of the idea package; empty only if `evidenceClass` is `inferred` and limitations explain why |
| `snapshotId` | Exact active snapshot |

No panel may introduce a topic that is not a throughline node (`L-604`).

### `shots[]`

| Field | Rule |
| --- | --- |
| `panelId` | Parent panel |
| `shot` | Action / framing in one sentence |
| `camera` | `a-cam` \| `b-roll` \| `screen` \| `insert` |
| `durationHintSec` | Optional; prefer computed from WPM × words (`L-714`) over model guess; if guessed, `inferred` |
| `broll` | Optional |
| `continuity` | Optional (eyeline, prop in hand, outfit) |
| `evidenceClaimIds` | Same discipline as panels |

### `cameraTree`

Derived view of `shots[]` grouped by `camera`. Not a second generation. If the model returns a tree that disagrees with shots, **shots win**; regenerate or fail validation.

---

## Evidence rules (non-negotiable)

1. Copy the active `snapshotId` onto every Board artifact.  
2. Observed claims need source video IDs already present on the idea package.  
3. On-screen text must not state a `requires_studio` claim as a public fact (`L-606` analogue).  
4. Aggregate inferences (empty `sourceVideoIds`) must carry limitations.  
5. Concept stills are always `inferred` (pixels are not the YouTube snapshot).  
6. Fail the contract on stale snapshot IDs—same as Insights/Ideas/Script today.

---

## UI inventory

| Surface | Behavior |
| --- | --- |
| Package | Keep current publish composer. Brief section grows from a flat shot list to a summary + “Open Board”. |
| `/board` or Package tab | Horizontal storyboard; click panel → shots; camera filter chips. |
| Checks rail | Pass / warn / fail, parallel to throughline checks—not a fifth Research sidebar item. |
| Teleprompter | Unchanged; Board may link a shot to a section for cues. |
| Preview (`L-613`) | Still assemble-only. May use chapter cards + optional panel titles; must not stitch generative clips. |
| Settings | No video keys. Optional: “Generate storyboard stills” Off by default (`L-716`). |
| Export pack | Include `brief/` JSON; human-readable shot list in the existing PDF/pack if present. |

Edit policy: creator can rewrite `visual`, `shot`, `broll`, wardrobe. Regenerating a panel uses the same bounded evidence context as section regeneration on Script Writer. Do not free-form “expand this into a movie.”

---

## Feature flags

| Flag | Default | Effect |
| --- | --- | --- |
| Production Board | On once 3.0 ships (or Off until P1 UI exists; P0 can enrich brief silently) | Generates/stores `brief/` JSON |
| Storyboard stills | **Off** | Calls existing image model; inferred stills |
| ViMax-shaped export | **Off** | Extra folder layout in export pack only |

No flag enables a renderer.

---

## Mapping to older backlog

| Existing ID | v3 relationship |
| --- | --- |
| L-303 Production brief | **Superseded in shape** by L-703; keep the route, extend the schema |
| L-308 / L-501 Brand kit | Board continuity can *consume* brand kit when 1.3 ships; v3 must work without it |
| L-313 / L-505 Clip briefs | L-715 is the Board-based implementation |
| L-304 Thumb critique | L-717 reuses scoring for optional stills |
| L-508 Hermes companion | L-720 is the same pattern for ViMax |
| L-613 Assemble preview | Remains the only in-app video; Board may feed titles/chapters |

---

## Acceptance (product)

A creator who finished Script can open Board and, without a new API product:

1. See who is on camera and what to wear.  
2. See an ordered storyboard that only covers throughline sections.  
3. Filter B-roll vs talking-head vs screen capture.  
4. Export a folder they can film from.  
5. Never be asked for a Veo/Runway key.

If stills are on, they understand the pictures are concept art, not the snapshot and not the finished video.

---

## Tests (required with implementation)

- Zod accept/reject fixtures for characters, panels, shots, camera tree consistency  
- Stale `snapshotId` rejected  
- Unknown `evidenceClaimIds` rejected  
- Camera tree disagrees with shots → fail  
- Throughline subset: extra topic in a panel → fail  
- `requires_studio` in `onScreenText` treated as spoken fact → warn or fail  
- No tests call live YouTube, Gemini, or any video API  

---

## Attribution

ViMax (HKUDS) is MIT-licensed. Cutroom remains Apache 2.0. If implementation copies more than paraphrased stage names, add copyright lines to `NOTICE` and do not relicense ViMax files as Apache without retaining MIT notices. Prefer original Cutroom contracts over copying Python modules.
