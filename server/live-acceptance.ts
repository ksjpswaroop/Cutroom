import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  liveAcceptanceLabel,
  liveAcceptanceRunSchema,
  type LiveAcceptanceCheck,
  type LiveAcceptanceRun,
} from "@shared/live-acceptance";
import { runAgents } from "./orchestrator";
import { getTextProvider, resolveAiProviderId } from "./ai/index";
import type { AgentPlanInput } from "@shared/agents";
import type { AiTextProvider } from "./ai/types";
import { getEnvFilePaths } from "./env-path";

/**
 * Cutroom Pro M3 — live-provider acceptance harness (server).
 *
 * Runs the M2 agent team end to end (Researcher → Auditor → Scriptwriter
 * → Packaging → QA → assembler in dry-run) and records the result as a
 * live-acceptance run: per-check pass/fail with the provider's response
 * id, latency, and reported usage, plus the Cost Ledger and the agent
 * run id. The run is persisted under
 * <app-data root>/live-acceptance/<runId>.json with a top-level
 * `live: true/false` flag.
 *
 * The harness never invents a result: a stub run is labelled
 * "stub — not a live result" in the file, in the console output, and in
 * the UI; a provider that reports no usage is recorded as
 * "usage: not reported by provider". The key itself is never stored —
 * only its last-4 fingerprint, supplied by the caller.
 */

export function liveAcceptanceRoot(root = getEnvFilePaths().root): string {
  return path.join(root, "live-acceptance");
}

export function liveAcceptancePath(runId: string, root = getEnvFilePaths().root): string {
  return path.join(liveAcceptanceRoot(root), `${runId}.json`);
}

