import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  agentPlanInputSchema,
  buildAgentPlan,
  type AgentHandoff,
  type AgentPlan,
  type AgentPlanInput,
  type AgentReceipt,
} from "@shared/agents";
import { capAllows, addCostEntry } from "@shared/cost-ledger";
import { runQaChecks, type QaReport } from "@shared/qa";
import { escalationMessage, shouldRetryStep, agentRunReceiptSchema, type AgentRunReceipt, type EscalationReason } from "@shared/orchestrator";
import { getEnvFilePaths } from "./env-path";
import { createAgentRunContext, deleteAgentRunContext, executeAgentStep, getAgentRunContext, type AgentRunContext } from "./agents";
import { readAgentMemory, type AgentMemory } from "./agent-memory";
import type { AssemblerReceipt } from "./assembler";
import type { CostLedger } from "@shared/cost-ledger";
import type { AiTextProvider } from "./ai/types";

/**
 * Cutroom Pro M2 — Orchestrator.
 *
 * planAgents() builds the visible plan (no agent runs). runAgents() then:
 *  1. dispatches every agent step through the M0 command registry
 *     (proRegistry) — a step that never reaches the registry never runs;
 *  2. retries a failed step at most once, and only when it spent no money
 *     (live failures are never retried — they may have spent);
 *  3. runs the deterministic QA gate before the assembler; a QA Fail
 *     blocks the assembler and pauses the run as needs-human;
 *  4. enforces the spend cap (default $0) before any live step;
 *  5. persists the receipt under <app-data root>/agent-runs/<runId>/.
 *
 * The assembler step reuses M1's runAssembly via the "assembler.run"
 * registry command, with the QA report attached — a Fail there returns
 * a blocked receipt (409 at the route), never a render.
 */

export { agentRunReceiptSchema, type AgentRunReceipt } from "@shared/orchestrator";

export function agentRunsRoot(root = getEnvFilePaths().root): string {
  return path.join(root, "agent-runs");
}

export function agentRunDir(runId: string, root = getEnvFilePaths().root): string {
  return path.join(agentRunsRoot(root), runId);
}

export async function getAgentReceipt(runId: string, root = getEnvFilePaths().root): Promise<AgentRunReceipt | null> {
  try {
    const raw = await readFile(path.join(agentRunDir(runId, root), "receipt.json"), "utf8");
    return JSON.parse(raw) as AgentRunReceipt;
  } catch {
    return null;
  }
}

