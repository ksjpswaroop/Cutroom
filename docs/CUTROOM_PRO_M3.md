# Cutroom Pro — M3: Live-key acceptance pass + 10-creator pilot prep

**Branch:** `cutroom-pro-m3` (local only — not pushed, no PR)
**Base:** `ksjpswaroop/Cutroom` main `251852b` (PR #10, Tailwind v4) · **Version unchanged:** 2.0.0
**Date:** 2026-11-18

M3 is the "prove it" phase from the
[Cutroom Pro plan](../../your_files/Cutroom-Pro-Rebrand-Rebuild-Plan-2026-11-17.md):
the live-key acceptance pass (L-906) and the 10-creator pilot. The hard
boundary of this milestone: **the VM has no provider keys and makes no
live network calls, so the live pass itself can only run on the user's
Mac with a throwaway billable key, and only he runs it.** What M3 builds
in the VM is everything that makes that pass recordable, repeatable, and
honest — the harness, the usage passthrough, the premise-accuracy loop —
plus the pilot prep. Nothing in M3 simulates a live result and presents
it as real: stub/dry-run outputs are labelled "stub — not a live result"
in every receipt, file, and UI string.

## What was built

### 1. Live-provider acceptance harness (`shared/live-acceptance.ts`, `server/live-acceptance.ts`, `script/run-live-acceptance.ts`)
- `runLiveAcceptance(input, { mode, keyFingerprint, spendCapUsd })` runs
  the M2 agent team end to end (Researcher → Auditor → Scriptwriter →
  Packaging → QA → assembler in dry-run) and builds 5 checks:
  (a) Researcher end-to-end on a supplied snapshot; (b) the Auditor +
  Scriptwriter + Packaging chain; (c) the Orchestrator full plan with
  the assembler in dry-run; (d) the QA gate; (e) Cost Ledger totals vs
  provider-reported usage.
- Each check records pass/fail with the provider's response id, latency,
  and reported usage. Where the provider reports no usage, the check
  records **"usage: not reported by provider"** rather than inventing
  tokens or cost. The ledger check compares only the three chain
  agents' entries against the provider-reported total: the Researcher
  reuses a supplied snapshot and QA / the assembler are local, so their
  entries legitimately record tokens as null and must not poison the
  comparison.
- Each run persists under `<app-data root>/live-acceptance/<runId>.json`
  with run id, timestamp, provider, model, **key fingerprint (last 4
  characters only — never the full key)**, checks, receipts, ledger, and
  a top-level `live: true/false` flag. The schema refuses a live run
  without a fingerprint and a stub run carrying one.
- The script (`script/run-live-acceptance.ts`, not in `npm test`):
  - `--stub` runs the whole harness against the deterministic M2 stub
    engine — no key, no network, $0 — and labels every output stub.
  - Live mode is gated on `CUTROOM_LIVE_KEY`. Without it the script
    prints "no key — run on a Mac with CUTROOM_LIVE_KEY set" and runs
    **nothing** (exit 2, no live-acceptance directory created). With a
    key it also requires `--snapshot-id` (and optionally `--videos`
    JSON): the live Researcher reuses a supplied snapshot and does not
    search YouTube on its own.
  - The live run reuses the provider configured in Settings
    (`CUTROOM_AI_PROVIDER` + that provider's key env var); see
    "How to run the live pass on a Mac" below.

### 2. Provider usage passthrough (`server/ai/types.ts`, `server/ai/usage.ts`, all four text adapters, `server/agents.ts`)
- `AiJsonCompletionResult` gained an optional `usage` field
  (`AiProviderUsage`: prompt / completion / total tokens, all
  non-negative integers) and an optional `responseId`.
- `parseAiProviderUsage` (pure, `server/ai/usage.ts`) accepts the three
  shapes providers actually return — OpenAI-compatible
  (`prompt_tokens` / `completion_tokens` / `total_tokens`), Anthropic
  (`input_tokens` / `output_tokens`, total derived), Gemini
  (`promptTokenCount` / `candidatesTokenCount` / `totalTokenCount`) —
  plus the already-normalised shape. Malformed usage (negative counts,
  floats, strings, missing counts) is rejected, never repaired.
- Adapters extract usage when the provider reports it: OpenAI-compatible
  (covers OpenRouter, MiniMax, and the generic path), Anthropic,
  Gemini (`usageMetadata`), Ollama (`chatOnce` now returns usage
  alongside text). Malformed usage is dropped at the adapter; the agent
  engine re-validates defensively in `liveComplete`, so a provider
  returning a malformed usage object has it dropped and the step
  records "not reported" — no crash, no invented numbers.
- Live cost entries now carry the provider-reported total tokens
  (`liveCost` in `server/agents.ts`); cost stays null — no text
  provider reports a dollar cost, and Cutroom does not price tokens.
  Every live provider call is logged in the run context
  (`ctx.providerCalls`: agent, provider, model, latency, usage,
  response id) and carried into the run receipt
  (`AgentRunReceipt.providerCalls` in `shared/orchestrator.ts`), so a
  run's provider evidence survives the run context being deleted.
- The M2 ledger rule is unchanged: a total is null with `unknown: true`
  whenever any entry in it is null. That means a live run's overall
  token total stays "not reported" while any no-call step (Researcher
  reusing a snapshot, QA, assembler) records tokens as null — the
  harness's ledger check therefore compares the chain entries, not the
  poisoned total. If a future milestone wants a summable total, the
  no-call steps should record tokens `0` (a true zero, not an
  invention) — deliberately not done here, to avoid changing M2
  semantics inside M3.

### 3. Premise-accuracy loop (`shared/premise-accuracy.ts`, `server/premise-accuracy.ts`, registry commands, routes, Agents view)
- A premise record carries the video title, the claim ids it rests on,
  the **exact wording the agent asserted**, the agent run id, and an
  expectation: metric (`ctr` / `retention` / `views`), direction
  (`above` / `below`), threshold, and margin.
- Actuals (CTR %, retention %, views) are supplied by the creator **by
  hand** from Studio. Nothing fetches Studio data, nothing scrapes
  YouTube, nothing auto-uploads — there is no network call on this path.
- `comparePremise` (pure): no actuals yet → **inconclusive, never
  confirmed**; an actual inside ±margin → inconclusive; otherwise the
  verdict follows the direction (confirmed / contradicted), with the
  numbers attached and a human-readable reason.
- Store: plain JSON under `<app-data root>/premise-accuracy/<projectId>.json`
  (same visible-file pattern as agent memory). Registry commands
  `premise.record` / `premise.compare` (Pro-gated, audit-logged);
  routes `POST /api/agents/premise`, `GET /api/agents/premise`,
  `POST /api/agents/premise/:id/actuals` (all Pro-gated, 403 when off).
- Agents view: a "Premise accuracy loop" card — record-a-premise form
  (video title, wording, claim ids, metric / direction / threshold /
  margin), the premise table with verdict badges and reasons, and
  per-row inputs for the creator-supplied actuals.

### 4. Pilot prep (docs only)
- `docs/PILOT_M3.md` — the 10-creator pilot plan: who qualifies, what
  each pilot creator gets and owes, the consent wording, the runbook
  for one pilot video, and the exact Mac live-run checklist for L-906
  (throwaway billable key, Gemini + YouTube 10k quota ceiling,
  keychain, Studio OAuth read-only, MiniMax Hailuo H3 quote-then-charge
  — record the quote, get explicit approval, then charge; never
  simulate).

## Verification (VM, 2026-11-18)

- `npm run check` — 0 errors. `npm test` — **383 pass / 0 fail**
  (364 M2 baseline + 19 M3: usage parser 6, live-acceptance record 3,
  premise comparison 5, harness 3, premise store 1, plus the normalised-shape parser test).
  `npm run build` — ok (2 warnings, both the pre-existing M1
  `import.meta` warnings from `server/assembler-transport.ts` and
  `server/assemble-preview.ts`).
- One VM environment fix, not an M3 change: `npm run build` initially
  failed with `Cannot find module '@tailwindcss/postcss'` because this
  VM's `node_modules` predated the PR #10 Tailwind v4 migration
  (package.json already listed it). `npm ci` (13 s, lockfile
  unchanged) restored it; the build then passed. No M3 file touches
  the build config.
- Stub harness E2E (`script/run-live-acceptance.ts --stub`,
  `CUTROOM_APP_DATA=/tmp/cutroom-m3-e2e`, exit 0). Exact result:
  - Run `acc-mwmf2817-2554df` — **status pass, live: false,
    label "stub — not a live result"**, provider stub, key fingerprint
    none, agent run `agt-mwmf281a-e83020`, 44 ms.
  - All 5 checks pass: researcher (stub snapshot), agent-chain (3/3),
    orchestrator-plan (run partial — assembler skipped, no Board
    supplied, by design), qa-gate (**pass with a warn**:
    `captions-present`, no Board on-screen text — a warn, not a fail),
    ledger-vs-usage ("usage: not reported by provider").
  - Ledger totals: cost $0, quota 100, tokens not reported
    (unknown=true). Persisted + reloaded from
    `live-acceptance/acc-mwmf2817-2554df.json`.
- No-key gate (`CUTROOM_APP_DATA=/tmp/cutroom-m3-nokey`, no key,
  live mode): prints the no-key message, **exit 2, nothing ran** — no
  `live-acceptance/` directory was created.
- Server tests cover: the stub harness run end to end; a live run with
  a usage-reporting fake provider (chain usage 300 prompt + 150
  completion = 450 total tokens flows into the chain ledger entries
  and the checks, response id `resp-pack-1` recorded, ledger check
  matches); a live run with a provider returning malformed usage
  (negative counts — no crash, tokens null, "not reported"); the
  premise store round-trip (inconclusive → confirmed on supplied
  actuals); the premise comparison edge cases (no data, margin,
  inverted direction).

## How to run the live pass on a Mac, step by step

1. Enable Cutroom Pro in Settings (local toggle, default Off).
2. **Keys — all from the environment, never hardcoded, never committed:**
   - `CUTROOM_LIVE_KEY` — the throwaway billable key. This is the
     harness gate: without it nothing live runs. Set it to the **same
     key value** the configured provider uses.
   - The provider's own key env var, as the desk already uses it:
     `GEMINI_API_KEY` (default provider), `OPENROUTER_API_KEY`,
     `OPENAI_API_KEY` (or `OPENAI_COMPATIBLE_API_KEY`),
     `ANTHROPIC_API_KEY`, or `MINIMAX_API_KEY`. Ollama needs no key.
   - `CUTROOM_AI_PROVIDER` — `gemini` | `openrouter` |
     `openai_compatible` | `anthropic` | `minimax` | `ollama`
     (default: `gemini`).
   - Only the last 4 characters of `CUTROOM_LIVE_KEY` are recorded
     (the fingerprint), so a run can be matched to a key without the
     key ever touching disk.
3. **Snapshot first:** make a Research snapshot on the Research page
   (the live Researcher reuses it; agents do no YouTube searching).
   Note its snapshot id — and, if you want the Researcher to reuse
   specific videos, export them as JSON
   (`[{ "id", "title", "channelTitle" }]`) for `--videos`.
4. **Spend cap — default $0.** A live run pauses as needs-human before
   the first live step unless you raise the cap in Settings → Cutroom
   Pro → "Agent spend cap". Raise it only as far as you are willing to
   spend on one run; the cap is checked before every live step. The
   text providers charge per token at their published rates — the
   harness records the tokens the provider reports, but **no dollar
   cost is ever shown**, because no text provider reports one; check
   the provider's billing page for what the run actually cost.
5. **Run it:**
   ```
   cd ~/projects/Cutroom
   CUTROOM_LIVE_KEY="<throwaway key>" CUTROOM_AI_PROVIDER=gemini \
     GEMINI_API_KEY="<same key>" \
     npx tsx script/run-live-acceptance.ts \
       --topic "How to sharpen a knife" \
       --snapshot-id snap-... --spend-cap 5
   ```
   Or open the Agents view, pick **Live** provider mode, enter the
   topic and snapshot id, Build plan, review it, Approve & run — the
   same run, through the UI instead of the script. (The UI run does not
   persist a live-acceptance file; the script is the recordable pass.)
6. **Read the result:** the script prints each check (pass/fail,
   latency, response id, usage) and the ledger totals, and persists
   `live-acceptance/<runId>.json` (`live: true`). A failed check means
   the pass did not complete — the file is the evidence, not a claim.
7. **MiniMax Hailuo H3 (cinematic) is a separate, manual step** — the
   harness does not run it. See `docs/PILOT_M3.md` § "L-906 live-run
   checklist": quote first (pure, no charge), record the quote, get
   explicit approval, then charge. Never simulate the result.

## Known limits (still need a Mac / live keys to verify)

- The live engine has never run against a real provider — the harness
  and the usage passthrough are code + fake-provider tests only. A
  real provider may return JSON the agent schemas reject (then the
  step fails once, is not retried, and the run escalates), or usage in
  a shape the parser drops (then it is recorded as "not reported").
- Live costs are never reported by any text provider, so the ledger
  can only ever show tokens + "cost not reported" for live steps — a
  dollar figure needs the provider's billing page, not Cutroom.
- The Agents view premise section and the `/agents` page have not
  been rendered in a live browser (VM only).
- The stub harness run's QA result is a **warn** (`captions-present`)
  when no Board is supplied — expected, since captions are planned
  from Board on-screen text; a pilot run with a real Board should show
  a clean pass.
- The premise loop has no data until a pilot creator publishes and
  hands back numbers; until then every premise is inconclusive by
  design.
- `npm audit` in this VM is blocked by the internal registry proxy
  (same as M2) — the 0-vulnerability figure still rests on the Mac run.
