# Cutroom Pro — M2: Agent team

**Branch:** `cutroom-pro-m2` (local only — not pushed, no PR)
**Base:** `ksjpswaroop/Cutroom` main `66de0d8` (PR #7, M1) · **Version unchanged:** 2.0.0
**Date:** 2026-11-18

M2 is the agent team from the
[Cutroom Pro plan](../../your_files/Cutroom-Pro-Rebrand-Rebuild-Plan-2026-11-17.md):
an Orchestrator that builds a visible plan, shows it for approval, then
delegates each step to one agent through the M0 command registry — Researcher
→ Insight Auditor → Scriptwriter → Packaging → QA gate → Assembler (M1,
reused, not rebuilt). Agents communicate only through structured handoffs;
there is no agent-to-agent chat. No payment, no account, no cloud code.
Nothing in `business/` was touched.

## What was built

### 1. Orchestrator (pure parts `shared/orchestrator.ts`, runner `server/orchestrator.ts`)
- `planAgents(input)` builds the plan — plain data, inspectable before any
  agent runs: 6 steps (researcher, auditor, scriptwriter, packaging, qa,
  assembler), each with command id, label, approval flag, and estimated cost.
  The assembler step is skipped (with a reason) when no Board is supplied.
- `runAgents(input, { transport })` dispatches every step through the M0
  registry (`proRegistry`), so every delegation has an audit-log entry.
  Receipts persist under `<app-data root>/agent-runs/<runId>/receipt.json`
  (+ `plan.json`); `GET /api/agents/runs/:runId` reloads them.
- Retry rule: a failed step is retried **at most once, and only when it
  spent no money** (`shouldRetryStep`). Live failures are never retried —
  they may have spent before failing — they escalate instead.
- Escalation (`plan.status = needs-human`): any paid-call failure, QA Fail,
  spend-cap hit, or ambiguous evidence (a claim the Auditor rejected for a
  missing evidence pointer). The receipt carries the reason + message.
- The run receipt type (`AgentRunReceipt`, `agentRunReceiptSchema`) lives
  in `shared/orchestrator.ts` so the client Agents view can type it.

### 2. The four agents (`shared/agents.ts`, `server/agents.ts`)
Each is a registry command: one command id, typed Zod params, a handler, a
receipt. `agents.researcher`, `agents.auditor`, `agents.scriptwriter`,
`agents.packaging`, plus `agents.qa`, `agents.ledger-record`,
`agents.ledger-get` — all Pro-gated (disabled when Pro is off).
- **Researcher** wraps the existing Research step: topic/channel → stamped
  `snapshotId` + counts (videos, captions, comments, quota used). It never
  invents snapshot data — stub mode and dry-run use the deterministic fixture
  snapshot; live mode refuses without a supplied `snapshotId` (agents do no
  YouTube searching of their own).
- **Insight Auditor**: `snapshotId` → Insights claims, each labelled
  Observed / Inferred / Requires Studio with an evidence pointer (snapshot
  video id + timestamp/excerpt). A claim without a pointer is **rejected by
  validation and logged** — never silently accepted.
- **Scriptwriter**: approved Insights + throughline → script sections + WPM
  chapters; every script line traces to an Insight claim id (a line whose
  `claimId` is missing or unknown fails validation).
- **Packaging**: script + brand kit → title/hook/thumbnail variants with
  source labels and the desk's critique-matrix fields (`strong` /
  `adequate` / `weak` only). **No CTR prediction, no SEO/algorithm score** —
  a variant carrying any numeric score is rejected by
  `assertNoNumericScores`.
- Stub engine (`server/agents.ts`, `provider: "stub"`): deterministic
  fixtures — 3 videos, 9 claims (3 observed / 3 inferred / 3
  requires_studio), 3 script sections, 4 packaging variants. Live engine:
  calls the configured `AiTextProvider.completeJson()` and validates the
  output against the **same** schemas; tokens/cost are always null there —
  the provider result carries neither, and M2 never invents them.
- A `failOnce` test hook (orchestrator options only, not a route) makes a
  step fail once so the single-retry rule is testable.

