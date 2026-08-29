import { createOpenAiCompatibleTextProvider } from "./openai-compatible";
import type { AiTextProvider } from "./types";
import { MINIMAX_TEXT_MODEL, minimaxApiKey, minimaxBaseUrl } from "../minimax";

export function createMiniMaxTextProvider(): AiTextProvider {
  return createOpenAiCompatibleTextProvider({
    id: "minimax",
    label: "MiniMax",
    apiKey: minimaxApiKey() || undefined,
    baseUrl: `${minimaxBaseUrl()}/v1`,
    defaultModel: process.env.MINIMAX_TEXT_MODEL?.trim() || MINIMAX_TEXT_MODEL,
  });
}
