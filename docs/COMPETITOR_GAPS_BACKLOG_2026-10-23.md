# Cutroom — Competitor Gap Backlog

**As of 2026-10-23.** Derived from [COMPETITIVE_FEATURES_2026-10-23.md](COMPETITIVE_FEATURES_2026-10-23.md) (live reads of
7 vendor surfaces) and [FEATURES.md](FEATURES.md) (our side, measured). IDs are `CG-xx` deliberately — nothing here is in
[TRACKER.md](../TRACKER.md) yet; promote to `L-801+` only when a decision is taken.

## The decision rule (applied to every gap)

A competitor capability earns a build slot only if it passes at least one of these, and never if it breaks the evidence
contract:

1. **Blocks a buyer who already wants the desk.** They came for evidence-grounded pre-publish work and left because one
   neighbouring capability was absent.
2. **Protects the moat.** Leaving it open lets someone else occupy the evidence lane while claiming our language.
3. **Half-built already.** The capability exists in-tree and is not wired, so parity costs days not months.

Everything else is either someone else's product or a deliberate non-goal. Copying a competitor's surface because it is
on their homepage is how a focused product becomes a worse version of theirs.

---

## Verdict table — every gap in the matrix

| # | Gap (who has it) | Passes rule | Verdict |
| --- | --- | --- | --- |
| 1 | Outlier / virality scoring (vidIQ ●, OpusClip ◐) | 1, 3 | **Build — P0** |
| 2 | Keyword search volume + competition score (vidIQ ●) | 1 | **Build — P1**, licensed data only |
| 3 | Competitor / channel tracking over time (vidIQ ●) | 1 | **Build — P1** |
| 4 | Agent access to the product (vidIQ ships an MCP) | 2 | **Build — P1** |
| 5 | Model breadth: many video/image models (invideo, Pictory, VEED) | 1, 3 | **Build — P1** |
| 6 | Long-form → Shorts as actual clips (OpusClip, Descript, vidIQ, CapCut) | 1 | **Build narrow — P2** (cut list + optional render, no editor) |
| 7 | Multilingual narration / dubbing (Pictory, VEED) | 1 | **Build — P2** |
| 8 | Package presets / templates (invideo, Pictory) | 1 | **Build — P2**, 1 day |
| 9 | Thumbnail A/B testing (vidIQ ●, TubeBuddy) | none | **Reject** — needs upload; YouTube's own Test & Compare already does it |
| 10 | Editing timeline (Descript, CapCut, VEED) | none | **Reject** — non-goal, unwinnable |
| 11 | AI avatars / talking-head (Pictory, VEED) | none | **Reject** — conflicts with *shoot myself* and with likeness consent rules |
| 12 | Stock media / B-roll library (invideo, VEED) | none | **Reject** — licensing cost, zero moat |
| 13 | Direct publish / upload (vidIQ, OpusClip) | none | **Reject** — `videos.insert` absence is asserted by test; keep it |
| 14 | Social scheduler (OpusClip) | none | **Reject** — follow-on from 13 |
| 15 | Mobile app, browser extension, team seats/SSO (CapCut, vidIQ, Pictory) | none | **Reject for now** — distribution, not product |

---

## P0 — build first

### CG-01 · Outlier multiplier + velocity table (closes gap 1)

**Their claim:** vidIQ — "Find Viral Ideas … trending topics and outlier videos in your niche before they go mainstream."
**Our state:** momentum and publication charts, and median views already computed for analytics — but no per-video
outlier figure anywhere in `shared/`, `server/` or `client/src/` (`grep -ri outlier` returns only prompt text and a chart note).

**Build:** a pure function `shared/outlier.ts` computing, from the snapshot we already hold:
`outlierMultiplier = video views/hour ÷ median views/hour of that channel's other videos in the snapshot`, plus a
`channelConfidence` flag when the snapshot holds too few videos from that channel to be meaningful. Render column +
sort in the source grid; expose `outliers[]` on the search response.

**Why it is ours:** it is arithmetic on **observed** data — no new API, no invented number, and it can carry the same
evidence class as everything else (`observed`, with the formula published in the UI). Their version is a black-box score;
ours is inspectable.

**Effort:** 2 days. **Gate:** unit tests for the median/multiplier math, a "too few videos" case that returns confidence
instead of a number, and a route test that the field is present and zod-validated.

### CG-00 · Pin the render path with a test (protects the moat, 0.5 day)

Not a competitor gap — a truth gap this analysis exposed: `TRACKER.md` and both feature docs said cinematic does not call
a video model, while `server/render-engine.ts:186` calls MiniMax Hailuo H3 whenever `hailuoH3Enabled()`. Add a test that
asserts both branches (H3 enabled → `usesH3: true`; disabled → stills fallback) so the docs cannot drift again.

---

## P1 — the parity that buyers notice

### CG-02 · Keyword demand, from licensed data only (closes gap 2)

**Their claim:** vidIQ — "Find Winning Keywords … real search volume, competition scores".
**Our constraint:** `server/gemini.ts:455` instructs the model to *never* claim search volume. That rule stays.

**Build:** an optional BYOK integration (Google Ads Keyword Planner API, or a licensed keyword vendor) that returns
volume/competition **with the source and date attached**, labeled `observed` and never model-generated. No key → the
panel says "not measured", which is already our house style.

