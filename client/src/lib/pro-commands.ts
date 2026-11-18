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
