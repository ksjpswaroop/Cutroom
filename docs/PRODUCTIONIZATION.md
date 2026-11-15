# Productionization assessment — 2026-11-15

What stands between Cutroom 2.0.0 and a build you'd hand to strangers.

**Method:** evidence, not the tracker. `TRACKER.md` reads 104 done / 1 cancelled / **0 open**, so it cannot tell you what's left. Everything below came from running the verification suite, auditing dependencies, and reading the shipped config on merged `main` (`0175985`).

**Verified green on merged main:** `npm run check` exit 0 · `npm test` 243 pass / 0 fail · `npm run build` exit 0. All three HANDOFF commands.

---

## Scorecard

| Area | State |
| --- | --- |
| Contract tests | 243 passing, zero skipped |
| Secret hygiene | No secret ever committed — verified across all history |
| Code debt markers | Zero TODO / FIXME / HACK in `server`, `shared`, `client/src` |
| Network posture | Binds `127.0.0.1` by default; `0.0.0.0` explicitly out of scope |
| Crash safety | `unhandledRejection` + `uncaughtException` handlers present |
| Updater | Signing pubkey configured; `latest.json` endpoint live |
| macOS | Developer ID signed, notarized, stapled, Gatekeeper green |
| Dependency security | Was 2 critical / 4 high / 8 moderate; 1 high (`zod`) remains as of 2026-11-15 |
| **Live-provider verification** | **Never run** |
| **Windows** | **Unsigned binary only** |
| Field diagnostics | None by design — no telemetry, and no log export either |
| CI on `main` | Was red since 2026-08-29; `cargo-check` fixed 2026-11-15 |

The codebase discipline is genuinely high. The gaps are at the edges: dependencies, paid paths, and anything that happens on a machine you don't own.

---

## P0 — blockers

### 1. Two critical CVEs in production dependencies

`npm audit --omit=dev` → **14 vulnerabilities (2 critical, 4 high, 8 moderate)**.

| Severity | Package | Issue | Fix |
| --- | --- | --- | --- |
| CRITICAL | `dompurify` | DOM XSS — `IN_PLACE` leaves detached subtree event handlers armed | non-breaking |
| CRITICAL | `proxy-addr` | IP spoofing via IPv4-mapped IPv6 trust subnet | non-breaking |
| HIGH | `body-parser` | DoS via trailing bytes after compressed body | non-breaking |
| HIGH | `brace-expansion` | Quadratic-time expansion CPU DoS | non-breaking |
| HIGH | `source-map-js` | Event-loop DoS via indexed section offsets | non-breaking |
| HIGH | `zod` | Memory exhaustion on oversized collections | **breaking (semver major)** |

**Triage by real exposure, not by severity label:**

- **`dompurify` is the one that matters.** It is transitive via `jspdf@4.2.1` (PDF export). Research PDFs embed **untrusted public YouTube titles and descriptions**, so there is a plausible path from attacker-controlled video metadata into the sanitizer. Narrow, but it is the one place the product handles hostile strings in a rendering context. Fix is non-breaking — take it.
- **`proxy-addr` and `body-parser` are near-zero in practice** because the server binds loopback and there is no proxy in front. They become real the moment anyone sets `HOST`. Fix anyway; they're free.
- **`zod` needs a planned migration.** It's a semver-major bump across `shared/schema.ts` and `shared/evidence-contracts.ts` — the contract layer. Don't rush it into a patch release.

**Fixed 2026-11-15.** `npm audit fix` (no `--force`) took production vulnerabilities from **14 to 1**. Both criticals are gone: `dompurify` moved 3.4.14 → 3.4.18, closing the only path that touched untrusted YouTube metadata. `body-parser` → 2.4.0, `source-map-js` → 1.2.2, `proxy-addr` and `brace-expansion` resolved by deduplication. Only `package-lock.json` changed, so no dependency range was widened.

Verified after: `check` exit 0, 243 tests pass, `build` exit 0, and the export-path tests (`research export tables`, `zip store`) pass — those exercise the `jspdf` → `dompurify` chain that carried the critical.

**Still to do:** `zod` remains at 3.25.76 with a high-severity memory-exhaustion advisory. Its fix is semver-major across `shared/schema.ts` and `shared/evidence-contracts.ts` — the contract layer — so it needs its own change with the evidence contracts re-verified, not an `audit fix --force`.

**Checked and cleared:** the single `dangerouslySetInnerHTML` (`client/src/components/ui/chart.tsx:81`) interpolates code-defined chart colors, not user input. Not a finding.

### 2. No live-provider acceptance pass has ever run

`HANDOFF.md` states it plainly: *"Paid-provider behavior still needs an explicit live-key acceptance pass."* The test suite makes **no live provider calls** by design (a standing boundary), so 243 green tests say nothing about:

- Gemini text and image under real quota, real latency, real error bodies
- YouTube Data API quota exhaustion behavior at the 10,000-unit ceiling
- **MiniMax Hailuo H3 cinematic — the quote-then-charge path.** This spends real money and has never been exercised end to end against the live provider.
- Keychain read/write on a machine that isn't this one
- OAuth Studio mirror against a real refresh token

The cinematic path is the sharpest edge: a billing flow verified only by contract tests. The checklist exists at `docs/DESKTOP.md` (L-202, L-203, L-208) and has not been executed.