### 3. QA / Compliance gate (`shared/qa.ts`, command `agents.qa`)
Deterministic, no model call. Five checks, each pass / warn / fail with a
reason:
- `board-subset-throughline` — every Board panel section must be one of the
  throughline sections (missing throughline data is a warn, not a fail —
  the gate must not invent a graph).
- `requires-studio-not-spoken` — no requires_studio claim's text may appear
  in a script line as fact. (A line that names Studio as the place to
  *validate* a claim does not contain the claim text, so it passes.)
- `no-snapshot-voice-clone` — a voice cloned from a research-snapshot
  creator is a fail.
- `no-invented-metrics` — packaging variants must carry no numeric score /
  CTR / SEO value.
- `captions-present` — narration without captions is a warn.
- **A Fail blocks Render and the assembler run.** `runAssembly` accepts an
  optional `qaReport`; a Fail returns a `blocked` receipt (no step ran, no
  export, cost $0, QA report attached), and `POST /api/assembler/run`
  returns **409** with that receipt. A Warn does not block but appears in
  the receipt. The Orchestrator runs QA before the assembler and pauses as
  needs-human on a Fail.

### 4. Structured handoffs + visible agent memory
- Every agent output is a handoff: `{ agent, input snapshotId / claim ids,
  claims with evidence pointers, open questions, cost so far, what it did
  NOT verify }`. Handoffs are in the run receipt (`receipt.handoffs`) and
  shown in the Agents view. No invisible per-agent profile.
- Per-project agent memory is a plain JSON file —
  `<app-data root>/agent-memory/<projectId>.json` (`server/agent-memory.ts`,
  Zod-validated read/write/delete): channel format DNA, packaging outcomes,
  premise notes. Agents read it at run start (`memoryUsed: true` in the
  receipt); they never trust a previous agent's summary over the ledger.
  The Agents view shows it with Edit (PUT) and Delete (DELETE).

### 5. Cost Ledger (`shared/cost-ledger.ts`, commands `agents.ledger-record/get`)
- Every agent step records provider, model/preset, tokens **if reported**
  (0 / null when not reported — never invented), quota units, and cost.
  The run receipt totals cost + quota + tokens **per agent and overall**;
  a total is null with `unknown: true` whenever any entry in it is null.
  All six steps — including QA and the assembler — have a ledger entry.
- **Spend cap, default $0** (`agentSpendCapUsd` in `server/preferences.ts`,
  input in the Settings Pro card). No paid call runs unless the creator
  raises it. The Orchestrator checks the cap before every live step; a
  step that would exceed it (or a live step with unknown cost under a $0
  cap) pauses the run as needs-human — before any provider call.
- MiniMax / cinematic quotes stay quote-then-charge and are **not part of
  M2** — a run that hits one records it as "not run in M2", not as a
  charge. No paid call is ever made in tests.

### 6. UI + routes
- **Agents view** (`client/src/pages/agents.tsx`, route `/agents`, sidebar
  item with a Pro badge like Edit): goal form (topic / channel / snapshot
  id / stub-or-live), Build plan → plan table (steps, status, skip reasons,
  estimated cost) → Approve & run → run receipt (per-agent receipts with
  attempts, cost, note/error, handoff summary), QA report (per-check
  status + reason), Cost Ledger (totals + past runs), agent-memory editor
  with Save / Delete. When Pro is off the page explains how to turn it on.
- Routes (all local-only + Pro-gated, 403 when off):
  `POST /api/agents/plan`, `POST /api/agents/run` (plan first, Approve to
  run), `GET /api/agents/runs/:runId`, `GET /api/agents/ledger`,
  `GET/PUT/DELETE /api/agents/memory`. The spend cap defaults to the
  Settings value when the body does not supply one.
- Settings: agent spend-cap input in the Cutroom Pro card
  (`input-agent-spend-cap`, 0–10,000 USD per run).

## Verification (VM, 2026-11-18)