export async function listAgentReceipts(root = getEnvFilePaths().root): Promise<AgentRunReceipt[]> {
  let ids: string[] = [];
  try {
    ids = (await readdir(agentRunsRoot(root))).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
  const out: AgentRunReceipt[] = [];
  for (const id of ids.sort().reverse()) {
    const receipt = await getAgentReceipt(id, root);
    if (receipt) out.push(receipt);
  }
  return out;
}

/** Ledger totals across all persisted agent runs (the GET /api/agents/ledger view). */
export async function aggregateLedger(root = getEnvFilePaths().root): Promise<CostLedger> {
  const receipts = await listAgentReceipts(root);
  const { emptyLedger, addCostEntry } = await import("@shared/cost-ledger");
  let ledger = emptyLedger();
  for (const receipt of receipts) {
    for (const entry of receipt.ledger.entries) ledger = addCostEntry(ledger, entry);
  }
  return ledger;
}

export function planAgents(input: AgentPlanInput, runId?: string): AgentPlan {
  return buildAgentPlan(input, runId || `agt-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`);
}

export interface RunAgentsOptions {
  transport?: "auto" | "dry-run";
  failOnce?: Partial<Record<string, boolean>>;
  textProviderOverride?: AiTextProvider;
}

export async function runAgents(
  rawInput: AgentPlanInput,
  opts: RunAgentsOptions = {},
): Promise<AgentRunReceipt> {
  const input = agentPlanInputSchema.parse(rawInput);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const runId = `agt-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const plan = buildAgentPlan(input, runId);
  const workDir = agentRunDir(runId);
  await mkdir(workDir, { recursive: true });

  const memory: AgentMemory = await readAgentMemory(input.projectId);
  const ctx = createAgentRunContext({
    runId,
    input,
    memory,
    failOnce: opts.failOnce as AgentRunContext["failOnce"],
    textProviderOverride: opts.textProviderOverride,
  });
  const { proRegistry } = await import("./pro-commands");

  const receipts: AgentReceipt[] = [];
  let qa: QaReport | null = null;
  let assemblerReceipt: AssemblerReceipt | null = null;
  let escalation: AgentRunReceipt["escalation"] = null;
  let status: AgentRunReceipt["status"] = "ok";

  const fail = (reason: EscalationReason, message: string) => {
    escalation = { reason, message: escalationMessage(reason, message) };
    status = "needs-human";
  };

  try {
    for (const step of plan.steps) {
      if (escalation || status === "failed") break;
      if (step.skipReason) {
        receipts.push({
          agent: step.agent,
          command: step.command,
          status: "skipped",
          attempts: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          cost: { agent: step.agent, provider: "stub", model: "stub", tokens: null, quotaUnits: 0, costUsd: 0, note: step.skipReason },
          handoff: null,
          note: step.skipReason,
        });
        step.status = "skipped";
        continue;
      }
      step.status = "running";

      if (step.agent === "qa") {
        const qaInput = buildQaInput(ctx, input);
        const report = (await proRegistry.dispatch("agents.qa", { runId, input: qaInput })) as QaReport;
        qa = report;
        receipts.push({
          agent: "qa",
          command: step.command,
          status: report.status === "fail" ? "failed" : "ok",
          attempts: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          cost: { agent: "qa", provider: "stub", model: "stub", tokens: null, quotaUnits: 0, costUsd: 0, note: "Deterministic checks; no provider call." },
          handoff: null,
          note: `QA ${report.status}: ${report.checks.map((c) => `${c.id}=${c.status}`).join(", ")}`,
        });
        // The QA step is deterministic and free, but it is still an agent
        // step — its cost entry belongs in the ledger like every other step.
        ctx.ledger = addCostEntry(ctx.ledger, { agent: "qa", provider: "stub", model: "stub", tokens: null, quotaUnits: 0, costUsd: 0, note: "Deterministic checks; no provider call." });
        step.status = report.status === "fail" ? "failed" : "ok";
        if (report.status === "fail") {
          fail("qa-fail", report.checks.filter((c) => c.status === "fail").map((c) => c.id).join(", "));
        }
        continue;
      }

      if (step.agent === "assembler") {
        if (!input.board) {
          step.status = "skipped";
          continue;
        }
        const receipt = (await proRegistry.dispatch("assembler.run", {
          board: input.board,
          options: input.boardOptions,
          transport: opts.transport,
          qaReport: qa ?? undefined,
        })) as AssemblerReceipt;
        assemblerReceipt = receipt;
        receipts.push({
          agent: "assembler",
          command: step.command,
          status: receipt.status === "ok" ? "ok" : receipt.status === "blocked" ? "needs-human" : receipt.status === "partial" ? "ok" : "failed",
          attempts: 1,
          startedAt: receipt.startedAt,
          finishedAt: receipt.finishedAt,
          durationMs: receipt.durationMs,
          cost: { agent: "assembler", provider: "filmcraft-cli", model: "filmcraft-cli 0.20.1", tokens: null, quotaUnits: 0, costUsd: 0, note: "Local filmcraft-cli only; no provider spend." },
          handoff: null,
          note: receipt.status === "blocked" ? "Assembler blocked by the QA report." : `Assembler ${receipt.status}: export ${receipt.export.path || "none"}.`,
        });
        // The assembler step's cost also belongs in the ledger (its own
        // receipt carries the same $0 local-CLI cost).
        ctx.ledger = addCostEntry(ctx.ledger, { agent: "assembler", provider: "filmcraft-cli", model: "filmcraft-cli 0.20.1", tokens: null, quotaUnits: 0, costUsd: 0, note: "Local filmcraft-cli only; no provider spend." });
        step.status = receipt.status === "ok" || receipt.status === "partial" ? "ok" : "failed";
        if (receipt.status === "blocked") fail("qa-fail", "assembler blocked by QA");
        if (receipt.status === "failed") { status = "failed"; escalation = { reason: "agent-failure", message: escalationMessage("agent-failure", "assembler failed") }; }
        continue;
      }

      // Live steps: enforce the spend cap before the call.
      if (input.provider === "live") {
        const check = capAllows(input.spendCapUsd, ctx.ledger.totals.costUsd, null);
        if (!check.allowed) {
          step.status = "needs-human";
          receipts.push({
            agent: step.agent,
            command: step.command,
            status: "needs-human",
            attempts: 0,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 0,
            cost: { agent: step.agent, provider: "stub", model: "stub", tokens: null, quotaUnits: 0, costUsd: 0, note: check.reason },
            handoff: null,
            error: check.reason,
          });
          fail("spend-cap", check.reason);
          continue;
        }
      }

      // Agent steps: dispatch through the registry, one no-spend retry.
      const stepInput = buildStepInput(ctx, step.agent, input);
      type AgentStepDispatchResult = { receipt: AgentReceipt; data: unknown; handoff: AgentHandoff | null };
      let result: AgentStepDispatchResult | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = (await proRegistry.dispatch(`agents.${step.agent}`, { runId, input: stepInput })) as AgentStepDispatchResult;
          lastError = null;
          break;
        } catch (error: any) {
          lastError = error;
          const spentMoney = ctx.mode === "live" || (ctx.ledger.totals.costUsd ?? 0) > 0;
          const decision = shouldRetryStep({ attempts: attempt, spentMoney, live: ctx.mode === "live" });
          if (!decision.retry) break;
        }
      }
      if (!result) {
        const message = (lastError as Error)?.message || `Agent step failed: ${step.agent}`;
        step.status = "failed";
        receipts.push({
          agent: step.agent,
          command: step.command,
          status: "failed",
          attempts: ctx.attempts.get(step.agent) ?? 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          cost: { agent: step.agent, provider: ctx.mode, model: ctx.mode, tokens: null, quotaUnits: 0, costUsd: null, note: "Step failed; cost not reported." },
          handoff: null,
          error: message,
        });
        const mayHaveSpent = (lastError as Error & { mayHaveSpent?: boolean })?.mayHaveSpent;
        fail(mayHaveSpent === false ? "agent-failure" : "paid-call-failure", message);
        continue;
      }
      receipts.push(result.receipt);
      step.status = result.receipt.status === "ok" ? "ok" : result.receipt.status;
      if (result.receipt.status === "needs-human") {
        fail("ambiguous-evidence", result.receipt.error || step.agent);
      }
    }
  } finally {
    deleteAgentRunContext(runId);
  }

  if (!escalation && status !== "failed") {
    status = plan.steps.some((s) => s.status === "skipped") ? "partial" : "ok";
  }
  plan.status = status;

  const receipt: AgentRunReceipt = {
    runId,
    status,
    plan,
    receipts,
    handoffs: Object.fromEntries(ctx.handoffs.entries()),
    qa,
    ledger: ctx.ledger,
    assemblerReceiptId: assemblerReceipt?.runId || null,
    assemblerReceipt,
    escalation,
    memoryUsed: [...ctx.handoffs.values()].some((h) => h.memoryUsed),
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
  };
  await writeFile(path.join(workDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(path.join(workDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return receipt;
}

function buildStepInput(ctx: AgentRunContext, agent: string, input: AgentPlanInput): Record<string, unknown> {
  switch (agent) {
    case "researcher":
      return { topic: input.topic, channelId: input.channelId, snapshotId: input.snapshotId, videos: input.videos };
    case "auditor":
      return {
        snapshotId: ctx.outputs.researcher?.snapshotId || input.snapshotId,
        videos: ctx.outputs.researcher?.videos,
        claims: input.claims,
      };
    case "scriptwriter":
      return {
        topic: input.topic,
        snapshotId: ctx.outputs.researcher?.snapshotId || input.snapshotId,
        claims: ctx.outputs.auditor?.claims,
      };
    case "packaging":
      return { script: ctx.outputs.scriptwriter?.script };
    default:
      return {};
  }
}

function buildQaInput(ctx: AgentRunContext, input: AgentPlanInput) {
  const script = ctx.outputs.scriptwriter?.script;
  const packaging = ctx.outputs.packaging?.packaging;
  const lines = script ? script.sections.flatMap((section) => section.lines) : [];
  const claims = ctx.outputs.auditor?.claims || [];
  const throughlineSections = script ? script.sections.map((section) => section.name) : undefined;
  const captionsPresent = input.board
    ? input.board.storyboardPanels.some((panel) => Boolean(panel.onScreenText?.trim()))
    : false; // Captions are produced by the assembler step after QA; at QA time only Board on-screen text counts as planned captions.
  return {
    board: input.board,
    throughlineSections,
    scriptLines: lines,
    claims,
    packagingVariants: packaging?.variants,
    voiceCloneFromSnapshotCreator: input.voiceCloneFromSnapshotCreator,
    narrationPresent: lines.length > 0,
    captionsPresent,
  };
}

export { getAgentRunContext, executeAgentStep };
