import { z } from "zod";
import type { ProductionBoardOutput } from "./board-contracts";
import { assertNoNumericScores, type AgentClaim, type PackagingVariant, type ScriptLine } from "./agents";

/**
 * Cutroom Pro M2 — QA / Compliance gate (pure, deterministic, no model call).
 *
 * Checks:
 *  - board-subset-throughline: every Board panel section must be one of the
 *    throughline sections (the desk's subset rule). Missing throughline
 *    data is a warn, not a fail — the gate must not invent a graph.
 *  - requires-studio-not-spoken: no requires_studio claim's text may appear
 *    in a script line as fact. (A line that names Studio as the place to
 *    *validate* a claim does not contain the claim text, so it passes.)
 *  - no-snapshot-voice-clone: a voice cloned from a research-snapshot
 *    creator is a fail.
 *  - no-invented-metrics: packaging variants must carry no numeric
 *    score / CTR / SEO value.
 *  - captions-present: narration without captions is a warn.
 *
 * A Fail blocks Render and blocks the assembler run. A Warn does not block
 * but must appear in the receipt.
 */

export const qaCheckStatusSchema = z.enum(["pass", "warn", "fail"]);
export type QaCheckStatus = z.infer<typeof qaCheckStatusSchema>;

export const qaCheckSchema = z.object({
  id: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(200),
  status: qaCheckStatusSchema,
  reason: z.string().trim().min(1).max(1_000),
}).strict();
export type QaCheck = z.infer<typeof qaCheckSchema>;

export const qaReportSchema = z.object({
  status: qaCheckStatusSchema,
  checks: z.array(qaCheckSchema).min(1).max(16),
  checkedAt: z.string().datetime(),
}).strict();
export type QaReport = z.infer<typeof qaReportSchema>;

export const qaInputSchema = z.object({
  board: z.custom<ProductionBoardOutput>((value) => typeof value === "object" && value !== null).optional(),
  throughlineSections: z.array(z.string().trim().min(1).max(120)).max(16).optional(),
  scriptLines: z.array(z.object({
    text: z.string().trim().min(1).max(4_000),
    claimIds: z.array(z.string().trim().min(1).max(128)).max(8),
  }).strict()).max(200).optional(),
  claims: z.array(z.custom<AgentClaim>((value) => typeof value === "object" && value !== null)).max(24).optional(),
  packagingVariants: z.array(z.custom<PackagingVariant>((value) => typeof value === "object" && value !== null)).max(12).optional(),
  voiceCloneFromSnapshotCreator: z.boolean().default(false),
  narrationPresent: z.boolean().default(false),
  captionsPresent: z.boolean().default(false),
}).strict();
export type QaInput = z.infer<typeof qaInputSchema>;

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function runQaChecks(input: QaInput): QaReport {
  const checks: QaCheck[] = [];

  // Board subset of throughline.
  const board = input.board as ProductionBoardOutput | undefined;
  const sections = input.throughlineSections;
  if (board) {
    if (!sections || sections.length === 0) {
      checks.push({
        id: "board-subset-throughline",
        label: "Board panels are a subset of the throughline",
        status: "warn",
        reason: "No throughline sections were supplied, so the subset rule could not be verified.",
      });
    } else {
      const allowed = new Set(sections.map(normalize));
      const outside = board.storyboardPanels
        .map((panel) => panel.section)
        .filter((section) => !allowed.has(normalize(section)));
      const unique = [...new Set(outside)];
      checks.push({
        id: "board-subset-throughline",
        label: "Board panels are a subset of the throughline",
        status: unique.length === 0 ? "pass" : "fail",
        reason: unique.length === 0
          ? `All ${board.storyboardPanels.length} Board panels name a throughline section.`
          : `Board panels outside the throughline: ${unique.join(", ")}.`,
      });
    }
  } else {
    checks.push({
      id: "board-subset-throughline",
      label: "Board panels are a subset of the throughline",
      status: "pass",
      reason: "No Board supplied — nothing to check.",
    });
  }

  // Requires-Studio claims must not be spoken as fact in the script.
  const studioClaims = (input.claims || []).filter((claim) => claim.evidenceClass === "requires_studio");
  const lines = input.scriptLines || [];
  const spoken = lines.filter((line) => {
    const text = normalize(line.text);
    return studioClaims.some((claim) => {
      const claimText = normalize(claim.claim);
      return claimText.length >= 12 && text.includes(claimText);
    });
  });
  checks.push({
    id: "requires-studio-not-spoken",
    label: "No Requires Studio claim is spoken as fact in the script",
    status: spoken.length === 0 ? "pass" : "fail",
    reason: spoken.length === 0
      ? `${studioClaims.length} Requires Studio claim(s) checked against ${lines.length} script line(s); none is spoken as fact.`
      : `${spoken.length} script line(s) state a Requires Studio claim as fact.`,
  });

  // Voice clone guard.
  checks.push({
    id: "no-snapshot-voice-clone",
    label: "No voice cloned from a research-snapshot creator",
    status: input.voiceCloneFromSnapshotCreator ? "fail" : "pass",
    reason: input.voiceCloneFromSnapshotCreator
      ? "The voice profile is cloned from a research-snapshot creator — forbidden."
      : "No snapshot-creator voice clone in this run.",
  });

  // Invented metrics in packaging.
  let metricsError: string | null = null;
  try {
    assertNoNumericScores(input.packagingVariants ?? []);
  } catch (error: any) {
    metricsError = error?.message || String(error);
  }
  checks.push({
    id: "no-invented-metrics",
    label: "Packaging carries no invented metric or score",
    status: metricsError ? "fail" : "pass",
    reason: metricsError || `${(input.packagingVariants || []).length} packaging variant(s) checked; no numeric score, CTR, or SEO value found.`,
  });

  // Captions where narration exists.
  if (input.narrationPresent && !input.captionsPresent) {
    checks.push({
      id: "captions-present",
      label: "Captions present where narration exists",
      status: "warn",
      reason: "Narration exists but no captions were supplied — captions should be added before export.",
    });
  } else {
    checks.push({
      id: "captions-present",
      label: "Captions present where narration exists",
      status: "pass",
      reason: input.narrationPresent ? "Narration and captions are both present." : "No narration in this run.",
    });
  }

  const status: QaCheckStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn") ? "warn" : "pass";
  return { status, checks, checkedAt: new Date().toISOString() };
}
