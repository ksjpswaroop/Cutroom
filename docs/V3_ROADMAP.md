# Cutroom v3 Roadmap — Board + chosen render

**Version:** 3.0 (Board + shoot + slides+voice) · **3.1** (cinematic Shorts)  
**Theme:** One evidence-grounded production board. The creator picks **shoot myself**, **slides + voice**, or **cinematic**. Cutroom does **not** upload to YouTube.  
**Status:** Planned. Do not start until [v0.2](../TRACKER.md#phase-6--cutroom-v02) throughline (`L-604`–`L-607`) is shipped.  
**Day-to-day IDs:** [TRACKER.md](../TRACKER.md) Phase 7 (`L-701+`).  
**Feature inventory:** [V3_FEATURES.md](V3_FEATURES.md).

This phase borrows **Script2Video planning (and, for cinematic only, render stages)** from [HKUDS/ViMax](https://github.com/HKUDS/ViMax) (MIT). It does **not** vendor ViMax’s Python `agent_runtime`, TUI/Web UI, Idea2Video, or Novel2Video.

Same rule as [HERMES_DECISION.md](HERMES_DECISION.md): product truth stays in Express + Zod + the YouTube snapshot. Renderers are engines behind `/video`, not a second sidecar.

---

## 1. Why v3 exists

After v0.2, Cutroom can research, write, thumbnail, and package. Assemble preview is a packaging animatic (title card, Ken Burns, chapters, captions)—not a watchable episode and not a film crew.

Creators now want a **choice after Package**:

| Mode | Intent |
| --- | --- |
| **Shoot myself** | Personal / talking-head. Take the package + board and film. No generative video. |
| **Slides + voice** | Faceless explainer: cards + Ken Burns + captions + TTS or **consented voice clone**. |
| **Cinematic** | Multi-shot generated clips (Veo-class), continuity, concat + the same voice profile. Shorts-first. |

One Board feeds all three. ViMax is the blueprint for **cinematic Script2Video**, not for slides and not for personal shoot.

---

## 2. Decision record (ViMax, revised)

Generation is in-scope. **YouTube publish is not.** Python sidecar is still not.

| Question | Decision |
| --- | --- |
| Vendor `HKUDS/ViMax` as a submodule / sidecar? | **No.** Re-express stages in TypeScript. Same bundle/trust tests as Hermes. |
| Copy planning schemas (characters, storyboard, shots, camera tree)? | **Yes.** Zod contracts; Board is shared. |
| Continue the DAG into frame prompts / keyframes / clips? | **Yes, cinematic mode only.** Implement in Cutroom `server/`, not `pipelines/script2video_pipeline.py`. |
| Idea2Video / Novel2Video? | **No.** Vague-idea → film bypasses the snapshot. Input is always the selected idea + script. |
| Add video / TTS / clone keys to Settings? | **Yes**, loopback-only, never returned. Optional; cinematic and clone stay Off until configured. |
| `VIMAX_*` env trio / spawn ViMax? | **No.** Optional companion **export** of a Script2Video-shaped folder remains flag Off. |
| Voice cloning | **Creator’s consented sample only** (ElevenLabs-class or Gemini TTS). Never clone faces/voices from the research snapshot. ViMax AutoCameo is not the personal-video path. |
| YouTube `videos.insert` / auto-upload? | **No.** Review = play + download + export pack. |
| OpenCut / timeline editor? | **No.** FFmpeg concat is not an NLE. |
| License | ViMax is MIT. If prompt text or schemas are more than a paraphrase, keep copyright in `NOTICE`. Cutroom stays Apache 2.0. |

**One-liner:** ViMax is the cinematic Script2Video blueprint. Slides+voice is Cutroom FFmpeg. Personal is the export pack. One Board, three renders, no Python sidecar, no publish.

---

## 3. Prerequisites (do not skip)

| Version | Must already exist | Why v3 needs it |
| --- | --- | --- |
| **0.2** | Throughline DAG (`L-604`–`L-607`) | Board nodes are a **layout of the same graph**, not a second model. |
| **0.2** | Pace chapters (`L-612`) | Shot/slide duration from WPM × section words. |
| **0.2** | Library folder + export pack | `brief/` and `render.mp4` live next to research/script/thumbnail/package. |
| **0.2** | Assemble preview (`L-613`) | Skeleton for **slides** (add audio). Cinematic does not replace it. |
| **1.2** (nice) | Provider interface (`L-406`) | Board JSON and render adapters share schema-repair / timeouts. |

Schema enrichment (`L-703+`) may land as a **1.x minor**. **3.0 exit:** Board UI + mode picker + shoot export + slides+voice. **3.1 exit:** cinematic Shorts (Veo-class, quote-before-run).

---

## 4. Workflow after v3

```
Research (+ captions, comments, quota)
  → Insights / Ideas
  → Script + Throughline graph / mind map
  → Thumbnail
  → Package (publish copy + production brief)
  → Board (characters, storyboard, shots, camera tree)
  → Render (user picks one engine)
        ├─ shoot      → export pack / teleprompter; no mp4 required
        ├─ slides     → FFmpeg cards + Ken Burns + voice → render.mp4
        └─ cinematic  → stills + Veo clips + concat + voice → render.mp4
  → Review (play / download). No upload.
```

Board is **not** a research-style sidebar item. It lives after Package. Render stays on `/video` (extend assemble; do not add a sixth Research-style nav item).

**Confirmation gate (from ViMax, adapted):** do not generate Board artifacts from a topic or idea package alone. Require:

1. A selected grounded idea  
2. A generated (or user-edited) script  
3. The active snapshot ID matching Script’s evidence context  

**Plan-complete gate:** after characters, storyboard, shots, and camera tree exist, **ask which render mode**. Do not start Veo until the user picks **cinematic** and confirms cost. Do not start TTS/clone until they pick **slides** or **cinematic**.

---

## 5. Architecture

Still one sidecar:

```
Tauri 2 shell  →  WebView loads http://127.0.0.1:{port}
       │
       └─ spawns Node sidecar (Express)
              ├─ YouTube Data API v3
              ├─ Gemini text + image (+ optional Veo / TTS)
              ├─ optional ElevenLabs-class clone (consented sample)
              ├─ FFmpeg assemble / concat
              └─ secrets in app-data / keychain
```

New portable boundaries (add to [PORTING.md](../PORTING.md) when implemented):

| Layer | Files |
| --- | --- |
| Contracts | `server/board-contract.ts` + `shared/board-contracts.ts`; `server/render-contract.ts` (`shoot` \| `slides` \| `cinematic`) |
| Board generate | `generateProductionBoard()` — JSON + one repair pass |
| Render | Extend `server/assemble-preview.ts` for slides+voice; `server/cinematic-render.ts` for Script2Video stages |
| Routes | `POST /api/package/production-board`; `POST /api/preview/render` (engine in body). Keep `POST /api/preview/assemble` as the no-voice template |
| Client | Board after Package; `/video` mode picker; `workflow-context.tsx` |
| Library | `{project}/brief/*.json`; `{project}/render.mp4` (inferred); optional `{project}/cinematic/` clip cache |

**Authority:** throughline (`L-604`) is source of truth for *what is claimed*. Board is source of truth for *how it is shot or shown*. Render outputs are always `evidenceClass: inferred` (pixels are not the snapshot).

No Python runtime. No `vimax_narrative_planning` / `vimax_render_video`. No second sidecar. No OpenCut.

---

## 6. ViMax → Cutroom mapping

Script2Video DAG:

```text
input_script
  → characters → storyboard → shot_decomposition → camera_tree
  →  ✂  shoot / slides stop here (planning only)
  → frame_prompts → keyframes → video_clips → concat     ← cinematic only
```

| ViMax artifact | Cutroom | Modes |
| --- | --- | --- |
| `script.txt` | Existing script | All |
| `characters.json` | Talent / wardrobe / voice-only host | All |
| `storyboard.json` | Panels bound to `evidenceClaimIds` | All |
| Shot decomposition | Camera, duration, b-roll, continuity | All |
| Camera tree | `a-cam` \| `b-roll` \| `screen` \| `insert` | Shoot uses all; slides skip a-cam or still; cinematic prefers b-roll/screen |
| Frame prompts / keyframes | Cinematic stills + Veo prompts | Cinematic |
| Video clips / final_video | Concat into `render.mp4` | Cinematic (slides use FFmpeg cards, not Veo) |
| Audio/video binding | Shared **voice profile** (TTS or clone) muxed by FFmpeg | Slides + cinematic |
| AutoCameo / photo-as-cast | **Out** for v3 personal mode (user shoots) | — |
| Idea2Video / Novel2Video | **Out** | — |
| VLM best-of-k | Pattern for stills (`L-304` / `L-717`) | Cinematic / optional Board stills |
| Agent TUI | Resume last Board/Render step from workflow history | All |

---

## 7. How one Board drives three engines

| Board field | Shoot myself | Slides + voice | Cinematic |
| --- | --- | --- | --- |
| Storyboard panel | Shot on set | Slide / chapter title | Image + Veo prompt |
| `camera: a-cam` | Creator appears | Skip or host still | Usually skip (faceless default) |
| `camera: b-roll` | What to film | Ken Burns / card art | Generated clip |
| Duration hint | Teleprompter | Slide length = TTS | Clip length (4–8s typical) |
| Voice | Live on camera | Clone or TTS | Same voice under clips |

Shared voice profile: one consented sample (or TTS voice id) used by slides and cinematic so the creator can try both. Shoot ignores clone unless they want a scratch VO.

---

## 8. Phases inside 3.0 / 3.1

### P0 — Contracts (may ship as 1.x)

- Characters, storyboard panels, camera on each shot  
- Every panel/shot cites `evidenceClaimIds` or explicit `inferred`  
- Rebuild after script edit (`L-607` discipline)  
- Write `brief/` JSON into the library folder  
- Contract tests only; no live provider calls  

### P1 — Board surface (required for 3.0)

- Storyboard strip; camera tree filter; continuity rail  
- Checks: orphan shots, invented topics, `requires_studio` as on-screen fact  
- Pass / warn / fail before Render  

### P2 — Duration, clip briefs, optional stills

- `durationHintSec` from WPM × words (`L-612`)  
- Group shots into Shorts/clip briefs (`L-313` slice)  
- Optional concept stills on existing image model; inferred; Settings Off  

### P3 — Render modes (3.0 = shoot + slides; 3.1 = cinematic)

- Mode picker on `/video`: `shoot` \| `slides` \| `cinematic`  
- **Shoot:** pack already exports; Board PDF/shot list sufficient  
- **Slides:** assemble timeline + TTS/clone mux → `render.mp4`  
- **Cinematic:** TS Script2Video stages; Veo-class; default **1 scene / 3–5 shots**; quote cost; clip cap  
- Generated mp4 labeled inferred; included in export pack  
- Settings: optional TTS/clone key, optional video key; no `VIMAX_*`  

### P4 — Companion export (optional, 3.1 ok)

- Flag Off: extra `script2video/`-shaped tree for people who run ViMax themselves  
- Never product truth; never spawn ViMax  

---

## 9. Standing boundaries

- Preserve snapshot IDs through Research → Ideas → Script → Package → Board → **Render**.  
- Board must not invent throughline nodes, source video IDs, search volume, or Studio metrics.  
- Render pixels and cloned audio are **inferred**, not observed snapshot evidence.  
- Never return API keys to the WebView.  
- No live provider calls in automated tests.  
- Do not reintroduce Replit-managed video generation, login gates, a Python agent sidecar, or YouTube upload.  
- Do not bind `0.0.0.0` without a separate auth design.  
- Voice clone = user-uploaded sample + explicit consent in Settings. No scraping YouTube audio.

## 10. Explicit non-goals

- In-app timeline editor; CapCut / Descript / OpenCut sidecar  
- Viral Shorts auto-render **farm**; unattended batch to public YouTube  
- Idea2Video / Novel2Video / “prompt → full video”  
- AutoCameo as a substitute for shooting yourself  
- Cloning third-party voices or likenesses from the research grid  
- `videos.insert` / Studio auto-upload  
- Vendoring ViMax Python or replacing Express with Hermes  
- Long-form cinematic (10+ minute Veo episodes) in 3.1 — Shorts-first only  

v0.2 assemble-only preview remains the **no-key** template (`engine: assemble`). Slides and cinematic are opt-in engines on the same page.

---

## 11. Suggested library layout

```text
{library}/{topic}/
  research/
  script/
  thumbnail/
  package/
  brief/
    characters.json
    storyboard.json
    shots.json
    camera-tree.json
    stills/                 # optional inferred concept art
  preview.mp4               # v0.2 assemble, optional
  render.mp4                # slides or cinematic watch file
  cinematic/                # 3.1 clip cache, optional
    prompts/
    clips/
  voice/                    # clone consent metadata only; raw sample not required long-term
```

IndexedDB mirrors JSON for resume. Uploaded thumbnail **references** stay unretained (existing rule). Voice clone samples: store hashed/path in app-data with owner-only perms; never send to Insights/Ideas.

---

## 12. Implementation stance

1. Keep Express as system of record.  
2. Board: one JSON generate + one schema-repair pass.  
3. Fail the contract on unknown claim IDs or stale `snapshotId`.  
4. Fail or warn if on-screen text states a `requires_studio` claim as fact.  
5. Cinematic: quote estimated clips × provider cost; require confirm; cap shots.  
6. Slides: reuse `buildAssembleTimeline`; add audio track; do not call Veo.  
7. Experiments that shell out to ViMax: `docs/experiments/vimax-companion.md`, flag Off.

---

## 13. Exit criteria

### 3.0

- [x] Production board JSON validated in CI (`L-707`)  
- [x] Board UI; throughline subset checks (`L-709`–`L-713`)  
- [x] Mode picker: shoot / slides / cinematic (cinematic may be disabled until 3.1)  
- [x] Slides+voice writes `render.mp4`; shoot uses export pack only  
- [x] Voice: consented clone or TTS; no snapshot cloning  
- [x] Settings may hold TTS/clone keys; still **no** YouTube upload fields  
- [x] Smoke: Research → Script → Thumbnail → Package → Board → Render (shoot or slides)  

### 3.1

- [x] Cinematic Shorts path in TypeScript (stills → clips → concat)  
- [x] Quote-before-run; default 3–5 shots  
- [x] `render.mp4` in export pack; inferred label  
- [x] Optional ViMax-shaped folder export, flag Off  

Cinematic concat uses Board stills/Ken Burns rather than a live Veo clip API. P2 stills generation remains Off.

P2 stills may slip without blocking 3.0 if P0+P1+slides are solid.
