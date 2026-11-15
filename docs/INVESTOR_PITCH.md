# Cutroom — the problem, and why this product is the answer

**Product:** Cutroom — a local-first, evidence-grounded YouTube pre-publish desk
**Stage:** Working product. Web app and a Developer ID–signed, notarized macOS desktop build.
**License:** Apache 2.0
**Date:** 2026-11-13

This is the problem-first pitch. Business model, competitive table and use of funds live in [INVESTOR_BRIEF.md](INVESTOR_BRIEF.md). Strategy detail is in [STRATEGY.md](STRATEGY.md).

---

## 1. The problem in one sentence

**A creator cannot tell which part of their video plan is a fact and which part a tool made up — and every tool in the stack is built to hide the difference.**

Everything below is a consequence of that sentence.

---

## 2. What actually goes wrong

A creator sitting down to plan one video today runs this gauntlet:

**The numbers are unfalsifiable.** SEO suites sell a "score" — opportunity, keyword difficulty, a competition grade out of 100. None of it is published YouTube data. It is a vendor's model, unaudited, with no way for the creator to check it or to learn when it is wrong. Decisions get made on it anyway, because it is the only number on the screen.

**The AI output is unattributed.** Ask any AI suite for video ideas and you get confident paragraphs with no provenance. Which claim came from real videos that exist? Which is the model free-associating? The creator cannot tell, so they either trust everything or trust nothing. Both are expensive.

**The work doesn't survive the handoff.** Research lives in one tab, the script in a doc, the thumbnail brief in a chat log, the shot list in someone's head. Nothing carries context forward. By the time the camera rolls, the evidence that justified the video is gone, and the script has quietly drifted away from the promise that made the idea good.

**The creator's material is someone else's asset.** Keys, research history, scripts, unreleased ideas — all sitting in a SaaS account, under terms the creator does not control, priced per seat per month, gone when the subscription lapses.

The cost is not mainly money. It is **videos made on a premise nobody checked** — and that failure is invisible until the video underperforms, by which point the premise is unrecoverable.

---

## 3. Why the existing stack cannot fix this

Not because the incumbents are bad. Because the fix is against their grain.

| What creators use | What it is good at | Why it can't close the gap |
| --- | --- | --- |
| vidIQ / TubeBuddy | Fast SEO signal in-browser | The score *is* the product; publishing its uncertainty undercuts it |
| 1of10 / OutlierKit | Finding outlier videos | Discovery ends at the idea; nothing carries into script or package |
| OverseerOS / TubeAI | End-to-end cloud production | Opposite trust model — more generation, less attribution |
| Descript / Opus | Post-production craft | Starts after the decisions that matter have been made |
| ChatGPT / Claude direct | Flexible, cheap | No snapshot, no provenance, no continuity between sessions |

An honest "we inferred this and here's how" is a **weaker-sounding** answer than a confident score. It only wins if the whole product is built around it from the first screen. That is a positioning a market leader cannot retrofit — and it is the only thing Cutroom sells.

---

## 4. What Cutroom does instead

**Every AI step is bound to a stamped public snapshot.** Research pulls up to 50 public videos through the YouTube Data API and stamps a `snapshotId`. Insights, ideas, script and package reason over *that* snapshot — not over the open internet, not over model memory. The snapshot is re-openable, so any claim can be traced back to the sample it came from.

**Three labels, on everything.** `Observed` — read from public API data. `Inferred` — a model's reading, honestly marked. `Requires Studio` — only the channel owner's own analytics can answer this, and Cutroom will not pretend otherwise. Generated images and voices are labeled inferred wherever they appear.

**Missing stays missing.** When a statistic is absent from the API, the field stays blank. No zero-fill. A blank is information; a fabricated zero is a lie that compounds downstream.

**The throughline keeps the script honest.** Promise → sections → claims → source videos, as a DAG the creator can walk. An evidence overlay marks each line *On promise*, *Tangent*, or *Unsupported* — so drift is visible while it is still cheap to fix, before the shoot rather than after.

**One room, carried forward.** Research → Insights → Ideas → Script → Thumbnail → Package → Board → Render. Each stage inherits the snapshot and the idea. The shot list is a subset of the throughline, not a fresh guess.

