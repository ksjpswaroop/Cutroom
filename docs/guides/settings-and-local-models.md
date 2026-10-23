# Guide: settings and local models

## Where keys live

Settings → API. A saved YouTube, Gemini, or MiniMax key shows **Configured**. The field asks for a replacement. The saved value is not sent back to the window.

On the desktop app, secrets prefer the macOS keychain. In `npm run dev` they stay in the project `.env` unless keychain mode is turned on. The Library tab shows which backend is active.

## Ollama

1. Install Ollama and run `ollama serve`.
2. Pull a tagged model, for example `ollama pull llama3.2:3b`. A name without a tag is rejected.
3. In Settings → API, set the AI text provider to Ollama, the host (default `http://127.0.0.1:11434`), and the model.
4. Save. The header should name Ollama. If the model is not installed, the header says generation will fail until you pick one.

Local models are weaker at strict JSON. Cutroom repairs common shape mistakes and, for captions and mined comments, puts the observed text back when the model drops it.

Thumbnail pixels and thumbnail inspection still use the image provider (Gemini, unless you select another image provider).

## Preferences that stay off

On the Library tab:

- Assemble preview
- Storyboard stills
- ViMax companion export

Leave them off unless you mean to turn that path on. ViMax is never started as a sidecar, and Cutroom never uploads to YouTube.

Screenshot: [../demos/05-settings-api.png](../demos/05-settings-api.png).
