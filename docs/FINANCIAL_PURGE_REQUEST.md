# Financial files — history purge request (owner action required)

**Status:** untracked from the working tree on 2026-11-15. The files are still
reachable in Git history on the public remote. Removing them from `git ls-files`
(done) does **not** remove them from the public repository — GitHub keeps blobs
reachable by SHA after a branch is deleted. Fully removing them requires a
history rewrite **and** a GitHub Support request to purge cached views. Both are
owner actions; this repository change did neither (no history rewrite, no
force-push), by instruction.

## What was untracked

| File | Current blob SHA (at the time of untracking) |
| --- | --- |
| `business/Cutroom_Business_Plan.xlsx` | `362e11e93e104e5d1be651f0f37a8ecfd7e2b58a` |
| `business/Cutroom_Investor_Handover.docx` | `1370c13634629f0d9a1e9e3c2294390d1ae90672` |
| `business/Cutroom_Pitch_Deck.pptx` | `2e5cac20ad54d600432d9d96c86a177a143949a6` |
| `business/Cutroom_Valuation.xlsx` | `793decd970840d4a1b79f4f148d1025daf923ec0` |
| `business/Cutroom_Valuation_Report.docx` | `ec14a99a18c85f40cb850e0f8e014cfaef0862d3` |
| `docs/INVESTOR_BRIEF.md` | `be4684336af78e4f69745f698bb830677c91f100` |
| `docs/INVESTOR_PITCH.md` | `507d8f6378807ff2f9323a2c7719b65084d4ac2a` |

## Commits that introduced or changed them

These are the commits whose history still contains the blobs above:

- `ddff8cc` — Add the business and fundraising documents.
- `2b65545` — Document the desk: user guide, illustrated demo script, investor pitch.
- `71a16ee` — Initial Cutroom import: local-first desk through v0.1 desktop.

Re-derive the full object list at any time:

```bash
git log --oneline --all -- 'business/' docs/INVESTOR_BRIEF.md docs/INVESTOR_PITCH.md
git rev-list --all --objects | git cat-file --batch-check='%(objecttype) %(objectname) %(rest)' \
  | grep -E 'business/|INVESTOR_BRIEF|INVESTOR_PITCH'
```

Public remote: `https://github.com/ksjpswaroop/Cutroom.git`

## Step 1 — rewrite history to drop the blobs (owner, local)

Use `git filter-repo` (preferred) on a fresh mirror clone. This **rewrites every
commit SHA** on the affected branches, so coordinate with anyone who has a clone.

```bash
# On a throwaway mirror, never your working checkout:
git clone --mirror https://github.com/ksjpswaroop/Cutroom.git cutroom-mirror
cd cutroom-mirror
git filter-repo \
  --path business/ \
  --path docs/INVESTOR_BRIEF.md \
  --path docs/INVESTOR_PITCH.md \
  --invert-paths
git push --force --mirror
```

(If `git filter-repo` is unavailable, `brew install git-filter-repo`.)

After the push, delete and re-create any PRs/branches that still reference the
old commits, and have every collaborator re-clone — old clones still hold the
blobs.

## Step 2 — ask GitHub to purge cached objects (owner, support ticket)

History rewrite alone leaves the blobs reachable by their SHA via the web UI and
the API until GitHub garbage-collects and clears its caches. Open a request:

- Where: <https://support.github.com/contact> → "I need help with my repository"
- Repository: `ksjpswaroop/Cutroom`
- Request: *"I have rewritten history to remove sensitive files and force-pushed.
  Please purge the cached views and run garbage collection so the following
  object SHAs are no longer reachable."*
- Attach the seven blob SHAs from the table above.

## Step 3 — rotate anything the documents exposed

If any valuation, plan, or handover file contained live figures, contact
details, or credentials that are sensitive once public, treat them as disclosed
for the window they were reachable and rotate or re-issue as needed. Removing the
blob does not un-disclose what was already fetched.

## Alternative — decide to keep them public

If, after review, the material is acceptable as public, no action is needed:
the files stay untracked locally (so they are not re-committed) and the existing
history is left as-is. This document then records the known state and the exit
ramp if that decision changes.
