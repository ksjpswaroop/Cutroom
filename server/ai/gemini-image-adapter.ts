import { Modality } from "@google/genai";
import { ProviderError } from "../provider-errors";
import {
  getGeminiApiKey,
  getGeminiClient,
  getGeminiImageModel,
} from "../gemini-runtime";
import { getGeminiImageModelLabel } from "../gemini-models";
import type {
  AiImageGenerationRequest,
  AiImageGenerationResult,
  AiImageProvider,
} from "./types";

export function createGeminiImageProvider(): AiImageProvider {
  return {
    id: "gemini",
    async generateImage(request: AiImageGenerationRequest): Promise<AiImageGenerationResult> {
      if (!getGeminiApiKey()) {
        throw new ProviderError({
          message: "Gemini API key is not configured.",
          category: "missing_key",
          code: "GEMINI_MISSING_KEY",
          status: 503,
          retryable: false,
        });
      }

      const model = request.model?.trim() || getGeminiImageModel();
      const contentParts: any[] = [];
      for (const reference of request.referenceImages || []) {
        const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(reference);
        if (!match) continue;
        contentParts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
      contentParts.push({ text: request.prompt });

      const response = await getGeminiClient().models.generateContent({
        model,
        contents: [{ role: "user", parts: contentParts }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
          imageConfig: {
            aspectRatio: request.aspectRatio || "16:9",
          },
        } as any,
      });

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((part: any) => part.inlineData);
      if (!imagePart?.inlineData?.data) {
        throw new ProviderError({
          message: "Gemini returned an invalid response without image data",
          category: "invalid_response",
          code: "GEMINI_IMAGE_INVALID_RESPONSE",
          status: 502,
          retryable: false,
        });
      }

      const mimeType = imagePart.inlineData.mimeType || "image/png";
      return {
        imageDataUrl: `data:${mimeType};base64,${imagePart.inlineData.data}`,
        providerId: "gemini",
        model: `${getGeminiImageModelLabel(model)} (${model})`,
        prompt: request.prompt,
      };
    },
  };
}
