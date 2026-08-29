/**
 * MiniMax T2A system-voice narration (not a clone of Research creators).
 * POST /v1/t2a_v2 — tests inject fetch; no live MiniMax in CI.
 */
import { writeFile } from "node:fs/promises";
import {
  MINIMAX_SPEECH_MODEL,
  MINIMAX_TTS_VOICE_ID,
  minimaxAuthHeaders,
  minimaxBaseUrl,
  minimaxConfigured,
} from "./minimax";

export type MiniMaxFetch = typeof fetch;

export async function synthesizeMiniMaxSpeech(input: {
  text: string;
  dest: string;
  fetchImpl?: MiniMaxFetch;
}): Promise<void> {
  if (!minimaxConfigured()) {
    throw Object.assign(new Error("MiniMax API key is not configured."), { status: 503 });
  }
  const fetcher = input.fetchImpl || fetch;
  const response = await fetcher(`${minimaxBaseUrl()}/v1/t2a_v2`, {
    method: "POST",
    headers: minimaxAuthHeaders(),
    body: JSON.stringify({
      model: process.env.MINIMAX_SPEECH_MODEL?.trim() || MINIMAX_SPEECH_MODEL,
      text: input.text.slice(0, 9_000),
      stream: false,
      language_boost: "auto",
      output_format: "hex",
      voice_setting: {
        voice_id: process.env.MINIMAX_TTS_VOICE_ID?.trim() || MINIMAX_TTS_VOICE_ID,
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    }),
  });
  const body = await response.json().catch(() => ({})) as {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
    error?: { message?: string };
  };
  const hex = body.data?.audio?.trim();
  if (!response.ok || !hex) {
    throw Object.assign(
      new Error(body.base_resp?.status_msg || body.error?.message || `MiniMax TTS failed (${response.status}).`),
      { status: response.status === 401 ? 401 : 502 },
    );
  }
  await writeFile(input.dest, Buffer.from(hex, "hex"));
}
