import { z } from "zod";
import { evidenceClaimSchema, type EvidenceClaim } from "./evidence-contracts";
import { productionBoardOutputSchema, type ProductionBoardOutput } from "./board-contracts";
import { assemblerPlanOptionsSchema } from "./assembler";

/**
 * Cutroom Pro M2 — the agent team (pure shared layer).
 *
 * Agents are registry commands, not chat personas. They communicate only
 * through structured handoffs (see AgentHandoffSchema): the input snapshot
 * / claim ids, claims with evidence pointers, open questions, cost so far,
 * and what the agent did NOT verify. No agent trusts a previous agent's
 * summary over the evidence ledger — every later agent re-reads the
 * ledger (claims + pointers) from the handoff.
 *
 * Nothing here calls a provider or touches the network. The stub engine
 * (server/agents.ts) produces deterministic outputs from these fixtures;
 * the live engine calls the configured AiTextProvider and validates its
 * output against the same schemas. A claim without an evidence pointer is
 * rejected by validation, never silently accepted.
 */

export const agentIds = ["researcher", "auditor", "scriptwriter", "packaging", "qa", "assembler"] as const;
export type AgentId = (typeof agentIds)[number];

export const agentCommandIds = {
  researcher: "agents.researcher",
  auditor: "agents.auditor",
  scriptwriter: "agents.scriptwriter",
  packaging: "agents.packaging",
  qa: "agents.qa",
  assembler: "assembler.run",
} as const satisfies Record<AgentId, string>;

/** An evidence pointer: the exact video + excerpt a claim rests on. */
export const evidencePointerSchema = z.object({
  videoId: z.string().trim().min(1).max(128),
  excerpt: z.string().trim().min(1).max(2_000),
  timestampSeconds: z.number().min(0).max(86_400).optional(),
}).strict();
export type EvidencePointer = z.infer<typeof evidencePointerSchema>;

/**
 * A claim as the Auditor emits it: the desk's evidenceClaim plus a
 * mandatory evidence pointer. Observed claims must also carry at least
 * one source video id (inherited from evidenceClaimSchema) and the
 * pointer's video must be one of them.
 */
export const agentClaimSchema = evidenceClaimSchema.extend({
  evidencePointer: evidencePointerSchema,
}).strict().superRefine((claim, ctx) => {
  if (claim.evidenceClass === "observed" && !claim.sourceVideoIds.includes(claim.evidencePointer.videoId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidencePointer", "videoId"],
      message: "Observed claim evidence pointer must be one of its source videos",
    });
  }
});
export type AgentClaim = z.infer<typeof agentClaimSchema>;

/** One script line, traced to at least one claim id. A line with no claim is rejected. */
export const scriptLineSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  claimIds: z.array(z.string().trim().min(1).max(128)).min(1).max(8),
}).strict();
export type ScriptLine = z.infer<typeof scriptLineSchema>;

export const scriptSectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(500),
  lines: z.array(scriptLineSchema).min(1).max(24),
  evidenceClaimIds: z.array(z.string().trim().min(1).max(128)).max(8),
}).strict();
export type ScriptSection = z.infer<typeof scriptSectionSchema>;

export const scriptOutputSchema = z.object({
  titles: z.array(z.string().trim().min(1).max(100)).length(3),
  hook: z.string().trim().min(1).max(1_500),
  sections: z.array(scriptSectionSchema).min(2).max(16),
  payoff: z.string().trim().min(1).max(1_000),
  primaryCta: z.string().trim().min(1).max(800),
  /** WPM chapters derived from the script words at the desk's teleprompter WPM. */
  wpmChapters: z.array(z.object({
    section: z.string().trim().min(1).max(120),
    words: z.number().int().min(0),
    minutes: z.number().min(0),
  }).strict()).min(2).max(16),
}).strict();
export type ScriptOutput = z.infer<typeof scriptOutputSchema>;

/**
 * Packaging variants carry qualitative critique only — no numeric score,
 * CTR prediction, or SEO/algorithm score anywhere. `assertNoNumericScores`
 * below enforces that on any JSON the Packaging agent produces.
 */
