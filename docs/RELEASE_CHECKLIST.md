# Cutroom — Release Checklist

**Version:** 2.0.0 · **Prepared:** 2026-11-18 · **Branch verified:** `main` @ `e9020f9`

A concrete, tickable go/no-go list for cutting a Cutroom release. The strategic
version map lives in [RELEASE_PLAN.md](RELEASE_PLAN.md); the open owner-gated
work is in [PRODUCTION_SIGNOFF_TRACKER.md](PRODUCTION_SIGNOFF_TRACKER.md) and
[PRODUCTION_PLAN.md](PRODUCTION_PLAN.md). This page is the operational gate.

> **Scope note.** Everything a developer can *run and verify* on this machine is
> green (below). The remaining release gates — notarized/signed installers, the
> Windows build, the formal paid live-provider acceptance pass, and the deploy
> itself — are **owner-run** and tracked at the bottom. This checklist does not
> deploy, tag, or sign; it certifies readiness and records evidence.

---

## 1. Code & quality gates (all green 2026-11-18)

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npm run check` | ✅ exit 0 |
| Tests | `npm test` | ✅ **383 pass / 0 fail** |
| Build | `npm run build` | ✅ exit 0 (2 benign `import.meta`-in-cjs warnings) |
| Prod deps audit | `npm audit --omit=dev` | ✅ **0 vulnerabilities** |
| Working tree | `git status` | ✅ clean (tracked); only untracked `creator-modules.json` |
| Branch sync | `git rev-list --left-right --count main...origin/main` | ✅ `0  0` |

Re-run before every tag:

```bash
npm run check && npm test && npm run build && npm audit --omit=dev
```

---

## 2. Build artifacts

`npm run build` (`tsx script/build.ts`) emits the production bundle to `dist/`
(gitignored — ship via a GitHub Release or the native bundle, never commit it).

**Manifest captured 2026-11-18:**

| Path | Size | Notes |
| --- | --- | --- |
| `dist/index.cjs` | 1.5 MB | Node/Express sidecar (server) |
| `dist/public/assets/index-*.js` | 1.6 MB | React client bundle |
| `dist/public/assets/index-*.css` | 132 KB | Tailwind v4 output |
| `dist/public/filmcraft-web/filmcraft_web_bg.wasm` | 48 MB | Pro FilmCraft engine (dominates size) |
| **`dist/` total** | **52 MB** | 48 MB of which is the Pro WASM |

Start the built sidecar (loopback only):

```bash
npm start        # NODE_ENV=production node dist/index.cjs
```

### Native desktop packaging (Tauri 2)

```bash
npm run tauri:build
```

Produces `Cutroom.app` + `Cutroom_2.0.0_aarch64.dmg` under
`src-tauri/target/release/bundle/`. **Owner-run** — signing/notarization needs
the Apple Developer ID creds (see §5). Windows build + Authenticode is `L-903`.

---

## 3. Live end-to-end acceptance (run 2026-11-18, real keys)

The full pipeline was exercised against live providers on this machine. Topic:
*"how to make perfect cold brew coffee at home."*

| Stage | Provider | Result |
| --- | --- | --- |
| Research | YouTube Data API | 202 quota units, 50 videos, real analytics |
| Insights → Ideas | Gemini 3.7 Flash | evidence-grounded idea packages |
| Script | Gemini 3.7 Flash | idea-grounded Short script (300 words) |
| Thumbnail | Gemini image (Nano Banana 2) | real image + SynthID provenance |
| Package | Gemini 3.7 Flash | titles/hooks, `observed` vs `inferred` labels intact |
| Board | Gemini | "Board check: pass", 9 shots / 4 panels |
| Cinematic video | **MiniMax Hailuo H3** | real `render.mp4` — h264 1344×768, aac, **5.17s, ~1 MB, $0.45** |

See [INVESTOR_DEMO.md](INVESTOR_DEMO.md) and
[guides/persona-walkthroughs.md](guides/persona-walkthroughs.md) for the
screenshotted walkthrough of this exact run.

### Text-provider matrix (all validated live via `regenerate-titles`)

| Provider | Slot / model | Status |
| --- | --- | --- |
| Gemini | native `gemini-3.7-flash` | ✅ default; ran whole pipeline |
| Omnirouter | OpenAI-compatible `…/v1`, `auto/best-fast` | ✅ auto-routed to `openai/gpt-6.2-astra-pro`, usage+cost reported |
| OpenRouter | `openrouter/auto` | ✅ live titles |
| OpenAI (direct) | OpenAI-compatible slot | ↩︎ redundant — Omnirouter already reaches OpenAI |

Secrets are stored in the OS keychain on desktop, else the server's owner-only
`.env`; saved values are never returned to the browser.

---

## 4. Pre-tag checklist

- [ ] §1 gates re-run and green on the release commit
- [ ] `package.json` + `src-tauri/tauri.conf.json` version bumped and matching
- [ ] [RELEASE_NOTES.md](../RELEASE_NOTES.md) updated for the version
- [ ] [TRACKER.md](../TRACKER.md) / [PRODUCTION_SIGNOFF_TRACKER.md](PRODUCTION_SIGNOFF_TRACKER.md) status current
- [ ] No secrets, tokens, or production URLs in the diff (scan the PR)
- [ ] Large binaries intentional (the 48 MB Pro WASM is expected)
- [ ] `docs/images/` screenshots current for the shipping UI

## 5. Owner-run release gates (NOT done by this checklist)

These need credentials, a clean machine, billable keys, or a history rewrite —
they are the owner's to execute and record.

| Gate | What it needs | Tracker |
| --- | --- | --- |
| **L-902** updater live-upgrade proof | a prior signed install + new signed build | `L-902` |
| **L-903** Windows signing | Authenticode cert + Windows runner | `L-903` |
| **L-906** live-provider acceptance pass | clean Mac + billable keys | `L-906` (today's MiniMax quote-then-charge run is the evidence shape) |
| **L-907** financial-history purge | owner-only history rewrite | `L-907` |
| Apple notarization | Developer ID + notary creds | §2 |
| Deploy / tag / GitHub Release | owner action | — |

## 6. Rollback

Local-first app: "rollback" = ship the prior signed build / DMG and, if the
updater feed advanced, point it back. No server state to revert. Keys and
workflows are on the user's machine and are untouched by a version change.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
