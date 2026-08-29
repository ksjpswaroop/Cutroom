import { createGeminiTextProvider } from "./gemini-adapter";
import { createGeminiImageProvider } from "./gemini-image-adapter";
import { createMiniMaxTextProvider } from "./minimax-adapter";
import { createMiniMaxImageProvider } from "./minimax-image-adapter";
import { createOllamaImageProvider } from "./ollama-image-adapter";
import {
  createOllamaTextProvider,
  createOpenAiCompatibleEnvProvider,
  createOpenRouterTextProvider,
} from "./openai-compatible";
import { createUnconfiguredTextProvider } from "./stubs";
import { minimaxConfigured } from "../minimax";
import {
  isAiImageProviderId,
  isAiProviderId,
  type AiImageProvider,
  type AiImageProviderId,
  type AiProviderId,
  type AiTextProvider,
} from "./types";

export type {
  AiImageGenerationRequest,
  AiImageGenerationResult,
  AiImageProvider,
  AiImageProviderId,
  AiJsonCompletionRequest,
  AiJsonCompletionResult,
  AiProviderId,
  AiTextProvider,
} from "./types";
export {
  AI_IMAGE_PROVIDER_IDS,
  AI_PROVIDER_IDS,
  isAiImageProviderId,
  isAiProviderId,
} from "./types";

/**
 * Resolve the active text provider.
 * Env: `CUTROOM_AI_PROVIDER` = gemini | openai_compatible | ollama | openrouter | minimax (default: gemini).
 */
export function resolveAiProviderId(
  raw: string | undefined = process.env.CUTROOM_AI_PROVIDER,
): AiProviderId {
  const value = (raw || "gemini").trim().toLowerCase();
  return isAiProviderId(value) ? value : "gemini";
}

export function getTextProvider(providerId?: AiProviderId): AiTextProvider {
  const id = providerId ?? resolveAiProviderId();
  switch (id) {
    case "gemini":
      return createGeminiTextProvider();
    case "openai_compatible":
      return createOpenAiCompatibleEnvProvider();
    case "ollama":
      return createOllamaTextProvider();
    case "openrouter":
      return createOpenRouterTextProvider();
    case "minimax":
      return createMiniMaxTextProvider();
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/**
 * Resolve the active image provider (L-408).
 * Env: `CUTROOM_IMAGE_PROVIDER` = gemini | ollama | minimax (default: gemini,
 * or MiniMax when the text provider is MiniMax).
 */
export function resolveAiImageProviderId(
  raw: string | undefined = process.env.CUTROOM_IMAGE_PROVIDER,
): AiImageProviderId {
  const value = (raw || "").trim().toLowerCase();
  if (isAiImageProviderId(value)) return value;
  if (resolveAiProviderId() === "minimax" && minimaxConfigured()) return "minimax";
  return "gemini";
}

export function getImageProvider(providerId?: AiImageProviderId): AiImageProvider {
  const id = providerId ?? resolveAiImageProviderId();
  switch (id) {
    case "gemini":
      return createGeminiImageProvider();
    case "ollama":
      return createOllamaImageProvider();
    case "minimax":
      return createMiniMaxImageProvider();
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** Kept for tests that assert clear errors when forcing an unconfigured stub. */
export { createUnconfiguredTextProvider };
