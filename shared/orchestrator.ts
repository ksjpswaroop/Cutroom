import { z } from "zod";
import type { AgentHandoff, AgentPlan, AgentPlanStep, AgentReceipt } from "./agents";
import type { QaReport } from "./qa";
import type { CostLedger } from "./cost-ledger";

/** The part of the M1 assembler receipt the agent run needs: run id, status, export. */
export type AssemblerReceiptSummary = {
  runId: string;
  status: string;
  export: { path: string | null; bytes: number | null };
};

export type { AgentPlan, AgentPlanStep } from "./agents";

/**
 * Cutroom Pro M2 — Orchestrator helpers (pure, no I/O).
 *
 * Retry rule: a failed step is retried at most once, and only when it
 * spent no money. A live failure may have spent (the provider may have
 * charged before failing), so live failures are never retried — they
 * escalate to the user instead. Escalation reasons: any paid-call
 * failure, a QA Fail, a spend-cap pause, or ambiguous evidence (a claim
 * the Auditor rejected for a missing evidence pointer).
 */

export function nextPendingStep(plan: AgentPlan): AgentPlanStep | undefined {
  return plan.steps.find((step) => step.status === "pending");
}

export function shouldRetryStep(args: {
  attempts: number;
  spentMoney: boolean;
  live: boolean;
}): { retry: boolean; reason: string } {
  if (args.attempts >= 2) return { retry: false, reason: "Already attempted twice — no further retries." };
  if (args.spentMoney) return { retry: false, reason: "The failed step spent money — no retry; escalating to the user." };
  if (args.live) return { retry: false, reason: "A live call failed; it may have spent before failing — no retry; escalating to the user." };
  return { retry: true, reason: "One retry allowed: the failed step spent no money." };
}

export type EscalationReason =
  | "paid-call-failure"
  | "qa-fail"
  | "spend-cap"
  | "ambiguous-evidence"
  | "agent-failure";

export function escalationMessage(reason: EscalationReason, detail?: string): string {
  switch (reason) {
    case "paid-call-failure":
      return `A paid call failed${detail ? `: ${detail}` : ""} — the run paused for a human decision.`;
    case "qa-fail":
      return `QA failed${detail ? `: ${detail}` : ""} — the assembler is blocked until the failure is fixed.`;
    case "spend-cap":
      return `Spend cap reached${detail ? `: ${detail}` : ""} — raise the cap in Settings or stop the run.`;
    case "ambiguous-evidence":
      return `Ambiguous evidence${detail ? `: ${detail}` : ""} — a claim could not be tied to an evidence pointer.`;
    case "agent-failure":
      return `An agent step failed${detail ? `: ${detail}` : ""} — the run paused for a human decision.`;
  }
}

/**
 * The run receipt — the one document that proves a run happened: plan,
 * per-agent receipts, handoffs, QA report, cost ledger, and the assembler
 * receipt id (null when QA blocked the run). Lives in the shared layer so
 * the client Agents view can type it; the server persists it as JSON.
 */
export const agentRunReceiptSchema = z.object({
  runId: z.string().trim().min(1).max(128),
  status: z.enum(["ok", "partial", "failed", "needs-human"]),
  plan: z.custom<AgentPlan>((value) => typeof value === "object" && value !== null),
  receipts: z.array(z.custom<AgentReceipt>((value) => typeof value === "object" && value !== null)),
  handoffs: z.record(z.string(), z.custom<AgentHandoff>((value) => typeof value === "object" && value !== null)),
  qa: z.custom<QaReport>((value) => typeof value === "object" && value !== null).nullable(),
  ledger: z.custom<CostLedger>((value) => typeof value === "object" && value !== null),
  assemblerReceiptId: z.string().trim().min(1).max(128).nullable(),
  assemblerReceipt: z.custom<AssemblerReceiptSummary>((value) => typeof value === "object" && value !== null).nullable(),
  escalation: z.object({
    reason: z.enum(["paid-call-failure", "qa-fail", "spend-cap", "ambiguous-evidence", "agent-failure"]),
    message: z.string().trim().min(1).max(2_000),
  }).strict().nullable(),
  memoryUsed: z.boolean(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
}).strict();

export type AgentRunReceipt = z.infer<typeof agentRunReceiptSchema>;
