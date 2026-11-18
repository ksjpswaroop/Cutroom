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
| **2.1** | **Creator Suite GA (current)** | Channels / Audience / Operations / Humanize to production depth (provider-grounded, workflow-linked, evidence-labeled); productionization blockers closed — CI stop-the-line, updater proof, rate-limit guard; Windows signing + live-provider pass tracked env/owner-gated ([PRODUCTION_PLAN.md](PRODUCTION_PLAN.md), `L-801+`/`L-901+`) |
| **2.2** | Go-to-market / Market readiness | Ship-to-strangers + sellable: release blockers real (updater/Windows signing/live-provider/history purge), commercial-model decision (Gate 0), deterministic samples + E2E/browser testing, licensing/Stripe (test-mode first), download channel + legal pack ([GTM_ROADMAP.md](GTM_ROADMAP.md), `G-001+`). Monetization/accounts are a **positioning change** from the 1.x "no mandatory accounts" non-goal — decided at Gate 0 |
| **2.3** | Production sign-off | Multi-provider connect/sign-in (Claude/OpenAI-Codex/Cursor/Ollama + router/OpenAI/Anthropic/OpenRouter keys), image+video generator APIs, Gemini rendering, the cinematic Veo-class path, and publishing — under TDD across parallel tracks ([PRODUCTION_SIGNOFF_TRACKER.md](PRODUCTION_SIGNOFF_TRACKER.md), `PS-001+`). **Auto-publishing is gated** (`PS-001`) — it reverses the test-enforced `videos.insert` non-goal + YouTube ToS; any publish stays user-consented, never agent-autonomous |
| **3.0** | Board + chosen render | Evidence-grounded Board; mode picker; **shoot myself** + **slides+voice** `render.mp4`; no YouTube upload ([V3_ROADMAP.md](V3_ROADMAP.md), `L-701+`) |
| **3.1** | Cinematic Shorts | TS Script2Video stages (stills → Veo-class clips → concat); quote-before-run; optional ViMax-shaped export flag Off |

## Release train (cadence target)

- **Patch (1.0.x):** fixes, quota messaging, docs  
- **Minor (1.x):** user-visible capabilities from TRACKER Phase 3+ / model plan  
- **Major (2.0):** OAuth / sync / any cloud surface (requires security design)  
- **Major (3.0):** Production Board + shoot / slides+voice (local-first; optional TTS/clone keys; no upload)
- **Major (3.1):** Cinematic Shorts (optional video-generator key; still no upload)

## Next version focus → **2.1 (Creator Suite GA)**

See TRACKER Phase 8 (**L-801+**, creator suite to production depth) and Phase 9
(**L-901+**, production blockers). The implementation plan — goals, parallel
tracks, dependency graph, and TDD test specs — is [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md).
Code tracks (CS, INT, REL) ship the GA tag; `L-903`/`L-906`/`L-907` are
env/owner-gated and tracked separately before "ship to strangers".

> Historical note: phases 0–7 (the evidence desk through v3 Board) are shipped
> and `done`. v0.2 and the 1.x/2.0/3.x themes below remain the architectural map.

## After GA → **2.2 (Go-to-market)**

Once the code GA (2.1) lands, [GTM_ROADMAP.md](GTM_ROADMAP.md) (TRACKER Phase 10,
`G-001+`) takes over: the owner-gated release blockers (`L-902`/`L-903`/`L-906`/`L-907`)
become the distribution gate, Gate 0 (`G-001`) settles the commercial model, and the
samples (`G-101+`) and testing (`G-201+`) tracks are buildable immediately. The
agent builds licensing/Stripe in **test mode only**; live keys and real payments are
owner actions.

## Non-goals through 1.x

- Replacing Descript/Opus/CapCut  
- Hermes as primary backend ([HERMES_DECISION.md](HERMES_DECISION.md))  
- Fake search volume / algorithm scores  
- Mandatory accounts
- Veo / talking-head / auto-upload (v0.2 assemble-only preview is the exception: local template render, Settings Off by default). **v3** adds opt-in slides+voice (3.0) and cinematic Shorts (3.1) on `/video`; still no YouTube publish ([V3_ROADMAP.md](V3_ROADMAP.md))
- Vendoring ViMax Python / Idea2Video / OpenCut sidecar

Schema enrichment for the production brief (`L-703+`) may land as a 1.x minor. **3.0** named exit is Board UI + shoot + slides+voice. **3.1** is cinematic Shorts.

## Packaging checklist (every desktop release)

1. `npm test && npm run check && npm run build`  
2. `npm run desktop:build:macos` (signed app + DMG)  
3. Notarize + staple when credentials present (`npm run desktop:notarize`)  
4. `spctl -a -vv` shows Notarized Developer ID  
5. Launch smoke: Research → Settings status → Script (throughline when shipped) → Thumbnail → Package → Board (v3) → Render (shoot or slides; cinematic when 3.1)  
6. Tag `vX.Y.Z` + [RELEASE_NOTES.md](../RELEASE_NOTES.md)
