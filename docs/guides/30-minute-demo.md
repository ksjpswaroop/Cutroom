# 30-minute Cutroom demo (presenter script)

**Audience:** creators evaluating a local Research → Package → Board desk  
**Build:** signed `Cutroom.app` (Developer ID). Notarization optional.  
**Keys:** already on this Mac — see [credentials.md](credentials.md). Never show secret values.  
**Do not:** confirm a MiniMax quote, run Slides + voice (overwrites cinematic), or claim YouTube upload.

If live Insights are slow after Research, restore the standing-desk workflow from history / library at **minute 8** so Board and Render still fit the clock.

---

## 0:00–2:00 — Launch and trust

**Say:** Cutroom is a local-first YouTube pre-publish desk. Keys stay on this machine. No Cutroom account. No upload.

**Click:**

1. Open `Cutroom.app` (or the signed DMG install).
2. If the first-run banner appears, note keys / library, then open **Settings → API**.
3. Point at **Configured** for YouTube and Gemini. Fields do not show the saved secret.

![Settings API — Configured](../demos/01-settings-api-configured.png)

**Do not click:** paste a new key on stage.

---

## 2:00–8:00 — Research snapshot

**Say:** We pull a real public sample (up to 50 videos), stamp a snapshot id, and leave missing stats blank — never invent zeros.

**Click:**

1. **Research**.
2. Type a short topic (e.g. desk stability or a niche you know).
3. **Search**. Show quota meter and result count.
4. Scroll overview / charts / source grid.
5. Optional if time: **Inspect thumbnails** (claims labeled **Inferred**).

![Research search and quota meter](../demos/02-research-search.png)

![Snapshot overview and top videos](../demos/03-research-results.png)

![Thumbnail inspection — inferred](../demos/04-thumbnail-inspection.png)

**Backup:** if search fails, open a finished snapshot from history and keep talking about evidence honesty.

---

## 8:00–12:00 — Insights and Ideas

**Say:** Insights only reason over *this* snapshot. Every claim is Observed, Inferred, or Requires Studio.

**Click:**

1. Wait for Insights (export buttons may read **Insights…** / **Ideas…**).
2. Open the evidence ledger. Read one Observed and one Inferred line aloud.
3. Open Ideas. Select one idea → continue to Script.

![Evidence ledger — Observed vs Inferred](../demos/05-insights-ledger.png)

![Idea selected with snapshot context](../demos/06-ideas-select.png)

**Backup (minute 8):** restore standing-desk workflow; skip waiting on a cold Insights run.

---

## 12:00–18:00 — Script, throughline, teleprompter

**Say:** The script is bound to the idea and snapshot. The throughline is Promise → sections → claims → source videos — not a free mind map.

**Click:**

1. **Script Writer**. Show teleprompter (pace / play briefly).
2. **Script throughline** → **DAG**.
3. Switch **Mind map** (same nodes).
4. Scroll **evidence overlay**: On promise / Tangent / Unsupported.
5. Mention pass / warn / fail before Thumbnail.

![Teleprompter](../demos/07-script-teleprompter.png)

![Throughline DAG](../demos/08-throughline-dag.png)

![Mind map — same nodes](../demos/09-mind-map.png)

![Evidence overlay](../demos/10-evidence-overlay.png)

---

## 18:00–21:00 — Thumbnail and Package

**Say:** Thumbnail is a click promise with provenance. Package separates observed packaging lines from generated copy. Chapters come from teleprompter pace × section words, not guessed timestamps.

**Click:**

1. **Thumbnail** — show preview / critique if present.
2. **Package** — highlight an **observed** title vs an **inferred** title.
3. Note production brief / tags. **Open Board** (not upload).

![Thumbnail Creator](../demos/11-thumbnail.png)

![Package — observed vs inferred](../demos/12-package.png)

---

## 21:00–25:00 — Board and Render

**Say:** Board is a subset of the throughline. Render never uploads. Four modes: Shoot myself, Slides + voice, Cinematic Shorts, Assemble preview.

**Click:**

1. **Board** — storyboard strip, camera filters (`a-cam` / `b-roll` / …), continuity.
2. **Render** — show mode picker.
3. Play existing `render.mp4` if present. Label it **inferred**.
4. Mention cinematic quote-before-run and cost if MiniMax is configured — **do not Confirm**.

![Board — talent, storyboard, camera filters](../demos/13-board.png)

![Render modes](../demos/14-render-modes.png)

**Do not click:** Slides + voice; cinematic Confirm / pay.

---

## 25:00–28:00 — Export and Calendar

**Say:** Export is a single zip for the shoot pack. Calendar is local JSON only.

**Click:**

1. **Export pack** / download zip. Confirm one archive (browser or desktop folder write).
2. **Calendar** — add a theme + date, show it under Upcoming.

![Export pack — single zip](../demos/16-export-pack.png)

![Calendar — upcoming](../demos/15-calendar.png)

---

## 28:00–30:00 — Recap

**Say:**

- Evidence-grounded Research → Script → Package → Board → Render
- Keys on device; loopback; no Cutroom login
- No YouTube upload; billing / Stripe out of scope
- Optional local Ollama later; cinematic is BYOK quote-before-run

**Leave them with:** [USER_GUIDE.md](../USER_GUIDE.md) and the signed DMG path under `src-tauri/target/release/bundle/dmg/`.

---

## Panic card

| Problem | Move |
| --- | --- |
| Insights taking forever | Restore library workflow; finish Script → Render |
| Keys not Configured | Settings → API; do not type secrets on stream — pause |
| Board Open Render disabled | Open `/video` from nav; seed board may fail snapshot match |
| Gatekeeper warn | Expected without notarization; Developer ID signed |
| Port 5000 taken | Desktop picks a free loopback port; web demo uses 5001 |

## Related

- [credentials.md](credentials.md)
- [USER_GUIDE.md](../USER_GUIDE.md)
- [user-flows.md](../user-flows.md)
- [demos/README.md](../demos/README.md)
