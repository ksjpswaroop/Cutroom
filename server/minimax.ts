/**
 * MiniMax platform helpers (global host by default).
 * One BYOK key covers text (M3), image-01, T2A speech, and Hailuo H3 video.
 * Keys never return to the WebView.
 */
export const MINIMAX_DEFAULT_HOST = "https://api.minimax.io";
export const MINIMAX_TEXT_MODEL = "MiniMax-M3";
export const MINIMAX_IMAGE_MODEL = "image-01";
export const MINIMAX_SPEECH_MODEL = "speech-2.8-turbo";
export const MINIMAX_TTS_VOICE_ID = "English_expressive_narrator";
export const MINIMAX_H3_MODEL = "MiniMax-H3";
export const MINIMAX_H3_DURATION_SEC = 5;
export const MINIMAX_H3_RESOLUTION = "768P" as const;
export const MINIMAX_H3_RATIO = "9:16";
export const MINIMAX_H3_USD_PER_SEC_768P = 0.09;
export const MINIMAX_H3_USD_PER_SEC_2K = 0.13;

export function minimaxApiKey(): string {
  return process.env.MINIMAX_API_KEY?.trim() || "";
}

export function minimaxConfigured(): boolean {
  return Boolean(minimaxApiKey());
}

export function minimaxBaseUrl(): string {
  const host = process.env.MINIMAX_API_HOST?.trim() || MINIMAX_DEFAULT_HOST;
  return host.replace(/\/+$/, "");
}

export function minimaxAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${minimaxApiKey()}`,
    "Content-Type": "application/json",
  };
}

export function hailuoH3Resolution(): "768P" | "2K" {
  return process.env.MINIMAX_H3_RESOLUTION?.trim() === "2K" ? "2K" : MINIMAX_H3_RESOLUTION;
}

export function hailuoH3UsdPerSecond(): number {
  return hailuoH3Resolution() === "2K" ? MINIMAX_H3_USD_PER_SEC_2K : MINIMAX_H3_USD_PER_SEC_768P;
}
