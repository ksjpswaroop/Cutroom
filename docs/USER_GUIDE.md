# Cutroom user guide

Step-by-step walkthrough of the local Research → Package → Board → Render desk. Screenshots are from the signed desktop app on this machine. Keys stay on the Mac — see [guides/credentials.md](guides/credentials.md). Timed presenter script: [guides/30-minute-demo.md](guides/30-minute-demo.md).

**Build:** `Cutroom.app` + `Cutroom_2.0.0_aarch64.dmg` under `src-tauri/target/release/bundle/`. Developer ID signed; notarization optional.

**Screenshots (2026-11-01):** Taken against the signed app’s loopback sidecar (`127.0.0.1:61581`) with YouTube + Gemini already Configured. Computer Use launched Cutroom.app; Screen Recording was not granted, so the illustrated steps used the same sidecar in the browser automation tab.

**Never:** paste API keys into this doc, confirm a paid cinematic quote for screenshots, run Slides + voice over an existing cinematic `render.mp4`, or upload to YouTube (the product has no upload).

---

## 1. Launch

### Desktop app (what the screenshots show)

1. Open `src-tauri/target/release/bundle/macos/Cutroom.app`, or install from the DMG.
2. The sidecar binds to loopback and loads the UI in the WebView.
3. If the first-run banner asks for keys or a library folder, open **Settings** and complete those, or dismiss and return later.

### From source (same UI, browser tab)

```bash
npm install
npm run dev
```

The dev server binds `127.0.0.1:5000`. Set `PORT` to move it — `PORT=5178 npm run dev` — then open `http://localhost:<port>`. Verified on this Mac 2026-11-13 under Node v26.10.0: every route below (`/`, `/settings`, `/board`, `/video`, `/calendar`) loads, and a restored workflow renders board, shots and an existing `render.mp4` without spending YouTube quota.

Routes map one-to-one to the sidebar: `/` Research · `/script` Script Writer · `/thumbnail` Thumbnail Creator · `/package` Publish Package · `/board` Board · `/video` Render · `/calendar` Calendar · `/settings` Settings. `/ideas` needs a selected snapshot and sends you back to Research without one.

---

## 2. Settings → API

1. Open **Settings**. Four tabs: **Library**, **API**, **Brand**, **Desktop**. A **Local connections** link sits above the title.
2. On **API**, YouTube and Gemini show **Configured** when keys are already on this Mac.
3. Replacement fields never echo the saved secret. The banner states where secrets live — OS keychain on desktop, otherwise the server's git-ignored `.env` with owner-only permissions.
4. The header badge names the **active** provider, not a fixed default: it reads `Ollama (local)` when the local model is selected, and carries a cloud warning when prompts would leave the machine.
5. On **Library**, set an absolute folder for topic-arranged workflow storage, or **Use app data instead**. Only new workflows move; existing topic folders stay put.

![Settings API — Configured](demos/01-settings-api-configured.png)

Optional: Library folder, brand kit, Assemble / storyboard stills / ViMax / Hermes toggles (all default **Off**). Details: [guides/settings-and-local-models.md](guides/settings-and-local-models.md).

---

## 3. Research

1. Open **Research**.
2. Enter a topic (optional filters: upload date, duration, sort, competitor `channelId`).
3. Click **Search**. Cutroom requests up to 50 public videos and stamps a `snapshotId`.
4. Read overview, charts, coverage, and the source grid. Missing stats stay blank.
5. Watch the quota meter (search costs units).

![Research search](demos/02-research-search.png)

![Research results](demos/03-research-results.png)

While Insights/Ideas run, export buttons may say **Insights…** / **Ideas…**. When clear: **Download PDF / XLS / CSV**.

### Optional grounding

- **Ground with captions** — public captions only → observed excerpts.
- **Mine comment questions** — public questions → `audienceQuestions`.
- **Inspect thumbnails** — top 5 images; every claim is **Inferred**.

![Thumbnail inspection](demos/04-thumbnail-inspection.png)

Longer notes: [guides/research-to-package.md](guides/research-to-package.md).

