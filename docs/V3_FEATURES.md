# Cutroom v3 Feature Inventory — Board + chosen render

Canonical list of **planned** 3.0 / 3.1 capabilities. Shipped product remains [FEATURES.md](FEATURES.md). Architecture and non-goals: [V3_ROADMAP.md](V3_ROADMAP.md). Tracker: [TRACKER.md](../TRACKER.md) `L-701+`.

**As of:** 2026-08-29  
**Status:** Shipped (3.0 Board + shoot + slides; 3.1 cinematic Shorts via stills concat + quote-before-run). Veo-class clip APIs are not called. Optional Board stills and ViMax companion remain Off.

Inspiration: [HKUDS/ViMax](https://github.com/HKUDS/ViMax) Script2Video **planning** for all modes; **render stages** (frame prompts → clips → concat) for **cinematic only**. Runtime, Idea2Video, Novel2Video, AutoCameo, and YouTube upload are out of scope.

---

## Workflow spine (v3 additions)

| Step | Capability | Notes | Tracker |
| --- | --- | --- | --- |
| Package | Enriched production brief | Characters, storyboard panels, camera on shots | L-703 |
| Board | Storyboard strip | One panel per throughline section | L-709 |
| Board | Shot list | Camera, duration hint, b-roll, on-screen text, continuity | L-703, L-710 |
| Board | Camera tree | `a-cam` / `b-roll` / `screen` / `insert` | L-710 |
| Board | Talent / continuity | Wardrobe, props, who is on camera | L-711 |
| Board | Evidence checks | Orphan shots; invented topics; Studio-as-fact on screen | L-713 |
| Board | Rebuild on script edit | Same rule as throughline | L-705 |
| Package | Clip briefs from shot groups | Shorts packages from long-form board | L-715 |
| Board | Concept stills (optional) | Existing image model; inferred; Off | L-716, L-717 |
| Render | Mode picker | `shoot` \| `slides` \| `cinematic` | L-721 |
| Render | Shoot myself | Export pack + board; user films | L-721 |
| Render | Slides + voice | Assemble timeline + TTS/clone → `render.mp4` | L-722, L-723 |
| Render | Cinematic (3.1) | Script2Video stages in TS; Veo-class Shorts | L-724, L-725 |
| Render | Shared voice profile | Same consented clone/TTS for slides and cinematic | L-726 |
| Export | `brief/` + `render.mp4` | Inferred watch file when generated | L-706, L-728 |
| Export | ViMax-shaped folder | Optional, flag Off; do not spawn ViMax | L-718, L-720 |

Research → Insights → Ideas → Script → Thumbnail → Package stay unchanged. Board does not replace the evidence ledger, throughline, or teleprompter. `/video` gains engines; it does not publish.

---

## Render modes

| Mode | Watch file | Keys | ViMax overlap |
| --- | --- | --- | --- |
| **Shoot myself** | None required | None new | Planning DAG only |
| **Slides + voice** | `render.mp4` | TTS and/or clone | Almost none (FFmpeg + voice) |
| **Cinematic** | `render.mp4` | Video generator (Veo-class) + same voice | Script2Video from storyboard onward |
| Assemble (v0.2) | `preview.mp4` | None | Packaging animatic; keep as no-key template |

Personal talking-head **is** shoot-myself. Do not substitute AutoCameo or lip-sync.

---

## What ships vs what does not

### In scope

- Board JSON from the selected script and idea package  
- Three-way render choice after Board  
- Slides+voice on the existing assemble timeline  
- Cinematic Shorts implemented **in TypeScript** (not Python)  
- Consented voice clone or TTS; shared profile  
- Optional companion folder export  

### Out of scope

| Item | Stance |
| --- | --- |
| `agent_runtime/`, ViMax TUI/Web UI | Do not port |
| Idea2Video / Novel2Video | No film from a vague prompt |
| AutoCameo / snapshot voice clone | Rights and product: personal = shoot |
| OpenCut / timeline editor | FFmpeg concat only |
| YouTube `videos.insert` | User uploads in Studio |
| Unattended render farm | Quote + confirm per run |

---

## Contract sketch (P0)

Names are indicative. Final fields live in Zod.

### `characters[]`

| Field | Rule |
| --- | --- |
| `id` | Stable within the workflow |
| `role` | host, guest, on-screen demo, voice-only |
| `onScreen` | boolean (`false` for slides/cinematic host VO) |
| `wardrobeOrLook` | Optional; inferred unless creator notes |
| `evidenceClass` | `observed` only if grounded in idea/script notes |

Do not invent named people from the research snapshot as cast without labeling inferred.

### `storyboardPanels[]` / `shots[]` / `cameraTree`

Unchanged from the planning sketch: panels subset throughline; shots carry `camera` and `durationHintSec`; camera tree is **derived** from shots (shots win on disagreement).

### `renderRequest`

| Field | Rule |
| --- | --- |
| `engine` | `assemble` \| `shoot` \| `slides` \| `cinematic` |
| `snapshotId` | Must match Board and script |
| `voiceProfileId` | Optional; required for slides/cinematic if not using default TTS |
| `maxShots` | Cinematic default 5 |

### `renderResult`

| Field | Rule |
| --- | --- |
| `engine` | Echo |
| `path` / `relativePath` | `render.mp4` or omitted for `shoot` |
| `durationSec` | When a file exists |
| `evidenceClass` | Always `inferred` for generated pixels/audio |

---

## Evidence rules (non-negotiable)

1. Copy the active `snapshotId` onto Board and render requests.  
2. Observed claims need source video IDs already on the idea package.  
3. On-screen text must not state a `requires_studio` claim as a public fact.  
4. Concept stills, Veo clips, TTS, and clones are always `inferred`.  
5. Fail stale snapshot IDs and unknown `evidenceClaimIds`.  
6. Voice: only samples the user uploaded with consent; never from YouTube search results.

---

## UI inventory

| Surface | Behavior |
| --- | --- |
| Package | Brief summary + “Open Board”. |
| `/board` | Storyboard strip; camera filters; checks rail. |
| Teleprompter | Unchanged; primary for **shoot**. |
| `/video` | Engine picker. Assemble remains. Slides/cinematic disabled until keys + Board pass. |
| Settings | Optional TTS/clone key, optional video-generator key, clone-sample upload. **No** YouTube upload client. Loopback-only. |
| Review | Play `render.mp4`; download; include in export pack. No privacy/publish controls. |
| Export pack | `brief/` JSON; `render.mp4` when present; shot list. |

Edit policy: creator can rewrite `visual`, `shot`, `broll`, wardrobe. Regenerating a panel uses the same bounded evidence context as Script section regen. Do not free-form “expand this into a movie” (that would be Idea2Video).

---

## Feature flags / Settings defaults

| Flag | Default | Effect |
| --- | --- | --- |
| Production Board | On once 3.0 ships | `brief/` JSON |
| Storyboard stills | **Off** | Image model stills |
| Slides+voice | **Off** until TTS or clone configured | `render.mp4` |
| Cinematic | **Off** until video key + 3.1 | Veo-class Shorts |
| ViMax-shaped export | **Off** | Folder layout only |
| YouTube upload | **Absent** | Not a flag — not in product |

---

## Mapping to older backlog

| Existing ID | v3 relationship |
| --- | --- |
| L-303 Production brief | Schema superseded by L-703 |
| L-308 / L-501 Brand kit | Continuity can consume it later; v3 works without it |
| L-313 / L-505 Clip briefs | L-715 |
| L-304 Thumb critique | L-717 stills; cinematic best-of-k |
| L-508 Hermes companion | L-720 ViMax **folder** companion (not runtime) |
| L-613 Assemble preview | Kept as `engine: assemble`; slides extends it with audio |
| L-314 Studio OAuth | Read-only metrics only; **not** upload |

---

## External ViMax handoff (optional, default Off)

Cutroom Settings may hold TTS/clone/video keys. It never stores `VIMAX_*` sidecar env and never spawns ViMax.

If you run [HKUDS/ViMax](https://github.com/HKUDS/ViMax) yourself, copy `brief/` JSON from the library or export pack. The companion folder flag (`vimaxCompanionEnabled`) defaults **Off** and is not product truth.

---

## Acceptance (product)

A creator who finished Script can:

1. Open Board and see who is on camera, wardrobe, and an ordered storyboard that only covers throughline sections.  
2. Choose **shoot myself** and leave with a filmable pack (no new key).  
3. Choose **slides + voice**, hear their clone or TTS on an assembled explainer, and get `render.mp4`.  
4. Choose **cinematic**, confirm quoted cost, and get a short inferred cut using the same Board and voice (stills concat until a Veo-class generator is wired).  
5. Never be asked to upload to YouTube from Cutroom.  
6. Never have another creator’s voice cloned from the research grid.

---

## Tests (required with implementation)

- Zod accept/reject for characters, panels, shots, camera tree, `renderRequest` engines  
- Stale `snapshotId` / unknown claims rejected  
- Camera tree disagrees with shots → fail  
- Throughline subset: extra topic → fail  
- `requires_studio` in `onScreenText` as spoken fact → warn or fail  
- `shoot` produces no Veo/TTS calls in mocked render  
- `slides` mux path does not call the video generator  
- Voice profile rejects missing consent metadata  
- No tests call live YouTube, Gemini, Veo, or clone APIs  

---

## Attribution

ViMax (HKUDS) is MIT-licensed. Cutroom remains Apache 2.0. If implementation copies more than paraphrased stage names, add copyright lines to `NOTICE`. Prefer original Cutroom contracts over copying Python modules.
