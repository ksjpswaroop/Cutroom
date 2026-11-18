import type { AiProviderUsage } from "./types";

/**
 * Cutroom Pro M3 — provider usage parsing (pure, no I/O).
 *
 * Providers report usage in different shapes:
 *  - OpenAI-compatible (OpenAI, OpenRouter, MiniMax, Ollama /v1):
 *    `{ prompt_tokens, completion_tokens, total_tokens }`
 *  - Anthropic: `{ input_tokens, output_tokens }` (no total — it is derived)
 *  - Gemini: `{ promptTokenCount, candidatesTokenCount, totalTokenCount }`
 *
 * The parser accepts any of those, requires non-negative integer counts,
 * and derives `totalTokens` as prompt + completion when the provider did
 * not report a total. Anything else — a negative count, a float, a
 * string, a null, a missing prompt/completion count — is malformed:
 * the result is `{ ok: false, reason }` and the caller must record usage
 * as "not reported by provider", never invent a number and never crash.
 * A missing usage object entirely (the provider returned none) is not
 * an error: it is `{ ok: true, usage: undefined }` — "not reported".
 */

export type ParsedProviderUsage =
  | { ok: true; usage: AiProviderUsage | undefined }
  | { ok: false; reason: string };

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function parseAiProviderUsage(raw: unknown): ParsedProviderUsage {
  if (raw === undefined || raw === null) {
    return { ok: true, usage: undefined };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "Provider usage is not an object." };
  }
  const record = raw as Record<string, unknown>;
  // Accept the already-normalised shape too (AiProviderUsage, as a
  // provider result carries it): promptTokens / completionTokens /
  // totalTokens — alongside the raw provider shapes below.
  const prompt =
    record.promptTokens ?? record.prompt_tokens ?? record.input_tokens ?? record.promptTokenCount;
  const completion =
    record.completionTokens ?? record.completion_tokens ?? record.output_tokens ?? record.candidatesTokenCount;
  const total = record.totalTokens ?? record.total_tokens ?? record.totalTokenCount;

  if (prompt === undefined || completion === undefined) {
    return { ok: false, reason: "Provider usage is missing a prompt or completion token count." };
  }
  if (!isNonNegativeInt(prompt) || !isNonNegativeInt(completion)) {
    return { ok: false, reason: "Provider usage has a prompt or completion token count that is not a non-negative integer." };
  }
  if (total !== undefined && !isNonNegativeInt(total)) {
    return { ok: false, reason: "Provider usage has a total token count that is not a non-negative integer." };
  }
  const totalTokens = typeof total === "number" ? total : prompt + completion;
  return { ok: true, usage: { promptTokens: prompt, completionTokens: completion, totalTokens } };
}

/**
 * A provider response id, when one is returned. Only a non-empty string
 * counts; anything else is "not reported" (undefined), never invented.
 */
export function parseProviderResponseId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim().slice(0, 128) : undefined;
}
