import { z } from "zod";
import { productionBoardOutputSchema } from "./board-contracts";

export const renderEngineSchema = z.enum(["assemble", "shoot", "slides", "cinematic"]);

export const renderRequestSchema = z.object({
  engine: renderEngineSchema,
  topic: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(120).optional(),
  chapters: z.array(z.object({
    timestamp: z.string().trim().min(1).max(16),
    title: z.string().trim().min(1).max(120),
  })).max(40).optional(),
  scriptContent: z.string().trim().max(80_000).optional(),
  thumbnailDataUrl: z.string().max(12_000_000).optional(),
  workflowId: z.string().trim().min(1).max(120).optional(),
  workflowTitle: z.string().trim().max(120).optional(),
  snapshotId: z.string().trim().min(8).max(128).optional(),
  board: productionBoardOutputSchema.optional(),
  voiceConsent: z.literal(true).optional(),
  confirmCinematic: z.literal(true).optional(),
  maxShots: z.number().int().min(1).max(5).optional(),
}).strict();

export type RenderRequest = z.infer<typeof renderRequestSchema>;

export const renderResultSchema = z.object({
  engine: renderEngineSchema,
  path: z.string().min(1).max(2_048).optional(),
  relativePath: z.string().min(1).max(512).optional(),
  durationSec: z.number().min(0).max(600).optional(),
  evidenceClass: z.literal("inferred"),
  voiceSource: z.enum(["none", "tts", "clone", "captions_only"]).optional(),
  usesVeo: z.boolean().optional(),
  usesH3: z.boolean().optional(),
  videoModel: z.string().min(1).max(80).optional(),
  shotCount: z.number().int().min(0).max(5).optional(),
}).strict();

export type RenderResult = z.infer<typeof renderResultSchema>;

export const cinematicQuoteSchema = z.object({
  engine: z.literal("cinematic"),
  shotCount: z.number().int().min(1).max(5),
  maxShots: z.literal(5),
  estimatedUsd: z.number().min(0).max(500),
  currency: z.literal("USD"),
  needsConfirm: z.literal(true),
  usesVeo: z.boolean(),
  usesH3: z.boolean().optional(),
  videoModel: z.string().min(1).max(80).optional(),
  durationSec: z.number().int().min(1).max(15).optional(),
  evidenceClass: z.literal("inferred"),
  note: z.string().min(1).max(400),
}).strict();

export type CinematicQuote = z.infer<typeof cinematicQuoteSchema>;

export const DEFAULT_CINEMATIC_MAX_SHOTS = 5;
export const DEFAULT_USD_PER_VEO_SHOT = 0.5;
export const DEFAULT_H3_DURATION_SEC = 5;
export const DEFAULT_USD_PER_H3_SECOND = 0.09;

export function quoteCinematic(input: {
  shotCount: number;
  usesVeo?: boolean;
  usesH3?: boolean;
  durationSec?: number;
  usdPerShot?: number;
  usdPerSecond?: number;
}): CinematicQuote {
  const shotCount = Math.min(DEFAULT_CINEMATIC_MAX_SHOTS, Math.max(1, input.shotCount));
  const usesH3 = Boolean(input.usesH3);
  const usesVeo = Boolean(input.usesVeo) && !usesH3;
  const durationSec = Math.min(15, Math.max(4, input.durationSec ?? DEFAULT_H3_DURATION_SEC));
  const h3Rate = input.usdPerSecond ?? DEFAULT_USD_PER_H3_SECOND;
  const veoRate = input.usdPerShot ?? DEFAULT_USD_PER_VEO_SHOT;
  const estimatedUsd = usesH3
    ? Number((durationSec * h3Rate).toFixed(2))
    : usesVeo
      ? Number((shotCount * veoRate).toFixed(2))
      : 0;
  const note = usesH3
    ? `Confirm to spend about $${estimatedUsd.toFixed(2)} on one MiniMax Hailuo H3 Short (${durationSec}s, 768P, 9:16). Output is inferred, not snapshot evidence.`
    : usesVeo
      ? `Confirm to spend about $${estimatedUsd.toFixed(2)} on up to ${shotCount} Veo-class clips. Output is inferred, not snapshot evidence.`
      : `No video-generator key: cinematic will Ken-Burns Board stills/thumbnail (${shotCount} shots). Still inferred. Confirm to render.`;
  return {
    engine: "cinematic",
    shotCount,
    maxShots: 5,
    estimatedUsd,
    currency: "USD",
    needsConfirm: true,
    usesVeo,
    usesH3,
    videoModel: usesH3 ? "MiniMax-H3" : undefined,
    durationSec: usesH3 ? durationSec : undefined,
    evidenceClass: "inferred",
    note,
  };
}
