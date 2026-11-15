# Cutroom demo runbook — what to click, what to type, what to say

Operator's companion to [30-minute-demo.md](30-minute-demo.md). That file is the clock; this one is the **exact inputs** and the **proof moments** that make the argument land.

Every field name, option label and number below was read from the running app and the source on 2026-11-13. Quota costs come from `server/youtube-quota.ts`.

**Never on stage:** paste a real API key · confirm a MiniMax cinematic quote (costs money) · run Slides + voice over a cinematic `render.mp4` you want to keep · claim Cutroom uploads to YouTube.

---

## Part 1 — The argument you are making

One sentence, and every proof moment serves it:

> **A creator cannot tell which part of their video plan is a fact and which part a tool made up — and every tool in the stack is built to hide the difference.**

You are not demoing features. You are demoing **four moments where Cutroom tells the truth and a competitor would not**. If you only have ten minutes, run Proof 1 and Proof 3 and stop.

---

## Part 2 — Setup, 15 minutes before

- [ ] Launch the app. Desktop: `Cutroom.app`. From source: `PORT=5178 npm run dev`, then `http://localhost:5178`.
- [ ] **Settings → API** — confirm YouTube and Gemini read **Configured**. Fix this now, never on stage.
- [ ] Check the quota meter on Research. A live search costs **100 units** of the **10,000**/day budget. You get ~100 searches a day total — budget 3 for the demo, not 30.
- [ ] Run your demo topic **once privately** so a warm snapshot sits in Recent Workflows as a fallback.
- [ ] Confirm a finished workflow exists with script + board + an existing `render.mp4`.
- [ ] Decide your topic now (below). Do not improvise a niche you don't know — you need to be able to say "that's right" or "that's wrong" about the results out loud.
- [ ] Close anything with secrets. Zoom the browser to ~125%.
- [ ] Settings → Brand (optional): add banned phrases `guaranteed results` and `overnight success`. Sets up a good aside later.

**Topic choice.** Pick one you can personally judge:

| Topic to type | Why it demos well |
| --- | --- |
| `standing desk reviews 2024` | Known-good; the committed screenshots use it |
| `mechanical keyboard sound test` | Dense sample, strong thumbnail grid |
| `sourdough starter troubleshooting` | Shows it isn't a tech-only tool |

---

## Part 3 — The run, step by step

### Step 1 · Settings (1 min)

1. Open **Settings**. Point at the four tabs: **Library**, **API**, **Brand**, **Desktop**.
2. Point at **Configured** next to YouTube and Gemini.
3. Point at the stored-locally banner — OS keychain on desktop, otherwise a git-ignored `.env` with owner-only permissions.
4. Point at the header badge naming the **active** provider (`Ollama (local)` when local).

> "No Cutroom account. No login. The keys are on this machine and the server is on loopback. If I close my laptop, the product is gone — that's the point."

**Don't:** open a key field and type.

### Step 2 · Research (4 min)

**Type into the search box** (placeholder *Search YouTube videos by keyword, topic, or channel...*):

```
standing desk reviews 2024
```

Leave **Competitor channel ID** (`UCxxxxxxxx (optional)`), **Upload date**, **Duration** and **Sort by** at defaults for the first pass. Mention filters are drafts until you press Search — changing them spends nothing.

Click **Search**.

1. Call out the quota meter moving — 100 units.
2. Read the line: *"Analyzing this 50-video snapshot"*, and the stamped snapshot id.
3. Point at the **Observed public data** badge and the channel count.
4. Scroll the snapshot overview: Sample Views, Median Views, Median Views/Day, Visible Interaction Rate, Average Views, Videos Analyzed.
5. Scroll to **Top Videos by Views** and **Duration Mix**.

> "Fifty public videos, stamped with an id. Everything downstream reasons over *this* sample — not the open internet, not what the model half-remembers. If you don't like the sample, change it; you can see exactly what it is."

**→ Run Proof 1 and Proof 2 here.**

Optional if time: **Inspect thumbnails** (top 5, every claim **Inferred**).

### Step 3 · Insights → Ideas (4 min)

1. Wait for Insights. Export buttons may read **Insights…** / **Ideas…** while it works — say what's happening instead of standing in silence.
2. Open the **evidence ledger**. Read one **Observed** line and one **Inferred** line aloud, verbatim.
3. Open **Ideas**. Pick one that carries the snapshot context.
4. Continue to **Script Writer**.

**→ Run Proof 3 here.** This is your strongest moment.

### Step 4 · Script (5 min)

Set the three selectors to real options:

- **Format:** `Long-form Video (8-15 min)`
- **Target audience:** `Beginners`
- **Persona style:** `The Data Expert` *(mention the list runs from `No specific style` to `The Storyteller` — a writing register, not an impersonation)*

**Type into the notes box** (placeholder *Any specific points, style preferences, or requirements...*):

