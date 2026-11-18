import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { qaReportSchema, type QaReport } from "@shared/qa";
import {
  assemblerPlanOptionsSchema,
  buildAssemblyPlan,
  type AssemblyPlan,
  type AssemblyStep,
} from "@shared/assembler";
import { getEnvFilePaths } from "./env-path";
import {
  resolveTransport,
  type FilmCraftTransport,
  type StepExecution,
  type TransportContext,
} from "./assembler-transport";

/**
 * Cutroom Pro M1 — Assembler runner + receipt.
 *
 * runAssembly() is the only entry point that executes a plan. It:
 *  1. builds the plan (pure, shared/assembler.ts),
 *  2. writes captions.srt/.vtt + plan.json into the run directory,
 *  3. dispatches every plan step through the M0 command registry
 *     (proRegistry, shared/commands.ts) — the step handlers live in
 *     server/pro-commands.ts and call the transport via the per-run
 *     context map below, so no step executes without an audit entry,
 *  4. builds the receipt (never an invented number: loudness is
 *     "not measured", cost is 0 for a local CLI, dry-run steps say so),
 *  5. persists receipt.json under the run directory and deletes the
 *     run context.
 *
 * Receipts live under <app-data root>/assembler-runs/<runId>/, next to
 * the project file, captions, and export. The list/get endpoints read
 * that directory; nothing is committed to git.
 */

export interface AssemblerStepResult {
  seq: number;
  command: string;
  label: string;
  status: "ok" | "failed" | "skipped" | "not-run";
  dryRun: boolean;
  result?: unknown;
  error?: string;
  note?: string;
}

export interface AssemblerReceipt {
  runId: string;
  snapshotId: string;
  /** "blocked" — the QA report failed, so no step ran and nothing was exported (M2). */
  status: "ok" | "partial" | "failed" | "blocked";
  proEnabled: boolean;
  /** The QA report that gated this run, when one was supplied (M2). */
  qa?: import("@shared/qa").QaReport;
  transport: {
    kind: "local-cli" | "dry-run";
    label: string;
    cliPath: string | null;
    version: string | null;
    dryRun: boolean;
    dryRunReason: string | null;
  };
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  demoMedia: boolean;
  plan: AssemblyPlan;
  steps: AssemblerStepResult[];
  captions: {
    cues: number;
    captionless: string[];
    srtPath: string;
    vttPath: string;
  };
  ducking: {
    applied: boolean;
    reduceDb: number;
    plannedKeyframes: Array<{ atSeconds: number; levelDb: number }>;
    cliKeyframesReturned: number;
    note: string;
  };
  loudness: AssemblyPlan["loudness"];
  export: {
    path: string | null;
    bytes: number | null;
    frames: number | null;
    format: string;
    note: string;
  };
  cost: { amount: number; currency: string; note: string };
  audit: Array<{ seq: number; command: string; timestamp: string; ok: boolean; error?: string }>;
  workDir: string;
  projectPath: string | null;
}

export const assemblerRunInputSchema = z.object({
  board: productionBoardOutputSchema,
  options: assemblerPlanOptionsSchema.optional(),
  /** Transport override for tests ("dry-run" forces the DryRunTransport). */
  transport: z.enum(["auto", "dry-run"]).optional(),
  /** QA report from the M2 agent run. A Fail blocks the run before any step executes. */
  qaReport: qaReportSchema.optional(),
}).strict();

export type AssemblerRunInput = z.infer<typeof assemblerRunInputSchema>;

/** Per-run context, keyed by runId, for the registry step handlers. Deleted when the run ends. */
interface RunContext {
  transport: FilmCraftTransport;
  transportCtx: TransportContext;
  stepResults: AssemblerStepResult[];
  beginResult: StepExecution | null;
}

const runContexts = new Map<string, RunContext>();

export function getRunContext(runId: string): RunContext | undefined {
  return runContexts.get(runId);
}

export function assemblerRunsRoot(root = getEnvFilePaths().root): string {
  return path.join(root, "assembler-runs");
}

export function assemblerRunDir(runId: string, root = getEnvFilePaths().root): string {
  return path.join(assemblerRunsRoot(root), runId);
}

