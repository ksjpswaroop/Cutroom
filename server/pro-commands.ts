import { z } from "zod";
import { createCommandRegistry, type CommandRegistry } from "@shared/commands";
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { buildOtioTimeline } from "@shared/otio";
import { assemblerStepSchema } from "@shared/assembler";
import { readPreferences, writePreferences, type AppPreferences } from "./preferences";

/**
 * Server-side Pro command registry (Cutroom Pro M0).
 *
 * The three M0 Pro actions go through here so every dispatch is validated
 * and written to the append-only audit log (see shared/commands.ts).
 * The audit log is in-memory and resets when the server restarts — M0 does
 * not persist it.
 */

export const PRO_VERSION = "0.20.1";
export const PRO_EDITOR_NAME = "FilmCraft";

function otioFileName(snapshotId: string): string {
  const safe = snapshotId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "board";
  return `cutroom-board-${safe}.otio.json`;
}

const exportOtioParamsSchema = z.object({
  board: productionBoardOutputSchema,
  fps: z.number().int().min(1).max(240).optional(),
  mediaByShotIndex: z.record(z.string(), z.string().trim().min(1).max(2_000)).optional(),
}).strict();

export function createProRegistry(): CommandRegistry {
  const registry = createCommandRegistry();

  registry.register("pro.set-enabled", {
    description: "Turn the Cutroom Pro tier on or off (persisted in preferences.json). No payment, account, or cloud.",
    paramsSchema: z.object({ enabled: z.boolean() }).strict(),
    handler: async ({ enabled }): Promise<AppPreferences> => {
      return writePreferences({ cutroomProEnabled: enabled });
    },
  });

  registry.register("pro.export-otio", {
    description: "Export the production Board as an OpenTimelineIO 1.0 timeline. Requires Cutroom Pro on.",
    paramsSchema: exportOtioParamsSchema,
    enabled: async () => (await readPreferences()).cutroomProEnabled,
    handler: async ({ board, fps, mediaByShotIndex }) => {
      const media: Record<number, string> = {};
      for (const [key, value] of Object.entries(mediaByShotIndex || {})) {
        const index = Number(key);
        if (Number.isInteger(index) && index >= 0) media[index] = value;
      }
      const result = buildOtioTimeline(board, { fps, mediaByShotIndex: media });
      return {
        ...result,
        filename: otioFileName(board.snapshotId),
      };
    },
  });

  registry.register("pro.open-edit", {
    description: "Open the Edit tab (FilmCraft web build). Server-side this only records the audit entry; navigation happens in the client.",
    paramsSchema: z.object({}).strict(),
    enabled: async () => (await readPreferences()).cutroomProEnabled,
    handler: async () => ({ opened: true, editor: PRO_EDITOR_NAME, version: PRO_VERSION }),
  });

  /**
   * Cutroom Pro M1 — Assembler agent commands. Every plan step goes
   * through here (Pro-gated, validated, audit-logged). The step handlers
   * do no FilmCraft work themselves: they look up the per-run context
   * (created by runAssembly in server/assembler.ts) and call the run's
   * transport. Steps whose plan entry has a skipReason never reach a
   * handler — the runner records them as skipped.
   */
  const assemblerStepParamsSchema = z.object({
    runId: z.string().trim().min(1).max(128),
    step: assemblerStepSchema,
  }).strict();

  const assemblerStepHandler = async ({ runId, step }: { runId: string; step: z.infer<typeof assemblerStepSchema> }) => {
    const { getRunContext } = await import("./assembler");
    const context = getRunContext(runId);
    if (!context) throw new Error(`No assembler run context for ${runId} — the run may have ended.`);
    const result = await context.transport.executeStep(step, context.transportCtx);
    // Throw on a failed step so the registry audit log records ok: false
    // (a returned { ok: false } would otherwise read as a successful
    // dispatch). runAssembly catches this and records the step as failed.
    if (!result.ok) throw new Error(result.error || `Assembler step failed: ${step.command}`);
    return result;
  };

  const assemblerEnabled = async () => (await readPreferences()).cutroomProEnabled;

  for (const [id, description] of [
    ["assembler.new-sequence", "Create the FilmCraft sequence for an assembly run."],
    ["assembler.import-media", "Import one media file into the FilmCraft project."],
    ["assembler.place-clip", "Place one Board shot on V1 at its planned time."],
    ["assembler.place-music", "Place the music bed on A1."],
    ["assembler.duck-music", "Duck the music bed to -12 dB under narration (Essential Sound)."],
    ["assembler.add-captions", "Add the caption track and its cues."],
    ["assembler.check-loudness", "Loudness step — no meter in filmcraft-cli; applied at export, not measured."],
    ["assembler.export", "Export the assembled sequence as H.264 MP4."],
  ] as const) {
    registry.register(id, {
      description,
      paramsSchema: assemblerStepParamsSchema,
      enabled: assemblerEnabled,
      handler: assemblerStepHandler,
    });
  }

  registry.register("assembler.plan", {
    description: "Build the assembly plan for a Board (no execution, no transport). Requires Cutroom Pro on.",
    paramsSchema: z.object({
      board: productionBoardOutputSchema,
      options: z.object({
        fps: z.number().int().min(1).max(240).optional(),
        mediaByShotIndex: z.record(z.string(), z.string().trim().min(1).max(2_000)).optional(),
        captionByShotIndex: z.record(z.string(), z.string().trim().min(1).max(2_000)).optional(),
        musicBed: z.union([
          z.object({ path: z.string().trim().min(1).max(2_000) }).strict(),
          z.object({ demo: z.literal(true) }).strict(),
        ]).optional(),
        demoMedia: z.boolean().optional(),
        exportWidth: z.number().int().min(16).max(7680).optional(),
        exportHeight: z.number().int().min(16).max(4320).optional(),
        exportFileName: z.string().trim().min(1).max(128).optional(),
        loudnessTargetLufs: z.number().min(-70).max(0).optional(),
      }).strict().optional(),
    }).strict(),
    enabled: assemblerEnabled,
    handler: async ({ board, options }) => {
      const { buildAssemblyPlan } = await import("@shared/assembler");
      return buildAssemblyPlan(board, options ?? {});
    },
  });

  registry.register("assembler.run", {
    description: "Run the assembler on a Board: build the plan, dispatch every step through this registry, and return the receipt. Requires Cutroom Pro on.",
    paramsSchema: z.object({
      board: productionBoardOutputSchema,
      options: z.object({
        fps: z.number().int().min(1).max(240).optional(),
        mediaByShotIndex: z.record(z.string(), z.string().trim().min(1).max(2_000)).optional(),
        captionByShotIndex: z.record(z.string(), z.string().trim().min(1).max(2_000)).optional(),
        musicBed: z.union([
          z.object({ path: z.string().trim().min(1).max(2_000) }).strict(),
          z.object({ demo: z.literal(true) }).strict(),
        ]).optional(),
        demoMedia: z.boolean().optional(),
        exportWidth: z.number().int().min(16).max(7680).optional(),
        exportHeight: z.number().int().min(16).max(4320).optional(),
        exportFileName: z.string().trim().min(1).max(128).optional(),
        loudnessTargetLufs: z.number().min(-70).max(0).optional(),
      }).strict().optional(),
      transport: z.enum(["auto", "dry-run"]).optional(),
    }).strict(),
    enabled: assemblerEnabled,
    handler: async ({ board, options, transport }) => {
      const { runAssembly } = await import("./assembler");
      const { DryRunTransport } = await import("./assembler-transport");
      const receipt = await runAssembly(
        { board, options, transport },
        {
          transportOverride: transport === "dry-run" ? new DryRunTransport() : undefined,
          proEnabled: true,
        },
      );
      return receipt;
    },
  });

  return registry;
}

/** Process-wide server registry. */
export const proRegistry = createProRegistry();