```
Open on the wobble test, not the specs. Beginner buying their first
standing desk under $400. No hype adjectives. Every claim has to trace
to a video in the snapshot — if it doesn't, leave it out.
```

Generate. Then:

1. **Teleprompter** — start it, change pace, stop it. Five seconds, not fifty.
2. **Script throughline → DAG** — walk Promise → sections → claims → source videos.
3. Switch to **Mind map** — same nodes, radial.
4. Scroll the **evidence overlay**: *On promise* / *Tangent* / *Unsupported*.

> "This isn't a free-association mind map. Every leaf is a video in the snapshot I pulled four minutes ago."

**→ Run Proof 4 here.**

### Step 5 · Thumbnail (3 min)

**Video topic or title:**
```
Standing desk wobble: what $400 actually buys you
```

**Describe the thumbnail you want:**
```
Hands pressing down on a standing desk at full height, slight visible
flex in the frame, home office, warm window light, shot from a low angle
```

**Words on the thumbnail** (2–5 words):
```
IT WOBBLES
```

**Secondary text:**
```
under $400
```

Generate. Then show the iterate box (*What should change in the next version?*):
```
Tighter crop on the desk leg flex, drop the background clutter
```

> "Generated pixels are labeled inferred everywhere they appear. Gemini images keep SynthID provenance. The brand kit feeds the prompt, so if I banned 'guaranteed results' it won't appear here."

### Step 6 · Package (2 min)

1. Open **Publish Package**.
2. Find an **observed** packaging line and an **inferred** one. Put them side by side and say which is which.
3. Note chapters come from teleprompter pace × section words — not guessed timestamps.
4. Click **Open Board**.

> "Note what this button says. Open Board. Not Publish. Not Upload. There is no upload path in this product."

### Step 7 · Board (2 min)

1. Talent / continuity — inferred unless you supplied notes.
2. Storyboard strip: HOOK, BODY.
3. Camera filters: `all` · `a-cam` · `b-roll` · `screen` · `insert`.
4. Shots with duration hints — both inferred.
5. Shorts / clip briefs grouped from the board.

> "The shot list is a subset of the throughline you just saw. Not a fresh guess from a second model that never read the research."

### Step 8 · Render, Export, Calendar (3 min)

1. Open **Render**. Show four modes: **Shoot myself**, **Slides + voice**, **Cinematic Shorts**, **Assemble preview**.
2. Play the existing `render.mp4` in the review player. Call out the `inferred` label.
3. Mention cinematic is MiniMax Hailuo H3, BYOK, **quote before run**, max 5 shots. **Do not confirm the quote.**
4. Point at the consent line: voice clone uses *your* Settings voice id only, never a creator from the research grid, and consent is off until confirmed.
5. **Export pack** → one `.zip` (script, media, `brief/*.json`).
6. **Calendar** → add theme `Desk stability follow-up`, pick a date, **Add to calendar**. Local JSON, no Google sync.

---

## Part 4 — The four proof moments

These are the demo. Run them deliberately and slow down while you do.

### Proof 1 · The blank that isn't a zero

**Do:** In the snapshot grid, find a video with a missing statistic — commonly hidden like counts. Point at the empty cell.

**Say:**
> "That's blank because the API didn't return it. Every other tool you've used would print a zero there, and you'd never know the difference between 'nobody liked it' and 'YouTube didn't tell us.' Those are opposite facts. A fabricated zero is a lie that compounds — it drags down every average computed on top of it."

**Why it lands:** it's small, visual, and instantly recognisable as something they've been burned by.

**If challenged, it's test-backed.** `server/youtube.test.ts` asserts `likeCount` stays `undefined` — not `0` — when the API withholds it. Same test asserts quota used is `101` for one search (100 for `search.list` + 1 for `videos.list`). Offer to open it; an engineer in the room will appreciate that you did.

### Proof 2 · The number that doesn't exist

**Do:** Ask the room: "What's the opportunity score for this topic?" Then show there isn't one, anywhere in the product.

**Say:**
> "There's no score, because I can't compute one honestly. Keyword difficulty, opportunity score, competition grade — none of those are YouTube data. They're a vendor's model, unaudited, and you have no way to check it or learn when it's wrong. We refuse to ship the number that sells best. That refusal *is* the product."

**Why it lands:** it reframes a missing feature as the thesis. Expect pushback — that's good, it means it registered.

**Verified:** a source-wide search for "opportunity score", "keyword difficulty", "competition score" and "SEO score" returns nothing. The claim is literally true, not a positioning line.

### Proof 3 · Observed / Inferred / Requires Studio

**Do:** In the evidence ledger, read one line from each tier aloud. Land hard on **Requires Studio**.

**Say:**
> "Three labels on every claim. Observed — read from public API data, here's the video. Inferred — a model's reading, and we say so. Requires Studio — only you, the channel owner, can answer this, and I will not pretend otherwise.
>
> That third label is the one no competitor will ship. 'I don't know and here's exactly why' is a worse-sounding answer than a confident number. It's also the only honest one. Everything else in this product follows from being willing to print it."

