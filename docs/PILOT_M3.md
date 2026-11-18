# Cutroom Pro — 10-creator pilot plan (M3)

**Status:** plan only — no creator has been contacted, nothing has been
sent, no pilot has started. Recruiting, outreach, and any price test
need the owner's separate approval.
**Version:** Cutroom 2.0.0, Pro M0+M1+M2 landed (main `251852b`).

The pilot is the M3 go/no-go: do creators actually want the agent team,
and does the premise-accuracy loop hold up on real videos? It is not a
launch. Nothing in the pilot sells anything, charges anything, or
uploads anything on a creator's behalf.

## Who qualifies

A pilot creator is a working YouTube creator, not an agent buyer:

- An active channel that **publishes at least monthly** (a channel that
  has not published in 3+ months cannot run the loop — there is nothing
  to compare against).
- Willing to run **one video end to end through Cutroom Pro** —
  Research → Audit → Script → Packaging → Edit → QA → assemble — and
  to publish that video by hand (see "no auto-upload" below).
- Willing to **share the video's CTR / retention / views from Studio,
  by hand**, after publishing, so the premise-accuracy loop can be
  scored. Sharing is per-video and opt-in each time.
- No follower-count bar, no niche bar, no payment. Ten creators, two
  videos each where the first one works (the plan's M3 scope), is the
  target — but one honest completed video beats ten half-finished ones.

Explicitly **not** required: agents in production, a budget, a
company, or any technical setup beyond running the Cutroom desktop
build on their own Mac.

## What each pilot creator gets, and owes

**Gets:**
- The Cutroom Pro build (M0+M1+M2) with the agent team, the QA gate,
  and the Cost Ledger, for the pilot's duration.
- A human walkthrough of one video (the runbook below), and a written
  record of what the agents asserted vs what happened (the
  premise-accuracy loop output for their video).
- Nothing else is promised: no audience, no distribution, no revenue,
  no price. The pilot tests whether the tool is wanted, not whether it
  sells.

**Owes:**
- One video run end to end, published by hand.
- The video's CTR / retention / views from Studio, supplied by hand
  after publishing, if they agree to share them (per-video opt-in).
- Honest feedback: what was wrong, what was slow, what they would not
  use again. A "would not use again" is a pilot result, not a failure
  to hide.

## Consent wording (use verbatim when recruiting)

> Cutroom Pro is a local-first desktop tool: your research, scripts,
> and packaging never leave your machine, and Cutroom never uploads
> anything to YouTube for you — you publish by hand, as always.
>
> The agent team reads only the research snapshot you made in Cutroom
> and the script you approve. It never clones a voice from a research
> video, never invents a metric, and never calls a paid provider
> without you raising the spend cap first (it defaults to $0).
>
> After you publish, you can share the video's CTR, retention, and
> views from Studio by typing them in yourself, if you want to — that
> is the only data that ever leaves your machine, and only if you agree
> per video. You can stop at any time, and your agent memory file is
> yours to edit or delete.

## Runbook — one pilot video

1. **Research (creator, in Cutroom).** Make a Research snapshot for
   the topic on the Research page, as normal. Note the snapshot id.
2. **Plan (Agents view).** Topic + snapshot id, provider mode **Live**
   (or Stub first, to see the flow at $0 — the stub run is labelled
   "stub — not a live result" and proves nothing about the provider).
   Build plan, read every step, then Approve & run.
3. **Review the receipts.** Every agent's receipt, the QA report, and
   the Cost Ledger are on the Agents view. If QA fails, fix the Board
   (usually a panel outside the throughline) and re-run — the
   assembler stays blocked until QA passes.
4. **Edit (Edit tab).** Open the FilmCraft web build, review the
   timeline, adjust by hand. FilmCraft edits; Cutroom does not
   auto-edit.
5. **Assemble.** Board → Assemble (Pro) → approve the plan → run.
   The receipt records every step; a QA Fail returns a blocked
   receipt, not a render.
6. **Publish by hand.** Upload the export to YouTube yourself, from
   your own account. Cutroom never uploads, schedules, or touches
   Studio.
7. **Record the premise.** On the Agents view, record the premise the
   agent asserted (exact wording + claim ids + expected metric /
   threshold). It starts **inconclusive**.
8. **After 7 days, supply the numbers.** CTR %, retention %, views —
   typed in by hand from Studio. The loop scores the premise
   confirmed / contradicted / inconclusive, with the numbers attached.
   Share the verdict (and the numbers, if agreed) back to the pilot.

## L-906 live-run checklist (Mac only, owner runs it)

This is the acceptance pass the harness was built for. It has never
run. Do it on a clean Mac with a **throwaway billable key** — never a
production key, never a key shared with anything else. Record the
result; never simulate it.

1. **Key.** Create a throwaway billable key for the provider under
   test (Gemini first, per the plan). Set `CUTROOM_LIVE_KEY` to it and
   the provider's own env var (`GEMINI_API_KEY`) to the same value.
   Only the last 4 characters are recorded.
2. **Provider pass.** Run the harness (see `docs/CUTROOM_PRO_M3.md`
   § "How to run the live pass on a Mac"): `--snapshot-id` from a real
   Research snapshot, `--spend-cap` raised above $0 only as far as you
   are willing to spend on one run. Record the persisted
   `live-acceptance/<runId>.json` (`live: true`) — that file is the
   pass, not a summary of it.
3. **Gemini text + image under real quota.** Note real latency, real
   error bodies, and the usage the provider reports. If usage is not
   reported, the harness records "not reported" — do not fill it in
   by hand.
4. **YouTube Data API quota.** Note the Research quota used against
   the 10,000-unit ceiling, and the exhaustion behaviour if it is hit
   (the desk must fail with a clear message, not a silent empty
   snapshot).
5. **Keychain.** Confirm the keychain read/write works on the Mac
   (the VM cannot test this).
6. **Studio OAuth, read-only.** Confirm the OAuth mirror works
   against a real refresh token, read-only. Never grant a write scope
   for this pass.
7. **MiniMax Hailuo H3 — quote-then-charge (manual, not in the
   harness).** This spends real money and has never been exercised end
   to end against the live provider:
   - Call `quote()` first — it is pure, no network, no charge — and
     **record the quote in writing**.
   - Get explicit approval for that exact quote before any charging
     call.
   - Then run `generateClip()` once, and record the actual charge
     against the quote.
   - Never simulate the result: if the quote or the charge cannot be
     recorded, the item stays open.
8. **Record, don't summarise.** The pass is closed only when the
   persisted harness file, the quota notes, and the MiniMax
   quote-then-charge record all exist. A verbal "it worked" closes
   nothing.

## What the pilot decides

- **Go:** at least half the pilot creators complete one video end to
  end and say they would run a second one; the premise loop scores
  at least as many confirmed as contradicted premises with real
  numbers attached. Then M4 (ship Pro) is worth scoping, and pricing
  (the plan's recommendation: OSS + paid signed desktop builds, e.g.
  $49 one-time or $9/mo, evidence contracts never paywalled) can be
  tested with the pilot creators first.
- **No-go / pivot:** creators stall at the plan step, QA blocks
  everything, or the premises mostly contradict. Then the problem is
  the product, not the pilot — fix that before any pricing or launch
  work.
- **Price is not set in this pilot.** No creator is charged, and no
  price is quoted as final. Willingness to pay is a question asked at
  the end, not a term of entry.