**Do:** run it on a clean Mac with a separate throwaway key, and record the results.

### 3. Financial documents are public

`business/` — valuation workbook, valuation report, business plan, pitch deck, investor handover — was committed and pushed to `github.com/ksjpswaroop/Cutroom`, a **public** repository, on 2026-11-14.

This was a deliberate decision made with the file list in view, so it is recorded here as a known state rather than an error. It belongs on this list because the cost of reversing it rises daily: GitHub keeps blobs reachable by SHA after branch deletion, so removal requires history rewriting *and* a support request to purge cached objects.

**Decide:** keep public, or rewrite now. There is no cheap third option later.

---

### 4. CI has been red on `main` since at least August

`gh run list --branch main` shows the last two completed runs before today both **failed** — 2026-08-29 and 2026-10-23. The safety net has been off for roughly three months, which means a real regression would land unnoticed.

The split matters, and it's good news:

- **`verify` succeeds** — contract tests, `tsc`, and the production build all pass in CI. The job that catches code regressions is healthy.
- **`cargo-check` fails**, exit 101, with the cause in the log:
  `glob pattern resources/app/**/* path not found or didn't match any files.`

`src-tauri/tauri.conf.json` bundles `resources/app/**/*`, which `npm run desktop:prepare` generates and `.gitignore` excludes. On a clean CI checkout that directory never exists, so the Tauri build aborts before compiling. The job is missing its prepare step — it is a **CI configuration defect, not a code defect**, which is why local desktop builds have kept working and nobody noticed.

**Fixed 2026-11-15.** The `cargo-check` job now writes a placeholder into `src-tauri/resources/app/` before the cargo step. Running the full `desktop:prepare` was rejected as disproportionate: it triggers a production build plus a nested npm install inside a job capped at 10 minutes, when `cargo check` only needs the glob to match. The strict glob stays intact so genuine bundle builds still fail loudly if the real sidecar payload is missing.

Reproduced before fixing — moving the local `resources/app` aside gave exit 101 with the identical message, and the placeholder brought `cargo check` to exit 0.

**Still to do:** treat red CI on `main` as a stop-the-line event, because for three months it hasn't been one.

Secondary, from the same logs: GitHub is warning that `actions/checkout@v4` and `actions/cache@v4` target deprecated Node 20 and are being forced onto Node 24. Bump them before they stop working.

---

## P1 — before wider distribution

### 4. No `engines` field

`package.json` declares no `engines`. CI pins Node `20.19.0`; this machine runs `v26.10.0`; the README claims Node 20.19+. Nothing enforces any of it, so a contributor on an unsupported Node gets a confusing failure instead of a clear one.

**Do:** add `"engines": { "node": ">=20.19" }`.

### 5. Windows is unsigned

L-411 shipped `cutroom-windows-x86_64.exe` cross-built via cargo-xwin — unsigned, with NSIS/MSI still needing a Windows host or CI runner. Users will meet a SmartScreen warning, which is precisely the trust friction this product exists to avoid. macOS is fully notarized; Windows is not at parity.

### 6. Zero field diagnostics

No telemetry is the right call and a selling point. But there is currently *no* path for a user to report what went wrong — no crash dump, no log bundle, no "export diagnostics" button. When a stranger hits a bug, neither of you can see it.

**Do:** an opt-in, local-only "export diagnostic bundle" that writes redacted logs to a file the user chooses and inspects before sending. Consistent with the privacy posture; closes the support hole.

### 7. Rate limiting is in-memory

`server/rate-limit.ts` resets on restart. Correct for single-user loopback. It silently stops being correct if a multi-user or hosted surface is ever added — worth a comment at the definition so the assumption is explicit.

---

## P2 — hygiene

8. **`dist/index.cjs` is 1.0 MB**, flagged by the bundler. Cosmetic for a desktop sidecar; worth a look if startup time regresses.
9. **Updater has never been exercised end to end.** Pubkey and endpoint are configured; an actual v2.0.0 → v2.0.1 upgrade on a real install hasn't been proven. The first real update is a bad time to find out.
10. **Dependency tree is not reproducibly verified for desktop packaging.** `node_modules` vanished from this checkout between 2026-11-13 and 2026-11-15 (cause unknown; nothing in this session removed it). `npm ci` from the lockfile restored a green build, so no harm — but desktop release builds should run from `npm ci` on a clean checkout, never from whatever happens to be on the machine.

---

## Suggested order

1. ~~Fix the `cargo-check` CI job~~ — **done 2026-11-15**
2. ~~`npm audit fix` (five non-breaking)~~ — **done 2026-11-15**, 14 → 1
3. Decide `business/` — the clock is running
4. Add `engines`
5. Live-key acceptance pass on a clean Mac, cinematic quote path included
6. Diagnostic bundle export
7. Updater end-to-end test
8. Plan the `zod` major against the contract layer
9. Windows signing

Items 1–4 are a day. Item 5 is the one that decides whether this is shippable to strangers, and it cannot be shortened by reading more code.

---

## Related

- [../TRACKER.md](../TRACKER.md) — feature ledger (all green; not a readiness signal)
- [../HANDOFF.md](../HANDOFF.md) — verification commands, standing boundaries
- [RELEASE_PLAN.md](RELEASE_PLAN.md) — release train and packaging checklist
- [DESKTOP.md](DESKTOP.md) — live-key acceptance checklist
