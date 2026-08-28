# Cutroom — User Story & Pitch

**For:** creators evaluating the product  
**Date:** 2026-08-28

---

## The story

You open Cutroom when you have a topic itch—not when you already filmed.

1. **Research** — Search YouTube. See the exact sample Cutroom will reason about (up to 50 videos), with charts and gaps labeled honestly.  
2. **Insights** — AI reads *that* snapshot. Claims say whether they were observed in the data, inferred, or need YouTube Studio.  
3. **Ideas** — Pick one grounded idea. No orphan idea factory.  
4. **Script** — Generate, edit, regenerate sections, read it in the teleprompter.  
5. **Thumbnail** — Describe the click promise; generate and critique.  
6. **Package** — Titles, hooks, description, tags, production brief, export the pack. Film next.

Your API keys stay on your machine. Workflows stay in your browser profile / app data. No Cutroom account.

## Why creators switch (or add Cutroom beside vidIQ)

- Tired of AI that “sounds sure” with no sources  
- Tired of copy-pasting between five tabs  
- Want a desk that works offline-capable once models are local (roadmap)  
- Prefer open source they can inspect

## Why stay with Studio / editors

- Cutroom does **not** replace YouTube Analytics  
- Cutroom does **not** cut your footage or auto-generate Shorts farms  
- That is intentional—so the research desk stays sharp

## 60-second pitch (user)

> Cutroom is your local YouTube research-to-package desk. It pulls a real public-data snapshot, keeps AI honest about what’s evidence vs guesswork, and walks you to a script, thumbnail, and upload package—without another SaaS login.

## Objection handling

| Objection | Answer |
| --- | --- |
| “I already pay for vidIQ.” | Keep it for keywords/SEO; use Cutroom to decide and write from a snapshot. |
| “ChatGPT is free enough.” | ChatGPT doesn’t bind claims to your research sample or ship a publish pack. |
| “I need outlier badges.” | Use 1of10 for browse-time outliers; bring the topic into Cutroom to produce. |
| “Thumbnails look better in Canva.” | Generate a concept here, finish in Canva if you want—the brief travels with the package. |

## Getting started

```bash
cp .env.example .env   # or use in-app Settings
npm install && npm run dev
# Desktop: npm run tauri:dev
```

Need YouTube Data API + (today) Gemini keys. Multi-model / local options: see [MODELS.md](MODELS.md).
