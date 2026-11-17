# Cutroom Go-to-Market Roadmap — v2.2 "Market readiness"

**Goal:** take Cutroom from *code-GA* (v2.1, the Creator Suite GA) to *shippable to
strangers and sellable* — closing the owner-gated release blockers, deciding the
commercial model, and standing up the samples + testing infrastructure that makes
the pipeline provable and demoable.

This is the implementation document for the GTM phase. It states each goal, the
**decision gate** that shapes the commercial tracks, the **dependency graph**, the
**parallel tracks** you can run at once, the **TDD test specs** to write first, and
the **done-when** gate. Day-to-day status is in [../TRACKER.md](../TRACKER.md)
(Phase 10, `G-001+`). Readiness evidence is [PRODUCTIONIZATION.md](PRODUCTIONIZATION.md);
the code-GA plan is [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md); the version train is
[RELEASE_PLAN.md](RELEASE_PLAN.md).

**Companion docs:** [ROADMAP.md](../ROADMAP.md) · [TRACKER.md](../TRACKER.md) ·
[PRODUCTIONIZATION.md](PRODUCTIONIZATION.md) · [STRATEGY.md](STRATEGY.md) ·
[RELEASE_PLAN.md](RELEASE_PLAN.md) · [DESKTOP.md](DESKTOP.md)

---

## 1. How to use this document

1. **Settle Gate 0 first** (§3). The commercial-model decision bifurcates every
   monetization track; nothing in Track COMM should start before it.
2. Pick a **track** (§5). Tracks are split by file-set/ownership so they run in
   parallel without collisions.
3. For each buildable goal, **write the tests first** (§6), watch them fail, then
   implement until green. No goal is "done" until its named tests pass **and** the
   three HANDOFF commands stay green: `npm run check` · `npm test` · `npm run build`.
