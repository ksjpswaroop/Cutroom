# Cutroom user flows

Each flow below was exercised on the local app at `http://127.0.0.1:5050` on 2026-10-22, using saved workflows already on this machine plus one new calendar item and one live thumbnail inspection. Screenshots are in [docs/demos](demos/). Step-by-step guides are in [docs/guides](guides/).

Billing and Stripe are out of scope. See [personas.md](personas.md).

## Evidence-first solo creator

### Research a topic and read the snapshot

1. Open Research.
2. Search a topic. Cutroom requests up to 50 public videos and stamps a snapshot id.
3. Read the overview, charts, and source grid. Missing stats stay unavailable.
4. Wait until Insights and Ideas finish. Export buttons say **Insights…** while insights run and **Ideas…** while ideas run. They say **Download PDF / XLS / CSV** when the pipeline is clear. They do not say “PDF waiting”.
5. Select one idea and continue to Script Writer.

**Evidence:** [demos/01-research-results.png](demos/01-research-results.png). The live page showed **Download PDF**, **Download XLS**, and **Download CSV** on a finished “Agentic AI automation” snapshot (about 292,546 matches, 50 videos). The loading labels are covered by `shared/research-export-labels.test.ts` because that snapshot had already finished before the screenshot.

### Inspect competitor thumbnails

1. On a finished snapshot, choose **Inspect thumbnails**.
2. Cutroom sends the top 5 thumbnail images to Gemini vision.
3. Every returned claim is labeled **Inferred**, with the limitation that pixels are not a Data API field.

**Evidence:** [demos/02-thumbnail-inspection.png](demos/02-thumbnail-inspection.png). `POST /api/research/thumbnail-inspection` returned 200 in 14s. Five inferred claims rendered, including the “AI AGENTS” face thumbnail and the “Roadmap To Learn Agentic AI” path.

### Write and check a script

1. Open a workflow that already has a script, or generate one.
2. Read it in the teleprompter.
3. Read the throughline graph. The same nodes can be shown as a DAG or a mind map.
4. Read the evidence overlay under the graph. **On promise** stays with a linked or hook section. **Tangent** is an orphan body section. **Unsupported** is a Studio-only claim spoken as fact, or a claim used outside its section.

**Evidence:** [demos/03-script-evidence-overlay.png](demos/03-script-evidence-overlay.png) and [demos/04-script-throughline-mind-map.png](demos/04-script-throughline-mind-map.png). The saved “Standing Desk Stability Shootout” script showed a failing throughline (`MAIN CONTENT` has no linked claim) and the overlay marked that section **Tangent**. Earlier sentences stayed **On promise** on the hook section. That matches the graph. It does not invent nodes.

### Thumbnail, package, board, render

1. Thumbnail Creator holds the promise and a visual brief. A previous still can remain in the preview.
2. Publish Package separates observed titles from inferred titles.
3. Board shows talent, a storyboard strip, and camera filters (`all`, `a-cam`, `b-roll`, `screen`, `insert`).
4. Render offers Shoot myself, Slides + voice, Cinematic Shorts, and Assemble preview. The copy on the page says Cutroom never uploads to YouTube.

**Evidence:**

- [demos/10-thumbnail.png](demos/10-thumbnail.png)
- [demos/09-package.png](demos/09-package.png) — “STOP Buying Standing Desks That Can’t Do This” is marked observed; neighboring titles are inferred.
- [demos/08-board.png](demos/08-board.png)
- [demos/07-render-modes.png](demos/07-render-modes.png) — an existing `render.mp4` played in the review player and was labeled inferred.

## Local-model creator

1. Open Settings → API.
2. Confirm YouTube and Gemini can be configured without the saved key being shown again.
3. Read the Ollama host and model. The header names the active provider and warns when the selected local model is not installed.

**Evidence:** [demos/05-settings-api.png](demos/05-settings-api.png). Keys were configured and the fields offered a replacement, not the saved secret. The header warned that `llama3.2:3b` is not installed, so a new local generation was not run.

## Batch planner

1. Open Calendar.
2. Enter a theme and a planned date.
3. Add it. The row appears under Upcoming / backlog with a status. Nothing is sent to Google Calendar.

**Evidence:** [demos/06-calendar.png](demos/06-calendar.png). Added “Desk stability follow-up” for 2026-10-29. `POST /api/calendar` returned 201. The item is now in the local calendar store.

## Hermes companion (off by default)

1. Open Settings → Library.
2. Find **Hermes companion digest**. It starts Off.
3. Turning it on only allows a local Monday digest. Cutroom does not spawn Hermes, and the digest is not product truth.

The contract is `server/hermes-companion.ts`. The write-up is [experiments/hermes-companion.md](experiments/hermes-companion.md).

**Evidence:** [demos/11-hermes-companion-on.png](demos/11-hermes-companion-on.png). The Library tab showed **Hermes companion digest** switched On. It was turned back Off afterward.

## Launch video side project

`launch-video/` is a Remotion film of the shot list (0:00–5:05). It is not a route in the app. The rendered file is `launch-video/out/launch-video.mp4` (14,259,688 bytes).
