# Contributing to Cutroom

Cutroom welcomes focused contributions that preserve the continuous workflow from Research to Insights to Ideas to Script Writer to Thumbnail Creator.

## Local setup

1. Install Node.js 20.19 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add your own provider keys, or configure them through the local Settings page.
4. Run `npm run dev` and open `http://127.0.0.1:5000`.

Never commit `.env`, provider keys, generated private data, or exports containing private channel information.

## Required checks

Run all checks before opening a pull request:

```bash
npm test
npm run check
npm run build
```

The automated suite uses fixtures and mocks. It must not spend YouTube or Gemini quota.

## CI is stop-the-line (L-901)

`main` must stay green. The `verify` job (contract tests, `tsc`, production
build) and `cargo-check` run on every PR and push.

- A red `main` is a stop-the-line event: fix or revert before new work merges.
  CI on `main` was red and unnoticed from 2026-08-29 until 2026-11-15; the fix is
  to treat red as blocking, not advisory.
- **Repository admin:** enable branch protection on `main` requiring the
  `verify` and `cargo-check` checks to pass before merge, and require the branch
  to be up to date. This is a GitHub setting (Settings → Branches), not a code
  change, so it cannot land in a PR — enable it once on the repository.
- Do not merge a PR with failing or missing required checks.

## Reproducible desktop builds (L-905)

Desktop release artifacts must build from a clean checkout and the committed
lockfile, never from whatever `node_modules` happens to be on the machine
(`node_modules` once vanished mid-session; `npm ci` restored a green build):

```bash
git clean -xdn            # review what would be removed first
npm ci                    # install exactly from package-lock.json
npm run check && npm test && npm run build
npm run desktop:build:macos
```

Release builds run `npm ci`, not `npm install`. If `npm ci` fails, the lockfile
is out of sync — fix the lockfile, don't reach for `npm install` on the release
machine.

## Pull requests

- Keep each change focused and explain its user-facing effect.
- Preserve snapshot IDs and source-video evidence through the Research, Insights, Ideas, and Script stages.
- Keep provider credentials and paid calls on the server.
- Add or update focused tests when changing request contracts, provider behavior, evidence rules, exports, or security boundaries.
- Include screenshots for meaningful interface changes in both dark and light themes when practical.
- State which checks were run and any acceptance work that remains.

## License and contributions

By contributing, you agree that your contributions will be licensed under the repository's [Apache License 2.0](LICENSE).
