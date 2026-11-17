# Release notes

## Version 2.1.0 — Creator Suite GA (draft, pending release)

> Prepared draft. The tag, signed build, and GitHub Release are the owner's call
> and are not created by this change. The code is merged-ready on the PR; the
> live-provider acceptance pass and Windows signing remain open and named (see
> [docs/PRODUCTIONIZATION.md](docs/PRODUCTIONIZATION.md)).

Brings the creator-intelligence suite folded in from CreatorForge to production
depth, and closes the code-side productionization gaps.

### Added / improved

- **Creator suite is provider-grounded.** Channel intelligence and audience
  personas synthesize through the active Cutroom text provider (Gemini / Ollama /
  OpenRouter / OpenAI-compatible / MiniMax) and fall back to a deterministic
  rewrite when no provider is configured. Every finding is labeled **inferred**
  in code — a model can never relabel a synthesized claim as observed.
- **Operations is evidence-gated.** Production items carry an optional snapshot
  and due date; an item cannot be marked **published** without citing a workflow
  snapshot.
- **Unified creator evidence ledger** (`/api/creator/ledger`) collects channel
  intelligence, personas, and the audience avatar, refusing any entry without an
  `inferred` label.
- **Humanize honesty.** The result discloses the active provider and shows a
  clear notice when the local deterministic fallback ran.
- **Research prefill.** The search box seeds from the active channel's niche
  (once, only when empty).
- **Creator artifacts in the export pack.** Channel intelligence, the audience
  persona, and the avatar are added under `creator/` in the project export when
  the new **Creator artifacts in export pack** Settings toggle is on (default
  Off). Each file is labeled **inferred**; nothing is exported until you turn it
  on. Served by `GET /api/creator/export` and assembled by the client pack.
- **Opt-in, local-only, redacted diagnostics export** (no telemetry).
- **Trust/robustness:** `zod` 4 migration (high-severity advisory cleared);
  `engines: node >=20.19`; CI Actions off deprecated Node 20; rate-limiter
  single-user assumption guarded with a non-loopback `HOST` warning.

### Verification

- `npm run check`: passed
- `npm test`: 299 passed / 0 failed
- `npm run build`: passed
- `npm audit --omit=dev`: 0 vulnerabilities

### Still open (named, not simulated)

- **Live-provider acceptance pass** (incl. MiniMax Hailuo H3 quote-then-charge) —
  needs a clean Mac and a throwaway billable key.
- **Windows signing** — needs an Authenticode certificate and a Windows runner.
- **Financial history purge** — owner-run history rewrite + GitHub support.
- **Not ported, by design:** CreatorForge's store, credits, Claude-only engine,
  fake publish API, collaboration, and integrations.

## 2026-08-25: Version 1.0.0 public release

This release brings the complete local-first workflow, current product documentation, and release checks together in the public GitHub repository.

### Included

- **Complete creation workflow:** Research, evidence-grounded AI Insights, automatically generated Ideas, Script Writer with teleprompter, and Thumbnail Creator remain connected through one restorable project.
- **Workflow history controls:** The eight most recent browser-local projects can be reopened, renamed, or deleted after explicit confirmation.
- **Current product tour:** Five current screenshots document Research analytics, source videos, AI Insights, the Script teleprompter, and Thumbnail Creator.
- **Launch package:** A five-minute demonstration script, presentation, shot list, and YouTube publishing package are available under `docs/launch-video/`.
- **License:** Apache License 2.0. This copy is local-only and is not linked to a remote origin.

### Verification

- `npm test`: 62 tests passed
- `npm run check`: TypeScript check passed
- `npm run build`: Production client and server builds completed
- `npm audit --audit-level=high`: 0 vulnerabilities
- Current source scan outside the ignored `.env`: 0 secret findings
- GitHub Actions runs the same test, TypeScript, and production-build gates on every push and pull request

### Release boundary

This is a local-first application release, not a hardened multi-user internet service. Do not expose the server directly to the internet without the authentication, secret-management, shared rate-limiting, and deployment-specific security controls described in `SECURITY.md`.

## 2026-08-24: Restorable local workflows and refreshed research experience

This update makes Cutroom easier to leave and resume. Research, generated ideas, scripts, and thumbnail work now stay grouped as local workflows, while the research brief presents dense AI output in a more visual, scan-first format.

### Added

- **Recent workflows:** The sidebar lists the eight most recently updated projects and reopens the last useful Research, Script Writer, or Thumbnail Creator step.
- **Browser-local persistence:** Research snapshots, AI Insights, grounded ideas, script output and revisions, thumbnail briefs, and generated thumbnail results are stored in IndexedDB.
- **Independent projects:** **New Workflow** starts a fresh project without replacing earlier work in the recent-workflow list.
- **Workflow management:** Recent projects can be renamed from the sidebar or deleted after explicit confirmation.
- **Workflow helper tests:** Shared title, ordering, deduplication, and history-limit behavior now have focused automated coverage.

### Improved

- **Research readability:** AI Insights use compact visual summaries, expandable findings, opportunity cards, and collapsed evidence and methodology details.
- **Evidence clarity:** Observed findings, inferred recommendations, and metrics that require channel-owner YouTube Studio data remain visibly separated.
- **Resume behavior:** Research results are saved as soon as the public-data snapshot returns, then enriched again when AI Insights and grounded ideas finish.
- **Script Writer:** Generated output, supporting metadata, form inputs, and user revisions restore with the selected workflow.
- **Thumbnail Creator:** The brief, advanced visual controls, generated image, and model information restore with the selected workflow.
- **Navigation:** Opening a saved workflow returns to the most useful completed step instead of an empty route.

### Documentation

- Replaced the product-tour captures with five current screenshots covering Research analytics, Source Videos, AI Insights, the Script teleprompter, and Thumbnail Creator.
- Expanded the README with workflow-history behavior, local-storage boundaries, and restoration details.

### Privacy and storage boundaries

- Workflow history remains in the current browser profile. It is not synchronized to a server or another device.
- API keys remain server-side and are not written into workflow history.
- Uploaded thumbnail reference images are not retained. Users must select them again for a later generation.
- Research continues to use public YouTube Data API metadata. Owner-only metrics such as impressions, click-through rate, traffic sources, and retention require YouTube Studio and are not inferred as public facts.

### Verification

- `npm test`: 61 tests passed
- `npm run check`: TypeScript check passed
- `npm run build`: Production client and server builds completed
- README image-reference and source-image checksum checks passed
