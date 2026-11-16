# Cutroom Production Plan — Creator Suite GA

**Goal:** ship a production release of Cutroom that carries the creator-intelligence
suite folded in from CreatorForge (Channels, Audience, Operations, Humanize) at
production depth, and closes the remaining productionization blockers — as **one
complete, local-first, evidence-grounded desktop app**.

This is the implementation document. It states each goal, the dependency graph,
the **parallel tracks** you can run at once, the **TDD test specs** to write
first, and the **done-when** gate. Day-to-day status is tracked in
[../TRACKER.md](../TRACKER.md) (`L-801+`, `L-901+`); the readiness assessment is
[PRODUCTIONIZATION.md](PRODUCTIONIZATION.md); the version train is
[RELEASE_PLAN.md](RELEASE_PLAN.md).

**Companion docs:** [ROADMAP.md](../ROADMAP.md) · [TRACKER.md](../TRACKER.md) ·
[PRODUCTIONIZATION.md](PRODUCTIONIZATION.md) · [RELEASE_PLAN.md](RELEASE_PLAN.md) ·
[STRATEGY.md](STRATEGY.md) · [MODELS.md](MODELS.md) · [DESKTOP.md](DESKTOP.md)

---

## 1. How to use this document

1. Pick a **track** (§4). Tracks are designed so two or more people (or agents)
   can work at once without touching the same files.
2. For each goal, **write the tests first** (§5 gives the file and the cases),
   watch them fail, then implement until green. No goal is "done" until its
   named tests pass **and** the three HANDOFF commands stay green:
   `npm run check` · `npm test` · `npm run build`.
