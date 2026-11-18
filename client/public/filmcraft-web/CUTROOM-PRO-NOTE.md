# FilmCraft web build — vendored by Cutroom Pro (M0)

This directory is the **unmodified** FilmCraft web build, vendored — not
rebranded. FilmCraft's own UI, name, and ArtCraft marks inside this build are
left exactly as shipped.

- **What:** FilmCraft v0.20.1, web build (`filmcraft-web-0.20.1.zip`)
- **Source:** https://github.com/storytold/filmcraft/releases/tag/v0.20.1
  (published 2026-11-12; by the ArtCraft team)
- **Zip size:** 15,630,847 bytes;
  SHA-256 `1cf3072e3f3b6535fcd024d6f6ab2a16cf7776345d868037dc630de0ad0dbbb8`
  (verified on download, 2026-11-18)
- **Extracted size:** ~49 MB (the `.wasm` alone is ~48 MB)
- **Licence:** dual MIT *or* Apache-2.0, at your option — see
  `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, and `ATTRIBUTION.md` in this
  directory. The ArtCraft name, wordmark, and logos are trademarks and are
  **not** covered by that licence; they are not removed or altered here
  because this is the unmodified upstream build, not a fork.
- **How Cutroom uses it:** the Cutroom Pro Edit tab (`/edit`) frames
  `index.html` in a same-origin iframe. Nothing about FilmCraft is presented
  as Cutroom's own work; the Edit page states the version, author, licence,
  and links back to the repo and to these files.
- **Do not edit files in this directory.** To upgrade, download a newer
  `filmcraft-web-<ver>.zip` from a FilmCraft release, verify its SHA-256
  against the release page, replace this directory's contents, and update
  the pinned version in `docs/CUTROOM_PRO_M0.md` and the Edit page.
- **Hosting notes:** see `HOSTING.md` (shipped upstream). The `.wasm` must be
  served as `application/wasm`; the app needs inline scripts and
  `wasm-unsafe-eval` to run, so Cutroom's server sends a scoped CSP for
  `/filmcraft-web/*` only — see `server/index.ts`.
