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
  createdAt: z.number().int().positive(),
}).strict();

export type ProductionItem = z.infer<typeof productionItemSchema>;

export const productionItemCreateSchema = z.object({
  channelId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
}).strict();

export const productionItemMoveSchema = z.object({
  id: z.string().trim().min(1).max(80),
  stage: productionStageSchema,
  assignee: z.string().trim().max(80).optional(),
}).strict();

// ── Channel intelligence (inferred) ───────────────────────────────────────────

export const channelIntelligenceRequestSchema = z.object({
  niche: z.string().trim().min(1).max(160),
  scriptTitles: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
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
