import { z } from "zod";
import {
  agentClaimSchema,
  agentHandoffSchema,
  buildAgentPlan,
  stubClaims,
  stubPackaging,
  stubScript,
  stubSnapshotVideos,
  type AgentClaim,
  type AgentHandoff,
  type AgentId,
  type AgentPlanInput,
  type AgentReceipt,
  type CostEntry,
  type PackagingOutput,
  type ScriptOutput,
  type StubVideo,
} from "@shared/agents";
import { addCostEntry, emptyLedger, type CostLedger } from "@shared/cost-ledger";
import { getTextProvider, resolveAiProviderId } from "./ai/index";
import type { AiTextProvider } from "./ai/types";
import { extractJsonText } from "./ai/json-extract";
import { readAgentMemory, type AgentMemory } from "./agent-memory";

/**
 * Cutroom Pro M2 — the agent engine.
 *
 * Two modes, one validation path:
 *  - "stub" (default): deterministic fixtures from shared/agents.ts. No
 *    network, no keys, no spend. This is what tests and dry runs use.
 *  - "live": the configured AiTextProvider (see server/ai/index.ts)
 *    completes JSON over the evidence already supplied. The provider's
 *    output is validated against the same schemas as the stub output —
 *    a pointer-less claim or a numeric packaging score is rejected, not
 *    repaired. Tokens / cost are null when the provider does not report
 *    them (AiJsonCompletionResult carries neither), never invented.
 *
 * Live Researcher does NOT run a YouTube search: a live run must start
 * from a snapshot the creator already made on the Research page
 * (snapshotId + videos supplied). Without one it escalates to the user.
 *
 * Every step runs through the M0 registry (server/pro-commands.ts);
 * this module holds the per-run context the registry handlers look up.
 * Contexts are created by runAgents (server/orchestrator.ts) and deleted
 * when the run ends.
 */

export interface AgentStepData {
  researcher?: { snapshotId: string; videos: StubVideo[]; counts: { videos: number; captions: number; comments: number; quotaUnits: number } };
  auditor?: { claims: AgentClaim[]; rejected: number };
  scriptwriter?: { script: ScriptOutput };
  packaging?: { packaging: PackagingOutput };
}

export interface AgentRunContext {
  runId: string;
  projectId: string;
  mode: "stub" | "live";
  spendCapUsd: number;
  input: AgentPlanInput;
  ledger: CostLedger;
  handoffs: Map<AgentId, AgentHandoff>;
  outputs: AgentStepData;
  memory: AgentMemory | null;
  attempts: Map<AgentId, number>;
  /** Test hook: fail this agent once with a no-spend error, then succeed. */
  failOnce?: Partial<Record<AgentId, boolean>>;
  /** Test hook: count live provider calls without hitting the network. */
  textProviderOverride?: AiTextProvider;
}

const contexts = new Map<string, AgentRunContext>();

export function createAgentRunContext(args: {
  runId: string;
  input: AgentPlanInput;
  memory: AgentMemory | null;
  failOnce?: Partial<Record<AgentId, boolean>>;
  textProviderOverride?: AiTextProvider;
}): AgentRunContext {
  const ctx: AgentRunContext = {
    runId: args.runId,
    projectId: args.input.projectId,
    mode: args.input.provider,
    spendCapUsd: args.input.spendCapUsd,
    input: args.input,
    ledger: emptyLedger(),
    handoffs: new Map(),
    outputs: {},
    memory: args.memory,
    attempts: new Map(),
    failOnce: args.failOnce,
    textProviderOverride: args.textProviderOverride,
  };
  contexts.set(args.runId, ctx);
  return ctx;
}

export function getAgentRunContext(runId: string): AgentRunContext | undefined {
  return contexts.get(runId);
}

export function deleteAgentRunContext(runId: string): void {
  contexts.delete(runId);
}

function stubCost(agent: AgentId, quotaUnits: number, note: string): CostEntry {
  return { agent, provider: "stub", model: "stub", tokens: null, quotaUnits, costUsd: 0, note };
}

