# Cutroom personas

These personas are the people the current app can actually serve. They come from the workflow in [ROADMAP.md](../ROADMAP.md), [docs/FEATURES.md](FEATURES.md), and [docs/USER_STORY.md](USER_STORY.md). Billing, Stripe, checkout, and subscription charging are **out of scope**. They are not on the engineering roadmap, and this pass does not add them.

## Scope used for this pass

In scope: the product/engineering roadmap in [ROADMAP.md](../ROADMAP.md) and the status list in [TRACKER.md](../TRACKER.md).

| Item | Decision |
| --- | --- |
| Phases 0–7 except the open rows below | Treated as the product. Most tracker rows are already `done`. This pass closed L-413, L-414, L-616, L-617, and L-619. |
| L-508 optional Hermes companion | Done as a local Monday digest. Default off. Never spawns Hermes. |
| L-620 Remotion launch-video side project | Done in `launch-video/`. Not an in-app route. |
| Billing, Stripe, checkout, subscriptions | Out of scope. Do not build. |
| YouTube upload, timeline editor, Shorts farm, ViMax Python sidecar | Already non-goals in the roadmap. |

## 1. Evidence-first solo creator

**Who:** A person with a topic and no finished video. They want a public YouTube snapshot, an honest brief, one idea, a script, a thumbnail, and an upload package. They keep YouTube Studio for private analytics.

**What they use:** Research, Insights, Ideas, Script Writer, Thumbnail Creator, Publish Package. Keys stay on the machine. There is no Cutroom account.

**What they do not get from Cutroom:** Search-volume scores, a timeline editor, or an upload button.

## 2. Local-model creator

**Who:** The same desk, but text generation should stay on the machine. They choose Ollama in Settings. Hosted Gemini can still make thumbnails and thumbnail-pixel inspection.

**What they use:** Settings → API → Ollama, plus the caption and comment grounding added for cheap or local models (L-413, L-414). If the configured model is missing, the header says so and generation should fail rather than pretend.

**Current machine note:** On 2026-10-22 the header read `Ollama (local)` and warned that `llama3.2:3b` is not installed. Pull a tagged model before expecting local Insights or scripts to succeed.

## 3. Desk producer

**Who:** The creator is ready to film or to make a watch file. They want a storyboard that is a subset of the script throughline, then one render mode.

**What they use:** Board (storyboard, camera tree, continuity) and Render (`Shoot myself`, `Slides + voice`, `Cinematic Shorts`, `Assemble preview`). Generated pixels stay labeled inferred. Cutroom does not upload to YouTube.

## 4. Batch planner

**Who:** Someone lining up several videos on this computer, not in Google Calendar.

**What they use:** Content calendar. A theme, a date, and a status live in the local calendar store.
