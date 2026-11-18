import { z } from "zod";
import { costLedgerSchema } from "./cost-ledger";

/**
 * Cutroom Pro M3 — live-provider acceptance harness (pure shared layer).
 *
 * One command runs the acceptance checklist against the configured text
 * provider and records the result. A run is either live or stub, and the
 * distinction is carried everywhere: the top-level `live` flag, the
 * `label` ("live" vs "stub — not a live result"), and every check's
 * note. A stub run must never be presented as a live result — the
 * harness, the persisted file, and the UI all say so.
 *
 * No key is ever stored: only the last 4 characters of the key used
 * (the fingerprint) are recorded, so a run can be matched to a key
 * without the key itself ever touching disk.
 */

export const liveAcceptanceCheckIdSchema = z.enum([
  "researcher",
  "agent-chain",
  "orchestrator-plan",
  "qa-gate",
  "ledger-vs-usage",
]);
export type LiveAcceptanceCheckId = z.infer<typeof liveAcceptanceCheckIdSchema>;

export const liveAcceptanceCheckSchema = z.object({
  id: liveAcceptanceCheckIdSchema,
  label: z.string().trim().min(1).max(200),
  status: z.enum(["pass", "fail"]),
  /** Per-call latency in ms, when a provider call was made for this check. */
  latencyMs: z.number().int().min(0).nullable(),
  /** The provider's own response/request id, when one was returned. */
  providerResponseId: z.string().trim().min(1).max(128).nullable(),
  /**
   * Provider-reported token usage for this check, when the provider
   * reported it. Null means "usage: not reported by provider" — never
   * an invented number.
   */
  usage: z.object({
    promptTokens: z.number().int().min(0),
    completionTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0),
  }).strict().nullable(),
  detail: z.string().trim().min(1).max(2_000),
}).strict();
export type LiveAcceptanceCheck = z.infer<typeof liveAcceptanceCheckSchema>;

export const liveAcceptanceRunSchema = z.object({
  runId: z.string().trim().min(1).max(128),
  /** False for --stub runs. A stub run is not a live result, anywhere. */
  live: z.boolean(),
  label: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(128).nullable(),
  /** Last 4 characters of the key used, or null for stub runs. Never the full key. */
  keyFingerprint: z.string().length(4).nullable(),
  topic: z.string().trim().min(1).max(500),
  snapshotId: z.string().trim().min(1).max(128).nullable(),
  spendCapUsd: z.number().min(0),
  agentRunId: z.string().trim().min(1).max(128).nullable(),
  checks: z.array(liveAcceptanceCheckSchema).min(1).max(8),
  /** Overall: pass only when every check passes. */
  status: z.enum(["pass", "fail"]),
  ledger: costLedgerSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
}).strict().superRefine((run, ctx) => {
  // A live run must carry the key fingerprint it ran under; a stub run
  // must not carry one. The fingerprint is the only key material ever
  // recorded, and a live run without it cannot be matched to a key.
  if (run.live && run.keyFingerprint === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["keyFingerprint"], message: "A live acceptance run must record the key fingerprint (last 4 characters)." });
  }
  if (!run.live && run.keyFingerprint !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["keyFingerprint"], message: "A stub run must not carry a key fingerprint." });
  }
});
export type LiveAcceptanceRun = z.infer<typeof liveAcceptanceRunSchema>;

/** The label that must appear on every stub output, in files and in UI. */
export const STUB_LABEL = "stub — not a live result";
export const LIVE_LABEL = "live";

export function liveAcceptanceLabel(live: boolean): string {
  return live ? LIVE_LABEL : STUB_LABEL;
}

/**
 * Key fingerprint: the last 4 characters only. A key shorter than 4
 * characters has no fingerprint (null) — the harness refuses to run
 * live on a key it cannot fingerprint honestly.
 */
export function keyFingerprint(key: string | undefined): string | null {
  if (!key || key.trim().length < 4) return null;
  return key.trim().slice(-4);
}

export function failedCheck(run: LiveAcceptanceRun): LiveAcceptanceCheck | undefined {
  return run.checks.find((check) => check.status === "fail");
}
