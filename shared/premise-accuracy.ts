import { z } from "zod";

/**
 * Cutroom Pro M3 — premise-accuracy loop (pure shared layer).
 *
 * After a video is published, the creator supplies the real numbers
 * (CTR, retention, views) by hand — Cutroom never fetches Studio data,
 * never scrapes YouTube, and never auto-uploads. Each premise the agent
 * asserted is then compared against the numbers the creator supplied:
 *
 *  - "confirmed" — the actual number is on the expected side of the
 *    threshold (with the margin, where one is set).
 *  - "contradicted" — the actual number is on the opposite side.
 *  - "inconclusive" — no actual number has been supplied yet, or the
 *    actual sits inside the margin around the threshold.
 *
 * A premise record carries the claim ids it rests on and the exact
 * wording the agent used, so a verdict can always be traced back to
 * what was asserted — and a premise with no data yet is "inconclusive",
 * never "confirmed".
 */

export const premiseMetricSchema = z.enum(["ctr", "retention", "views"]);
export type PremiseMetric = z.infer<typeof premiseMetricSchema>;

export const premiseExpectationSchema = z.object({
  metric: premiseMetricSchema,
  /** "above" = the video was expected to beat the threshold; "below" = under it. */
  direction: z.enum(["above", "below"]),
  /** Threshold in the metric's units: percent for ctr/retention, count for views. */
  threshold: z.number().min(0),
  /** Values within ±margin of the threshold are inconclusive, not a verdict. */
  margin: z.number().min(0).default(0),
}).strict();
export type PremiseExpectation = z.infer<typeof premiseExpectationSchema>;

export const premiseActualsSchema = z.object({
  /** Creator-supplied CTR in percent (e.g. 6.1 means 6.1%). */
  ctrPct: z.number().min(0).max(100).nullable(),
  /** Creator-supplied average retention in percent. */
  retentionPct: z.number().min(0).max(100).nullable(),
  /** Creator-supplied view count. */
  views: z.number().int().min(0).nullable(),
  /** When the creator supplied the numbers (ISO date). */
  suppliedAt: z.string().datetime().nullable(),
  /** Free-text note from the creator, e.g. where the numbers came from. */
  note: z.string().trim().min(1).max(500).nullable(),
}).strict();
export type PremiseActuals = z.infer<typeof premiseActualsSchema>;

export function emptyActuals(): PremiseActuals {
  return { ctrPct: null, retentionPct: null, views: null, suppliedAt: null, note: null };
}

export const premiseRecordSchema = z.object({
  id: z.string().trim().min(1).max(128),
  projectId: z.string().trim().min(1).max(128),
  videoTitle: z.string().trim().min(1).max(400),
  /** The claim ids the premise rests on (from the agent run's handoff). */
  claimIds: z.array(z.string().trim().min(1).max(128)).max(24),
  /** The exact wording the agent asserted. */
  wording: z.string().trim().min(1).max(2_000),
  agentRunId: z.string().trim().min(1).max(128).nullable(),
  publishedAt: z.string().datetime().nullable(),
  expectation: premiseExpectationSchema,
  actuals: premiseActualsSchema,
  createdAt: z.string().datetime(),
}).strict();
export type PremiseRecord = z.infer<typeof premiseRecordSchema>;

export const premiseVerdictSchema = z.enum(["confirmed", "contradicted", "inconclusive"]);
export type PremiseVerdict = z.infer<typeof premiseVerdictSchema>;

/** Input to record a premise: everything except the server-assigned id / actuals / createdAt. */
export const premiseRecordInputSchema = premiseRecordSchema.omit({ id: true, actuals: true, createdAt: true });
export type PremiseRecordInput = z.infer<typeof premiseRecordInputSchema>;

/** Input to supply creator-reported actuals for a premise. */
export const premiseActualsInputSchema = z.object({
  ctrPct: z.number().min(0).max(100).nullable().optional(),
  retentionPct: z.number().min(0).max(100).nullable().optional(),
  views: z.number().int().min(0).nullable().optional(),
  note: z.string().trim().min(1).max(500).nullable().optional(),
}).strict();
export type PremiseActualsInput = z.infer<typeof premiseActualsInputSchema>;

export interface PremiseComparison {
  recordId: string;
  verdict: PremiseVerdict;
  /** The numbers the verdict rests on, or null when none were supplied. */
  actual: number | null;
  expected: PremiseExpectation;
  reason: string;
}

/** The actual value for the premise's metric, or null when not supplied. */
export function actualForMetric(actuals: PremiseActuals, metric: PremiseMetric): number | null {
  switch (metric) {
    case "ctr": return actuals.ctrPct;
    case "retention": return actuals.retentionPct;
    case "views": return actuals.views;
  }
}

/**
 * Compare one premise against creator-supplied actuals. Pure and
 * deterministic. No data yet → inconclusive, never confirmed. An actual
 * inside the margin → inconclusive. Otherwise the verdict follows the
 * direction: "above" expects actual > threshold, "below" expects
 * actual < threshold.
 */
export function comparePremise(record: PremiseRecord): PremiseComparison {
  const { metric, direction, threshold, margin } = record.expectation;
  const actual = actualForMetric(record.actuals, metric);
  const base = { recordId: record.id, actual, expected: record.expectation };
  if (actual === null) {
    return {
      ...base,
      verdict: "inconclusive",
      reason: `No ${metric} number has been supplied yet — the premise is untested, not confirmed.`,
    };
  }
  if (Math.abs(actual - threshold) <= margin) {
    return {
      ...base,
      verdict: "inconclusive",
      reason: `${metric} ${actual} is within ±${margin} of the ${threshold} threshold — too close to call.`,
    };
  }
  const meets = direction === "above" ? actual > threshold : actual < threshold;
  return {
    ...base,
    verdict: meets ? "confirmed" : "contradicted",
    reason: meets
      ? `${metric} ${actual} is ${direction} the ${threshold} threshold, as the premise expected.`
      : `${metric} ${actual} is ${direction === "above" ? "below" : "above"} the ${threshold} threshold — the premise did not hold.`,
  };
}

export function comparePremises(records: PremiseRecord[]): PremiseComparison[] {
  return records.map(comparePremise);
}

export function premiseLoopStatus(comparisons: PremiseComparison[]): {
  total: number;
  confirmed: number;
  contradicted: number;
  inconclusive: number;
} {
  return {
    total: comparisons.length,
    confirmed: comparisons.filter((c) => c.verdict === "confirmed").length,
    contradicted: comparisons.filter((c) => c.verdict === "contradicted").length,
    inconclusive: comparisons.filter((c) => c.verdict === "inconclusive").length,
  };
}
