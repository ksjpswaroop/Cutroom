import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  agentClaimSchema,
  assertNoNumericScores,
  buildAgentPlan,
  stubClaims,
  stubPackaging,
  stubScript,
  stubSnapshotVideos,
  type AgentPlanInput,
} from "./agents";

const baseInput: AgentPlanInput = {
  topic: "How to sharpen a kitchen knife",
  projectId: "proj-m2-test",
  provider: "stub",
  spendCapUsd: 0,
  voiceCloneFromSnapshotCreator: false,
};

describe("Agent team — plan (Cutroom Pro M2)", () => {
  test("plan lists the six agents in order; assembler is skipped without a Board", () => {
    const plan = buildAgentPlan(baseInput, "run-plan-1");
    assert.deepEqual(plan.steps.map((s) => s.agent), ["researcher", "auditor", "scriptwriter", "packaging", "qa", "assembler"]);
    assert.equal(plan.steps[5].status, "skipped");
    assert.match(plan.steps[5].skipReason || "", /No Board/);
    assert.equal(plan.steps[0].estimatedCostUsd, 0);
  });

  test("stub snapshot is deterministic and claims are pointer-bound", () => {
    const a = stubSnapshotVideos(baseInput.topic);
    const b = stubSnapshotVideos(baseInput.topic);
    assert.deepEqual(a, b);
    assert.equal(a.videos.length, 3);
    const claims = stubClaims(a.snapshotId, a.videos);
    assert.equal(claims.length, 9);
    for (const claim of claims) {
      const parsed = agentClaimSchema.safeParse(claim);
      assert.equal(parsed.success, true, `stub claim ${claim.id} must validate: ${JSON.stringify(parsed)}`);
    }
    assert.equal(claims.filter((c) => c.evidenceClass === "observed").length, 3);
    assert.equal(claims.filter((c) => c.evidenceClass === "inferred").length, 3);
    assert.equal(claims.filter((c) => c.evidenceClass === "requires_studio").length, 3);
  });

  test("Auditor rejects a claim without an evidence pointer", () => {
    const { snapshotId, videos } = stubSnapshotVideos(baseInput.topic);
    const claims = stubClaims(snapshotId, videos);
    const pointerless = { ...claims[0] };
    delete (pointerless as Record<string, unknown>).evidencePointer;
    assert.equal(agentClaimSchema.safeParse(pointerless).success, false);
    const wrongVideo = { ...claims[0], evidencePointer: { videoId: "not-a-source", excerpt: "x" } };
    assert.equal(agentClaimSchema.safeParse(wrongVideo).success, false);
  });

  test("Scriptwriter traces every line to a claim id", () => {
    const { snapshotId, videos } = stubSnapshotVideos(baseInput.topic);
    const claims = stubClaims(snapshotId, videos);
    const script = stubScript(baseInput.topic, claims);
    const claimIds = new Set(claims.map((c) => c.id));
    for (const section of script.sections) {
      for (const line of section.lines) {
        assert.ok(line.claimIds.length >= 1);
        for (const id of line.claimIds) assert.ok(claimIds.has(id), `line traces to unknown claim ${id}`);
      }
    }
    assert.equal(script.titles.length, 3);
    assert.ok(script.wpmChapters.every((c) => c.minutes >= 0));
  });

  test("Packaging carries no numeric score — and the guard rejects one", () => {
    const { snapshotId, videos } = stubSnapshotVideos(baseInput.topic);
    const script = stubScript(baseInput.topic, stubClaims(snapshotId, videos));
    const packaging = stubPackaging(script);
    assertNoNumericScores(packaging);
    for (const variant of packaging.variants) {
      assert.ok(!("score" in variant) && !("ctr" in variant));
    }
    assert.throws(
      () => assertNoNumericScores({ variants: [{ kind: "title", text: "x", ctr: 0.42 }] }),
      /Invented metric rejected/,
    );
    assert.throws(
      () => assertNoNumericScores({ variants: [{ kind: "title", text: "x", seoScore: 87 }] }),
      /Invented metric rejected/,
    );
  });
});