**Why it lands:** this is the whole pitch in fifteen seconds. If one moment survives, make it this one.

### Proof 4 · Drift caught before the shoot

**Do:** In the evidence overlay, find a line marked **Tangent** or **Unsupported**. Point at it.

**Say:**
> "The script drifted off its own promise, and it's flagged while fixing it costs me nothing. Catch this after the shoot and it costs a reshoot. Catch it after publishing and it costs the video. No other tool in this chain even knows the script had a promise — because no other tool carried the research this far."

**Why it lands:** converts an abstract trust argument into saved money.

---

## Part 5 — Talking points by room

### Creators

- One room instead of eight tabs. Research, script, thumbnail, package, shot list — each stage inherits the snapshot.
- Your keys, your machine, your files. No subscription that deletes your history when it lapses.
- Nothing is invented silently. When it's a guess it says so.
- It stops at the package. You still publish, and you still shoot.
- BYOK: you pay the model provider directly, at cost. No seat fee on top.

### Investors

- **Problem:** creators make videos on premises nobody checked, because every tool hides the line between fact and generation.
- **Why incumbents can't follow:** the score *is* vidIQ's product. Publishing its uncertainty undercuts the thing being sold. This is a positioning a leader can't retrofit.
- **Wedge:** replace the pre-production pile — the stage where a bad premise is still cheap to fix — not YouTube Studio, not Premiere.
- **Moat:** evidence contracts as a constraint on every surface, local-first secrets, snapshot continuity, and a public repo that makes "we don't make numbers up" checkable.
- **Timing:** local models are good enough, BYOK is normal, and the trust backlash is loud.
- **Honest:** users, retention, revenue and time-saved are **UNMEASURED**. No pilot has run. The product is demonstrable; the traction isn't. Full version in [../INVESTOR_PITCH.md](../INVESTOR_PITCH.md).

### Engineers

- Apache 2.0, read it yourself.
- Loopback bind; keychain on desktop, else git-ignored `.env`, owner-only.
- `search.list` 100 units, `videos.list` 1, 10,000/day — the meter is in the UI because quota is a real constraint, not a detail.
- Contract tests on the evidence tiers; tsc clean, 243 tests passing as of 2026-11-13.
- Tauri + sidecar, Developer ID signed and notarized.
- No telemetry by default. No account service to breach.

---

## Part 6 — Hard questions, honest answers

**"Isn't this just a wrapper?"**
> The wrapper is the product. Anyone can call Gemini. The work is binding every call to a stamped snapshot and labeling what came back, across eight surfaces, without exception. The constraint is the engineering.

**"Why would I trust your Inferred label?"**
> Don't — check it. It's open source, and the snapshot is re-openable. That's more than any score-based tool offers.

**"Local models aren't as good."**
> Correct, and that's why the tier exists. A weaker inference is *labeled* inferred, so it's visible rather than silently load-bearing. Use Gemini when you want; the contract doesn't change.

**"vidIQ already does research."**
> It does, well. Then it hands you a score and stops. Nothing it learns reaches your script, and nothing in your script knows what it found.

**"What if YouTube restricts the API?"**
> The Observed tier shrinks and the honesty contract holds. We'd label more things Inferred — which is exactly what we'd want a tool to do.

**"Why no upload?"**
> Publishing is the creator's act. Adding upload means OAuth, an account, and a reason to hold their credentials — the architecture we exist to avoid.

**"What's your traction?"**
> UNMEASURED, and I won't invent a number in a demo about not inventing numbers.

---

## Part 7 — Panic card

| Problem | Move |
| --- | --- |
| Search fails / quota spent | Open the warm snapshot from Recent Workflows; keep talking about evidence honesty |
| Insights slow | Restore a finished workflow at minute 8; go straight to Script → Board |
| Keys not Configured | Settings → API. **Pause the demo.** Never type a secret live |
| Board's Open Render disabled | Navigate to `/video` directly; the seed board may fail snapshot match |
| `/ideas` bounces to Research | Expected with no selected snapshot — select an idea first |
| Gatekeeper warning | Developer ID signed and notarized; if it appears, show the DMG path and move on |
| Port in use | `PORT=5178 npm run dev`; desktop picks a free loopback port automatically |
| Asked for a metric that needs Studio | Don't improvise. Say "Requires Studio" — it's the right answer and it's on-message |

---

## Related

- [30-minute-demo.md](30-minute-demo.md) — the clock
- [../USER_GUIDE.md](../USER_GUIDE.md) — screen by screen
- [../INVESTOR_PITCH.md](../INVESTOR_PITCH.md) — the problem argument in full
- [credentials.md](credentials.md) — key handling, no secrets
- [../demos/README.md](../demos/README.md) — screenshot index
