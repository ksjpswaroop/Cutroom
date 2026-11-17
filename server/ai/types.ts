/**
 * Pragmatic text-generation provider surface for Insights / Ideas / Script / Package.
 * Image generation: see `AiImageProvider` (L-408). Video: see `AiVideoProvider` (PS-201).
 */
import type { ProductionBoardOutput } from "@shared/board-contracts";

export const AI_PROVIDER_IDS = [
  "gemini",
  "openai_compatible",
  "ollama",
  "openrouter",
  "minimax",
  "anthropic",
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

/**
 * PS-201: generative video (cinematic Veo-class) provider surface. A `quote()`
 * (pure, no network, no charge) must precede the charging `generateClip()`, so the
 * UI can confirm before any spend — the quote-then-charge rule. Clips are written
 * to a file (`dest`), not returned inline. Output is always `inferred`.
 */
export const AI_VIDEO_PROVIDER_IDS = [
  "minimax",
] as const;

export type AiVideoProviderId = (typeof AI_VIDEO_PROVIDER_IDS)[number];

export function isAiVideoProviderId(value: string): value is AiVideoProviderId {
  return (AI_VIDEO_PROVIDER_IDS as readonly string[]).includes(value);
}

export interface AiVideoClipRequest {
  topic: string;
  title?: string;
  scriptContent?: string;
  board?: ProductionBoardOutput;
  /** data:image/...;base64 to seed the first frame. */
  thumbnailDataUrl?: string;
  maxShots?: number;
  durationSec?: number;
  /** Output file path for the generated clip. */
  dest: string;
}

export interface AiVideoQuote {
  provider: AiVideoProviderId;
  model: string;
  shots: number;
  estimatedDurationSec: number;
  /** Cost/charge note, surfaced so the UI can confirm before the charging call. */
  note: string;
}

export interface AiVideoClipResult {
  path: string;
  providerId: AiVideoProviderId;
  model: string;
  durationSec: number;
  /** True when a generative video model produced the clip (the Veo-class path). */
  usesVeo: boolean;
}

export interface AiVideoGenerateOptions {
  /** Injected fetch for tests — no live provider call. */
  fetchImpl?: typeof fetch;
  pollMs?: number;
  maxPolls?: number;
}

export interface AiVideoProvider {
  readonly id: AiVideoProviderId;
  /** Estimate shots / duration / cost BEFORE charging. Pure — no network. */
  quote(request: AiVideoClipRequest): AiVideoQuote;
  /** Generate the clip. This is the charging call; callers must quote + confirm first. */
  generateClip(request: AiVideoClipRequest, options?: AiVideoGenerateOptions): Promise<AiVideoClipResult>;
}
