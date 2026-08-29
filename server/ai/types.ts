/**
 * Pragmatic text-generation provider surface for Insights / Ideas / Script / Package.
 * Image generation: see `AiImageProvider` (L-408).
 */

export const AI_PROVIDER_IDS = [
  "gemini",
  "openai_compatible",
  "ollama",
  "openrouter",
  "minimax",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export function isAiProviderId(value: string): value is AiProviderId {
  return (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export const AI_IMAGE_PROVIDER_IDS = [
  "gemini",
  "ollama",
  "minimax",
] as const;

export type AiImageProviderId = (typeof AI_IMAGE_PROVIDER_IDS)[number];

export function isAiImageProviderId(value: string): value is AiImageProviderId {
  return (AI_IMAGE_PROVIDER_IDS as readonly string[]).includes(value);
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

/** Local / remote image generation (thumbnails). */
export interface AiImageGenerationRequest {
  prompt: string;
  /** data:image/...;base64 references optional */
  referenceImages?: string[];
  aspectRatio?: "16:9" | "1:1" | "9:16";
  model?: string;
}

export interface AiImageGenerationResult {
  imageDataUrl: string;
  providerId: AiImageProviderId;
  model: string;
  prompt: string;
}

export interface AiImageProvider {
  readonly id: AiImageProviderId;
  generateImage(request: AiImageGenerationRequest): Promise<AiImageGenerationResult>;
}
