import { ProviderError } from "../provider-errors";
import type {
  AiJsonCompletionRequest,
  AiJsonCompletionResult,
  AiProviderId,
  AiTextProvider,
} from "./types";

interface OpenAiCompatibleConfig {
  id: Exclude<AiProviderId, "gemini">;
  label: string;
  apiKey: string | undefined;
  baseUrl: string;
  defaultModel: string;
  /** Extra headers (e.g. OpenRouter HTTP-Referer). */
  headers?: Record<string, string>;
  /** When true, missing API key is OK (local Ollama). */
  allowMissingKey?: boolean;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Chat Completions JSON mode for OpenAI-compatible endpoints
 * (OpenRouter, Ollama `/v1`, custom gateways).
 */
export function createOpenAiCompatibleTextProvider(
  config: OpenAiCompatibleConfig,
): AiTextProvider {
  return {
    id: config.id,
    async completeJson(
      request: AiJsonCompletionRequest,
    ): Promise<AiJsonCompletionResult> {
      if (!config.allowMissingKey && !config.apiKey?.trim()) {
        throw new ProviderError({
          message: `${config.label} API key is not configured.`,
          category: "missing_key",
          code: `${config.id.toUpperCase()}_MISSING_KEY`,
          status: 503,
          retryable: false,
        });
      }

      const model = request.model?.trim() || config.defaultModel;
      const url = `${trimSlash(config.baseUrl)}/chat/completions`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(config.headers || {}),
      };
      if (config.apiKey?.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are a JSON API. Reply with a single JSON object only. No markdown fences.",
              },
              { role: "user", content: request.prompt },
            ],
            temperature: 0.4,
            response_format: { type: "json_object" },
          }),
        });
      } catch (error: any) {
        throw new ProviderError({
          message: `${config.label} request failed to connect (${error?.message || "network error"}).`,
          category: "network",
          code: `${config.id.toUpperCase()}_NETWORK`,
          status: 502,
          retryable: true,
        });
      }

      const raw = await response.text();
      if (!response.ok) {
        throw new ProviderError({
          message: `${config.label} returned HTTP ${response.status}.`,
          category: response.status === 401 || response.status === 403
            ? "invalid_key"
            : "provider_server",
          code: `${config.id.toUpperCase()}_HTTP_${response.status}`,
          status: response.status >= 500 ? 502 : 400,
          retryable: response.status >= 500,
        });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new ProviderError({
          message: `${config.label} returned non-JSON.`,
          category: "invalid_response",
          code: `${config.id.toUpperCase()}_BAD_JSON`,
          status: 502,
          retryable: true,
        });
      }

      const text =
        parsed?.choices?.[0]?.message?.content
        || parsed?.choices?.[0]?.text
        || "";
      if (typeof text !== "string" || !text.trim()) {
        throw new ProviderError({
          message: `${config.label} returned an empty completion.`,
          category: "invalid_response",
          code: `${config.id.toUpperCase()}_EMPTY`,
          status: 502,
          retryable: true,
        });
      }

      return {
        text: text.trim(),
        providerId: config.id,
        model,
      };
    },
  };
}

export function createOpenRouterTextProvider(): AiTextProvider {
  return createOpenAiCompatibleTextProvider({
    id: "openrouter",
    label: "OpenRouter",
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
    defaultModel:
      process.env.OPENROUTER_MODEL?.trim()
      || "openrouter/auto",
    headers: {
      "HTTP-Referer": "https://github.com/ksjpswaroop/Cutroom",
      "X-Title": "Cutroom",
    },
  });
}

export function createOllamaTextProvider(): AiTextProvider {
  return createOpenAiCompatibleTextProvider({
    id: "ollama",
    label: "Ollama",
    apiKey: process.env.OLLAMA_API_KEY,
    baseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1",
    defaultModel: process.env.OLLAMA_MODEL?.trim() || "llama3.2",
    allowMissingKey: true,
  });
}

export function createOpenAiCompatibleEnvProvider(): AiTextProvider {
  return createOpenAiCompatibleTextProvider({
    id: "openai_compatible",
    label: "OpenAI-compatible",
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY,
    baseUrl:
      process.env.OPENAI_BASE_URL?.trim()
      || process.env.OPENAI_COMPATIBLE_BASE_URL?.trim()
      || "https://api.openai.com/v1",
    defaultModel:
      process.env.OPENAI_MODEL?.trim()
      || process.env.OPENAI_COMPATIBLE_MODEL?.trim()
      || "gpt-4o-mini",
  });
}