**Why:** it is the single most-requested research number in this category and the one place our honesty rule currently
looks like a limitation rather than a principle. Doing it with cited numbers turns the principle into an advantage.

**Effort:** 4 days (auth, quota, caching, labeling). **Gate:** a fixture-driven contract test; a no-key test asserting the
"not measured" state; a UI assertion that every number carries its source string.

### CG-03 · Channel watchlist + snapshot diff (closes gap 3)

**Their claim:** vidIQ competitor tracking / outliers; Pictory and Opus are single-shot.
**Our state:** channel-first search (`channelId`) works, but nothing is remembered over time.

**Build:** `watchlist` in the library store (channel ids + last snapshot), a weekly diff (`views delta`, `new videos`,
`outlier entries`), and a Research tab. Local only, no account, no cron dependency.

**Effort:** 3 days. **Gate:** diff tests against two fixture snapshots; a store round-trip test; no network in tests.

### CG-04 · Cutroom MCP server (closes gap 4)

**Their claim:** vidIQ — "Bring vidIQ's YouTube insights into your favorite AI tools … Explore vidIQ MCP".
**Our state:** evidence ledger, throughline, board and package all exist behind loopback routes — a natural MCP surface.

**Build:** a local stdio MCP exposing read-only tools: `research_search`, `snapshot_get`, `evidence_claims`,
`throughline_get`, `board_get`, `package_get`, `outlier_rank` (after CG-01). No writes, keys stay server-side.

**Why:** it is the cheapest moat-broadening move we have — an agent asking "what does this channel's evidence actually
support?" has no other vendor to ask. It also matches how this user already works (local tools over plugins/MCP).

**Effort:** 3 days. **Gate:** tool-call tests with no live providers; a test that no tool returns API keys.

### CG-05 · Model breadth (closes gap 5)

**Their claim:** invideo — "Nano Banana Pro Ideogram Seedream Flux Kontext Qwen Imagen"; Pictory —
"AI Avatars Voice Clone Dubbing & Multilingual Voices"; VEED — "AI Avatars & Lip Sync".
**Our state:** one video model (Hailuo H3), three image providers (Gemini, Ollama, MiniMax) behind `server/ai/`.

**Build:** add one second video model and two image models through the existing adapters (`server/ai/*`), selectable in
Settings. Keep the labels honest: each result reports which model produced it.

**Effort:** 2 days. **Gate:** adapter contract tests with stubbed HTTP; Settings round-trip.

---

## P2 — narrow versions, only if they pay for themselves

### CG-06 · Shorts as cut lists, not an editor (closes gap 6)

**Their claim:** OpusClip — "the fastest way to turn any video into viral shorts"; Descript "Create Clips";
CapCut "Long video to short videos".
**Our state:** clip briefs exist (`shared/clip-briefs.ts`) with no renderer.

**Build:** export the existing clip briefs as an **EDL/CSV cut list** (timecodes + titles + captions) that drops into
CapCut/Descript/Resolve, plus optional render of the same brief through H3 or the stills timeline. We interoperate with
the editors instead of rebuilding one.

**Effort:** 2 days. **Gate:** cut-list golden file test; timecodes within board shot ranges.

### CG-07 · Multilingual narration (closes gap 7)

**Build:** translate the narration (evidence-labeled as a translation, source script id retained) and regenerate captions
+ TTS in the target language. No lip sync.

**Effort:** 3 days. **Gate:** translation contract test; proof the original evidence ids survive translation.

### CG-08 · Package presets (closes gap 8)

**Build:** brand-kit-driven presets for title/hook/description shape (their "templates" idea, minus the stock library).

**Effort:** 1 day. **Gate:** schema test + one snapshot round-trip.

---

## Do not build (with the sentence to use when asked)

- **Editing timeline** — "We stop at ready-to-produce; Descript and CapCut are better at pixels and we say so."
- **Upload / scheduling** — "Cutroom does not touch `videos.insert`; the package is yours to post." (asserted in tests)
- **AI avatars** — "We render your board and your voice with consent; we do not manufacture a presenter."
- **Thumbnail A/B** — "Use YouTube's own Test & Compare; we give you the variants and the critique, not a second scoreboard."
- **Stock library** — "No licensing business inside a pre-production desk."
- **Teams/SSO/mobile** — "Single-user, local-first, by design."

## Sequencing

1. **Sprint A (4 days):** CG-00 + CG-01 + CG-08 — closes the loudest research gap with zero new cost, pins the render
   truth, and ships one visible template win.
2. **Sprint B (10 days):** CG-02 + CG-03 + CG-04 — the three that change how we are compared (real keyword demand,
   tracked competitors, agent access).
3. **Sprint C (as capacity allows):** CG-05, CG-06, CG-07.

## Open decisions for the owner

1. **Keyword demand:** licensed vendor vs Google Ads API vs keep refusing to publish volume. Everything downstream
   depends on this answer.
2. **MCP surface:** read-only (recommended) or read+write (draft script from an agent)?
3. **Second video model:** MiniMax second-tier, or a different vendor for resilience against one provider's pricing?
4. **Promote to TRACKER?** These are `CG-xx` until you say otherwise; the tracker currently has no open rows at all.