export const critiqueLabelSchema = z.enum(["strong", "adequate", "weak"]);
export const packagingVariantSchema = z.object({
  kind: z.enum(["title", "hook", "thumbnail"]),
  text: z.string().trim().min(1).max(500),
  /** Where the variant came from, e.g. "script title 1" / "brand kit". */
  source: z.string().trim().min(1).max(200),
  critique: z.object({
    clarity: critiqueLabelSchema,
    promiseMatch: critiqueLabelSchema,
    brandFit: critiqueLabelSchema,
  }).strict(),
}).strict();
export type PackagingVariant = z.infer<typeof packagingVariantSchema>;

const SCORE_KEY = /(ctr|click.?through|seo|score|rank|rating|percent|%)|_score|score_/i;

/** Recursively reject any numeric value under a metric-sounding key. */
export function assertNoNumericScores(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNumericScores(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === "number" && SCORE_KEY.test(key)) {
        throw new Error(`Invented metric rejected at ${path}.${key}: numeric scores / CTR / SEO values are not allowed in packaging output.`);
      }
      assertNoNumericScores(entry, `${path}.${key}`);
    }
  }
}

export const packagingOutputSchema = z.object({
  variants: z.array(packagingVariantSchema).min(1).max(12),
}).strict();
export type PackagingOutput = z.infer<typeof packagingOutputSchema>;

/** Structured handoff between agents — the only way agents communicate. */
export const agentHandoffSchema = z.object({
  agent: z.enum(agentIds),
  runId: z.string().trim().min(1).max(128),
  snapshotId: z.string().trim().min(8).max(128),
  claimIds: z.array(z.string().trim().min(1).max(128)).max(64),
  claims: z.array(agentClaimSchema).max(24).default([]),
  openQuestions: z.array(z.string().trim().min(1).max(1_000)).max(16).default([]),
  /** Cost in USD spent so far in this run, or null when a provider did not report it. Never invented. */
  costSoFarUsd: z.number().min(0).nullable(),
  /** What this agent did NOT verify — the next agent must not assume it. */
  notVerified: z.array(z.string().trim().min(1).max(1_000)).max(16).default([]),
  memoryUsed: z.boolean().default(false),
  summary: z.string().trim().min(1).max(2_000),
}).strict();
export type AgentHandoff = z.infer<typeof agentHandoffSchema>;

export const agentStepStatusSchema = z.enum(["pending", "running", "ok", "failed", "skipped", "needs-human"]);
export type AgentStepStatus = z.infer<typeof agentStepStatusSchema>;

export const agentPlanStepSchema = z.object({
  seq: z.number().int().min(1),
  agent: z.enum(agentIds),
  command: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(200),
  /** Human approval is required before this step runs. */
  requiresApproval: z.boolean(),
  /** Stub steps cost $0; live steps cost null (unknown until the provider reports it). */
  estimatedCostUsd: z.number().min(0).nullable(),
  status: agentStepStatusSchema,
  skipReason: z.string().trim().min(1).max(500).optional(),
}).strict();
export type AgentPlanStep = z.infer<typeof agentPlanStepSchema>;

export const agentPlanSchema = z.object({
  runId: z.string().trim().min(1).max(128),
  projectId: z.string().trim().min(1).max(128),
  topic: z.string().trim().min(1).max(500),
  channelId: z.string().trim().min(2).max(128).optional(),
  snapshotId: z.string().trim().min(8).max(128).optional(),
  provider: z.enum(["stub", "live"]),
  spendCapUsd: z.number().min(0),
  steps: z.array(agentPlanStepSchema).min(1).max(8),
  status: z.enum(["pending", "running", "ok", "failed", "needs-human", "partial"]),
  createdAt: z.string().datetime(),
}).strict();
export type AgentPlan = z.infer<typeof agentPlanSchema>;

/** Input to plan/run. `videos` / `claims` let a run start from an existing snapshot instead of a fresh topic. */
export const agentPlanInputSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  channelId: z.string().trim().min(2).max(128).optional(),
  snapshotId: z.string().trim().min(8).max(128).optional(),
  projectId: z.string().trim().min(1).max(128).default("default"),
  provider: z.enum(["stub", "live"]).default("stub"),
  spendCapUsd: z.number().min(0).max(10_000).default(0),
  board: productionBoardOutputSchema.optional(),
  boardOptions: assemblerPlanOptionsSchema.optional(),
  videos: z.array(z.object({
    id: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(400),
    channelTitle: z.string().trim().min(1).max(200),
  }).strict()).min(1).max(50).optional(),
  claims: z.array(agentClaimSchema).min(1).max(24).optional(),
  voiceCloneFromSnapshotCreator: z.boolean().default(false),
}).strict();
export type AgentPlanInput = z.infer<typeof agentPlanInputSchema>;

