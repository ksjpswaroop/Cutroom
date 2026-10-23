import { z } from "zod";

export const THUMBNAIL_INSPECTION_TOP_N = 5;

export interface ThumbnailInspectionVideo {
  id: string;
  title: string;
  thumbnailUrl?: string;
  viewCount?: number;
}

export interface ThumbnailInspectionClaim {
  id: string;
  claim: string;
  evidenceClass: "inferred";
  sourceVideoIds: string[];
  confidence: "low" | "medium" | "high";
  limitations: string[];
  snapshotId: string;
}

export const thumbnailInspectionRequestSchema = z.object({
  snapshotId: z.string().trim().min(8).max(128),
  videos: z.array(z.object({
    id: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(500),
    thumbnailUrl: z.string().url().max(2_048),
    viewCount: z.number().nonnegative().optional(),
  }).strict()).min(1).max(50),
}).strict();

export type ThumbnailInspectionRequest = z.infer<typeof thumbnailInspectionRequestSchema>;

function parseLooseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] || text).trim());
}

/** Highest-view thumbnails in the snapshot. Missing URLs are skipped. */
export function selectCompetitorThumbnails<T extends ThumbnailInspectionVideo>(
  videos: readonly T[],
  limit = THUMBNAIL_INSPECTION_TOP_N,
): T[] {
  const count = Math.max(1, Math.min(limit, THUMBNAIL_INSPECTION_TOP_N));
  return videos
    .filter((video) => typeof video.thumbnailUrl === "string" && /^https:\/\//i.test(video.thumbnailUrl))
    .slice()
    .sort((left, right) => {
      const byViews = (right.viewCount ?? -1) - (left.viewCount ?? -1);
      if (byViews !== 0) return byViews;
      return left.id.localeCompare(right.id);
    })
    .slice(0, count);
}

export function thumbnailInspectionPrompt(input: {
  snapshotId: string;
  videos: readonly { id: string; title: string; thumbnailUrl: string }[];
}): string {
  const rows = input.videos.map((video) => ({
    id: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
  }));
  return `You inspect competitor YouTube thumbnail pixels for one research snapshot.
Every claim's evidenceClass must be "inferred".
Do not label visual observations as observed. Thumbnail pixels are not YouTube Data API facts.
Do not invent videos, metrics, or quotes.
Active snapshot: ${input.snapshotId}
Inspected videos:
${JSON.stringify(rows)}
Return JSON only:
{"claims":[{"id":"stable id","claim":"one visual observation","evidenceClass":"inferred","sourceVideoIds":["exact inspected id"],"confidence":"low|medium|high","limitations":["Visual inspection is inferred from pixels, not a Data API field."],"snapshotId":"${input.snapshotId}"}]}`;
}

export function parseThumbnailInspectionClaims(
  text: string,
  input: { snapshotId: string; videoIds: readonly string[] },
): ThumbnailInspectionClaim[] {
  let parsed: unknown;
  try {
    parsed = parseLooseJson(text);
  } catch (error) {
    throw new Error("Thumbnail inspection returned malformed JSON.", { cause: error });
  }

  const claims = parsed && typeof parsed === "object" && "claims" in parsed
    ? (parsed as { claims?: unknown }).claims
    : undefined;
  if (!Array.isArray(claims) || claims.length === 0) {
    throw new Error("Thumbnail inspection returned no inferred claims.");
  }

  const allowed = new Set(input.videoIds);
  return claims.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw new Error("Thumbnail inspection claims must be inferred.");
    }
    const claim = raw as Record<string, unknown>;
    if (claim.evidenceClass !== "inferred") {
      throw new Error("Thumbnail inspection claims must be inferred.");
    }
    const sourceVideoIds = Array.isArray(claim.sourceVideoIds)
      ? claim.sourceVideoIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (sourceVideoIds.length === 0 || sourceVideoIds.some((id) => !allowed.has(id))) {
      throw new Error("Thumbnail inspection cited an unknown video.");
    }
    if (claim.snapshotId !== input.snapshotId) {
      throw new Error("Thumbnail inspection snapshot mismatch.");
    }
    const confidence = claim.confidence;
    if (confidence !== "low" && confidence !== "medium" && confidence !== "high") {
      throw new Error("Thumbnail inspection claims must be inferred.");
    }
    const textClaim = typeof claim.claim === "string" ? claim.claim.trim() : "";
    if (!textClaim) throw new Error("Thumbnail inspection claims must be inferred.");
    const limitations = Array.isArray(claim.limitations)
      ? claim.limitations.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    if (limitations.length === 0) throw new Error("Thumbnail inspection claims must be inferred.");
    const withVisualLimit = limitations.some((item) => /infer|visual|pixel/i.test(item))
      ? limitations
      : [...limitations, "Visual thumbnail inspection is inferred, not an observed Data API field."];
    const id = typeof claim.id === "string" && claim.id.trim() ? claim.id.trim() : `thumb-${index + 1}`;
    return {
      id,
      claim: textClaim,
      evidenceClass: "inferred",
      sourceVideoIds,
      confidence,
      limitations: withVisualLimit,
      snapshotId: input.snapshotId,
    };
  });
}
