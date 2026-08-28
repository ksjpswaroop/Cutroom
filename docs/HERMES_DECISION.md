# Hermes Agent Decision Record

**Status:** **Do not replace** Cutroom’s Node/Express sidecar with Hermes as the primary backend.  
**Optional later:** companion / optional research agent — not core path.  
**Date:** 2026-08-28  
**Context:** Machine has Hermes installed (`hermes` CLI + Agent Foundry runtime under Application Support). Hermes (Nous Research) is an open-source persistent agent with tools, memory, messaging gateways, and a Python `AIAgent` library.

## What Hermes is good at

- Multi-step tool-calling agents (web, terminal, cron, messaging)  
- Persistent memory / skills / subagents  
- Provider flexibility (OpenRouter, OpenAI-compatible, etc.)  
- Embedding via Python (`AIAgent.chat` / `run_conversation`) — **no published pip wheel**; clone + `uv sync`

## What Cutroom’s backend must guarantee

| Requirement | Node sidecar today | Hermes as primary backend |
| --- | --- | --- |
| Deterministic evidence contracts + snapshot IDs | Explicit Zod/schemas in TS | Agent loop is nondeterministic; hard to certify |
| Loopback Settings security (reject proxies) | Hardened Express routes | Would need full reimplementation |
| Tauri spawns one HTTP server on dynamic port | Simple `node dist/index.cjs` | Extra Python runtime + Hermes checkout; heavier bundle |
| Contract tests without live models | Mature | Possible but foreign to current CI |
| Structured JSON for Insights/Ideas/Script | Prompt + schema repair in TS | Agent may call tools / wander without tight guards |
| Apache 2.0 product ship shape | Self-contained | Hermes is a large adjacent system with its own lifecycle |

## Decision

**Use Hermes?** **No** as the Python replacement for Express.

**Why not**

1. **Wrong abstraction** — Cutroom is a *workflow API with contracts*, not a general autonomous agent.  
2. **Bundle & ops cost** — Desktop would need Python + Hermes env + Node (or rewrite everything); signing/notarization and sidecar health checks get harder.  
3. **Trust surface** — Hermes toolsets (terminal, browser) expand attack surface beyond “generate JSON from snapshot.”  
4. **No pip package** — fragile to vendor as an embedded library.  
5. **Duplication** — OpenRouter/Ollama can be added directly (MODELS.md) without Hermes.

## What we *could* enhance with Hermes (optional, later)

Only as an **opt-in companion**, never on the critical evidence path:

| Idea | Value | Risk |
| --- | --- | --- |
| Cron “competitor watch” digests delivered to Telegram/Discord | Nice for power users who already run Hermes | Split-brain UX; support burden |
| One-shot “explore niche” agent that *writes a draft research brief* user pastes into Cutroom | Exploration | Must re-run official Research to get snapshot IDs |
| Skill pack that calls Cutroom’s localhost API | Automation | Requires Cutroom running; auth model is loopback-only |

**Rule:** Anything that becomes *product truth* (Insights, Ideas, Script, Package) must go through Cutroom’s TypeScript contracts and YouTube snapshot pipeline—not Hermes memory.

## Implementation stance if revisited

1. Keep Express as system of record.  
2. If experimenting: separate `docs/experiments/hermes-companion.md` + feature flag off by default.  
3. Never spawn Hermes from Tauri production sidecar without an explicit security review.

## Summary one-liner

> Hermes is a powerful personal agent runtime; Cutroom is a deterministic creator desk. Integrate optionally at the edges—do not merge the backends.
