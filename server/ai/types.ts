/**
 * Pragmatic text-generation provider surface for Insights / Ideas / Script / Package.
 * Image generation stays on the Gemini path until L-408.
 */

export const AI_PROVIDER_IDS = [
  "gemini",
  "openai_compatible",
  "ollama",
  "openrouter",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export function isAiProviderId(value: string): value is AiProviderId {
  return (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Request for structured JSON completion (Gemini responseMimeType: application/json). */
export interface AiJsonCompletionRequest {
  prompt: string;
  /** Optional model override; adapters may ignore or remap. */
  model?: string;
}

export interface AiJsonCompletionResult {
  text: string;
  providerId: AiProviderId;
  model: string;
}

export interface AiTextProvider {
  readonly id: AiProviderId;
  completeJson(request: AiJsonCompletionRequest): Promise<AiJsonCompletionResult>;
}