**The machine is the boundary.** Keys go to the OS keychain on desktop, otherwise a git-ignored `.env` with owner-only permissions. The server binds loopback. There is no Cutroom account, no login, no telemetry-by-default, and no upload path to YouTube — the creator publishes, not the tool.

Verified on this Mac on 2026-11-13: the app runs from source and as a signed desktop build; every route loads; a restored workflow renders board, shot list and an existing cut without spending API quota.

---

## 5. Why now

- **Local models crossed the line.** Ollama-class models are good enough for the reasoning Cutroom does. The private desk is no longer a performance sacrifice — the running app's header reads `Ollama (local)`.
- **Trust is the live complaint.** The backlash against hallucinated SEO scores and invented AI insight is loud and getting louder. Provenance is becoming a feature creators ask for by name.
- **BYOK is normal now.** Creators already hold their own API keys and are increasingly unwilling to rent access to them through a third party's account.
- **Native OSS shipping is cheap.** Tauri makes a signed, notarized desktop app achievable for a small team — no Electron tax, no cloud to operate.

---

## 6. The wedge

Not "replace YouTube Studio." Not "replace Premiere."

**Replace the pre-production pile** — the tabs, the docs, the chat logs, the scattered scores — with one auditable room that ends in a package you can actually shoot.

That pile is where the money is already being spent ($20–100+/month across vidIQ, Canva, ChatGPT and friends), and it is the stage where a bad premise is still cheap to correct.

---

## 7. What is defensible

1. **Evidence contracts as a product constraint, not a feature.** Every surface honors Observed / Inferred / Requires Studio. A competitor adding a provenance badge to one screen does not reproduce this.
2. **Local-first secrets architecture.** Hard to retrofit onto a SaaS whose business model is the account.
3. **Snapshot continuity.** The thing that makes the throughline and the board possible is that every stage shares one stamped sample.
4. **The refusal.** No invented search volume, no algorithm score, no cloning a research-grid creator's voice, no upload. Each refusal is a competitor's headline feature, and each is why a creator would trust this one.
5. **Open source.** The claim "we don't make numbers up" is checkable in the repository. That is the only form of that claim worth anything.

---

## 8. What we are not claiming

Per honest-measurement discipline, these are **UNMEASURED**: user counts, retention, revenue, conversion, time-saved, and any claim that Cutroom improves video performance. No pilot has been run. Market sizing in [INVESTOR_BRIEF.md](INVESTOR_BRIEF.md) is directional and derived from competitor pricing, not from our own funnel.

What *is* demonstrable today is the product: it runs, the contracts hold across the flow, and the walkthrough reproduces on a clean machine.

---

## 9. Risks we take seriously

- **YouTube Data API quota economics** set a ceiling on snapshot size and refresh rate. Mitigation is caching and snapshot reuse; the quota meter is already in the UI.
- **Model quality variance**, especially on local models, affects the Inferred tier. Mitigation is that Inferred is *labeled* — a weak inference is visible, not silently load-bearing.
- **YouTube policy shifts** could change what public data is available. The Observed tier shrinks; the honesty contract does not break.
- **Honesty is a harder sell than a score.** This is the real one. A confident number markets better than a labeled inference. Our bet is that the trust backlash is earlier than the market thinks — and that is a bet, not a finding.
- **Scope creep into editing** would destroy the wedge. Cutroom stops at the package. Post-production is a complement, not a roadmap item.

---

## 10. The one slide

> Creators make videos on premises no tool will let them check. Cutroom binds every AI step to a stamped public YouTube snapshot, labels every claim **Observed / Inferred / Requires Studio**, and carries one evidence trail from research to a shoot-ready package — on the creator's own machine, with their own keys, open source, no invented scores.

---

## Related

- [INVESTOR_BRIEF.md](INVESTOR_BRIEF.md) — model, market, competition, ask
- [STRATEGY.md](STRATEGY.md) — product philosophy and contracts
- [USER_GUIDE.md](USER_GUIDE.md) — the product, screen by screen
- [guides/30-minute-demo.md](guides/30-minute-demo.md) — the live walkthrough
- [FEATURES.md](FEATURES.md) — scope, including what is deliberately absent