---

## 4. Insights → Ideas

1. Wait for the Insights brief and **Evidence ledger** (Observed / Inferred / Requires Studio).
2. Open Ideas when ready. Select one idea that carries the snapshot context.
3. Continue to **Script Writer**.

![Insights ledger](demos/05-insights-ledger.png)

![Ideas select](demos/06-ideas-select.png)

**Fast path:** restore a finished workflow from history / library if Insights are slow.

---

## 5. Script, throughline, teleprompter

1. Generate or open the script.
2. Use the teleprompter (pace, text size, play/pause, mirror; desktop fullscreen available).
3. Open **Script throughline** — Promise → sections → claims → source videos (**DAG**).
4. Switch **Mind map** — same nodes, radial layout.
5. Read the **evidence overlay** (On promise / Tangent / Unsupported). Fix tangents before treating the script as Thumbnail-ready.

![Teleprompter](demos/07-script-teleprompter.png)

![Throughline DAG](demos/08-throughline-dag.png)

![Mind map](demos/09-mind-map.png)

![Evidence overlay](demos/10-evidence-overlay.png)

Details: [guides/script-evidence.md](guides/script-evidence.md).

---

## 6. Thumbnail

1. Open **Thumbnail Creator**.
2. Set the click promise / brief; generate and critique as needed.
3. Brand kit (if set) feeds the prompt. Gemini images keep SynthID provenance.

![Thumbnail](demos/11-thumbnail.png)

---

## 7. Package

1. Open **Publish Package**.
2. Review titles, hooks, description, tags, pace chapters, production brief.
3. Observed packaging lines stay distinct from generated copy.
4. Choose **Open Board** — not upload.

![Package](demos/12-package.png)

---

## 8. Board

1. Open **Board** after package (requires matching idea + script + snapshot).
2. Scan talent / continuity, storyboard strip, shot list, camera tree.
3. Filter cameras: `all`, `a-cam`, `b-roll`, `screen`, `insert`.
4. Resolve pass / warn / fail checks before Render.

![Board](demos/13-board.png)

---

## 9. Render

1. Open **Render** (`/video`).
2. Modes:

| Mode | What you get |
| --- | --- |
| Shoot myself | Filmable pack + board. You record. |
| Slides + voice | Timeline + TTS/consented voice → `render.mp4` (overwrites cinematic). |
| Cinematic Shorts | MiniMax Hailuo H3 when keyed; quote-before-run; max 5 shots. |
| Assemble preview | FFmpeg `preview.mp4` (Off by default). |

3. Play an existing `render.mp4` if present. Generated files are labeled **inferred**.
4. Do **not** confirm a new cinematic quote for screenshots. Do **not** run Slides over a keep-worthy cinematic.

![Render modes](demos/14-render-modes.png)

Details: [guides/board-render-and-calendar.md](guides/board-render-and-calendar.md).

---

## 10. Export pack

1. From Package or Render, start **Export pack**.
2. Browser builds one `.zip` (script, media, `brief/*.json`). Desktop may write a folder.
3. Confirm the archive name does not contain a leaked `undefined` suffix.

![Export pack](demos/16-export-pack.png)

---

## 11. Calendar

1. Open **Calendar**.
2. Enter a theme and planned date → **Add**.
3. Rows stay in local `content-calendar.json`. No Google Calendar sync.
4. Rows are plain data, not markup: a theme containing HTML renders as literal text.

![Calendar](demos/15-calendar.png)

---

## 12. What Cutroom does not do

- YouTube upload / publish OAuth
- Cutroom accounts, Stripe, or a Pro gate
- CapCut / Descript timeline editing
- Invented search volume or algorithm scores
- Cloning voices or likenesses from research-grid creators

---

## Related

- [guides/credentials.md](guides/credentials.md)
- [guides/30-minute-demo.md](guides/30-minute-demo.md)
- [user-flows.md](user-flows.md)
- [FEATURES.md](FEATURES.md)
- [demos/README.md](demos/README.md)
- [INVESTOR_PITCH.md](INVESTOR_PITCH.md)