function liveCost(agent: AgentId, provider: string, model: string): CostEntry {
  return {
    agent,
    provider,
    model,
    tokens: null,
    quotaUnits: 0,
    costUsd: null,
    note: "Live provider call; the provider did not report tokens or cost, so both are recorded as not reported.",
  };
}

function handoffBase(ctx: AgentRunContext, agent: AgentId, snapshotId: string, summary: string): Omit<AgentHandoff, "claimIds" | "claims" | "openQuestions" | "costSoFarUsd" | "notVerified" | "memoryUsed"> {
  return { agent, runId: ctx.runId, snapshotId, summary };
}

async function liveComplete(ctx: AgentRunContext, prompt: string): Promise<{ text: string; provider: string; model: string }> {
  const provider = ctx.textProviderOverride ?? getTextProvider();
  const result = await provider.completeJson({ prompt });
  return { text: result.text, provider: result.providerId, model: result.model };
}

function parseLiveJson(text: string): unknown {
  return JSON.parse(extractJsonText(text)) as unknown;
}

/** Live Auditor prompt: the model returns claims; validation decides whether they stand. */
function auditorPrompt(snapshotId: string, videos: StubVideo[]): string {
  return [
    "You are the Insight Auditor for a YouTube pre-publish desk. Return JSON only, in this shape:",
    '{ "claims": [ { "id": "c1", "claim": "...", "evidenceClass": "observed" | "inferred" | "requires_studio", "sourceVideoIds": ["..."], "confidence": "low" | "medium" | "high", "limitations": ["..."], "snapshotId": "...", "evidencePointer": { "videoId": "...", "excerpt": "..." } } ] }',
    "Rules: every claim needs an evidencePointer (videoId + excerpt from that video).",
    "Observed claims need at least one sourceVideoId, and the pointer video must be one of them.",
    "Return exactly 9 claims: 3 observed, 3 inferred, 3 requires_studio. Copy the snapshotId exactly.",
    `Snapshot: ${snapshotId}. Videos: ${JSON.stringify(videos)}.`,
    "Do not invent metrics, CTR, search volume, or Studio data.",
  ].join("\n");
}

function scriptwriterPrompt(topic: string, snapshotId: string, claims: AgentClaim[]): string {
  return [
    "You are the Scriptwriter for a YouTube pre-publish desk. Return JSON only, in this shape:",
    '{ "titles": ["...", "...", "..."], "hook": "...", "sections": [ { "name": "...", "purpose": "...", "lines": [ { "text": "...", "claimIds": ["..."] } ], "evidenceClaimIds": ["..."] } ], "payoff": "...", "primaryCta": "...", "wpmChapters": [ { "section": "...", "words": 0, "minutes": 0 } ] }',
    "Rules: every script line must trace to at least one claim id from the supplied claims.",
    "Never state a requires_studio claim as fact; name Studio as the place to validate it.",
    `Topic: ${topic}. Snapshot: ${snapshotId}. Claims: ${JSON.stringify(claims)}.`,
  ].join("\n");
}

function packagingPrompt(script: ScriptOutput, brandKitName?: string): string {
  return [
    "You are the Packaging agent for a YouTube pre-publish desk. Return JSON only, in this shape:",
    '{ "variants": [ { "kind": "title" | "hook" | "thumbnail", "text": "...", "source": "...", "critique": { "clarity": "strong" | "adequate" | "weak", "promiseMatch": "strong" | "adequate" | "weak", "brandFit": "strong" | "adequate" | "weak" } } ] }',
    "Rules: qualitative critique only. Never output a numeric score, CTR prediction, or SEO score.",
    brandKitName ? `Brand kit channel: ${brandKitName}.` : "No brand kit supplied.",
    `Script: ${JSON.stringify(script)}.`,
  ].join("\n");
}

export interface AgentStepResult {
  receipt: AgentReceipt;
  data: unknown;
  handoff: AgentHandoff | null;
}

/**
 * Execute one agent step for a run context. Throws on failure (the
 * registry audit log records it as ok: false); returns a receipt whose
 * status is "needs-human" for escalations the Orchestrator must stop on
 * (ambiguous evidence — claims rejected for missing pointers).
 */
