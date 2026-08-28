# Cutroom — Investor Brief

**Product:** Cutroom — local-first, evidence-grounded YouTube pre-publish desk  
**License:** Apache 2.0  
**Stage:** Working product (web + Tauri desktop shell); macOS signing in progress  
**Date:** 2026-08-28

---

## Problem

YouTube creators spend more on *guesswork tooling* than on clarity. SEO suites sell keyword scores; AI suites invent insights; editors assume you already know what to film. Keys and history live in SaaS accounts. There is no mainstream **auditable, local** desk that carries public evidence from research → script → packaging.

## Solution

Cutroom binds every AI step to a **public YouTube Data API snapshot** with explicit **Observed / Inferred / Requires Studio** contracts, then walks the creator through Insights → Ideas → Script → Thumbnail → Publish package—on their machine.

## Why now

- Creator tooling is consolidating into expensive cloud suites (OverseerOS, TubeAI, vidIQ Max).  
- Local LLMs (Ollama) and cheap OpenRouter models make “private desk” viable.  
- Trust backlash against hallucinated SEO/AI claims is rising.  
- Desktop shells (Tauri) make OSS apps feel native without Electron bloat.

## Market (directional)

- Addressable: independent YouTube creators + small studios who already pay for vidIQ/TubeBuddy/Canva/ChatGPT stacks ($20–100+/mo).  
- Wedge: “replace the messy pre-production pile,” not replace YouTube Studio or Premiere.  
- Expansion: multi-provider AI, competitor workspaces, optional OAuth Studio mirror—still local-first.

## Product moat

1. Evidence contracts (hard product philosophy)  
2. Local-first secrets architecture  
3. Continuous grounded workflow (not feature salad)  
4. OSS transparency  
5. Refusal to fake Studio/algorithm metrics

See [STRATEGY.md](STRATEGY.md).

## Competition

| Player | Position vs Cutroom |
| --- | --- |
| vidIQ / TubeBuddy | Strong SEO/extension; weak local evidence desk |
| 1of10 / OutlierKit | Strong outlier discovery; weak end-to-end package |
| OverseerOS / TubeAI | Full cloud production; opposite trust model |
| Descript / Opus | Post-production; complementary |

## Business model options (undecided — open for discussion)

1. **OSS + paid desktop builds** (notarized binaries, auto-update, priority support)  
2. **Optional cloud sync / team** (separate SKU; never required)  
3. **Sponsored model credits** (OpenRouter partnership) while core stays BYOK  
4. **Agency / education licenses** for workshop curricula (playbook already exists)

*No mandatory SaaS login in the core product.*

## Traction assets today

- Runnable app with contract tests and CI  
- Documented research playbook + launch-video kit  
- Desktop architecture (Tauri + sidecar)  
- Clear roadmap and tracker  

## Ask / use of funds (template)

If raising: engineering for multi-provider AI, caption-grounded research, Windows/Linux polish, notarized distribution, and creator GTM—not for rebuilding a cloud editor.

## Risks

API quota economics · model quality variance · YouTube policy shifts · scope creep into editors · crowded SEO messaging

## One-slide summary

> **Cutroom makes YouTube pre-production trustworthy again:** local keys, snapshot-bound AI, and a publish-ready package—open source, no fake scores.
