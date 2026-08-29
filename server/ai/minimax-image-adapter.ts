import { ProviderError } from "../provider-errors";
import {
  MINIMAX_IMAGE_MODEL,
  minimaxAuthHeaders,
  minimaxBaseUrl,
  minimaxConfigured,
} from "../minimax";
import type { AiImageGenerationRequest, AiImageGenerationResult, AiImageProvider } from "./types";

export function createMiniMaxImageProvider(): AiImageProvider {
  return {
    id: "minimax",
    async generateImage(request: AiImageGenerationRequest): Promise<AiImageGenerationResult> {
      if (!minimaxConfigured()) {
        throw new ProviderError({
          message: "MiniMax API key is not configured.",
          category: "missing_key",
          code: "MINIMAX_MISSING_KEY",
          status: 503,
          retryable: false,
        });
      }
      const model = request.model?.trim() || MINIMAX_IMAGE_MODEL;
      const response = await fetch(`${minimaxBaseUrl()}/v1/image_generation`, {
        method: "POST",
        headers: minimaxAuthHeaders(),
        body: JSON.stringify({
          model,
          prompt: request.prompt.slice(0, 1_500),
          aspect_ratio: request.aspectRatio || "16:9",
          response_format: "base64",
          n: 1,
        }),
      });
      const body = await response.json().catch(() => ({})) as {
        data?: { image_base64?: string[] };
        base_resp?: { status_code?: number; status_msg?: string };
      };
      const b64 = body.data?.image_base64?.[0];
      if (!response.ok || !b64) {
        throw new ProviderError({
          message: body.base_resp?.status_msg || `MiniMax image generation failed (${response.status}).`,
          category: response.status === 401 ? "invalid_key" : "invalid_response",
          code: "MINIMAX_IMAGE_FAILED",
          status: response.status === 401 ? 401 : 502,
          retryable: false,
        });
      }
      return {
        imageDataUrl: `data:image/png;base64,${b64}`,
        providerId: "minimax",
        model,
        prompt: request.prompt,
      };
    },
  };
}
