import { ProviderError } from "../provider-errors";
import { extractJsonText } from "./json-extract";
import type {
  AiJsonCompletionRequest,
  AiJsonCompletionResult,
  AiTextProvider,
} from "./types";

/**
 * PS-101: Anthropic (Claude) text provider. Anthropic is NOT OpenAI-compatible —
 * it uses `POST /v1/messages` with an `x-api-key` header and an `anthropic-version`
 * header, and returns `content: [{ type: "text", text }]`. Config is injectable so
 * the adapter is unit-testable with a mocked `fetch` and no live call; when a field
 * is omitted it falls back to the `ANTHROPIC_*` env. The provider throws a clear
 * `missing_key` ProviderError (without touching the network) when no key is set, so
 * the registry fails closed to the default provider.
 */
export interface AnthropicProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5-5";

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function requestTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.CUTROOM_AI_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

export function createAnthropicTextProvider(
  config: AnthropicProviderConfig = {},
): AiTextProvider {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const baseUrl = trimSlash(
    config.baseUrl ?? (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com/v1"),
  );
  const defaultModel = config.model?.trim() || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const maxTokens = config.maxTokens && config.maxTokens > 0 ? config.maxTokens : 4096;

  return {
    id: "anthropic",
    async completeJson(
      request: AiJsonCompletionRequest,
    ): Promise<AiJsonCompletionResult> {
      if (!apiKey?.trim()) {
        throw new ProviderError({
          message: "Anthropic API key is not configured.",
          category: "missing_key",
          code: "ANTHROPIC_MISSING_KEY",
          status: 503,
          retryable: false,
        });
      }

      const model = request.model?.trim() || defaultModel;
      const url = `${baseUrl}/messages`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey.trim(),
            "anthropic-version": ANTHROPIC_VERSION,
          },
          signal: AbortSignal.timeout(requestTimeoutMs()),
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system:
              "You are a JSON API. Reply with a single JSON object only. No markdown fences.",
            messages: [{ role: "user", content: request.prompt }],
          }),
        });
      } catch (error: any) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new ProviderError({
          message: timedOut
            ? `Anthropic did not respond within ${Math.round(requestTimeoutMs() / 1000)}s.`
            : `Anthropic request failed to connect (${error?.message || "network error"}).`,
          category: timedOut ? "timeout" : "network",
          code: `ANTHROPIC_${timedOut ? "TIMEOUT" : "NETWORK"}`,
          status: timedOut ? 504 : 502,
          retryable: true,
        });
      }

      const raw = await response.text();
      if (!response.ok) {
        throw new ProviderError({
          message: `Anthropic returned HTTP ${response.status}.`,
          category: response.status === 401 || response.status === 403
            ? "invalid_key"
            : "provider_server",
          code: `ANTHROPIC_HTTP_${response.status}`,
          status: response.status >= 500 ? 502 : 400,
          retryable: response.status >= 500,
        });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new ProviderError({
          message: "Anthropic returned non-JSON.",
          category: "invalid_response",
          code: "ANTHROPIC_BAD_JSON",
          status: 502,
          retryable: true,
        });
      }

      const blocks = Array.isArray(parsed?.content) ? parsed.content : [];
      const text: string =
        blocks.find((block: any) => block?.type === "text" && typeof block.text === "string")?.text
        || (typeof blocks[0]?.text === "string" ? blocks[0].text : "");
      if (typeof text !== "string" || !text.trim()) {
        throw new ProviderError({
          message: "Anthropic returned an empty completion.",
          category: "invalid_response",
          code: "ANTHROPIC_EMPTY",
          status: 502,
          retryable: true,
        });
      }

      return {
        text: extractJsonText(text),
        providerId: "anthropic",
        model,
      };
    },
  };
}
