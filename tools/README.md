# tools/ — local-only binaries (NOT committed)

This directory holds machine-local binaries the assembler drives. Nothing
in here is tracked by git (see `.gitignore`); each machine downloads its
own copy.

## filmcraft-cli (Cutroom Pro M1)

- Version: **0.20.1** (storytold/filmcraft, release v0.20.1, Nov 11 2026)
- Linux binary in this VM: `tools/filmcraft-cli`
  - Source: `filmcraft-0.20.1-linux-x86_64.tar.gz` from
    https://github.com/storytold/filmcraft/releases/tag/v0.20.1
    (107 MB tarball, SHA-256
    `3e4fea3cb8d473e68f189a0a8792ba46160fab507adab3ab8920073fd41f24fa`)
  - Binary SHA-256:
    `2fbc2865ee89f345b06747d7275d82274c740b4d7b42e16583ed534fdd69d7e9`
  - Verified: `filmcraft-cli --version` → `filmcraft-cli 0.20.1`;
    `commands` lists 718 commands, including `timeline.place`,
    `captions.newTrack` / `captions.add` / `captions.import`,
    `essentialSound.setType` / `essentialSound.set` (ducking.reduceDb) /
    `essentialSound.generateDucking`, `file.import`, `file.exportMedia`
    (with `loudnessLufs`). There is NO loudness-meter command — loudness
    is applied at export, not measured.
  - The Linux tarball DOES contain `filmcraft-cli` at
    `filmcraft-0.20.1-linux-x86_64/bin/filmcraft-cli` (88 MB).

## macOS (the real target)

FilmCraft ships the CLI only as a macOS universal zip:

- `filmcraft-cli-0.20.1-macos-universal.zip` (~100 MB) from the same
  v0.20.1 release page.
- Unzip it and either place the `filmcraft-cli` binary at
  `tools/filmcraft-cli` in this repo, or point the assembler at it with
  `FILMCRAFT_CLI_PATH=/path/to/filmcraft-cli`.
- Without a binary at either location, the assembler runs in dry-run
  mode and says so on every receipt — it never pretends a render
  happened.

## How the assembler drives it

One `run` script creates the project file (`--save-as project.fcproj`),
then each plan step runs as
`filmcraft-cli --project <proj> --save exec <id> '<json>'`, so each
step's returned ids (imported items, placed clips) feed the next step.
Demo mode (`--demo`) saves the demo project the same way. See
`docs/CUTROOM_PRO_M1.md` for the exact commands.
