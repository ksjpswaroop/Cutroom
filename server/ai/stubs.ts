import { ProviderError } from "../provider-errors";
import type { AiProviderId, AiTextProvider } from "./types";

const STUB_LABELS: Record<Exclude<AiProviderId, "gemini">, string> = {
  openai_compatible: "OpenAI-compatible provider",
  ollama: "Ollama",
  openrouter: "OpenRouter",
};

/**
 * Test helper: force a clear not-configured error without hitting the network.
 */
export function createUnconfiguredTextProvider(
  id: Exclude<AiProviderId, "gemini">,
): AiTextProvider {
  const label = STUB_LABELS[id];
  return {
    id,
    async completeJson() {
      throw new ProviderError({
        message: `${label} is not configured. Coming in Cutroom 1.2 (L-407).`,
        category: "missing_key",
        code: `${id.toUpperCase()}_NOT_CONFIGURED`,
        status: 503,
        retryable: false,
      });
    },
  };
}
