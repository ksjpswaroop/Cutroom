# Credentials for Cutroom demos

Use keys already on this Mac. **Never paste secret values into docs, git, chat, or screenshots.**

Settings never returns saved key material. A configured key shows **Configured**. The field asks for a replacement only.

## Required for the spine demo

| Need | Where to get it | Settings field | Demo use |
| --- | --- | --- | --- |
| YouTube Data API v3 | [Google Cloud Console](https://console.cloud.google.com/) → enable **YouTube Data API v3** → create an API key | YouTube key → **Configured** | Research search, captions, comments |
| Gemini | [Google AI Studio](https://aistudio.google.com/apikey) | Gemini key → **Configured** | Insights, Ideas, Script, Thumbnail, thumbnail inspection |

## Optional

| Need | Where to get it | Settings field | Demo use |
| --- | --- | --- | --- |
| MiniMax | MiniMax console (global `api.minimax.io` or China host matching the key) | MiniMax key → **Configured** | Cinematic Shorts quote-before-run. **Do not confirm a paid quote** during the screenshot pass; play an existing `render.mp4` instead. |
| Ollama | Install from [ollama.com](https://ollama.com/download), then `ollama pull llama3.2:3b` | AI provider = Ollama + tagged model | Local-model talking point. Header warns if the model is missing. |
| ElevenLabs / voice | Optional TTS or consented own-voice clone | Voice settings + consent flag | Slides + voice only. **Do not run Slides** if a cinematic `render.mp4` must stay intact. |

## How to confirm before a demo

1. Open Cutroom → **Settings** → **API**.
2. YouTube and Gemini should read **Configured**.
3. Confirm the header badge names the live text provider (usually Gemini).
4. Optional: Library folder points at a folder that already has workflows (fast restore for Board / Render).

Desktop secrets prefer the macOS keychain (`app.cutroom.desktop`). Web `npm run dev` uses project `.env` unless keychain mode is on. See [settings-and-local-models.md](settings-and-local-models.md).

## Fast restore path (no live search)

On this machine, a standing-desk library workflow under `tmp-artifacts/cutroom-library-c/` can restore Script → Package → Board → Render with an existing cinematic Short so the clock does not wait on Insights.

## Never do

- Commit `.env`, keychain dumps, or screenshots that show a pasted key
- Set `HOST=0.0.0.0` for a demo
- Promise YouTube upload or Studio private metrics without OAuth refresh (metrics stay null until a token exists)
