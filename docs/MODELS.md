# Model & Provider Strategy — Beyond Gemini / Google

**Decision date:** 2026-08-28  
**Goal:** Keep Cutroom usable when Gemini is expensive, rate-limited, or undesirable—without breaking evidence contracts.

## Current state

| Job | Provider | Notes |
| --- | --- | --- |
| Research metadata | YouTube Data API v3 | Official; quota-heavy on search |
| Text AI (Insights, Ideas, Script, Package) | Gemini text models | Allowlist in `server/gemini-models.ts` |
| Thumbnails | Gemini image models | SynthID on outputs |

## Principles

1. **Contracts first** — any provider must return structured JSON that still maps to Observed / Inferred / Requires Studio.  
2. **Bring-your-own key / local** — Settings remains loopback; never proxy secrets to Cutroom cloud (we have none).  
3. **Graceful degrade** — text can go local; image may stay cloud or local FLUX/Z-Image when hardware allows.  
4. **No fake YouTube metrics** — swapping LLMs must not invent Studio-only numbers.

## Recommended text stack (free / cheap)

| Tier | Option | Cost | Fit |
| --- | --- | --- | --- |
| A. Local | **Ollama** — Llama 4 8B/70B-class, Qwen 3 8B/32B, DeepSeek distill, Gemma 3, Phi-4 | Free (electricity/hardware) | Privacy max; offline Insights/Ideas/Script |
| B. Cheap API | **OpenRouter** free/promotional slots (e.g. Llama 4 Maverick, Qwen 3, DeepSeek, Hermes fine-tunes) | $0–low; rate limits | Easy multi-model; OpenAI-compatible |
| C. Cheap paid | OpenRouter paid / DeepSeek direct / Groq-class hosts | Low $/M tokens | Production fallback when free tier starves |
| D. Premium | Gemini / Claude / GPT (optional) | Higher | Keep as “best quality” preset |

**Default planned allowlist labels (future Settings):**

- `local-ollama` (base URL `http://127.0.0.1:11434`)  
- `openrouter`  
- `gemini` (current)  
- `custom-openai-compatible` (vLLM, LM Studio, etc.)

## Recommended image stack (free / cheap)

| Option | License / notes | Fit |
| --- | --- | --- |
| **Ollama `x/flux2-klein:4b`** | Apache 2.0; fast; macOS MLX experimental | Local thumbnails |
| **Ollama `x/z-image-turbo`** | Apache 2.0; stronger photoreal / text | Local quality |
| **ComfyUI + FLUX.1 schnell** | Apache 2.0 | Power users; optional sidecar |
| Gemini image (current) | SynthID; paid | Best “click easy” path |
| Avoid shipping **FLUX.1 dev / Klein 9B NC** outputs in commercial bundles without license review | Non-commercial caveats | Document in Settings |

## YouTube data alternatives (metadata — not “free Google”)

| Option | Pros | Cons | Plan |
| --- | --- | --- | --- |
| YouTube Data API v3 | Official, stable schema | Quota cost | **Remain primary** |
| Caption fetch (timedtext / yt-dlp captions) | Enables L-306 transcript grounding | Fragility / ToS nuance | **Opt-in enrichment** |
| Piped / Invidious | No Google key | Unreliable instances | **Not for production default** |
| Full innertube scrape | Richer fields | ToS / breakage risk | **Research spike only**; never silent |

## Adoption plan

| Version | Work |
| --- | --- |
| **v1.1** | Provider interface behind `server/gemini.ts` → `server/ai/` with Gemini adapter only (no behavior change) |
| **v1.2** | OpenAI-compatible adapter + Ollama + OpenRouter Settings fields; structured-output repair layer |
| **v1.3** | Image provider interface; Ollama FLUX/Z-Image path on Apple Silicon; quality A/B in docs |
| **v1.4** | Caption-grounded Insights using local/cheap text models (pairs with L-306) |
| **v2.x** | Optional model presets (“Private local”, “Cheap cloud”, “Gemini quality”) |

## Engineering constraints

- Keep snapshot bytes as the only research evidence input.  
- Add provider-level timeouts and schema validation (Zod) identical to Gemini path.  
- Tests: mock providers only; no live calls in CI.  
- Document cost/latency expectations per preset in Settings help text.
