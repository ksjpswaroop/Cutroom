# Guide: research through package

For the evidence-first solo creator. The app is local. API keys stay on this machine.

## Before you start

1. Install Node.js 20.19 or newer.
2. Copy `.env.example` to `.env`, or enter keys in Settings.
3. You need a YouTube Data API key for search. Insights, ideas, scripts, thumbnails, and thumbnail inspection need a text or image provider. Gemini is the default. Ollama can replace text generation.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5000` (or the port printed in the terminal if 5000 is taken).

## Search

1. Choose **Research**.
2. Type a topic. Optional filters (upload date, duration, sort, competitor channel id) do not spend quota until you search.
3. Choose **Search**. The sample is at most 50 videos. The page names the snapshot time and the video count.

While Insights are running, the export buttons say **Insights…**. While Ideas are running, they say **Ideas…**. After both finish they say **Download PDF**, **Download XLS**, and **Download CSV**.

## Grounding

- **Ground with captions** pulls public caption text for selected videos. Those excerpts are observed speech, not Studio metrics. If a cheap or local model drops them, Cutroom reattaches a quoted observed claim.
- **Mine comment questions** keeps public question phrasing. If a model drops a mined question, the idea package keeps it labeled “Observed public comment (not demand)”.
- **Inspect thumbnails** looks at the top 5 thumbnail images. Claims from pixels are **Inferred**.

## Continue

Select one idea, then **Proceed to Script Writer**. From the script, open Thumbnail Creator, then Publish Package. Observed package lines stay distinct from inferred lines. **Open Board** is the next step, not an upload.

Illustrated walkthrough: [../USER_GUIDE.md](../USER_GUIDE.md). Screenshots: [../demos/03-research-results.png](../demos/03-research-results.png), [../demos/12-package.png](../demos/12-package.png).
