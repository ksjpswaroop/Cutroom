# Cutroom v3 Roadmap — Production Board

**Version:** 3.0  
**Theme:** Evidence-grounded production planning (storyboard, shots, camera tree) without becoming a video generator.  
**Status:** Planned. Do not start until [v0.2](../TRACKER.md#phase-6--cutroom-v02) throughline (`L-604`–`L-607`) is shipped.  
**Day-to-day IDs:** [TRACKER.md](../TRACKER.md) Phase 7 (`L-701+`).  
**Feature inventory:** [V3_FEATURES.md](V3_FEATURES.md).

This phase borrows **planning artifacts** from [HKUDS/ViMax](https://github.com/HKUDS/ViMax) (MIT). It does **not** vendor ViMax’s Python agent runtime, Veo adapters, or Idea2Video / Novel2Video pipelines.

Same rule as [HERMES_DECISION.md](HERMES_DECISION.md): adjacent tools may sit at the edges; product truth stays in Express + Zod + the YouTube snapshot.

---

## 1. Why v3 exists

After v0.2, Cutroom can research, write, thumbnail, and package. The production brief is still a thin list: `{section, shot, broll?, onScreenText?}`.

ViMax’s useful half is the **Script2Video text DAG**:

```text
input_script
  → characters
  → storyboard
  → shot_decomposition
  → camera_tree
  →  ✂  stop here
  → frame_prompts → keyframes → video_clips → final_video   ← never in Cutroom
```

Creators already film themselves. They need a **board they can shoot**, bound to the same promise, claims, and source video IDs as Script Writer—not a prompt-to-film farm.

v3 is the production-planning desk. It is not Descript, Opus, CapCut, OverseerOS Auto Edit, or ViMax Video Generator.

---

## 2. Decision record (ViMax)

| Question | Decision |
| --- | --- |
| Vendor `HKUDS/ViMax` as a submodule / sidecar? | **No.** Python agent loop, video APIs, and bundle cost fail the same tests as Hermes. |
| Copy planning *schemas* and stage names? | **Yes.** Re-express them as Zod contracts in TypeScript. |
| Add Veo / Runway / video generator keys to Settings? | **No.** v0.2 already forbids this. Assemble-only preview (`L-613`) remains the only in-app video. |
| Idea2Video / Novel2Video? | **No.** Vague-idea → film bypasses the research snapshot. Cutroom already requires a selected idea before Script. |
| Export a folder a user can hand to ViMax? | **Optional P2 companion**, off by default, never product truth. |
| License | ViMax is MIT. If any prompt text or schema is more than a paraphrase, keep copyright notices in `NOTICE`. Cutroom stays Apache 2.0. |

**One-liner:** ViMax is a film crew; Cutroom is a creator desk. Steal the storyboard, not the renderer.

---

## 3. Prerequisites (do not skip)

| Version | Must already exist | Why v3 needs it |
| --- | --- | --- |
| **0.2** | Throughline DAG (`L-604`–`L-607`) | Board nodes are a **layout of the same graph**, not a second model. |
| **0.2** | Pace chapters (`L-612`) | Shot duration hints reuse WPM × section words. |
| **0.2** | Library folder + export pack | `brief/` artifacts live next to research/script/thumbnail/package. |
| **0.2** | Assemble-only preview | v3 must not replace this with generative clips. |
| **1.2** (nice) | Provider interface (`L-406`) | Board JSON can use the same schema-repair path as Package. |

Schema enrichment (`L-703+`) may land as a **1.x minor** if Package work happens early. The **3.0 exit** is still the Board surface + optional companion export.

---

## 4. Workflow after v3

```
Research (+ captions, comments, quota)
  → Insights / Ideas
  → Script + Throughline graph / mind map
  → Thumbnail
  → Package (publish copy + production brief)
  → Board (characters, storyboard, shots, camera tree)     ← new, optional to open
  → Preview render (assemble only, Settings Off)
```

Board is **not** a research-style sidebar item. It lives after Package, the way throughline lives on Script Writer.

**Confirmation gate (from ViMax, adapted):** do not generate Board artifacts from a topic or idea package alone. Require:

1. A selected grounded idea  
2. A generated (or user-edited) script  
3. The active snapshot ID matching Script’s evidence context  

Conversational “what if we shot it this way?” in chat is not planning. Planning writes `brief/*.json` only after those three exist.

**Text-planning complete gate:** after characters, storyboard, shots, and camera tree exist, stop. Ask before assemble preview. Never call a video generator.

---

## 5. Architecture

Unchanged sidecar:

```
Tauri 2 shell  →  WebView loads http://127.0.0.1:{port}
       │
       └─ spawns Node sidecar (Express)
              ├─ YouTube Data API v3
              ├─ Gemini (or later OpenRouter/Ollama) text + image
              └─ secrets in app-data / keychain
```

New portable boundaries (add to [PORTING.md](../PORTING.md) when implemented):

| Layer | Files |
| --- | --- |
| Contracts | `server/package-contract.ts` (extended brief) or `server/board-contract.ts` + `shared/board-contracts.ts` |
| Generator | `server/gemini.ts` → `generateProductionBoard()` (JSON + one repair pass, same as brief today) |
| Routes | `POST /api/package/production-board` (or extend `POST /api/package/production-brief`) |
| Client | Board strip on Package, or `/board` after Package; `workflow-context.tsx` continuity |
| Library | `{project}/brief/characters.json`, `storyboard.json`, `shots.json`, `camera-tree.json` |

**Authority:** throughline nodes (`L-604`) are source of truth for *what is claimed*. Board artifacts are source of truth for *how it is shot*. Sessions / IndexedDB remain an index, not a second copy of claims.

No Python runtime. No `vimax_narrative_planning` / `vimax_render_video` tools. No second sidecar.

---

## 6. ViMax → Cutroom mapping

| ViMax artifact | Cutroom v3 | Bound to |
| --- | --- | --- |
| `script2video/script.txt` | Existing script (already stored) | Snapshot + idea package |
| `characters.json` | On-screen talent / wardrobe / recurring props | Script sections; no invented people presented as research |
| `storyboard.json` | Ordered panels: section, visual, on-screen text | `evidenceClaimIds`; subset of throughline |
| Shot decomposition | Shots with camera, duration hint, b-roll, continuity | Same claims; duration from `L-612` math when possible |
| Camera tree | `a-cam` \| `b-roll` \| `screen` \| `insert` | Honest filming, not multi-camera AI film |
| Frame prompts / keyframes | **Out.** Optional later: Gemini **concept stills**, labeled inferred, Settings Off | Existing image model only |
| Video clips / final_video | **Out.** Assemble preview only (`L-613`) | No new API key |
| Idea2Video project_brief | **Out.** Cutroom idea package already exists | Evidence claims |
| Novel compressor / RAG over novels | **Out.** Corpus is the YouTube snapshot + captions/comments | `L-608` / `L-609` |
| VLM best-of-k frame picker | Pattern only: generate N thumbnail/still candidates, score with existing critique | `L-304` extended |
| Agent TUI / session loop | Pattern only: resume last Board step from workflow history | Existing IndexedDB / library |

---

## 7. Phases inside 3.0

### P0 — Contracts (may ship as 1.x)

Extend the production brief without a new navigation item. Package already shows shot list; v3 makes that list structurally honest.

- Characters, storyboard panels, camera on each shot  
- Every panel/shot cites `evidenceClaimIds` or is explicitly `inferred`  
- Rebuild after script edit (same discipline as `L-607`)  
- Write `brief/` JSON into the library folder  
- Contract tests only; no live provider calls  

### P1 — Board surface (3.0 exit, core)

- Storyboard strip the creator can scan before filming  
- Camera tree filter (A-cam vs B-roll vs screen vs insert)  
- Continuity notes from the character list  
- Checks: orphan shots, shots that invent topics, `requires_studio` copy on screen treated as fact  
- Pass / warn / fail before Preview  

### P2 — Duration, clips, optional stills

- Duration hints from teleprompter WPM × section words (`L-612`)  
- Group shots into Shorts/clip briefs (slice of `L-313` / `L-505`)  
- Optional storyboard stills via **existing** Gemini image model; Settings default **Off**; each still `evidenceClass: inferred` (concept art, not footage)  
- Best-of-k stills reuse thumbnail critique, not ViMax selector Python  

### P3 — Companion export (optional)

- Export pack includes a `script2video/`-shaped folder: `script.txt` + planning JSON  
- Document how to run ViMax (or any other renderer) **outside** Cutroom  
- Feature flag **Off**; no `VIMAX_*` or video-generator keys in Settings  
- Same companion rule as Hermes (`L-508`): never become Insights/Ideas/Script/Package/Board truth  

---

## 8. Standing boundaries

- Preserve snapshot IDs and evidence contracts through Research → Ideas → Script → Package → **Board**.  
- Board must not invent throughline nodes, source video IDs, search volume, or Studio metrics.  
- Never return API keys to the WebView.  
- No live provider calls in automated tests.  
- Do not reintroduce Replit-managed video generation, login gates, or a Python agent sidecar.  
- Do not bind `0.0.0.0` without a separate auth design.  

## 9. Explicit non-goals for v3

- In-app timeline editor; CapCut / Descript clone  
- Viral Shorts auto-render farm; talking-head / lip-sync  
- Veo, Runway, Kling, or any generative B-roll pipeline  
- “Prompt → full video” (Idea2Video)  
- Novel-to-episode adaptation  
- Character-portrait consistency banks for AI-cast films  
- Replacing Express with ViMax `agent_runtime` or Hermes  
- Auto-upload to YouTube  

Assemble-only preview from v0.2 stays the video exception: local template render, no new key.

---

## 10. Suggested library layout

```text
{library}/{topic}/
  research/          # snapshot (existing)
  script/            # script + throughline (existing / v0.2)
  thumbnail/         # (existing)
  package/           # publish package (existing)
  brief/             # v3
    characters.json
    storyboard.json
    shots.json
    camera-tree.json
  preview.mp4        # v0.2 assemble, optional
```

IndexedDB mirrors these for fast resume. Uploaded reference images stay unretained (existing privacy rule). Optional concept stills, if enabled, are **generated** outputs stored under `brief/stills/` and labeled inferred.

---

## 11. Implementation stance

1. Keep Express as system of record.  
2. One JSON generate + one schema-repair pass (same as `generateProductionBrief` today).  
3. If Board JSON cites a claim ID not in the active idea package, fail the contract—do not silently drop.  
4. If a still or on-screen line would speak a `requires_studio` claim as fact, fail or warn (`L-606` analogue).  
5. Experiments that shell out to ViMax belong in `docs/experiments/vimax-companion.md` with the flag off.

---

## 12. Exit criteria for 3.0

- [ ] Production board JSON validated in CI fixtures (`L-707`)  
- [ ] Board UI after Package; throughline subset checks pass (`L-709`–`L-713`)  
- [ ] Library `brief/` files round-trip with the export pack (`L-706`)  
- [ ] Settings has **no** video-generator key fields  
- [ ] README / FEATURES inventory lists Board as a workflow step  
- [ ] Smoke: Research → Script (throughline) → Thumbnail → Package → Board → Preview (assemble, if on)  

P2 stills and P3 ViMax folder export may slip to 3.1 without blocking 3.0 if P0+P1 are solid.
