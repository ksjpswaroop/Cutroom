import { z } from "zod";
import { evidenceClassSchema, evidenceConfidenceSchema } from "./evidence-contracts";

/**
 * Contracts for the creator-intelligence modules folded into Cutroom:
 * Channels (gaps / growth / benchmark / memory), Audience (personas +
 * exportable avatar), Operations (Kanban), and Humanize.
 *
 * Standing boundary: new claims carry an evidence class. Channel intelligence
 * and audience personas are *synthesized* — there is no research snapshot behind
 * them — so they must be labeled `inferred`, never `observed`. A claim with no
 * label is rejected (the field is required), and a claim labeled `observed` is
 * rejected because these modules have no source videos to cite.
 */

const boundedText = z.string().trim().min(1).max(2_000);
const limitations = z.array(boundedText).min(1).max(8);

/**
 * The label a synthesized creator finding must carry. Unlabeled → rejected
 * (required). `observed` → rejected (no snapshot sources exist here). Only
 * `inferred` passes, which is the honest class for model-synthesized strategy.
 */
export const inferredEvidenceClassSchema = evidenceClassSchema.refine(
  (value) => value === "inferred",
  "Channel and audience findings are synthesized, not observed from a research snapshot — label them \"inferred\".",
);

// ── Channels ────────────────────────────────────────────────────────────────

export const channelSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  niche: z.string().trim().max(160).default(""),
  description: z.string().trim().max(2_000).default(""),
  subscribers: z.number().int().min(0).max(10_000_000_000).default(0),
  createdAt: z.number().int().positive(),
}).strict();

export type Channel = z.infer<typeof channelSchema>;

export const channelCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  niche: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2_000).optional(),
  subscribers: z.number().int().min(0).max(10_000_000_000).optional(),
}).strict();

export const channelUpdateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120).optional(),
  niche: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2_000).optional(),
  subscribers: z.number().int().min(0).max(10_000_000_000).optional(),
}).strict();

// ── Operations (Kanban) ───────────────────────────────────────────────────────

export const productionStages = ["idea", "research", "scripting", "review", "published"] as const;
export const productionStageSchema = z.enum(productionStages);
export type ProductionStage = z.infer<typeof productionStageSchema>;

export const productionItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  channelId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  stage: productionStageSchema,
  assignee: z.string().trim().max(80).optional(),
  // L-803: an item may cite the research snapshot it came from, and carry a
  // planned date. Publishing is gated on a cited snapshot (see creator-store).
  snapshotId: z.string().trim().min(1).max(120).optional(),
  dueDate: z.string().trim().min(1).max(40).optional(),
  createdAt: z.number().int().positive(),
}).strict();

export type ProductionItem = z.infer<typeof productionItemSchema>;

export const productionItemCreateSchema = z.object({
  channelId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  snapshotId: z.string().trim().min(1).max(120).optional(),
  dueDate: z.string().trim().min(1).max(40).optional(),
}).strict();

export const productionItemMoveSchema = z.object({
  id: z.string().trim().min(1).max(80),
  stage: productionStageSchema,
  assignee: z.string().trim().max(80).optional(),
  // Allow citing the snapshot at publish time (L-803 gate).
  snapshotId: z.string().trim().min(1).max(120).optional(),
}).strict();

/** The stage that requires a cited workflow artifact before an item may enter it. */
export const PUBLISH_STAGE: ProductionStage = "published";

// ── Channel intelligence (inferred) ───────────────────────────────────────────

export const channelIntelligenceRequestSchema = z.object({
  niche: z.string().trim().min(1).max(160),
  scriptTitles: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  // L-806: when present, the handler grounds the synthesis in this channel's
  // stored memory (production + persona counts, stage breakdown).
  channelId: z.string().trim().min(1).max(80).optional(),
}).strict();

export const channelIntelligenceSchema = z.object({
  niche: z.string().trim().min(1).max(160),
  evidenceClass: inferredEvidenceClassSchema,
  confidence: evidenceConfidenceSchema,
  performance: boundedText,
  gaps: z.array(boundedText).max(8),
  growth: z.array(boundedText).max(8),
  benchmark: boundedText,
  limitations,
  provider: z.string().trim().min(1).max(80),
  generatedAt: z.string().trim().min(1).max(64),
}).strict();

export type ChannelIntelligence = z.infer<typeof channelIntelligenceSchema>;

// ── Audience (personas + avatar, inferred) ─────────────────────────────────────

export const audiencePersonaRequestSchema = z.object({
  channelId: z.string().trim().min(1).max(80),
  channelName: z.string().trim().min(1).max(120),
  niche: z.string().trim().max(160).default(""),
}).strict();

export const audiencePersonaSchema = z.object({
  id: z.string().trim().min(1).max(80),
  channelId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  demographics: boundedText,
  intent: boundedText,
  messaging: boundedText,
  painPoints: z.array(boundedText).min(1).max(8),
  interests: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  evidenceClass: inferredEvidenceClassSchema,
  limitations,
  provider: z.string().trim().min(1).max(80),
  createdAt: z.number().int().positive(),
}).strict();

export type AudiencePersona = z.infer<typeof audiencePersonaSchema>;

export const audienceAvatarRequestSchema = z.object({
  channelName: z.string().trim().min(1).max(120),
  niche: z.string().trim().max(160).default(""),
}).strict();

export const audienceAvatarSchema = z.object({
  markdown: z.string().trim().min(1).max(20_000),
  evidenceClass: inferredEvidenceClassSchema,
  provider: z.string().trim().min(1).max(80),
}).strict();

export type AudienceAvatar = z.infer<typeof audienceAvatarSchema>;

// ── Humanize (text transform, provider-backed) ─────────────────────────────────

export const humanizeRequestSchema = z.object({
  text: z.string().trim().min(1).max(80_000),
}).strict();

export const humanizeResultSchema = z.object({
  output: z.string().min(1).max(120_000),
  // -1 means the provider rewrote the whole draft (edit count not meaningful);
  // >= 0 is the number of deterministic phrasing fixes applied.
  changes: z.number().int().min(-1),
  provider: z.string().trim().min(1).max(80),
}).strict();

export type HumanizeResult = z.infer<typeof humanizeResultSchema>;

/**
 * L-804: pure presentation summary for a humanize result. `changes === -1`
 * means a provider rewrote the whole draft (edit count not meaningful);
 * `provider === "deterministic"` means no model was available and the local
 * phrasing pass ran instead, which the UI should disclose.
 */
export interface HumanizeSummary {
  headline: string;
  isFallback: boolean;
  provider: string;
}

export function humanizeSummary(result: HumanizeResult): HumanizeSummary {
  const isFallback = result.provider === "deterministic";
  const headline =
    result.changes === -1
      ? `Fully rewritten by ${result.provider}`
      : `${result.changes} phrasing ${result.changes === 1 ? "fix" : "fixes"} applied`;
  return { headline, isFallback, provider: result.provider };
}
