import { createGeminiTextProvider } from "./gemini-adapter";
import { createUnconfiguredTextProvider } from "./stubs";
import {
  isAiProviderId,
  type AiProviderId,
  type AiTextProvider,
} from "./types";

export type {
  AiJsonCompletionRequest,
  AiJsonCompletionResult,
  AiProviderId,
  AiTextProvider,
} from "./types";
export { AI_PROVIDER_IDS, isAiProviderId } from "./types";

/**
 * Resolve the active text provider.
 * Env: `CUTROOM_AI_PROVIDER` = gemini | openai_compatible | ollama | openrouter (default: gemini).
 * Non-gemini adapters are stubs until L-407.
 */
export function resolveAiProviderId(
  raw: string | undefined = process.env.CUTROOM_AI_PROVIDER,
): AiProviderId {
  const value = (raw || "gemini").trim().toLowerCase();
  return isAiProviderId(value) ? value : "gemini";
}

export function getTextProvider(providerId?: AiProviderId): AiTextProvider {
  const id = providerId ?? resolveAiProviderId();
  switch (id) {
    case "gemini":
      return createGeminiTextProvider();
    case "openai_compatible":
    case "ollama":
    case "openrouter":
      return createUnconfiguredTextProvider(id);
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