export async function executeAgentStep(
  ctx: AgentRunContext,
  agent: Exclude<AgentId, "qa" | "assembler">,
  stepInput: Record<string, unknown>,
): Promise<AgentStepResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const attempts = (ctx.attempts.get(agent) ?? 0) + 1;
  ctx.attempts.set(agent, attempts);
  const command = `agents.${agent}`;

  // Test hook: fail once, spending nothing.
  if (ctx.failOnce?.[agent]) {
    ctx.failOnce[agent] = false;
    const error = new Error(`Test-injected failure for ${agent} (no spend).`);
    (error as Error & { mayHaveSpent?: boolean }).mayHaveSpent = false;
    throw error;
  }

  try {
    const { data, handoff, cost } = await runAgentLogic(ctx, agent, stepInput);
    ctx.ledger = addCostEntry(ctx.ledger, cost);
    ctx.handoffs.set(agent, handoff);
    const receipt: AgentReceipt = {
      agent,
      command,
      status: "ok",
      attempts,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      cost,
      handoff,
    };
    return { receipt, data, handoff };
  } catch (error: any) {
    // A needs-human escalation is returned, not thrown: the Orchestrator
    // stops the run on it, and the receipt records the reason.
    if (error?.needsHuman) {
      // A live escalation may have spent (the provider may have charged
      // before the output was rejected), so its cost stays "not reported"
      // rather than the stub's $0.
      const cost = ctx.mode === "live"
        ? { agent, provider: resolveAiProviderId(), model: "unknown", tokens: null, quotaUnits: 0, costUsd: null, note: "Escalated after a live call; the provider did not report tokens or cost." } satisfies CostEntry
        : stubCost(agent, 0, "Escalated before spending.");
      ctx.ledger = addCostEntry(ctx.ledger, cost);
      const receipt: AgentReceipt = {
        agent,
        command,
        status: "needs-human",
        attempts,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        cost,
        handoff: null,
        error: error.message,
      };
      return { receipt, data: null, handoff: null };
    }
    throw error;
  }
}

async function runAgentLogic(
  ctx: AgentRunContext,
  agent: Exclude<AgentId, "qa" | "assembler">,
  stepInput: Record<string, unknown>,
): Promise<{ data: unknown; handoff: AgentHandoff; cost: CostEntry }> {
  switch (agent) {
    case "researcher": return runResearcher(ctx, stepInput);
    case "auditor": return runAuditor(ctx, stepInput);
    case "scriptwriter": return runScriptwriter(ctx, stepInput);
    case "packaging": return runPackaging(ctx, stepInput);
  }
}

async function runResearcher(ctx: AgentRunContext, stepInput: Record<string, unknown>) {
  const topic = String(stepInput.topic || ctx.input.topic);
  const channelId = (stepInput.channelId as string | undefined) || ctx.input.channelId;
  const suppliedVideos = (stepInput.videos as StubVideo[] | undefined) || ctx.input.videos;
  const suppliedSnapshotId = (stepInput.snapshotId as string | undefined) || ctx.input.snapshotId;

  if (ctx.mode === "live" && !suppliedSnapshotId) {
    const error = new Error("Live research needs a snapshot from the Research page first (snapshotId + videos) — the agent team does not run YouTube searches on its own.");
    (error as Error & { needsHuman?: boolean }).needsHuman = true;
    throw error;
  }

  const { snapshotId, videos } = suppliedVideos
    ? { snapshotId: suppliedSnapshotId || stubSnapshotVideos(topic, channelId).snapshotId, videos: suppliedVideos }
    : stubSnapshotVideos(topic, channelId);
  const counts = { videos: videos.length, captions: 0, comments: 0, quotaUnits: 100 };
  const data = { snapshotId, videos, counts };
  ctx.outputs.researcher = data;
  const handoff = agentHandoffSchema.parse({
    ...handoffBase(ctx, "researcher", snapshotId, `Stamped snapshot ${snapshotId}: ${videos.length} videos, ${counts.quotaUnits} YouTube quota units.`),
    claimIds: [],
    claims: [],
    openQuestions: [],
    costSoFarUsd: 0,
    notVerified: ["Captions and comments were not fetched for this snapshot.", "No Studio data was read."],
    memoryUsed: ctx.memory !== null && (ctx.memory.channelFormatDna.length > 0 || ctx.memory.packagingOutcomes.length > 0 || ctx.memory.premiseNotes.length > 0),
  });
  return { data, handoff, cost: stubCost("researcher", counts.quotaUnits, ctx.mode === "live" ? "Live researcher reused the supplied snapshot; no new provider call." : "Deterministic stub snapshot; no YouTube call.") };
}