3. Respect the standing boundaries ([ROADMAP.md](../ROADMAP.md) §"Standing
   boundaries", [PRODUCTIONIZATION.md](PRODUCTIONIZATION.md)): no live-provider
   calls in automated tests; every new claim carries an evidence class; keys
   never reach the WebView; loopback-only.

---

## 2. Verified baseline (start here)

Measured after the first production-depth pass (Track CS core + L-904):

| Signal | State |
| --- | --- |
| `npm run check` | exit 0 |
| `npm test` | **295 pass / 0 fail** (266 baseline + 29 new) |
| `npm run build` | exit 0 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Creator suite | Channel intel + personas **provider-grounded** (injectable, deterministic fallback, label code-controlled); Operations gated on a cited snapshot; Humanize surfaces provider/fallback; unified evidence ledger served |
| Shipped | `L-801`, `L-802`, `L-803`, `L-804`, `L-805`, `L-807`, `L-808`, `L-904` · partial `L-806` |
| Still open | `L-806` Research-page prefill; `L-901`/`L-902`/`L-905` release eng; `L-903`/`L-906`/`L-907` env/owner-gated |

**What "production depth" means here, now partly delivered:** channel
intelligence and personas gained a provider-grounded path
(`generateChannelIntelligence` / `generatePersona`) that still labels every
finding `inferred` **in code** — a model cannot relabel a synthesized claim as
`observed` — and still falls back to the deterministic template when no provider
is configured. Operations items now carry a `snapshotId`/`dueDate` and cannot
enter `published` without citing a workflow snapshot. The remaining Track CS/INT
work is UI surfacing and cross-module flow; the env/owner-gated items stay
honestly blocked.

---

## 3. Goal statements

Each goal is a single, testable outcome. IDs continue the `TRACKER.md` ledger.

### Track CS — Creator suite to production depth

- **L-801 — Provider-grounded channel intelligence.** `analyzeChannelIntelligence`
  gains an optional provider-backed path that synthesizes gaps/growth/benchmark
  from the channel's niche **and** its stored `channelMemory`, returning
  `provider: "<id>"` and `evidenceClass: "inferred"`. The deterministic template
  stays as the fallback when no provider is configured or the call fails. No
  `observed` claim is ever emitted (no snapshot behind it).

- **L-802 — Provider-grounded audience personas.** `buildPersona` /
  `buildAvatarMarkdown` gain a provider-backed synthesis path grounded in the
  channel niche and (optionally) channel intelligence from L-801, labeled
  `inferred`, deterministic fallback retained. Avatar markdown keeps the
  "synthesized, not measured" limitation line.

- **L-803 — Operations wired to the workflow.** A production item (`productionItem`)
  can carry an optional `snapshotId` and `dueDate`, and moving an item to
  `published` is blocked unless it cites a workflow artifact. Kanban reads/writes
  stay in `creator-modules.json`; no new store.

- **L-804 — Humanize in Settings + evidence surfacing.** Humanize exposes the
  active provider in the UI and labels output as a transform (not a new claim);
  when it falls back to deterministic, the UI says so. The `changes: -1`
  convention (provider rewrote the whole draft) renders as "fully rewritten".

- **L-805 — Creator suite UX hardening.** Empty states, loading states, and
  error toasts on all four pages; `useActiveChannel` sync verified across tabs;
  no route throws when no channel exists yet.

### Track INT — Integration (depends on CS being contract-stable)

- **L-806 — Channel → Research → Operations flow.** The active channel's niche
  pre-fills Research; a research snapshot can spawn a `productionItem` in `idea`
  with its `snapshotId`; the item links back to the workflow.

- **L-807 — Unified evidence ledger across creator modules.** Channel
  intelligence, personas, and board artifacts surface in one ledger view with
  their `inferred` labels, consistent with the Insights Evidence ledger naming.

- **L-808 — Creator artifacts in the export pack.** The project export pack
  optionally includes `creator/channel-intelligence.json`,
  `creator/persona.json`, and `creator/avatar.md`, each carrying its
  `evidenceClass`. No new API key.

### Track REL — Release engineering (independent; run in parallel with CS)

- **L-901 — CI stop-the-line policy.** Document and wire branch protection so a
  red `main` blocks merges; record the policy in [PRODUCTIONIZATION.md](PRODUCTIONIZATION.md)
  and a CONTRIBUTING note. (Config/process; no product code.)

- **L-902 — Updater end-to-end proof.** Exercise a real `v2.0.0 → v2.0.x`
  upgrade against a signed build and `latest.json`; record the result. Closes
  PRODUCTIONIZATION P2 #9.

- **L-903 — Windows signing (env-gated).** Wire an Authenticode cert + Windows
  signing host/runner into `desktop-packages.yml` so NSIS/MSI ship signed. Does
  not close until a signature exists; until then the gap stays recorded.

- **L-904 — Rate-limit assumption guard.** Add the explicit single-user/loopback
  comment at `server/rate-limit.ts` and a guard/warning if a non-loopback `HOST`
  is set. Closes PRODUCTIONIZATION P1 #7.

- **L-905 — Reproducible desktop build.** Desktop release builds run from
  `npm ci` on a clean checkout; document and (optionally) CI-check it. Closes
  PRODUCTIONIZATION P2 #10.

### Track ACC — Live acceptance & trust (env/owner-gated; cannot be simulated)

- **L-906 — Live-provider acceptance pass.** Execute the [DESKTOP.md](DESKTOP.md)
  checklist on a clean Mac with a throwaway billable key: Gemini text/image,
  YouTube Data API at the 10,000-unit ceiling, keychain read/write on another
  machine, OAuth Studio mirror against a real refresh token, and the **MiniMax
  Hailuo H3 quote-then-charge** cinematic path. **Does not close until a written
  result for the MiniMax path exists.** No pass is simulated.

- **L-907 — Financial history purge (owner).** Owner runs the `filter-repo` +
  GitHub support purge from [FINANCIAL_PURGE_REQUEST.md](FINANCIAL_PURGE_REQUEST.md)
  and rotates anything exposed. Owner-gated; not an agent action.

---

## 4. Dependency graph & parallel tracks

```
          ┌─────────────────────────────────────────────┐
          │  Foundation (DONE on main):                  │
          │  evidence contracts · provider abstraction   │
          │  creator-store · creator-modules contracts   │
          └───────────────┬─────────────────────────────┘
                          │
        ┌─────────────────┼───────────────────┬──────────────────┐
        │                 │                   │                  │
   Track CS          Track REL           Track ACC (prep)    (no dep)
   L-801 ─┐          L-901  ┐            L-906 checklist
   L-802 ─┤ (parallel L-902  ├ parallel   L-907 owner request
   L-803 ─┤  modules) L-904  │
   L-804 ─┤          L-905 ─┘
   L-805 ─┘
        │
        │  (CS contract-stable)
        ▼
   Track INT
   L-806 → L-807 → L-808
        │
        ▼
   ┌──────────────────────────────┐
   │  GA gate: §6 done-when        │
   │  + env-gated L-903, L-906     │
   └──────────────────────────────┘
```

**What can run at the same time (no shared files):**

| Wave | Run in parallel | Why it's safe |
| --- | --- | --- |
| **Wave 1** | CS `L-801`/`L-802` (creator-ai.ts), `L-803` (creator-store.ts + routes), `L-804`/`L-805` (client pages) · REL `L-901`/`L-904`/`L-905` · ACC prep | CS touches `server/creator-*`; REL touches CI/config + `rate-limit.ts`; ACC is docs/runbook. Disjoint. |
| **Wave 2** | INT `L-806`→`L-808` (sequential within), REL `L-902` | INT needs CS contracts frozen; `L-902` is still independent. |
| **Wave 3** | `L-903` (Windows signing), `L-906` (live pass), `L-907` (purge) | All env/owner-gated; start when hardware/cert/owner available. |

**Within Track CS**, `L-801` → `L-802` has a soft dependency (personas may consume
channel intelligence), but both can start against the schema in parallel and
integrate at the seam. `L-803`, `L-804`, `L-805` are fully independent of `L-801`/`L-802`.

**Single-writer rule:** one person per file-set at a time. The CS sub-tasks are
split by file (`creator-ai.ts` vs `creator-store.ts`+`routes.ts` vs
`client/src/pages/*`) precisely so three can proceed without collisions.

---

## 5. TDD test specs (write these first)

House rules (match the existing suite): `node:test` + `node:assert/strict`;
temp roots via `fs.mkdtemp`; **no live provider calls** — provider-backed paths
are tested by injecting a fake provider or by forcing the deterministic fallback
(pin `CUTROOM_AI_PROVIDER` to an unconfigured provider, as
`server/creator-modules.test.ts` already does for Humanize). Each provider-backed
function must therefore accept an **injectable provider** (dependency injection),
the same way store functions accept a `root` — this is part of the
implementation, specified below.

### L-801 — `server/creator-modules.test.ts` (extend) / `server/creator-ai.test.ts`

Refactor: `analyzeChannelIntelligence(niche, titles, opts?)` where
`opts.provider` is an optional injected text provider; default path is
deterministic.

```
describe("channel intelligence — provider-grounded (L-801)")
  it("uses an injected provider and labels the result inferred")
      → given a fake provider returning valid JSON, result.provider == fake id,
        result.evidenceClass == "inferred"
  it("grounds gaps/growth in channelMemory when provided")
      → memory string appears to influence output; assert non-empty gaps/growth
  it("falls back to deterministic when the provider throws")
      → fake provider throws → result.provider == "deterministic", still inferred
  it("never emits observed")
      → force a provider that returns evidenceClass:"observed" → schema parse
        rejects (inferredEvidenceClassSchema), function returns deterministic
  it("rejects an unlabeled finding")
      → provider omits evidenceClass → rejected, deterministic fallback
```

### L-802 — `server/creator-modules.test.ts` (extend)

Refactor: `buildPersona(..., opts?)` and `buildAvatarMarkdown(..., opts?)` accept
an injected provider.

```
describe("audience persona — provider-grounded (L-802)")
  it("injected provider yields an inferred persona with its provider id")
  it("falls back to deterministic persona when provider fails")
  it("avatar markdown keeps the 'synthesized, not measured' line")
  it("rejects a persona labeled observed")
  it("persona interests are 1..12 and non-empty")  // schema guard holds
```

### L-803 — `server/creator-modules.test.ts` (extend, mkdtemp root)

Schema additions: `productionItem.snapshotId?`, `productionItem.dueDate?`;
`moveProductionItem` guards the `published` transition.

```
describe("operations — workflow link (L-803)")
  it("creates an item carrying an optional snapshotId")
  it("accepts a dueDate and persists it across reload")
  it("blocks move to 'published' without a cited artifact")
      → expect move to throw/return error when snapshotId absent
  it("allows 'published' when snapshotId is present")
  it("unknown stage still rejected")  // existing guard stays green
```

### L-804 — `client/src/pages/humanize.test.tsx` (or a logic unit)

```
describe("humanize UI (L-804)")
  it("renders 'fully rewritten' when changes == -1")
  it("renders the deterministic-fallback notice when provider == 'deterministic'")
  it("shows the active provider id")
```
(If a DOM harness isn't wired for this page, extract the label logic into a pure
function `humanizeSummary(result)` and unit-test that instead — pure-function
tests are preferred and need no DOM.)

### L-805 — `client/src/pages/*` guards

```
describe("creator suite UX (L-805)")
  it("each page renders an empty state with no channel selected")
  it("useActiveChannel broadcasts a change to a second subscriber")
```

### L-806 / L-807 / L-808 — `server/creator-integration.test.ts` (new)

```
describe("channel → research → operations (L-806)")
  it("spawns a production item from a snapshot with its snapshotId")
  it("active channel niche pre-fills a research request payload")
describe("unified evidence ledger (L-807)")
  it("collects channel-intel + persona findings all labeled inferred")
  it("rejects any ledger entry without an evidence class")
describe("export pack creator artifacts (L-808)")
  it("includes creator/*.json with evidenceClass when enabled")
  it("omits creator artifacts when the toggle is off (default)")
```

### L-901 / L-904 / L-905 — config & guard tests

```
describe("rate-limit hosting guard (L-904)")
  it("logs/throws a clear warning when HOST is non-loopback")
  it("stays silent on 127.0.0.1")
```
`L-901` (branch protection) and `L-905` (clean `npm ci` build) are verified by
CI config + a documented runbook, not unit tests.

### L-902 / L-903 / L-906 — acceptance runbooks (not unit tests)

These are **live/manual** acceptance items. Each gets a written checklist and a
recorded result file, not an automated test (the no-live-provider boundary
forbids exercising them in `npm test`). `L-906`'s MiniMax result is the GA gate.

---

## 6. Done-when — GA exit criteria

The Creator Suite GA ships when **all** of these hold:

1. `npm run check` · `npm test` · `npm run build` exit 0, with every new test in
   §5 green and the existing 266 still green.
2. `npm audit --omit=dev` reports 0 vulnerabilities.
3. Channel intelligence and personas have a provider-grounded path **and** a
   deterministic fallback; neither can emit an `observed` or unlabeled claim
   (contract-enforced).
4. Operations links to the workflow (`snapshotId`), and `published` is gated.
5. Export pack carries creator artifacts with evidence labels when enabled; the
   toggle defaults Off.
6. `server/rate-limit.ts` carries the explicit single-user assumption + a
   non-loopback `HOST` guard.
7. CI red on `main` blocks merges (branch protection on).
8. Updater proven on a real `v2.0.0 → v2.0.x` upgrade.
9. No public-facing file names `CreatorForge`, `VideoForge`, or `snapshot`
   (the youtubepro diff); README reflects the creator suite.
10. **Env/owner-gated, tracked separately, not blocking the code GA tag but
    required before "ship to strangers":** L-903 Windows signature exists;
    L-906 MiniMax quote-then-charge written result exists; L-907 history purge
    done. Until each is real, its gap stays recorded in
    [PRODUCTIONIZATION.md](PRODUCTIONIZATION.md) — never simulated.

---

## 7. Ownership & gates

| Item | Gate | Who |
| --- | --- | --- |
| CS, INT, REL (L-901/902/904/905) | none — code + CI | dev/agent |
| L-903 Windows signing | Authenticode cert + Windows host | owner provides cert; agent wires CI |
| L-906 Live-provider pass | clean Mac + throwaway billable key | owner provides; agent runs + records |
| L-907 Financial purge | history rewrite + GitHub support | **owner only** |

---

## Related

- [../TRACKER.md](../TRACKER.md) — the todo ledger (`L-801+`, `L-901+`)
- [PRODUCTIONIZATION.md](PRODUCTIONIZATION.md) — readiness assessment & blockers
- [RELEASE_PLAN.md](RELEASE_PLAN.md) — version train (GA = 2.1)
- [DESKTOP.md](DESKTOP.md) — live-key acceptance checklist
- [FINANCIAL_PURGE_REQUEST.md](FINANCIAL_PURGE_REQUEST.md) — owner purge steps
