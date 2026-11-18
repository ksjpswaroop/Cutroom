import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addCostEntry, capAllows, emptyLedger } from "./cost-ledger";
import { nextPendingStep, shouldRetryStep } from "./orchestrator";
import { buildAgentPlan, type AgentPlanInput } from "./agents";

describe("Cost Ledger (Cutroom Pro M2)", () => {
  test("totals stay honest: null tokens or cost make the total null, never invented", () => {
    let ledger = emptyLedger();
    ledger = addCostEntry(ledger, { agent: "researcher", provider: "stub", model: "stub", tokens: null, quotaUnits: 100, costUsd: 0, note: "Stub snapshot; no provider call." });
    assert.equal(ledger.totals.tokens, null);
    assert.equal(ledger.totals.tokensUnknown, true);
    assert.equal(ledger.totals.quotaUnits, 100);
    assert.equal(ledger.totals.costUsd, 0);
    ledger = addCostEntry(ledger, { agent: "auditor", provider: "gemini", model: "gemini-2.0-flash", tokens: 1200, quotaUnits: 0, costUsd: null, note: "Provider did not report cost." });
    assert.equal(ledger.totals.costUsd, null);
    assert.equal(ledger.totals.costUnknown, true);
    assert.equal(ledger.totals.tokens, null);
  });

  test("cap: $0 blocks unknown-cost live calls; a known $0 step is allowed", () => {
    assert.equal(capAllows(0, 0, null).allowed, false);
    assert.equal(capAllows(0, 0, 0).allowed, true);
    assert.equal(capAllows(5, 4, 2).allowed, false);
    assert.equal(capAllows(5, 4, null).allowed, true);
  });
});

describe("Orchestrator helpers (Cutroom Pro M2)", () => {
  test("retry once only when nothing was spent; live failures never retry", () => {
    assert.deepEqual(shouldRetryStep({ attempts: 1, spentMoney: false, live: false }), { retry: true, reason: "One retry allowed: the failed step spent no money." });
    assert.equal(shouldRetryStep({ attempts: 2, spentMoney: false, live: false }).retry, false);
    assert.equal(shouldRetryStep({ attempts: 1, spentMoney: true, live: false }).retry, false);
    assert.equal(shouldRetryStep({ attempts: 1, spentMoney: false, live: true }).retry, false);
  });

  test("nextPendingStep finds the first pending step", () => {
    const input: AgentPlanInput = { topic: "x", projectId: "p", provider: "stub", spendCapUsd: 0, voiceCloneFromSnapshotCreator: false };
    const plan = buildAgentPlan(input, "run-1");
    assert.equal(nextPendingStep(plan)?.agent, "researcher");
    plan.steps[0].status = "ok";
    assert.equal(nextPendingStep(plan)?.agent, "auditor");
  });
});
