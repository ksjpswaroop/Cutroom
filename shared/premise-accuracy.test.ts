import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  comparePremise,
  comparePremises,
  premiseLoopStatus,
  type PremiseRecord,
} from "./premise-accuracy";

/**
 * Cutroom Pro M3 — premise-accuracy comparison. The rule is honest by
 * construction: no actuals yet means "inconclusive", never "confirmed";
 * an actual inside the margin is inconclusive; otherwise the verdict
 * follows the expected direction.
 */
function record(overrides: Partial<PremiseRecord> = {}): PremiseRecord {
  return {
    id: "prm-test-01",
    projectId: "default",
    videoTitle: "How to sharpen a kitchen knife",
    claimIds: ["stub-claim-1"],
    wording: "A timed walkthrough holds retention past the opening.",
    agentRunId: "agt-test-01",
    publishedAt: "2026-11-18T00:00:00.000Z",
    expectation: { metric: "ctr", direction: "above", threshold: 5, margin: 0 },
    actuals: { ctrPct: null, retentionPct: null, views: null, suppliedAt: null, note: null },
    createdAt: "2026-11-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("comparePremise (Cutroom Pro M3)", () => {
  test("no data supplied yet is inconclusive, never confirmed", () => {
    const comparison = comparePremise(record());
    assert.equal(comparison.verdict, "inconclusive");
    assert.equal(comparison.actual, null);
    assert.match(comparison.reason, /has been supplied yet/);
  });

  test("actual above the threshold confirms an 'above' premise; below contradicts it", () => {
    const confirmed = comparePremise(record({ actuals: { ctrPct: 6.1, retentionPct: null, views: null, suppliedAt: "2026-11-19T00:00:00.000Z", note: "Studio, by hand" } }));
    assert.equal(confirmed.verdict, "confirmed");
    assert.equal(confirmed.actual, 6.1);

    const contradicted = comparePremise(record({ actuals: { ctrPct: 3.2, retentionPct: null, views: null, suppliedAt: "2026-11-19T00:00:00.000Z", note: "Studio, by hand" } }));
    assert.equal(contradicted.verdict, "contradicted");
  });

  test("a 'below' premise inverts the direction", () => {
    const confirmed = comparePremise(record({
      expectation: { metric: "retention", direction: "below", threshold: 40, margin: 0 },
      actuals: { ctrPct: null, retentionPct: 32, views: null, suppliedAt: "2026-11-19T00:00:00.000Z", note: null },
    }));
    assert.equal(confirmed.verdict, "confirmed");
  });

  test("an actual inside the margin is inconclusive, not a verdict", () => {
    const comparison = comparePremise(record({
      expectation: { metric: "ctr", direction: "above", threshold: 5, margin: 0.5 },
      actuals: { ctrPct: 5.2, retentionPct: null, views: null, suppliedAt: "2026-11-19T00:00:00.000Z", note: null },
    }));
    assert.equal(comparison.verdict, "inconclusive");
    assert.match(comparison.reason, /too close to call/);
  });

  test("views use the view count, and the loop status counts all three verdicts", () => {
    const comparisons = comparePremises([
      record({ id: "prm-1", actuals: { ctrPct: 6, retentionPct: null, views: null, suppliedAt: "2026-11-19T00:00:00.000Z", note: null } }),
      record({
        id: "prm-2",
        expectation: { metric: "views", direction: "above", threshold: 1000, margin: 0 },
        actuals: { ctrPct: null, retentionPct: null, views: 400, suppliedAt: "2026-11-19T00:00:00.000Z", note: null },
      }),
      record({ id: "prm-3" }),
    ]);
    assert.deepEqual(comparisons.map((c) => c.verdict), ["confirmed", "contradicted", "inconclusive"]);
    assert.deepEqual(premiseLoopStatus(comparisons), { total: 3, confirmed: 1, contradicted: 1, inconclusive: 1 });
  });
});