4. Respect the standing boundaries ([ROADMAP.md](../ROADMAP.md) §"Standing
   boundaries"): no live-provider calls in automated tests; every creator claim
   stays evidence-labeled `inferred`; keys never reach the WebView; loopback-only
   unless Gate 0 explicitly authorizes a hosted surface **with an auth design**.

---

## 2. Where we are (start here)

**Code is GA-ready.** On `main`: creator suite at production depth (`L-801`–`L-808`),
`npm run check`/`npm test`/`npm run build` green (299 tests), `npm audit --omit=dev`
0 vulnerabilities, `zod` 4 migration done, CI `cargo-check` fixed, `engines` set,
rate-limit guard + opt-in diagnostics export shipped. The code side is **not** the
blocker.

**What's pending for market is at the edges and in the business layer:**

| Pending | Class | Who |
| --- | --- | --- |
| Live-provider acceptance pass (`L-906`) | release blocker | owner provides key/Mac; agent runs + records |
| Windows signing (`L-903`) | release blocker | owner provides cert; agent wires CI |
| Updater end-to-end proof (`L-902`) | release blocker | needs a signed install |
| Financial-history purge (`L-907`) | release blocker | **owner only** |
| Branch protection on `main` (`L-901`) | release blocker | owner GitHub setting |
| Commercial model (free vs licensed vs hosted) | **decision** | **owner (Gate 0)** |
| Accounts / licensing / **Stripe** | commercial | gated on Gate 0 |
| Pricing & packaging | commercial | owner decides; agent wires |
| Download/landing + proven release channel | distribution | after signing + updater |
| Legal pack (ToS / Privacy / EULA / refunds) | distribution | **owner/legal** |
| Deterministic **samples** generator | QA / demo / onboarding | agent (buildable now) |
| E2E + browser-smoke **test** harness | QA | agent (buildable now) |

> **Positioning honesty.** Today's docs name "Mandatory accounts" and a SaaS login
> as **non-goals**, and lead with local-first / BYO-keys. Introducing accounts or
> billing is therefore a **strategic change of positioning**, not just an
> integration — which is why it is Gate 0, not a task. Fake-publish and the retired
> CreatorForge store/credits stay excluded regardless of the model chosen.

---

## 3. Gate 0 — the commercial model (decide before Track COMM)

Everything in Track COMM (accounts, licensing, Stripe, managed keys) depends on
this single owner decision. The three viable models:

| Model | What it is | Stripe? | Trade-off |
| --- | --- | --- | --- |
| **A. Free / OSS** | Stays local-first, BYO-keys, no accounts, Apache-2.0 | No | Preserves positioning; no revenue path. Donations/sponsorship only. |
| **B. Licensed desktop** *(recommended default)* | Paid unlock via a signed **license key**; still BYO provider keys; offline-verifiable; no account server required | **Yes** — Stripe Checkout → license issuance | Keeps local-first + loopback; monetizes; no hosting/PII surface. Piracy is softer than SaaS but acceptable for the segment. |
| **C. Hosted / managed keys** | Cutroom proxies provider keys server-side with **metered billing** | Yes (metered) | Best UX + recurring revenue, but **breaks local-first/loopback**, adds auth + PII + hosting + security-design burden, and re-opens the excluded "credits" surface. |

**`G-001` is the decision itself.** The roadmap below is written for **Model B** as
the default (it monetizes with the least architectural disruption and keeps the
product's core promise). If the owner picks A, Track COMM is cut; if C, Track COMM
expands with a hosted-proxy + auth-design sub-track (a 3.x-scale effort, out of
scope for v2.2).

---

## 4. Goal statements (Phase 10 — `G-001+`)

### Track REL — release blockers (owner/env-gated; already in TRACKER Phase 9)

Not re-planned here — these are the existing `L-9xx` items that stand between the
code and a build you hand to strangers. GTM treats them as the **distribution gate**:

- **`L-901`** branch protection on `main` (owner GitHub setting).
- **`L-902`** updater proven on a real `v2.0.0 → v2.0.x` upgrade (needs a signed install).
- **`L-903`** Windows signing (Authenticode cert + Windows runner).
- **`L-906`** live-provider acceptance pass incl. MiniMax quote-then-charge (clean Mac + throwaway billable key).
- **`L-907`** financial-history purge (owner `filter-repo` + GitHub support).

### Track SMPL — samples generation (buildable now; model-independent)

- **`G-101` — Deterministic sample dataset generator.** `npm run samples:generate`
  produces a canonical, reproducible sample project using **deterministic fallbacks
  only** (no live keys): one channel, N personas, a research-snapshot fixture, a
  script, a publish package, a board, and a full export pack including `creator/`
  artifacts. Large media under `samples/` (gitignored); small golden JSON under
  `test/fixtures/samples/`. Output is byte-stable across runs.
- **`G-102` — "Load sample project" onboarding.** A first-run action seeds the demo
  workflow so a new user sees a populated app immediately; every artifact is clearly
  labeled sample / `inferred`; Settings toggles stay Off by default.
- **`G-103` — Marketing/demo sample set.** A curated export pack + screenshots feed
  the landing page, `USER_GUIDE.md`, and `launch-video/`. No new key.

### Track QA — testing (buildable now)

- **`G-201` — Headless E2E acceptance harness.** A node runner drives the built
  sidecar through Research → Insights → Script → Thumbnail → Package → Export with
  deterministic providers, asserting a valid export pack and preserved evidence
  labels end to end. No live keys.
- **`G-202` — Browser-smoke coverage.** A minimal automated browser pass (Playwright,
  or the preview-driven harness) over the critical pages — Settings toggles, export
  trigger — closing the "UI changes may ship without browser coverage" signal the PR
  risk-taxonomy bot flags. Tooling choice is a dev decision.
- **`G-203` — Sample-driven regression.** Wire the `G-101` goldens into `npm test`
  so any drift in export/evidence/creator contracts fails a golden compare.
- **`G-204` — Live-provider acceptance pass.** Same item as `L-906`; listed here so
  the GTM gate references it. Env/owner-gated; recorded, never simulated.
- **`G-205` — Reference-set fixtures (optional).** Analyzer/golden fixtures that also
  answer the ECC "reference set readiness" audit. Low priority.

### Track COMM — commercialization (gated on Gate 0 = B or C)

- **`G-301` — Entitlement / licensing.** A public-key-signed **license key**:
  issuance payload, offline verification (signature + expiry + tamper rejection),
  and a feature-gate that unlocks "pro" capabilities. No account server for Model B.
- **`G-302` — Stripe integration (test-mode first).** Stripe Checkout → webhook →
  license issuance. Built and tested against **Stripe test keys / published test
  cards only**; the live switch and any real card entry are **owner-run, never the
  agent's** (see §8). Pricing from `G-303`.
- **`G-303` — Pricing & packaging (owner).** Tiers, free-vs-paid boundary, trial
  length; recorded in [STRATEGY.md](STRATEGY.md).
- **`G-304` — Managed-key proxy (only if Gate 0 = C; likely deferred to 3.x).**
  Hosted proxy + metered billing + the auth/security design the standing boundary
  requires before any non-loopback surface.

### Track DIST — distribution & legal

- **`G-401` — Download channel + landing.** Signed macOS DMG and signed Windows
  build (depends on `L-903`) published on a real download surface, with the updater
  proven (`L-902`). Landing page states the evidence/local-first posture.
- **`G-402` — Legal pack (owner/legal).** ToS, Privacy Policy, EULA, refund policy;
  plus a YouTube Data API ToS review for distribution at scale.
- **`G-403` — Support path.** Document the shipped opt-in diagnostics bundle as the
  support channel; define a contact/intake flow.

---

## 5. Dependency graph & parallel tracks

```
        ┌────────────────────────────────────────────┐
        │  Code GA done on main (v2.1):               │
        │  creator suite · export pack · 299 tests    │
        └───────────────┬────────────────────────────┘
                        │
   ┌──────────────┬─────┴───────┬──────────────────┬───────────────┐
   │              │             │                  │               │
 Track SMPL    Track QA      Track REL          Gate 0          (legal)
 G-101 ─┐      G-201 ─┐      L-901 (owner)      G-001  ───► Track COMM
 G-102 ─┤      G-202 ─┤      L-902 (signed)     decision    G-301 → G-302
 G-103 ─┘      G-203 ─┤      L-903 (cert)                   G-303 (owner)
   │           G-205 ─┘      L-906 = G-204                  G-304 (if C)
   │  goldens     │          L-907 (owner)
   └─────┬────────┘                │
         ▼                         ▼
   ┌───────────────────────────────────────────────┐
   │  Track DIST: G-401 (needs L-902+L-903)         │
   │              G-402 / G-403 (owner)             │
   └───────────────────────┬───────────────────────┘
                           ▼
            ┌──────────────────────────────┐
            │  GTM gate: §7 done-when        │
            └──────────────────────────────┘
```

**What runs at the same time (no shared files):**

| Wave | Run in parallel | Why it's safe |
| --- | --- | --- |
| **Wave 1 (now)** | SMPL `G-101`–`G-103`, QA `G-201`–`G-203`/`G-205`, REL `L-901` | SMPL adds `scripts/` + `samples/` + fixtures; QA adds test harness files; `L-901` is a GitHub setting. Disjoint from product code and from each other by file-set. |
| **Wave 2 (owner resources)** | REL `L-902`/`L-903`/`L-906`/`L-907`, **Gate 0** decision | Each needs a cert / key / signed install / owner action. Gate 0 is a decision, not code. |
| **Wave 3 (after Gate 0 = B/C)** | COMM `G-301`→`G-302`, DIST `G-401` (after signing+updater), `G-402`/`G-403` | COMM needs the model fixed; DIST needs the signed artifacts + proven updater. |

**Single-writer rule:** one owner per file-set. SMPL (`scripts/samples*`, `samples/`,
`test/fixtures/samples/`), QA (`test/e2e*`, browser harness config), and COMM
(`server/licensing*`, `server/billing*`, Settings UI) are disjoint by design.

---

## 6. TDD test specs (write these first)

House rules (match the suite): `node:test` + `node:assert/strict`; temp roots via
`fs.mkdtemp`; **no live provider calls** — force deterministic fallback or inject a
fake provider; **no live Stripe calls** — use fixture webhook events and test keys.

### SMPL — `scripts/samples/generate.test.ts`
```
describe("sample generator (G-101)")
  it("produces a byte-stable export pack across two runs")      // determinism
  it("every creator/* artifact is labeled inferred")            // evidence contract
  it("the golden JSON under test/fixtures/samples matches")     // regression anchor
  it("runs with no provider configured (deterministic only)")   // no live key
```

### QA — `test/e2e/pipeline.test.ts` + browser smoke
```
describe("headless pipeline E2E (G-201)")
  it("Research→…→Export yields a valid pack with preserved snapshotIds")
  it("requires_studio claims never render as observed fact")
describe("browser smoke (G-202)")
  it("Settings renders the export toggle Off by default")
  it("export trigger produces a downloadable pack")             // deterministic data
describe("sample regression (G-203)")
  it("a changed export/evidence contract fails a golden compare")
```

### COMM — `server/licensing.test.ts` + `server/billing-webhook.test.ts`
```
describe("license verification (G-301)")
  it("accepts a correctly signed, unexpired license")
  it("rejects a tampered payload")                              // signature guard
  it("rejects an expired license")
  it("gates a pro feature off without a valid license")
describe("stripe webhook → license issuance (G-302)")
  it("issues a license on a fixture checkout.session.completed")// fixture event, no network
  it("ignores an unsigned/invalid webhook signature")
  it("is idempotent on a replayed event")
```

### REL / DIST — acceptance runbooks (not unit tests)
`L-902`/`L-903`/`L-906` and `G-401`/`G-402` are live/manual acceptance items with a
written checklist + recorded result file, per the no-live boundary. `L-906`'s
MiniMax result remains the sharpest gate.

---

## 7. Done-when — go-to-market exit criteria

GTM (v2.2) ships when **all** of these hold:

1. **Gate 0 decided and recorded** in [STRATEGY.md](STRATEGY.md) / [RELEASE_PLAN.md](RELEASE_PLAN.md).
2. **Release blockers real or accepted:** `L-902` updater proven, `L-903` Windows
   signature exists, `L-906` MiniMax quote-then-charge written result exists,
   `L-907` purge done, `L-901` branch protection on — or each explicitly accepted as
   a recorded limitation, never simulated.
3. **Samples generate deterministically** and their goldens gate regressions in CI.
4. **E2E + browser smoke green** in CI (closes the "no browser coverage" signal).
5. **If commercial (B/C):** license verification + Stripe **test-mode** flow proven
   by the §6 tests; pricing/packaging recorded; legal pack published.
6. **Download channel live** with signed macOS + Windows builds and a proven updater.
7. `npm run check` · `npm test` · `npm run build` exit 0; `npm audit --omit=dev` 0.

---

## 8. Ownership & gates

| Item | Gate | Who |
| --- | --- | --- |
| SMPL `G-101`–`G-103`, QA `G-201`–`G-203`/`G-205` | none — code + CI | agent/dev |
| Gate 0 `G-001` commercial model | strategic decision | **owner** |
| COMM `G-301` licensing, `G-302` Stripe wiring | Gate 0 = B/C; **test-mode only** | agent builds + tests; **owner flips live keys and performs any real payment** |
| `G-303` pricing | business decision | owner |
| `L-903` Windows signing | Authenticode cert + Windows host | owner provides cert; agent wires |
| `L-906` live-provider pass | clean Mac + throwaway billable key | owner provides; agent runs + records |
| `L-907` financial purge, `G-402` legal | owner/legal action | **owner only** |
| `G-401` download channel | needs `L-902` + `L-903` | agent wires once signed |

**Agent boundary (standing):** the agent never enters payment credentials, never
performs a live financial transaction, never flips Stripe to live mode, and never
publishes to production on its own. Those are owner actions. The agent builds and
verifies the flows in Stripe **test mode** with published test cards.

---

## Related

- [../TRACKER.md](../TRACKER.md) — the todo ledger (Phase 10, `G-001+`)
- [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) — the code-GA plan (`L-801+`/`L-901+`)
- [PRODUCTIONIZATION.md](PRODUCTIONIZATION.md) — readiness evidence & blockers
- [RELEASE_PLAN.md](RELEASE_PLAN.md) — version train (GTM = 2.2)
- [STRATEGY.md](STRATEGY.md) — positioning, competitors, pricing context
- [DESKTOP.md](DESKTOP.md) — live-key acceptance checklist