async function persistReceipt(receipt: AssemblerReceipt): Promise<void> {
  await mkdir(receipt.workDir, { recursive: true });
  await writeFile(path.join(receipt.workDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

export async function getReceipt(runId: string, root = getEnvFilePaths().root): Promise<AssemblerReceipt | null> {
  try {
    const raw = await readFile(path.join(assemblerRunDir(runId, root), "receipt.json"), "utf8");
    return JSON.parse(raw) as AssemblerReceipt;
  } catch {
    return null;
  }
}

export async function listReceipts(root = getEnvFilePaths().root): Promise<Array<Pick<AssemblerReceipt, "runId" | "snapshotId" | "status" | "startedAt" | "transport" | "export">>> {
  let ids: string[] = [];
  try {
    ids = (await readdir(assemblerRunsRoot(root))).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
  const out: Array<Pick<AssemblerReceipt, "runId" | "snapshotId" | "status" | "startedAt" | "transport" | "export">> = [];
  for (const id of ids.sort().reverse()) {
    const receipt = await getReceipt(id, root);
    if (!receipt) continue;
    out.push({
      runId: receipt.runId,
      snapshotId: receipt.snapshotId,
      status: receipt.status,
      startedAt: receipt.startedAt,
      transport: receipt.transport,
      export: receipt.export,
    });
  }
  return out;
}

export interface RunAssemblyOptions {
  transportOverride?: FilmCraftTransport;
  /** Registry dispatch for step commands (defaults to the process-wide proRegistry). */
  dispatch?: (command: string, params: unknown) => Promise<unknown>;
  proEnabled?: boolean;
}

export async function runAssembly(
  input: AssemblerRunInput,
  opts: RunAssemblyOptions = {},
): Promise<AssemblerReceipt> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const runId = `asm-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const options = input.options ?? {};
  const plan = buildAssemblyPlan(input.board, options);
  const workDir = assemblerRunDir(runId);
  await mkdir(workDir, { recursive: true });
  await writeFile(path.join(workDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  // Cutroom Pro M2 — QA gate: a Fail blocks the run before any step
  // executes, before any transport starts, and before any export. The
  // blocked receipt is the durable record of why nothing happened.
  if (input.qaReport?.status === "fail") {
    const failedChecks = input.qaReport.checks.filter((c) => c.status === "fail").map((c) => c.id).join(", ");
    const receipt: AssemblerReceipt = {
      runId,
      snapshotId: plan.snapshotId,
      status: "blocked",
      proEnabled: opts.proEnabled ?? true,
      qa: input.qaReport,
      transport: {
        kind: "dry-run",
        label: "Blocked by QA — no transport started.",
        cliPath: null,
        version: null,
        dryRun: true,
        dryRunReason: "Blocked by QA — no transport started.",
      },
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      demoMedia: plan.demoMedia,
      plan,
      steps: plan.steps.map((step) => ({
        seq: step.seq,
        command: step.command,
        label: step.label,
        status: "not-run" as const,
        dryRun: true,
        error: `Blocked by QA (${failedChecks}).`,
      })),
      captions: { cues: plan.captions.cues.length, captionless: plan.captions.captionless, srtPath: path.join(workDir, "captions.srt"), vttPath: path.join(workDir, "captions.vtt") },
      ducking: { applied: plan.ducking.applied, reduceDb: plan.ducking.reduceDb, plannedKeyframes: plan.ducking.keyframes, cliKeyframesReturned: 0, note: plan.ducking.note },
      loudness: plan.loudness,
      export: { path: null, bytes: null, frames: null, format: "h264", note: `Not exported — blocked by QA (${failedChecks}).` },
      cost: { amount: 0, currency: "USD", note: "Blocked by QA; no provider spend." },
      audit: [],
      workDir,
      projectPath: null,
    };
    await persistReceipt(receipt);
    return receipt;
  }

  await writeFile(path.join(workDir, "captions.srt"), plan.captions.srt, "utf8");
  await writeFile(path.join(workDir, "captions.vtt"), plan.captions.vtt, "utf8");

  const resolved = opts.transportOverride
    ? { transport: opts.transportOverride, cliPath: null, version: null, dryRunReason: opts.transportOverride.kind === "dry-run" ? "Dry run (transport override)." : null }
    : await resolveTransport();
  const transport = resolved.transport;
  const exportPath = path.join(workDir, plan.exportFileName);
  const transportCtx: TransportContext = {
    runId,
    workDir,
    demo: plan.demoMedia,
    projectPath: path.join(workDir, "project.fcproj"),
    items: new Map(),
    clips: new Map(),
    captionTrack: null,
    musicClipIds: [],
    duckingKeyframesReturned: 0,
    exportPath,
  };
  const context: RunContext = { transport, transportCtx, stepResults: [], beginResult: null };
  runContexts.set(runId, context);

  const audit: AssemblerReceipt["audit"] = [];
  let failed = false;
  try {
    context.beginResult = await transport.begin(transportCtx, {
      name: `Cutroom — ${plan.snapshotId}`,
      width: 1920,
      height: 1080,
      fps: plan.fps,
    });
    if (!context.beginResult.ok) {
      failed = true;
      for (const step of plan.steps) {
        context.stepResults.push({ seq: step.seq, command: step.command, label: step.label, status: "not-run", dryRun: transport.kind === "dry-run", error: `Project setup failed: ${context.beginResult.error || "unknown"}` });
      }
    } else {
      const placedClips = (): number => [...context.transportCtx.clips.values()].reduce((n, ids) => n + ids.length, 0);
      for (const step of plan.steps) {
        if (failed) {
          context.stepResults.push({ seq: step.seq, command: step.command, label: step.label, status: "not-run", dryRun: transport.kind === "dry-run", error: "Not run — an earlier step failed." });
          continue;
        }
        if (step.skipReason) {
          context.stepResults.push({ seq: step.seq, command: step.command, label: step.label, status: "skipped", dryRun: transport.kind === "dry-run", note: step.skipReason });
          continue;
        }
        if (step.command === "assembler.export" && placedClips() === 0 && !plan.demoMedia) {
          context.stepResults.push({ seq: step.seq, command: step.command, label: step.label, status: "skipped", dryRun: transport.kind === "dry-run", note: "No clips were placed (every shot has no media) — nothing to export." });
          continue;
        }
        try {
          const result = (await (opts.dispatch
            ? opts.dispatch(step.command, { runId, step })
            : (await import("./pro-commands")).proRegistry.dispatch(step.command, { runId, step }))) as StepExecution;
          const ok = result?.ok === true;
          context.stepResults.push({
            seq: step.seq,
            command: step.command,
            label: step.label,
            status: ok ? "ok" : "failed",
            dryRun: result?.dryRun ?? transport.kind === "dry-run",
            result: result?.result,
            ...(result?.error ? { error: result.error } : {}),
            ...(result?.note ? { note: result.note } : {}),
          });
          if (!ok) failed = true;
        } catch (error: any) {
          failed = true;
          context.stepResults.push({ seq: step.seq, command: step.command, label: step.label, status: "failed", dryRun: transport.kind === "dry-run", error: error?.message || String(error) });
        }
      }
    }
  } finally {
    await transport.finish(transportCtx).catch(() => undefined);
    runContexts.delete(runId);
  }

  const exportStep = context.stepResults.find((s) => s.command === "assembler.export");
  // Audit entries come from the M0 registry the steps were dispatched
  // through (filtered to this run). A test stub dispatch leaves it empty.
  if (!opts.dispatch) {
    const { proRegistry } = await import("./pro-commands");
    for (const entry of proRegistry.auditLog()) {
      const params = entry.params as { runId?: string } | null;
      if (params && typeof params === "object" && params.runId === runId) {
        audit.push({ seq: entry.seq, command: entry.command, timestamp: entry.timestamp, ok: entry.ok, ...(entry.error ? { error: entry.error } : {}) });
      }
    }
  }
  const exportResult = exportStep?.result as { path?: string; result?: { bytes?: number; frames?: number } } | undefined;
  const exportBytes = typeof exportResult?.result?.bytes === "number" ? exportResult.result.bytes : null;
  const exportFrames = typeof exportResult?.result?.frames === "number" ? exportResult.result.frames : null;
  const status: AssemblerReceipt["status"] = failed
    ? "failed"
    : exportStep?.status === "skipped"
      ? "partial"
      : "ok";

  const receipt: AssemblerReceipt = {
    runId,
    snapshotId: plan.snapshotId,
    status,
    proEnabled: opts.proEnabled ?? true,
    ...(input.qaReport ? { qa: input.qaReport } : {}),
    transport: {
      kind: transport.kind,
      label: transport.label,
      cliPath: resolved.cliPath,
      version: resolved.version,
      dryRun: transport.kind === "dry-run",
      dryRunReason: resolved.dryRunReason,
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    demoMedia: plan.demoMedia,
    plan,
    steps: context.stepResults,
    captions: {
      cues: plan.captions.cues.length,
      captionless: plan.captions.captionless,
      srtPath: path.join(workDir, "captions.srt"),
      vttPath: path.join(workDir, "captions.vtt"),
    },
    ducking: {
      applied: plan.ducking.applied,
      reduceDb: plan.ducking.reduceDb,
      plannedKeyframes: plan.ducking.keyframes,
      cliKeyframesReturned: transportCtx.duckingKeyframesReturned,
      note: plan.ducking.note,
    },
    loudness: plan.loudness,
    export: {
      path: exportStep?.status === "ok" && transport.kind === "local-cli" ? exportPath : null,
      bytes: exportBytes,
      frames: exportFrames,
      format: "h264",
      note: exportStep?.status === "ok" && transport.kind === "local-cli"
        ? `Exported by filmcraft-cli (h264, loudness ${plan.loudness.targetLufs} LUFS applied at export, not measured).`
        : exportStep?.status === "skipped"
          ? "Not exported — no clips were placed."
          : transport.kind === "dry-run"
            ? "Not exported — dry run."
            : "Export failed — see the export step error.",
    },
    cost: { amount: 0, currency: "USD", note: "Local filmcraft-cli only; no provider spend." },
    audit,
    workDir,
    projectPath: transport.kind === "dry-run" ? null : transportCtx.projectPath,
  };
  await persistReceipt(receipt);
  return receipt;
}