async function runAuditor(ctx: AgentRunContext, stepInput: Record<string, unknown>) {
  const snapshotId = String(stepInput.snapshotId || ctx.outputs.researcher?.snapshotId || ctx.input.snapshotId || "");
  if (!snapshotId) throw new Error("Auditor needs a snapshotId from the Researcher step.");
  const videos: StubVideo[] = (stepInput.videos as StubVideo[] | undefined) || ctx.outputs.researcher?.videos || [];
  const suppliedClaims = (stepInput.claims as AgentClaim[] | undefined) || ctx.input.claims;

  let claims: AgentClaim[];
  let cost: CostEntry;
  if (ctx.mode === "live") {
    const { text, provider, model } = await liveComplete(ctx, auditorPrompt(snapshotId, videos));
    const parsed = parseLiveJson(text) as { claims?: unknown };
    const validated: AgentClaim[] = [];
    const rejected: string[] = [];
    for (const raw of Array.isArray(parsed.claims) ? parsed.claims : []) {
      const check = agentClaimSchema.safeParse(raw);
      if (check.success) validated.push(check.data);
      else rejected.push(check.error.issues.map((i) => i.message).join("; "));
    }
    if (rejected.length > 0) {
      const error = new Error(`Auditor rejected ${rejected.length} claim(s) for missing or invalid evidence pointers: ${rejected.slice(0, 3).join(" | ")}`);
      (error as Error & { needsHuman?: boolean }).needsHuman = true;
      throw error;
    }
    claims = validated;
    cost = liveCost("auditor", provider, model);
  } else {
    claims = suppliedClaims || stubClaims(snapshotId, videos.length > 0 ? videos : stubSnapshotVideos(ctx.input.topic, ctx.input.channelId).videos);
    // Validate even stub/supplied claims through the same gate.
    const rejected: string[] = [];
    for (const raw of claims) {
      if (!agentClaimSchema.safeParse(raw).success) rejected.push(raw.id);
    }
    if (rejected.length > 0) {
      const error = new Error(`Auditor rejected ${rejected.length} claim(s) for missing or invalid evidence pointers: ${rejected.join(", ")}`);
      (error as Error & { needsHuman?: boolean }).needsHuman = true;
      throw error;
    }
    cost = stubCost("auditor", 0, "Deterministic stub audit; no provider call.");
  }
  const data = { claims, rejected: 0 };
  ctx.outputs.auditor = data;
  const handoff = agentHandoffSchema.parse({
    ...handoffBase(ctx, "auditor", snapshotId, `Audited ${claims.length} claims (${claims.filter((c) => c.evidenceClass === "observed").length} observed, ${claims.filter((c) => c.evidenceClass === "inferred").length} inferred, ${claims.filter((c) => c.evidenceClass === "requires_studio").length} requires Studio), every one with an evidence pointer.`),
    claimIds: claims.map((c) => c.id),
    claims,
    openQuestions: claims.filter((c) => c.evidenceClass === "requires_studio").map((c) => `Validate in Studio: ${c.claim}`),
    costSoFarUsd: ctx.ledger.totals.costUsd,
    notVerified: ["No Studio data was read; requires_studio claims are questions, not facts."],
    memoryUsed: ctx.handoffs.get("researcher")?.memoryUsed ?? false,
  });
  return { data, handoff, cost };
}

