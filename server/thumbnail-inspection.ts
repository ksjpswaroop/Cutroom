import { getGeminiApiKey, getGeminiClient, getGeminiTextModel } from "./gemini-runtime";
import { ProviderError } from "./provider-errors";
import {
  parseThumbnailInspectionClaims,
  selectCompetitorThumbnails,
  thumbnailInspectionPrompt,
  type ThumbnailInspectionClaim,
  type ThumbnailInspectionRequest,
  type ThumbnailInspectionVideo,
} from "@shared/thumbnail-inspection";

const MAX_THUMBNAIL_BYTES = 1_500_000;

export interface FetchedThumbnail {
  mimeType: string;
  base64: string;
}

export interface ThumbnailInspectionImage extends FetchedThumbnail {
  videoId: string;
}

export interface ThumbnailInspectionDeps {
  fetchImage: (url: string) => Promise<FetchedThumbnail | null>;
  complete: (request: { prompt: string; images: ThumbnailInspectionImage[] }) => Promise<string>;
}

export interface ThumbnailInspectionResult {
  snapshotId: string;
  inspected: Array<{ id: string; title: string; thumbnailUrl: string }>;
  claims: ThumbnailInspectionClaim[];
}

export async function fetchThumbnailImage(url: string): Promise<FetchedThumbnail | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;
  const mimeType = (response.headers.get("content-type") || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
  if (!mimeType.startsWith("image/")) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_THUMBNAIL_BYTES) return null;
  return { mimeType, base64: bytes.toString("base64") };
}

export async function inspectCompetitorThumbnails(
  input: { snapshotId: string; videos: readonly ThumbnailInspectionVideo[] },
  deps: ThumbnailInspectionDeps,
): Promise<ThumbnailInspectionResult> {
  const selected = selectCompetitorThumbnails(input.videos).filter((video): video is ThumbnailInspectionVideo & { thumbnailUrl: string } => (
    typeof video.thumbnailUrl === "string"
  ));

  const images: ThumbnailInspectionImage[] = [];
  const inspected: ThumbnailInspectionResult["inspected"] = [];
  for (const video of selected) {
    const image = await deps.fetchImage(video.thumbnailUrl);
    if (!image) continue;
    images.push({ videoId: video.id, mimeType: image.mimeType, base64: image.base64 });
    inspected.push({ id: video.id, title: video.title, thumbnailUrl: video.thumbnailUrl });
  }

  if (inspected.length === 0) {
    throw new ProviderError({
      message: "No competitor thumbnails could be inspected.",
      category: "invalid_response",
      code: "THUMBNAIL_INSPECTION_NO_IMAGES",
      status: 502,
      retryable: true,
    });
  }

  const prompt = thumbnailInspectionPrompt({ snapshotId: input.snapshotId, videos: inspected });
  const text = await deps.complete({ prompt, images });
  let claims: ThumbnailInspectionClaim[];
  try {
    claims = parseThumbnailInspectionClaims(text, {
      snapshotId: input.snapshotId,
      videoIds: inspected.map((video) => video.id),
    });
  } catch (error) {
    throw new ProviderError({
      message: error instanceof Error ? error.message : "Thumbnail inspection claims must be inferred.",
      category: "invalid_response",
      code: "THUMBNAIL_INSPECTION_INVALID",
      status: 502,
      retryable: true,
      cause: error,
    });
  }

  return { snapshotId: input.snapshotId, inspected, claims };
}

export async function inspectCompetitorThumbnailsWithGemini(
  input: ThumbnailInspectionRequest,
): Promise<ThumbnailInspectionResult> {
  if (!getGeminiApiKey()) {
    throw new ProviderError({
      message: "Gemini API key is not configured.",
      category: "missing_key",
      code: "GEMINI_MISSING_KEY",
      status: 503,
      retryable: false,
    });
  }

  return inspectCompetitorThumbnails(input, {
    fetchImage: fetchThumbnailImage,
    complete: async ({ prompt, images }) => {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: prompt },
        ...images.map((image) => ({
          inlineData: { mimeType: image.mimeType, data: image.base64 },
        })),
      ];
      const response = await getGeminiClient().models.generateContent({
        model: getGeminiTextModel(),
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json" },
      });
      return response.text || "";
    },
  });
}
