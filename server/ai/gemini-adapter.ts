import { ProviderError } from "../provider-errors";
import {
  getGeminiApiKey,
  getGeminiClient,
  getGeminiTextModel,
} from "../gemini-runtime";
import { parseAiProviderUsage, parseProviderResponseId } from "./usage";
import type {
  AiJsonCompletionRequest,
  AiJsonCompletionResult,
  AiTextProvider,
} from "./types";

/**
 * Gemini text adapter — wraps the shared runtime configured via
 * `configureGeminiApiKey` / `configureGeminiModels` (Settings + env).
 */
export function createGeminiTextProvider(): AiTextProvider {
  return {
    id: "gemini",

    async completeJson(request: AiJsonCompletionRequest): Promise<AiJsonCompletionResult> {
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        throw new ProviderError({
          message: "Gemini API key is not configured",
          category: "missing_key",
          code: "GEMINI_MISSING_KEY",
          status: 503,
          retryable: false,
        });
      }

      const model = request.model || getGeminiTextModel();
      const response = await getGeminiClient().models.generateContent({
        model,
        contents: request.prompt,
        config: { responseMimeType: "application/json" },
      });

      // M3: carry the provider's own usage through when it reports it
      // (usageMetadata: promptTokenCount / candidatesTokenCount /
      // totalTokenCount); malformed usage is dropped, never repaired.
      // Gemini does not surface a response id on this path, so none is
      // recorded — "not reported", not invented.
      const parsedUsage = parseAiProviderUsage(response.usageMetadata);
      return {
        text: response.text || "",
        providerId: "gemini",
        model,
        ...(parsedUsage.ok && parsedUsage.usage ? { usage: parsedUsage.usage } : {}),
        ...(parseProviderResponseId((response as unknown as Record<string, unknown>).responseId)
          ? { responseId: parseProviderResponseId((response as unknown as Record<string, unknown>).responseId) }
          : {}),
      };
    },
  };
}
