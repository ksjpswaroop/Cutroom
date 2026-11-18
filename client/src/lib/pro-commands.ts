import { useEffect, useState } from "react";
import { z } from "zod";
import { createCommandRegistry } from "@shared/commands";
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { apiRequest } from "./queryClient";

/**
 * Client-side Pro command registry (Cutroom Pro M0).
 *
 * The same three Pro commands as the server registry, with client handlers:
 * flip the toggle (PUT /api/settings/preferences), open the Edit tab
 * (navigation, supplied by the caller), and export OTIO (POST
 * /api/board/otio, then a browser download). Every dispatch is validated
 * and written to this registry's append-only audit log, in the same shape
 * as the server's.
 */

export const FILMCRAFT_VERSION = "0.20.1";
export const FILMCRAFT_REPO_URL = "https://github.com/storytold/filmcraft";

export interface OtioExportResult {
  timeline: Record<string, unknown>;
  placeholders: string[];
  durationSeconds: number;
  fps: number;
  filename: string;
}

function downloadOtio(result: OtioExportResult): void {
  const blob = new Blob([`${JSON.stringify(result.timeline, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface AssemblerPlanResult {
  snapshotId: string;
  fps: number;
  totalSeconds: number;
  demoMedia: boolean;
  steps: Array<{ seq: number; command: string; label: string; filmcraftCommand: string | null; skipReason?: string }>;
  captions: { cues: Array<{ text: string; startSeconds: number; endSeconds: number }>; captionless: string[] };
  ducking: { applied: boolean; reduceDb: number; note: string };
  placeholders: string[];
  loudness: { measured: boolean; reason: string; targetLufs: number };
  exportFileName: string;
}

export interface AssemblerReceiptResult {
  runId: string;
  status: "ok" | "partial" | "failed";
  transport: { kind: string; dryRun: boolean; dryRunReason: string | null; version: string | null };
  steps: Array<{ seq: number; command: string; label: string; status: string; error?: string; note?: string }>;
  captions: { cues: number; captionless: string[] };
  ducking: { applied: boolean; reduceDb: number; cliKeyframesReturned: number; note: string };
  loudness: { measured: boolean; reason: string };
  export: { path: string | null; bytes: number | null; note: string };
  cost: { amount: number; currency: string };
}

export function createProClientRegistry(
  navigate: (path: string) => void,
  isProEnabled?: () => boolean,
) {
  const registry = createCommandRegistry();

  registry.register("pro.set-enabled", {
    description: "Turn the Cutroom Pro tier on or off.",
    paramsSchema: z.object({ enabled: z.boolean() }).strict(),
    handler: async ({ enabled }) => {
      const response = (await apiRequest("PUT", "/api/settings/preferences", {
        cutroomProEnabled: enabled,
      })) as { success: boolean; preferences: { cutroomProEnabled: boolean } };
      return response.preferences;
    },
  });

  registry.register("pro.open-edit", {
    description: "Open the Edit tab (FilmCraft web build).",
    paramsSchema: z.object({}).strict(),
    enabled: isProEnabled ? () => isProEnabled() : undefined,
    handler: async () => {
      navigate("/edit");
      return { opened: true, editor: "FilmCraft", version: FILMCRAFT_VERSION };
    },
  });

  registry.register("pro.export-otio", {
    description: "Export the production Board as an OTIO timeline and download it.",
    paramsSchema: z.object({
      board: productionBoardOutputSchema,
      fps: z.number().int().min(1).max(240).optional(),
    }).strict(),
    handler: async ({ board, fps }) => {
      const result = (await apiRequest("POST", "/api/board/otio", { board, fps })) as OtioExportResult;
      downloadOtio(result);
      return result;
    },
  });

  // Cutroom Pro M1 — Assembler agent: plan first (inspect, approve), then run.
  registry.register("assembler.plan", {
    description: "Build the assembly plan for the Board (no execution).",
    paramsSchema: z.object({
      board: productionBoardOutputSchema,
      options: z.object({
        demoMedia: z.boolean().optional(),
        exportWidth: z.number().int().min(16).max(7680).optional(),
        exportHeight: z.number().int().min(16).max(4320).optional(),
      }).strict().optional(),
    }).strict(),
    handler: async ({ board, options }) => {
      const result = (await apiRequest("POST", "/api/assembler/plan", { board, options })) as { plan: AssemblerPlanResult };
      return result.plan;
    },
  });

  registry.register("assembler.run", {
    description: "Run the assembler on the Board and return the receipt.",
    paramsSchema: z.object({
      board: productionBoardOutputSchema,
      options: z.object({
        demoMedia: z.boolean().optional(),
        exportWidth: z.number().int().min(16).max(7680).optional(),
        exportHeight: z.number().int().min(16).max(4320).optional(),
        transport: z.enum(["auto", "dry-run"]).optional(),
      }).strict().optional(),
    }).strict(),
    handler: async ({ board, options }) => {
      const result = (await apiRequest("POST", "/api/assembler/run", { board, options })) as { receipt: AssemblerReceiptResult };
      return result.receipt;
    },
  });

  return registry;
}

export type ProClientRegistry = ReturnType<typeof createProClientRegistry>;

/** Fetch the Pro toggle from the server settings status (cached per mount). */
export function useProEnabled(): { enabled: boolean; loading: boolean; refresh: () => void } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/settings/status", { cache: "no-store" });
        if (!response.ok) throw new Error("Settings unavailable.");
        const data = (await response.json()) as {
          preferences?: { cutroomProEnabled?: boolean };
        };
        if (!cancelled) setEnabled(Boolean(data.preferences?.cutroomProEnabled));
      } catch {
        if (!cancelled) setEnabled(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { enabled, loading, refresh: () => setNonce((n) => n + 1) };
}
