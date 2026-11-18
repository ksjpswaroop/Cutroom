import { z } from "zod";
import { costEntrySchema, type CostEntry } from "./agents";

/**
 * Cutroom Pro M2 — Cost Ledger (pure).
 *
 * Every agent step records provider, model, tokens (null when the provider
 * does not report them), quota units, and cost in USD (null when the
 * provider does not report it). Totals never invent a number: a total is
 * null, with `unknown: true`, whenever any entry in it is null.
 *
 * Spend cap: default $0 — no paid call runs unless the creator raises the
 * cap in Settings (Pro-gated). A step whose cost is unknown may only run
 * when the cap is above $0, and its cost stays null in the receipt.
 */

export const costLedgerSchema = z.object({
  entries: z.array(costEntrySchema).max(64),
  totals: z.object({
    tokens: z.number().int().min(0).nullable(),
    tokensUnknown: z.boolean(),
    quotaUnits: z.number().int().min(0),
    costUsd: z.number().min(0).nullable(),
    costUnknown: z.boolean(),
  }).strict(),
}).strict();
export type CostLedger = z.infer<typeof costLedgerSchema>;

export function emptyLedger(): CostLedger {
  return {
    entries: [],
    totals: { tokens: 0, tokensUnknown: false, quotaUnits: 0, costUsd: 0, costUnknown: false },
  };
}

export function addCostEntry(ledger: CostLedger, entry: CostEntry): CostLedger {
  const entries = [...ledger.entries, entry];
  let tokens: number | null = 0;
  let tokensUnknown = false;
  let quotaUnits = 0;
  let costUsd: number | null = 0;
  let costUnknown = false;
  for (const item of entries) {
    if (item.tokens === null) tokensUnknown = true;
    else if (tokens !== null) tokens += item.tokens;
    quotaUnits += item.quotaUnits;
    if (item.costUsd === null) costUnknown = true;
    else if (costUsd !== null) costUsd += item.costUsd;
  }
  if (tokensUnknown) tokens = null;
  if (costUnknown) costUsd = null;
  return { entries, totals: { tokens, tokensUnknown, quotaUnits, costUsd, costUnknown } };
}

/**
 * May a step run under the cap? `estimatedCostUsd` is null for live steps
 * (cost unknown until the provider reports it). A $0 cap blocks every
 * step that could spend; an unknown-cost step may run only above $0, and
 * its cost is recorded as null afterwards — never estimated.
 */
export function capAllows(capUsd: number, spentUsd: number | null, estimatedCostUsd: number | null): { allowed: boolean; reason: string } {
  const spent = spentUsd ?? 0;
  if (estimatedCostUsd !== null && estimatedCostUsd > 0 && spent + estimatedCostUsd > capUsd) {
    return { allowed: false, reason: `Spend cap $${capUsd} would be exceeded ($${spent} spent + $${estimatedCostUsd} estimated).` };
  }
  if (estimatedCostUsd === null && capUsd === 0) {
    return { allowed: false, reason: "Spend cap is $0 — a live call whose cost is unknown cannot run. Raise the cap in Settings to allow it." };
  }
  if (estimatedCostUsd === null) {
    return { allowed: true, reason: `Cost unknown until the provider reports it; running under the $${capUsd} cap with cost recorded as not reported.` };
  }
  return { allowed: true, reason: `Within the $${capUsd} cap ($${spent} spent + $${estimatedCostUsd} estimated).` };
}