/** A per-agent cost entry. Tokens / cost are null when the provider does not report them — never invented. */
export const costEntrySchema = z.object({
  agent: z.enum(agentIds),
  provider: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(128),
  tokens: z.number().int().min(0).nullable(),
  quotaUnits: z.number().int().min(0),
  costUsd: z.number().min(0).nullable(),
  note: z.string().trim().min(1).max(500),
}).strict();
export type CostEntry = z.infer<typeof costEntrySchema>;

export const agentReceiptSchema = z.object({
  agent: z.enum(agentIds),
  command: z.string().trim().min(1).max(128),
  status: z.enum(["ok", "failed", "skipped", "needs-human"]),
  attempts: z.number().int().min(0).max(3),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
  cost: costEntrySchema,
  handoff: agentHandoffSchema.nullable(),
  error: z.string().trim().min(1).max(2_000).optional(),
  note: z.string().trim().min(1).max(1_000).optional(),
}).strict();
export type AgentReceipt = z.infer<typeof agentReceiptSchema>;

// ---------------------------------------------------------------------------
// Deterministic stub fixtures (no live calls, no randomness)
// ---------------------------------------------------------------------------

function stubHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

export interface StubVideo { id: string; title: string; channelTitle: string; }

export function stubSnapshotVideos(topic: string, channelId?: string): { snapshotId: string; videos: StubVideo[] } {
  const hash = stubHash(topic + (channelId || "")).toString(16).padStart(8, "0").slice(0, 8);
  const snapshotId = `snap-stub-${hash}`;
  const channel = channelId || "stub-channel";
  return {
    snapshotId,
    videos: [1, 2, 3].map((n) => ({
      id: `stub-vid-${n}`,
      title: `${topic} — part ${n}: what the sample shows`,
      channelTitle: `${channel} — creator ${n}`,
    })),
  };
}

const OBSERVED_TEXTS = [
  "The sample videos open with a timed, on-screen demonstration",
  "Two of the three sample videos keep the same host on camera throughout",
  "The sample titles all name the outcome in the first five words",
];
const INFERRED_TEXTS = [
  "Viewers of this topic may prefer a demonstration over a talking head",
  "A shorter opening may hold attention better than a long introduction",
  "The format that repeats across the sample is a timed walkthrough",
];
const STUDIO_TEXTS = [
  "Whether this topic actually retains viewers past the opening",
  "Whether the audience for this topic finds the channel by search or by browse",
  "Whether the recommended format converts to subscribers for this channel",
];

export function stubClaims(snapshotId: string, videos: StubVideo[]): AgentClaim[] {
  const claims: AgentClaim[] = [];
  const mk = (index: number, text: string, evidenceClass: AgentClaim["evidenceClass"], video: StubVideo): AgentClaim => ({
    id: `stub-claim-${index + 1}`,
    claim: text,
    evidenceClass,
    sourceVideoIds: evidenceClass === "observed" ? [video.id] : [],
    confidence: evidenceClass === "observed" ? "high" : "medium",
    limitations: evidenceClass === "observed"
      ? ["Based on the 3-video stub sample only."]
      : ["Aggregate inference from the stub sample — not a measured fact."],
    snapshotId,
    evidencePointer: {
      videoId: video.id,
      excerpt: video.title,
      timestampSeconds: index * 30,
    },
  });
  OBSERVED_TEXTS.forEach((text, i) => claims.push(mk(i, text, "observed", videos[i % videos.length])));
  INFERRED_TEXTS.forEach((text, i) => claims.push(mk(3 + i, text, "inferred", videos[i % videos.length])));
  STUDIO_TEXTS.forEach((text, i) => claims.push(mk(6 + i, text, "requires_studio", videos[i % videos.length])));
  return claims;
}

