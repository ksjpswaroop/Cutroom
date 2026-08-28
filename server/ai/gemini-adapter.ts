import { ProviderError } from "../provider-errors";
import {
  getGeminiApiKey,
  getGeminiClient,
  getGeminiTextModel,
} from "../gemini-runtime";
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

      return {
        text: response.text || "",
        providerId: "gemini",
        model,
      };
    },
  };
}
