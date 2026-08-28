import { ProviderError } from "../provider-errors";
import type {
  AiImageGenerationRequest,
  AiImageGenerationResult,
  AiImageProvider,
} from "./types";

/**
 * Ollama / local FLUX-style image path (L-408).
 * Uses OpenAI-compatible `/images/generations` when the local daemon exposes it
 * (e.g. some FLUX.2 / Z-Image frontends). Clear error when unavailable.
 */
export function createOllamaImageProvider(): AiImageProvider {
  return {
    id: "ollama",
    async generateImage(request: AiImageGenerationRequest): Promise<AiImageGenerationResult> {
      const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
      const model = request.model?.trim()
        || process.env.OLLAMA_IMAGE_MODEL?.trim()
        || "flux";
      const url = `${baseUrl}/images/generations`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.OLLAMA_API_KEY?.trim()
              ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY.trim()}` }
              : {}),
          },
          body: JSON.stringify({
            model,
            prompt: request.prompt,
            n: 1,
            size: "1792x1024",
            response_format: "b64_json",
          }),
        });
      } catch (error: any) {
        throw new ProviderError({
          message: `Local image provider could not connect (${error?.message || "network error"}). Start Ollama/Comfy with an image model, or switch thumbnails back to Gemini.`,
          category: "network",
          code: "OLLAMA_IMAGE_NETWORK",
          status: 502,
          retryable: true,
        });
      }

      const raw = await response.text();
      if (!response.ok) {
        throw new ProviderError({
          message: `Local image provider returned HTTP ${response.status}. Ensure a FLUX/Z-Image-compatible /images/generations endpoint is running.`,
          category: "provider_server",
          code: `OLLAMA_IMAGE_HTTP_${response.status}`,
          status: response.status >= 500 ? 502 : 400,
          retryable: response.status >= 500,
        });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new ProviderError({
          message: "Local image provider returned non-JSON.",
          category: "invalid_response",
          code: "OLLAMA_IMAGE_BAD_JSON",
          status: 502,
          retryable: true,
        });
      }

      const b64 = parsed?.data?.[0]?.b64_json || parsed?.data?.[0]?.base64;
      if (typeof b64 !== "string" || !b64.trim()) {
        throw new ProviderError({
          message: "Local image provider returned no image bytes.",
          category: "invalid_response",
          code: "OLLAMA_IMAGE_EMPTY",
          status: 502,
          retryable: true,
        });
      }

      return {
        imageDataUrl: `data:image/png;base64,${b64.trim()}`,
        providerId: "ollama",
        model,
        prompt: request.prompt,
      };
    },
  };
}
