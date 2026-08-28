# Cutroom Release & Version Progression Plan

**Companion docs:** [ROADMAP.md](../ROADMAP.md) · [TRACKER.md](../TRACKER.md) · [STRATEGY.md](STRATEGY.md) · [MODELS.md](MODELS.md) · [HERMES_DECISION.md](HERMES_DECISION.md) · [V3_ROADMAP.md](V3_ROADMAP.md) · [V3_FEATURES.md](V3_FEATURES.md)

## Version map

| Version | Theme | Exit criteria |
| --- | --- | --- |
| **1.0** | Evidence desk + desktop shell | Current feature set; macOS `.app`/`.dmg` signed; notarization when Apple notary creds available; README accurate |
| **0.2** | Cutroom | Rebrand + splice icon; script throughline graph/mind map; caption + comment grounding (L-608/L-609); quota meter; observed packaging; assemble-only preview (`L-601`–`L-615`). P1 `L-616`–`L-620` if time |
| **1.1** | Trust polish | OS keychain for secrets; remaining L-306/L-307 if not closed in 0.2; provider interface extracted (Gemini-only adapter) |
| **1.2** | Model freedom | Ollama + OpenRouter text providers; Settings presets; schema-repair shared path |
| **1.3** | Local images + desktop parity | Ollama/Comfy image path; teleprompter desktop mode (L-309); brand kit memory (L-308); Windows/Linux signed builds |
| **1.4** | Research depth | Competitor/series workspace (L-311); calendar/batch (L-312); Shorts/clip briefs (L-313) |
| **2.0** | Optional Studio mirror | OAuth read-only Studio metrics clearly separated from public snapshot (L-314); updater live; optional cloud sync decision |
| **3.0** | Production board | Evidence-grounded storyboard, shots, camera tree after Package; ViMax planning schemas only — no renderer ([V3_ROADMAP.md](V3_ROADMAP.md), `L-701+`) |
| **3.1** | Board polish | Optional inferred storyboard stills + ViMax-shaped export companion if slipped from 3.0 P2/P3 |

## Release train (cadence target)

- **Patch (1.0.x):** fixes, quota messaging, docs  
- **Minor (1.x):** user-visible capabilities from TRACKER Phase 3+ / model plan  
- **Major (2.0):** OAuth / sync / any cloud surface (requires security design)  
- **Major (3.0):** Production Board (planning artifacts; still local-first, no video-generator keys)

## Next version focus → **0.2 (Cutroom)**

See TRACKER IDs **L-601+** (Phase 6). P0 is `L-601`–`L-615`. P1 is `L-616`–`L-620`.

After 0.2, resume **1.1** (`L-406`, `L-409`, leftover trust polish).

## Non-goals through 1.x

- Replacing Descript/Opus/CapCut  
- Hermes as primary backend ([HERMES_DECISION.md](HERMES_DECISION.md))  
- Fake search volume / algorithm scores  
- Mandatory accounts
- Veo / talking-head / auto-upload (v0.2 assemble-only preview is the exception: local template render, Settings Off by default)
- Vendoring ViMax or adding video-generator Settings keys (v3 Board is text planning + optional inferred stills on the existing image model)

Schema enrichment for the production brief (`L-703+`) may land as a 1.x minor. The **3.0** named exit is Board UI + library `brief/` files.

## Packaging checklist (every desktop release)

1. `npm test && npm run check && npm run build`  
2. `npm run desktop:build:macos` (signed app + DMG)  
3. Notarize + staple when credentials present (`npm run desktop:notarize`)  
4. `spctl -a -vv` shows Notarized Developer ID  
5. Launch smoke: Research → Settings status → Script (throughline when shipped) → Thumbnail → Package → Board (v3) → Preview (if assemble enabled)  
6. Tag `vX.Y.Z` + [RELEASE_NOTES.md](../RELEASE_NOTES.md)
