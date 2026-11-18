import { z } from "zod";
import { createCommandRegistry, type CommandRegistry } from "@shared/commands";
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { buildOtioTimeline } from "@shared/otio";
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

  return registry;
}

/** Process-wide server registry. */
export const proRegistry = createProRegistry();
