import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  compareProjectPremises,
  listPremiseRecords,
  recordPremise,
  supplyPremiseActuals,
} from "./premise-accuracy";

const appDataRoot = await mkdtemp(path.join(tmpdir(), "premise-test-appdata-"));
process.env.CUTROOM_APP_DATA = appDataRoot;

describe("premise-accuracy store (Cutroom Pro M3)", () => {
  test("record starts inconclusive; creator-supplied actuals move it to confirmed", async () => {
    const projectId = "proj-premise-test";
    const recorded = await recordPremise({
      projectId,
      videoTitle: "How to sharpen a kitchen knife",
      claimIds: ["stub-claim-1"],
      wording: "A timed walkthrough holds retention past the opening.",
      agentRunId: "agt-test-01",
      publishedAt: null,
      expectation: { metric: "ctr", direction: "above", threshold: 5, margin: 0 },
    });
    assert.equal(recorded.actuals.ctrPct, null);
    let compared = await compareProjectPremises(projectId);
    assert.deepEqual(compared.status, { total: 1, confirmed: 0, contradicted: 0, inconclusive: 1 });

    const updated = await supplyPremiseActuals(projectId, recorded.id, { ctrPct: 6.1, note: "Studio, by hand" });
    assert.equal(updated?.actuals.ctrPct, 6.1);
    compared = await compareProjectPremises(projectId);
    assert.deepEqual(compared.status, { total: 1, confirmed: 1, contradicted: 0, inconclusive: 0 });
    assert.equal(compared.comparisons[0].verdict, "confirmed");

    assert.equal(await supplyPremiseActuals(projectId, "prm-does-not-exist", { ctrPct: 1 }), null);
    assert.equal((await listPremiseRecords(projectId)).length, 1);
  });
});
