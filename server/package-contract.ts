import { z } from "zod";
import { ideaPackageSchema, scriptEvidenceContextSchema } from "@shared/schema";

const bounded = z.string().trim().min(1).max(2_000);

export const publishPackageRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  selectedIdea: ideaPackageSchema.nullish(),
  scriptContent: z.string().trim().max(80_000).nullish(),
  evidenceContext: scriptEvidenceContextSchema.nullish(),
}).strict();

export const publishPackageOutputSchema = z.object({
  titles: z.array(z.object({
    title: z.string().trim().min(1).max(100),
    rationale: bounded.max(400),
    evidenceClass: z.enum(["observed", "inferred", "requires_studio"]),
  })).min(5).max(10),
  hooks: z.array(z.object({
    hook: z.string().trim().min(1).max(280),
    rationale: bounded.max(400),
    evidenceClass: z.enum(["observed", "inferred"]),
  })).min(3).max(8),
  description: z.string().trim().min(40).max(5_000),
  tags: z.array(z.string().trim().min(1).max(60)).min(5).max(20),
  chapters: z.array(z.object({
    timestamp: z.string().trim().min(1).max(16),
    title: z.string().trim().min(1).max(120),
  })).max(40),
  pinnedComment: z.string().trim().min(1).max(1_000),
  endScreenSuggestions: z.array(bounded.max(300)).min(1).max(5),
  measurementChecklist: z.array(z.object({
    metric: z.string().trim().min(1).max(120),
    why: bounded.max(400),
    requiresStudio: z.literal(true),
  })).min(3).max(10),
}).strict();

export type PublishPackageRequest = z.infer<typeof publishPackageRequestSchema>;
export type PublishPackageOutput = z.infer<typeof publishPackageOutputSchema>;

export const productionBriefRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  scriptContent: z.string().trim().min(40).max(80_000),
  evidenceContext: scriptEvidenceContextSchema.nullish(),
}).strict();

export const productionBriefOutputSchema = z.object({
  shotList: z.array(z.object({
    section: z.string().trim().min(1).max(120),
    shot: bounded.max(400),
    broll: bounded.max(400).optional(),
    onScreenText: z.string().trim().max(120).optional(),
  })).min(3).max(40),
  chapterMarkers: z.array(z.object({
    timestamp: z.string().trim().min(1).max(16),
    title: z.string().trim().min(1).max(120),
  })).max(40),
  propsAndLocations: z.array(bounded.max(300)).max(20),
  teleprompterCues: z.array(bounded.max(300)).max(20),
}).strict();

export type ProductionBriefRequest = z.infer<typeof productionBriefRequestSchema>;
export type ProductionBriefOutput = z.infer<typeof productionBriefOutputSchema>;

export const thumbnailCritiqueRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  mainText: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2_000).optional(),
  thumbnailDataUrl: z.string().trim().min(32).max(12_000_000).optional(),
}).strict();

export const thumbnailCritiqueOutputSchema = z.object({
  scores: z.object({
    textReadability: z.number().min(1).max(10),
    subjectFocus: z.number().min(1).max(10),
    contrast: z.number().min(1).max(10),
    clutter: z.number().min(1).max(10),
  }),
  findings: z.array(bounded.max(400)).min(2).max(8),
  variationDirections: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    direction: bounded.max(400),
  })).min(3).max(6),
}).strict();

export type ThumbnailCritiqueRequest = z.infer<typeof thumbnailCritiqueRequestSchema>;
export type ThumbnailCritiqueOutput = z.infer<typeof thumbnailCritiqueOutputSchema>;
