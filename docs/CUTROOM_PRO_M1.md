# Cutroom Pro — M1: Assembler agent

**Branch:** `cutroom-pro-m1` (local only — not pushed, no PR)
**Base:** `ksjpswaroop/Cutroom` main `9b19e08` (PR #6, M0) · **Version unchanged:** 2.0.0
**Date:** 2026-11-18

M1 is the Assembler agent from the
[Cutroom Pro plan](../../your_files/Cutroom-Pro-Rebrand-Rebuild-Plan-2026-11-17.md):
it turns a production Board into an ordered assembly plan, shows the plan
for approval, then drives filmcraft-cli through it — place clips, captions,
music ducking, loudness at export, H.264 export — and returns a receipt.
No payment, no account, no cloud code. Nothing in `business/` was touched.

## What was built

### 1. Assembly plan (pure, `shared/assembler.ts`)
- `buildAssemblyPlan(board, options)` — one step per Board shot, in order:
  `assembler.new-sequence` → per shot `assembler.import-media` +
  `assembler.place-clip` (V1, in/out from `durationHintSec`, 8 s default,
  24 fps) → `assembler.place-music` (A1) → `assembler.duck-music` →
  `assembler.add-captions` → `assembler.check-loudness` →
  `assembler.export` (H.264 MP4). The plan is plain data, inspectable
  before anything executes.
- Caption text comes only from caller-supplied text or the panel's
  `onScreenText`. A shot with neither gets NO caption cue, recorded in
  `captionless` — never invented. SRT + WebVTT are generated frame-exact
  at 24 fps and written to the run directory.
- A shot with no media gets a place step marked skipped ("no media") —
  never an invented file path. If no clips are placed at all, the export
  step is skipped too and the receipt status is `partial`, never a fake
  render.
- Ducking is deterministic math in the plan: music at **−12 dB** under
  each narration (caption) segment, 0 dB between them, as keyframes in
  the plan and receipt.
- Loudness is **not measured**: filmcraft-cli v0.20.1 has no
  loudness-meter command (all 718 commands checked). The plan applies
  `loudnessLufs: -16` at export and the receipt says "not measured".

### 2. FilmCraft transport (`server/assembler-transport.ts`)
- `FilmCraftTransport` interface: `begin` / `executeStep` / `finish`,
  plus `DryRunTransport` (no subprocess, synthetic ids, every result
  flagged `dryRun: true`) and `LocalCliTransport` (the real binary).
- **The Linux CLI exists.** The v0.20.1 Linux tarball
  (`filmcraft-0.20.1-linux-x86_64.tar.gz`, 107 MB, SHA-256
  `3e4fea3cb8d473e68f189a0a8792ba46160fab507adab3ab8920073fd41f24fa`)
  contains `filmcraft-cli` (88 MB, SHA-256
  `2fbc2865ee89f345b06747d7275d82274c740b4d7b42e16583ed534fdd69d7e9`,
  `--version` → `filmcraft-cli 0.20.1`). It lives at
  `tools/filmcraft-cli` in this VM copy — **not committed** (see
  `.gitignore` and `tools/README.md`). `FILMCRAFT_CLI_PATH` overrides it.
  With no binary found, the assembler runs in dry-run mode and says so
  on every receipt.
- How the real CLI is driven (verified by hand first, then by the code):
  one `run` script creates the project file (`--save-as project.fcproj`;
  `--demo` saves the demo project the same way), then each plan step
  runs as `filmcraft-cli --project <proj> --save exec <id> '<json>'`, so
  each step's returned ids (imported items, placed clips) feed the next
  step. Clip ids are **not** stable across script shapes (verified:
  the same place returned 900027 in one run and 900021 in another), so
  nothing hardcodes them.
- Commands used (all verified against `filmcraft-cli commands`):
  `file.newProject` / `file.newSequence`, `file.import`,
  `timeline.place`, `captions.newTrack` / `captions.add`,
  `essentialSound.setType` / `essentialSound.set` (`ducking.reduceDb`) /
  `essentialSound.generateDucking`, `file.exportMedia` (with
  `loudnessLufs`). One real finding: `generateDucking` returned **0
  keyframes** with music-only audio — it generates keyframes from
  dialogue triggers, and this timeline has narration as captions, not
  as a dialogue clip. The −12 dB reduction is set on the music clip;
  the keyframes arrive when narration audio is present. The receipt
  records both the planned keyframes and the 0 the CLI returned.
- Captions: the export does **not** burn captions into the MP4 by
  default (`burnCaptions: false`). Captions live on the timeline's
  caption track and as `captions.srt` / `captions.vtt` in the run
  directory. Burn-in is a follow-up option, not silently assumed.

### 3. Runner + receipt (`server/assembler.ts`)
- `runAssembly(input)` — builds the plan, writes `captions.srt` /
  `captions.vtt` / `plan.json` into the run directory, dispatches every
  plan step through the M0 command registry (`proRegistry`), builds the
  receipt, persists `receipt.json`.
- Receipt (per run): run id, snapshotId, status (`ok` / `partial` /
  `failed`), transport (kind, CLI path, version, dry-run flag + reason),
  ordered steps with per-step status/result/error/note, captions
  (cue count, captionless shots, SRT/VTT paths), ducking (applied,
  −12 dB, planned keyframes, CLI keyframes returned), loudness
  ("not measured" + target), export (path/bytes/frames or an honest
  "not exported" note), cost **$0** (local CLI only), and the registry
  audit entries for the run. Receipts live under
  `<app-data root>/assembler-runs/<runId>/`, next to the project file,
  captions, and export.
- A failed step throws through the registry handler, so the audit log
  records it as `ok: false` (an early version returned `{ok:false}` as
  a successful dispatch — fixed after the E2E caught it). Later steps
  are recorded `not-run`, not silently skipped.
- Registered commands (`server/pro-commands.ts`, all Pro-gated):
  `assembler.plan`, `assembler.run`, and the per-step commands
  `assembler.new-sequence`, `assembler.import-media`,
  `assembler.place-clip`, `assembler.place-music`,
  `assembler.duck-music`, `assembler.add-captions`,
  `assembler.check-loudness`, `assembler.export`.

### 4. Routes + Board UI
- `POST /api/assembler/plan` — build the plan (403 when Pro is off).
- `POST /api/assembler/run` — run it, return `{ success, receipt }`.
  Body may pass `transport: "dry-run"` to force a dry run.
- `GET /api/assembler/receipts` and `GET /api/assembler/receipts/:runId`
  (404 for an unknown id).
- Board page: "Assemble (Pro)" button + "Use FilmCraft demo footage"
  checkbox. Plan first (ordered steps, placeholders, captions, ducking)
  with an "Approve & run assembly" button — the human gate — then the
  receipt (per-step status, export path or honest note, loudness,
  cost). The Board carries no media paths, so a plain run skips every
  place step; demo footage is the try-it path.

### 5. Tests + E2E
- `npm run check` passes; `npm test` **343 pass / 0 fail** (329 baseline
  on main + 14 M1: 7 plan/captions/ducking goldens, 3 transport,
  4 runner/gating). `npm run build` succeeds.
- E2E script `script/run-assembler-e2e.ts` (not part of `npm test` —
  the real render takes ~45 s): 3-shot fixture Board, demo media.
  Dry run: `ok`, 8/9 steps ok (loudness step skipped by design), audit
  8 entries, receipt reloaded from disk. Real CLI: **`ok` in 43 s**,
  export `cutroom-assemble-snap-e2e01.mp4`, **8,098,661 bytes, 576
  frames**, ffprobe-verified H.264 640×360 24 fps, 24.0 s, AAC.
  Captions: 2 cues, third shot captionless. Ducking: planned 4
  keyframes, CLI returned 0 (see §2). Loudness: not measured. Cost: $0.
- Live HTTP smoke (production build, port 5123, isolated app data):
  plan with Pro off → 403; toggle on → plan 200 (9 steps, 24 s, 2
  cues); dry-run → 200, receipt ok, 8 audit entries; receipts list +
  get → 200; unknown receipt → 404.

## How to run the 3-clip assembly on a Mac

1. Download `filmcraft-cli-0.20.1-macos-universal.zip` (~100 MB) from
   https://github.com/storytold/filmcraft/releases/tag/v0.20.1, unzip
   it, and place the `filmcraft-cli` binary at `tools/filmcraft-cli`
   in the repo (or set `FILMCRAFT_CLI_PATH=/path/to/filmcraft-cli`).
2. Enable Cutroom Pro in Settings.
3. On the Board page, tick "Use FilmCraft demo footage" and click
   "Assemble (Pro)", review the plan, then "Approve & run assembly".
   The receipt shows the export path (under the app-data
   `assembler-runs/<runId>/` directory) and per-step results.
4. For your own clips: the API accepts `mediaByShotIndex` (shot index
   → file path), `captionByShotIndex` (shot index → caption text), and
   `musicBed: { path }` — see `shared/assembler.ts` and the plan
   endpoint. The Board UI does not collect media paths yet (M1 scope);
   that is the M2 UI step.

## Known limits — read before trusting M1

- **Captions are not burned into the MP4** by default; they are on the
  timeline caption track + SRT/VTT files. Add `burnCaptions: true` to
  the export step if burn-in is wanted.
- **Ducking generates no keyframes without a dialogue clip.** The
  −12 dB reduction is set on the music clip, but FilmCraft's
  `generateDucking` only emits keyframes against dialogue triggers.
  A Board with narration *audio* (not just caption text) is needed to
  prove ducking end to end.
- **Loudness is applied, not measured.** No meter command exists in
  v0.20.1. If a measured LUFS number is ever needed, measure the
  exported file with an external tool (e.g. FFmpeg `loudnorm`) and
  record that separately — do not present the −16 target as a
  measurement.
- **The CLI binary is not in git.** Every machine (including the Mac)
  must download it per §"How to run" above. `tools/filmcraft-cli`
  is gitignored; `tools/README.md` records version + SHA-256.
- **Demo media only proves the mechanics.** Real user media (file
  paths via the API) has been exercised only through the stub CLI in
  tests, not against real files on a Mac.
- **Export is 1920×1080 by default**; the VM E2E used 640×360 for
  speed. A full-size 24 s export takes proportionally longer.
- **Audit log is in-memory** (M0 limit, unchanged): the receipt is
  the durable record, persisted as `receipt.json`.