async function runScriptwriter(ctx: AgentRunContext, stepInput: Record<string, unknown>) {
  const topic = String(stepInput.topic || ctx.input.topic);
  const snapshotId = String(stepInput.snapshotId || ctx.outputs.researcher?.snapshotId || "");
  const claims = (stepInput.claims as AgentClaim[] | undefined) || ctx.outputs.auditor?.claims;
  if (!claims || claims.length === 0) throw new Error("Scriptwriter needs audited claims from the Auditor step.");

  let script: ScriptOutput;
  let cost: CostEntry;
  if (ctx.mode === "live") {
    const { text, provider, model } = await liveComplete(ctx, scriptwriterPrompt(topic, snapshotId, claims));
    const parsed = parseLiveJson(text) as unknown;
    const { scriptOutputSchema } = await import("@shared/agents");
    script = scriptOutputSchema.parse(parsed);
    // Every line must trace to a supplied claim id.
    const known = new Set(claims.map((c) => c.id));
    for (const section of script.sections) {
      for (const line of section.lines) {
        if (!line.claimIds.every((id) => known.has(id))) {
          throw new Error(`Scriptwriter line traces to an unknown claim id: ${line.claimIds.join(", ")}.`);
        }
      }
    }
    cost = liveCost("scriptwriter", provider, model);
  } else {
    script = stubScript(topic, claims);
    cost = stubCost("scriptwriter", 0, "Deterministic stub script; no provider call.");
  }
  const data = { script };
  ctx.outputs.scriptwriter = data;
  const handoff = agentHandoffSchema.parse({
    ...handoffBase(ctx, "scriptwriter", snapshotId, `Script drafted: ${script.sections.length} sections, ${script.sections.flatMap((s) => s.lines).length} lines, every line traced to a claim id.`),
    claimIds: claims.map((c) => c.id),
    claims,
    openQuestions: [],
    costSoFarUsd: ctx.ledger.totals.costUsd,
    notVerified: ["Script quality was not judged — the throughline and QA checks are the quality gate."],
    memoryUsed: ctx.handoffs.get("auditor")?.memoryUsed ?? false,
  });
  return { data, handoff, cost };
}

async function runPackaging(ctx: AgentRunContext, stepInput: Record<string, unknown>) {
  const script = (stepInput.script as ScriptOutput | undefined) || ctx.outputs.scriptwriter?.script;
  if (!script) throw new Error("Packaging needs a script from the Scriptwriter step.");
  const brandKitName = (stepInput.brandKitName as string | undefined) || undefined;

  let packaging: PackagingOutput;
  let cost: CostEntry;
  if (ctx.mode === "live") {
    const { text, provider, model } = await liveComplete(ctx, packagingPrompt(script, brandKitName));
    const parsed = parseLiveJson(text) as unknown;
    const { packagingOutputSchema, assertNoNumericScores } = await import("@shared/agents");
    packaging = packagingOutputSchema.parse(parsed);
    assertNoNumericScores(packaging);
    cost = liveCost("packaging", provider, model);
  } else {
    packaging = stubPackaging(script, brandKitName);
    cost = stubCost("packaging", 0, "Deterministic stub packaging; no provider call.");
  }
  const data = { packaging };
  ctx.outputs.packaging = data;
  const snapshotId = ctx.outputs.researcher?.snapshotId || ctx.input.snapshotId || "snap-stub-unknown";
  const handoff = agentHandoffSchema.parse({
    ...handoffBase(ctx, "packaging", snapshotId, `Packaging drafted: ${packaging.variants.length} variants (title / hook / thumbnail), qualitative critique only — no numeric score.`),
    claimIds: ctx.outputs.auditor?.claims.map((c) => c.id) || [],
    claims: ctx.outputs.auditor?.claims || [],
    openQuestions: [],
    costSoFarUsd: ctx.ledger.totals.costUsd,
    notVerified: ["No CTR or SEO prediction was made — variants are untested until published."],
    memoryUsed: ctx.handoffs.get("scriptwriter")?.memoryUsed ?? false,
  });
  return { data, handoff, cost };
}

export { buildAgentPlan, resolveAiProviderId };
