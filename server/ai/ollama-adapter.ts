import { ProviderError } from "../provider-errors";
import {
  listOllamaModels,
  ollamaHttpError,
  ollamaMaxTokens,
  ollamaModelName,
  ollamaNetworkError,
  ollamaOpenAiBaseUrl,
  ollamaTimeoutMs,
  suggestInstalledModel,
} from "../ollama";
import { extractJsonText, isRecoverableJson } from "./json-extract";
import type {
  AiJsonCompletionRequest,
  AiJsonCompletionResult,
  AiTextProvider,
} from "./types";

const JSON_SYSTEM_PROMPT =
  "You are a JSON API. Reply with a single JSON object only. No markdown fences, no commentary, no explanation.";

/**
 * Retry instruction used when the first attempt could not be parsed. Small
 * local models respond better to a blunt restatement than to a longer prompt.
 */
const JSON_RETRY_SYSTEM_PROMPT =
  "You are a JSON API. Your previous reply was not valid JSON. Output ONLY a single raw JSON object. "
  + "Start your reply with { and end it with }. Do not write any other text, do not use markdown code fences, "
  + "and do not explain your reasoning.";

interface ChatAttemptOptions {
  prompt: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  temperature: number;
}

async function chatOnce(options: ChatAttemptOptions): Promise<string> {
  const { prompt, model, baseUrl, systemPrompt, temperature } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      // A cold model load can take minutes, so the budget is generous but bounded;
      // without it a stalled daemon would hang the request forever.
      signal: AbortSignal.timeout(ollamaTimeoutMs()),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature,
        stream: false,
        // Bounds a runaway repetition loop, which no stop token would end.
        max_tokens: ollamaMaxTokens(),
        response_format: { type: "json_object" },
      }),
    });
  } catch (error: any) {
    throw ollamaNetworkError(error, baseUrl, model);
  }

  const raw = await response.text();
  if (!response.ok) {
    if (response.status === 404) {
      // Name the installed model they most likely meant. An untagged name such
      // as `llama3.2` is the usual cause and `llama3.2:3b` is often already pulled.
      const installed = await listOllamaModels(baseUrl);
      const suggestion = installed ? suggestInstalledModel(model, installed) : undefined;
      if (suggestion) {
        throw new ProviderError({
          message: `Ollama has no model named "${model}", but "${suggestion}" is installed. Select it in Settings, or set OLLAMA_MODEL="${suggestion}".`,
          category: "invalid_response",
          code: "OLLAMA_MODEL_NOT_FOUND",
          status: 400,
          retryable: false,
        });
      }
    }
    throw ollamaHttpError(response.status, raw, model, baseUrl);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderError({
      message: "Ollama returned a malformed response envelope.",
      category: "invalid_response",
      code: "OLLAMA_BAD_ENVELOPE",
      status: 502,
      retryable: true,
    });
  }

  const message = parsed?.choices?.[0]?.message;
  const text = message?.content || parsed?.choices?.[0]?.text || "";
  if (typeof text !== "string" || !text.trim()) {
    // Reasoning models can spend the whole budget thinking and return nothing.
    const reasoned = typeof message?.reasoning === "string" && message.reasoning.trim();
    throw new ProviderError({
      message: reasoned
        ? `"${model}" returned only reasoning and no answer. Try a non-reasoning model, or one with a larger context window.`
        : `"${model}" returned an empty completion.`,
      category: "invalid_response",
      code: "OLLAMA_EMPTY",
      status: 502,
      retryable: true,
    });
  }

  return text;
}

/**
 * Ollama text adapter.
 *
 * Differs from the generic OpenAI-compatible path in three ways that matter for
 * a local-first product: requests are bounded by an explicit timeout, output is
 * recovered from the loose formatting local models produce, and a single strict
 * retry is attempted before failing so that one stray markdown fence does not
 * break a workflow step.
 */
export function createOllamaTextProvider(): AiTextProvider {
  return {
    id: "ollama",

    async completeJson(request: AiJsonCompletionRequest): Promise<AiJsonCompletionResult> {
      const baseUrl = ollamaOpenAiBaseUrl();
      const model = request.model?.trim() || ollamaModelName();

      const first = await chatOnce({
        prompt: request.prompt,
        model,
        baseUrl,
        systemPrompt: JSON_SYSTEM_PROMPT,
        temperature: 0.4,
      });

      if (isRecoverableJson(first)) {
        return { text: extractJsonText(first), providerId: "ollama", model };
      }

      // One deterministic retry. Local models frequently comply on the second
      // pass when the instruction is restated more bluntly.
      const second = await chatOnce({
        prompt: request.prompt,
        model,
        baseUrl,
        systemPrompt: JSON_RETRY_SYSTEM_PROMPT,
        temperature: 0,
      });

      if (isRecoverableJson(second)) {
        return { text: extractJsonText(second), providerId: "ollama", model };
      }

      throw new ProviderError({
        message: `"${model}" did not return valid JSON after two attempts. Smaller models often struggle with structured output — try a larger model such as gpt-oss:20b, or switch to a hosted provider for this step.`,
        category: "invalid_response",
        code: "OLLAMA_NON_JSON",
        status: 502,
        retryable: false,
      });
    },
  };
}