export async function getLiveAcceptanceRun(runId: string, root = getEnvFilePaths().root): Promise<LiveAcceptanceRun | null> {
  try {
    const raw = await readFile(liveAcceptancePath(runId, root), "utf8");
    return liveAcceptanceRunSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function listLiveAcceptanceRuns(root = getEnvFilePaths().root): Promise<LiveAcceptanceRun[]> {
  let names: string[] = [];
  try {
    names = (await readdir(liveAcceptanceRoot(root))).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: LiveAcceptanceRun[] = [];
  for (const name of names.sort().reverse()) {
    const run = await getLiveAcceptanceRun(name.replace(/\.json$/, ""), root);
    if (run) out.push(run);
  }
  return out;
}

export interface RunLiveAcceptanceOptions {
  /** "live" runs the configured text provider; "stub" runs the M2 stub engine. */
  mode: "stub" | "live";
  /** Last 4 characters of the key used, or null for stub runs. Never the full key. */
  keyFingerprint: string | null;
  spendCapUsd: number;
  /** Test hook: a fake provider for live-mode tests (no network). */
  textProviderOverride?: AiTextProvider;
}

export interface RunLiveAcceptanceInput {
  topic: string;
  snapshotId?: string;
  videos?: AgentPlanInput["videos"];
  board?: AgentPlanInput["board"];
  boardOptions?: AgentPlanInput["boardOptions"];
  projectId?: string;
}

function usageOf(calls: Array<{ usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
  if (calls.length === 0) return null;
  let prompt = 0;
  let completion = 0;
  let total = 0;
  for (const call of calls) {
    if (!call.usage) return null;
    prompt += call.usage.promptTokens;
    completion += call.usage.completionTokens;
    total += call.usage.totalTokens;
  }
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

export async function runLiveAcceptance(
  input: RunLiveAcceptanceInput,
  opts: RunLiveAcceptanceOptions,
): Promise<LiveAcceptanceRun> {
  const live = opts.mode === "live";
  const runId = `acc-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const providerId = live ? resolveAiProviderId() : "stub";
  const provider = live && opts.textProviderOverride
    ? opts.textProviderOverride
    : live
      ? getTextProvider()
      : undefined;

  const receipt = await runAgents(
    {
      topic: input.topic,
      snapshotId: input.snapshotId,
      videos: input.videos,
      board: input.board,
      boardOptions: input.boardOptions,
      projectId: input.projectId ?? "default",
      provider: live ? "live" : "stub",
      spendCapUsd: opts.spendCapUsd,
      voiceCloneFromSnapshotCreator: false,
    },
    { transport: "dry-run", textProviderOverride: provider as AiTextProvider | undefined },
  );

  const byAgent = (agent: string) => receipt.receipts.find((r) => r.agent === agent);
  const callsFor = (agent: string) => receipt.providerCalls.filter((c) => c.agent === agent);
  const chainCalls = receipt.providerCalls.filter((c) => ["auditor", "scriptwriter", "packaging"].includes(c.agent));
  const chainUsage = usageOf(chainCalls);
  const chainLatency = chainCalls.length > 0 ? chainCalls.reduce((n, c) => n + c.latencyMs, 0) : null;
  const lastResponseId = [...chainCalls].reverse().find((c) => c.responseId)?.responseId ?? null;

  const checks: LiveAcceptanceCheck[] = [];

  // (a) Researcher end-to-end on the supplied snapshot.
  const researcher = byAgent("researcher");
  checks.push({
    id: "researcher",
    label: "Researcher — end to end on the supplied snapshot",
    status: researcher?.status === "ok" ? "pass" : "fail",
    latencyMs: null,
    providerResponseId: null,
    usage: null,
    detail: researcher?.status === "ok"
      ? (live
        ? `Researcher ok: reused the supplied snapshot ${receipt.plan.snapshotId ?? input.snapshotId ?? "—"}; the live Researcher makes no provider call, so there is no response id or usage for this check.`
        : `Researcher ok: deterministic stub snapshot ${receipt.plan.snapshotId ?? "—"} (${liveAcceptanceLabel(false)}).`)
      : `Researcher ${researcher?.status ?? "missing"}: ${researcher?.error ?? "no receipt"}.`,
  });

  // (b) Auditor + Scriptwriter + Packaging chain.
  const chainOk = ["auditor", "scriptwriter", "packaging"].every((a) => byAgent(a)?.status === "ok");
  checks.push({
    id: "agent-chain",
    label: "Auditor + Scriptwriter + Packaging chain",
    status: chainOk ? "pass" : "fail",
    latencyMs: chainLatency,
    providerResponseId: lastResponseId,
    usage: chainUsage,
    detail: chainOk
      ? (chainUsage
        ? `Chain ok: 3/3 agents, provider reported ${chainUsage.totalTokens} tokens total (${chainUsage.promptTokens} prompt + ${chainUsage.completionTokens} completion).`
        : `Chain ok: 3/3 agents. Usage: not reported by provider${live ? "" : ` (${liveAcceptanceLabel(false)})`}.`)
      : `Chain failed: ${["auditor", "scriptwriter", "packaging"].map((a) => `${a}=${byAgent(a)?.status ?? "missing"}`).join(", ")}.`,
  });

  // (c) Orchestrator full plan with the assembler in dry-run.
  const assembler = byAgent("assembler");
  const planOk = (receipt.status === "ok" || receipt.status === "partial")
    && (assembler?.status === "ok" || assembler?.status === "skipped");
  checks.push({
    id: "orchestrator-plan",
    label: "Orchestrator full plan with assembler (dry-run)",
    status: planOk ? "pass" : "fail",
    latencyMs: null,
    providerResponseId: null,
    usage: null,
    detail: planOk
      ? `Run ${receipt.status}: ${receipt.receipts.length} steps, assembler ${assembler?.status ?? "—"} (${assembler?.note ?? "dry-run transport"}).`
      : `Run ${receipt.status}: assembler ${assembler?.status ?? "missing"}${receipt.escalation ? ` — ${receipt.escalation.message}` : ""}.`,
  });

  // (d) QA gate pass. A warn is not a failure — it does not block.
  const qaStatus = receipt.qa?.status ?? "missing";
  checks.push({
    id: "qa-gate",
    label: "QA gate — deterministic checks",
    status: qaStatus === "pass" || qaStatus === "warn" ? "pass" : "fail",
    latencyMs: null,
    providerResponseId: null,
    usage: null,
    detail: qaStatus === "pass"
      ? `QA pass on all ${receipt.qa?.checks.length ?? 0} checks.`
      : qaStatus === "warn"
        ? `QA warn (does not block): ${receipt.qa?.checks.filter((c) => c.status === "warn").map((c) => c.id).join(", ")}.`
        : `QA ${qaStatus}: ${receipt.qa?.checks.filter((c) => c.status === "fail").map((c) => `${c.id} — ${c.reason}`).join("; ") || "no QA report"}.`,
  });

  // (e) Cost Ledger totals vs provider-reported usage. Only the three
  // chain agents make provider calls: the Researcher reuses a supplied
  // snapshot, and QA / the assembler are local, so their ledger entries
  // record tokens as null (no call was made) and must not poison this
  // comparison — the check compares the chain entries' tokens against
  // the provider-reported total for those same calls.
  const chainEntries = receipt.ledger.entries.filter((e) => ["auditor", "scriptwriter", "packaging"].includes(e.agent));
  const chainLedgerTokens = chainEntries.every((e) => e.tokens !== null)
    ? chainEntries.reduce((n, e) => n + (e.tokens ?? 0), 0)
    : null;
  const reportedTotal = chainUsage?.totalTokens ?? null;
  let ledgerStatus: "pass" | "fail" = "pass";
  let ledgerDetail: string;
  if (reportedTotal === null) {
    ledgerDetail = live
      ? "Usage: not reported by provider — the ledger records tokens as not reported (unknown=true) and cost as not reported. No number was invented."
      : `Usage: not reported by provider (${liveAcceptanceLabel(false)} — no provider calls were made).`;
  } else if (chainLedgerTokens === reportedTotal) {
    ledgerDetail = `Ledger chain tokens ${chainLedgerTokens} match the provider-reported total ${reportedTotal}. Cost is still not reported — no text provider reports a dollar cost.`;
  } else {
    ledgerStatus = "fail";
    ledgerDetail = `Ledger chain tokens ${chainLedgerTokens ?? "not reported"} do not match the provider-reported total ${reportedTotal} — the passthrough is broken.`;
  }
  checks.push({
    id: "ledger-vs-usage",
    label: "Cost Ledger totals vs provider-reported usage",
    status: ledgerStatus,
    latencyMs: null,
    providerResponseId: lastResponseId,
    usage: chainUsage,
    detail: ledgerDetail,
  });

  const model = receipt.providerCalls[0]?.model ?? null;
  const run = liveAcceptanceRunSchema.parse({
    runId,
    live,
    label: liveAcceptanceLabel(live),
    provider: providerId,
    model,
    keyFingerprint: live ? opts.keyFingerprint : null,
    topic: input.topic,
    snapshotId: input.snapshotId ?? receipt.plan.snapshotId ?? null,
    spendCapUsd: opts.spendCapUsd,
    agentRunId: receipt.runId,
    checks,
    status: checks.every((c) => c.status === "pass") ? "pass" : "fail",
    ledger: receipt.ledger,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
  });

  await mkdir(liveAcceptanceRoot(), { recursive: true });
  await writeFile(liveAcceptancePath(runId), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return run;
}