- `npm run check` — 0 errors. `npm test` — **364 pass / 0 fail**
  (343 M1 baseline + 21 M2: 14 shared, 7 server). `npm run build` — ok
  (2 warnings, both from the pre-existing M1 `server/assembler-transport.ts`
  `import.meta` usage in a CJS bundle, not from M2 files).
- E2E script `script/run-agents-e2e.ts` (not in `npm test`):
  `CUTROOM_APP_DATA=/tmp/cutroom-m2-e2e npx tsx script/run-agents-e2e.ts`
  — exit 0. Exact result:
  - Plan `agt-mwm9lpwe-cd4804`: 6 steps, stub, spend cap $0, est. $0 each.
  - Run `agt-mwm9lpwh-be5790`: **status ok, 99 ms, memoryUsed true**;
    researcher/auditor/scriptwriter/packaging/qa/assembler all ok, 1
    attempt each, cost $0, tokens not reported; auditor handoff 9 claims,
    all with evidence pointers; QA **pass** on all 5 checks; ledger totals
    **cost $0, quota 100, tokens not reported (unknown=true)**; assembler
    `asm-mwm9lpyd-f970ed` **partial, dry-run transport** (no media, so no
    export — by design); receipt persisted + reloaded; aggregate ledger
    6 entries, quota 100, cost $0.
  - QA-fail run `agt-mwm9lpzd-4e06ce` (Board panel outside the throughline):
    **status needs-human, escalation qa-fail, QA fail, assembler receipt
    none (blocked)**. Registry audit: 10 agent-command entries across the
    runs.
- Server tests cover: the stub run end to end, QA Fail blocking the
  assembler (both via the Orchestrator and via `runAssembly` directly),
  single no-spend retry, $0 spend cap pausing a live run before any
  provider call (counting fake provider: 0 calls), Pro gating, and the
  agent-memory round-trip.

## How to run the E2E on a Mac with real keys

1. Enable Cutroom Pro in Settings (local toggle, default Off).
2. **Keys:** the live engine uses the provider configured in Settings —
   whichever text provider is set there (Gemini `GEMINI_API_KEY`, OpenRouter,
   OpenAI, Anthropic, or Ollama — the same keys the desk's Research/Script
   steps already use). No new key is introduced by M2. The Researcher
   needs an existing Research snapshot id to start from (agents do no
   YouTube searching); the live Auditor/Scriptwriter/Packaging call that
   provider's `completeJson`.
3. **What it will spend:** unknown until the provider reports it — the
   provider result carries no token/cost fields, so live costs are recorded
   as null ("not reported"), never estimated. YouTube Research quota still
   applies (100 units per Research call, as before). MiniMax / cinematic
   quotes are not run in M2.
4. **Spend-cap default is $0** — a live run pauses as needs-human before
   the first live step unless you raise the cap in Settings → Cutroom Pro →
   "Agent spend cap". Raise it only as far as you are willing to spend on
   one run; the cap is checked before every live step.
5. Run it: open the Agents view, pick **Live** provider mode, enter a topic
   (or snapshot id), Build plan, review it, Approve & run. Or run the stub
   E2E above to see the full flow at $0 first.
6. **Known limits (still need a Mac / live keys to verify):**
   - The live engine has never run against a real provider — the live
     path is code + validation only; a real provider may return JSON the
     schemas reject (then the step fails once, is not retried, and the run
     escalates with the validation error).
   - Live costs are never reported by the provider result, so the ledger
     can only ever show "not reported" for live steps — a real cost
     display needs the provider interface to expose usage first.
   - The Agents view has not been rendered in a live browser (VM only);
     the `/agents` route and sidebar item are wired the same way as Edit.
   - Assembler in the E2E is dry-run (no media in the fixture Board);
     a real render needs a Board with media paths and filmcraft-cli on
     the Mac (see M1 doc).
   - QA's `board-subset-throughline` warns (not fails) when there is no
     throughline data at all — the gate must not invent a graph.
   - Agent memory is per-project JSON under the app-data root; there is
     no migration, merge, or conflict handling — edit it by hand and the
     next run reads it as-is.