export function stubScript(topic: string, claims: AgentClaim[]): ScriptOutput {
  const byClass = (cls: AgentClaim["evidenceClass"]) => claims.filter((c) => c.evidenceClass === cls);
  const observed = byClass("observed");
  const inferred = byClass("inferred");
  const sections: ScriptSection[] = [
    {
      name: "Hook",
      purpose: "State the promise from the observed sample.",
      lines: [
        { text: `Today: ${topic} — the timed demonstration the sample opens with.`, claimIds: [observed[0]?.id || claims[0].id] },
        { text: "No guesswork: every claim in this script traces to the snapshot.", claimIds: [observed[1]?.id || claims[0].id] },
      ],
      evidenceClaimIds: observed.slice(0, 2).map((c) => c.id),
    },
    {
      name: "Method",
      purpose: "Walk through the format the sample repeats.",
      lines: [
        { text: "The walkthrough format repeats across the sample, so we follow it step by step.", claimIds: [inferred[0]?.id || claims[3].id] },
        { text: "We keep the host on camera, as two of the three sample videos do.", claimIds: [observed[1]?.id || claims[1].id] },
      ],
      evidenceClaimIds: [inferred[0]?.id || claims[3].id, observed[1]?.id || claims[1].id],
    },
    {
      name: "Close",
      purpose: "Close with the honest next experiment.",
      lines: [
        { text: "Try it, then check retention in Studio — that is the validation this script cannot claim.", claimIds: [claims[6].id] },
        { text: "The outcome is named up front, as the sample titles do.", claimIds: [observed[2]?.id || claims[2].id] },
      ],
      evidenceClaimIds: [claims[6].id, observed[2]?.id || claims[2].id],
    },
  ];
  const words = sections.flatMap((s) => s.lines).reduce((n, line) => n + line.text.split(/\s+/).filter(Boolean).length, 0);
  const wpm = 150;
  return {
    titles: [
      `${topic}: the timed walkthrough`,
      `${topic} in one demonstration`,
      `How ${topic} actually works`,
    ],
    hook: sections[0].lines[0].text,
    sections,
    payoff: "A timed walkthrough you can film, with every claim traced to the snapshot.",
    primaryCta: "Try the walkthrough and check retention in Studio.",
    wpmChapters: sections.map((section) => {
      const sectionWords = section.lines.reduce((n, line) => n + line.text.split(/\s+/).filter(Boolean).length, 0);
      return { section: section.name, words: sectionWords, minutes: Math.round((sectionWords / wpm) * 100) / 100 };
    }),
  };
}

export function stubPackaging(script: ScriptOutput, brandKitName?: string): PackagingOutput {
  const source = brandKitName ? `brand kit (${brandKitName})` : "script";
  return {
    variants: [
      { kind: "title", text: script.titles[0], source: "script title 1", critique: { clarity: "strong", promiseMatch: "strong", brandFit: "adequate" } },
      { kind: "title", text: script.titles[1], source: "script title 2", critique: { clarity: "strong", promiseMatch: "adequate", brandFit: "strong" } },
      { kind: "hook", text: script.hook, source: "script hook", critique: { clarity: "strong", promiseMatch: "strong", brandFit: "adequate" } },
      { kind: "thumbnail", text: `Timed walkthrough still — ${script.titles[2]}`, source, critique: { clarity: "adequate", promiseMatch: "strong", brandFit: "strong" } },
    ],
  };
}

/** Build the visible plan. No agent runs here — the plan is inspectable first, then approved. */
export function buildAgentPlan(input: AgentPlanInput, runId: string): AgentPlan {
  const steps: AgentPlanStep[] = [];
  const live = input.provider === "live";
  const add = (agent: AgentId, label: string, requiresApproval: boolean, skipReason?: string) => {
    steps.push({
      seq: steps.length + 1,
      agent,
      command: agentCommandIds[agent],
      label,
      requiresApproval,
      estimatedCostUsd: live ? null : 0,
      status: skipReason ? "skipped" : "pending",
      ...(skipReason ? { skipReason } : {}),
    });
  };
  add("researcher", "Researcher — stamp the snapshot (topic / channel)", false);
  add("auditor", "Insight Auditor — claims with evidence pointers", false);
  add("scriptwriter", "Scriptwriter — script traced to claims", false);
  add("packaging", "Packaging — title / hook / thumbnail variants", false);
  add("qa", "QA / Compliance — deterministic checks", false);
  if (input.board) {
    add("assembler", "Editor (Assembler) — assemble the Board with filmcraft-cli", true);
  } else {
    add("assembler", "Editor (Assembler) — assemble the Board with filmcraft-cli", true, "No Board supplied — assembler step skipped.");
  }
  return {
    runId,
    projectId: input.projectId,
    topic: input.topic,
    channelId: input.channelId,
    snapshotId: input.snapshotId,
    provider: input.provider,
    spendCapUsd: input.spendCapUsd,
    steps,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}
