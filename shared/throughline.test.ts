import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EvidenceClaim } from "./evidence-contracts";
import { buildThroughlineGraph, checkThroughline } from "./throughline";

const snapshotId = "yt_snapshot_throughline_01";

const observed: EvidenceClaim = {
  id: "claim-observed",
  claim: "Three sampled videos open with a comparison question.",
  evidenceClass: "observed",
  sourceVideoIds: ["video-a", "video-b"],
  confidence: "high",
  limitations: ["Sample only."],
  snapshotId,
};

const studio: EvidenceClaim = {
  id: "claim-studio",
  claim: "Average view duration is above forty percent.",
  evidenceClass: "requires_studio",
  sourceVideoIds: [],
  confidence: "low",
  limitations: ["Requires YouTube Studio."],
  snapshotId,
};

const unused: EvidenceClaim = {
  id: "claim-unused",
  claim: "Commenters ask about battery life more than price.",
  evidenceClass: "inferred",
  sourceVideoIds: [],
  confidence: "medium",
  limitations: ["Aggregate inference."],
  snapshotId,
};

describe("buildThroughlineGraph", () => {
  test("builds promise → sections → claims → source videos without inventing nodes", () => {
    const graph = buildThroughlineGraph({
      topic: "Compare two setup paths",
      script: "## Hook\nHello\n## Body\nDetails\n## Payoff\nDone",
      structure: [
        { section: "Hook", evidenceClaimIds: [] },
        { section: "Body", evidenceClaimIds: ["claim-observed", "missing-invented"] },
        { section: "Payoff", evidenceClaimIds: ["claim-observed"] },
      ],
      evidenceClaims: [observed, studio],
      ideaClaimIds: [observed.id, unused.id],
    });

    const kinds = graph.nodes.map((node) => node.kind);
    assert.ok(kinds.includes("promise"));
    assert.equal(graph.nodes.filter((node) => node.kind === "section").length, 3);
    assert.equal(graph.nodes.filter((node) => node.kind === "claim").length, 1);
    assert.equal(graph.nodes.filter((node) => node.kind === "source_video").length, 2);

    assert.equal(graph.nodes.some((node) => node.id === "claim:missing-invented"), false);
    assert.equal(graph.nodes.some((node) => node.id === "claim:claim-unused"), false);
    assert.equal(graph.nodes.some((node) => node.id === "source:invented-video"), false);

    assert.ok(graph.edges.some((edge) => edge.kind === "promise_to_section"));
    assert.ok(graph.edges.some((edge) => edge.from === "section:body" && edge.to === "claim:claim-observed"));
    assert.ok(graph.edges.some((edge) => edge.from === "claim:claim-observed" && edge.to === "source:video-a"));
  });

  test("uses ScriptSection names and only source IDs from provided claims", () => {
    const graph = buildThroughlineGraph({
      title: "Title from result",
      sections: [
        { name: "Opening", evidenceClaimIds: ["claim-observed"], paragraphs: [{ type: "text", content: "Hi" }] },
        { name: "Deep dive", evidenceClaimIds: ["claim-observed"] },
      ],
      evidenceClaims: [observed],
    });

    assert.equal(graph.nodes.find((node) => node.kind === "promise")?.label, "Title from result");
    assert.deepEqual(
      graph.nodes.filter((node) => node.kind === "section").map((node) => node.label),
      ["Opening", "Deep dive"],
    );
    assert.deepEqual(
      graph.nodes.filter((node) => node.kind === "source_video").map((node) => node.label).sort(),
      ["video-a", "video-b"],
    );
  });
});

describe("checkThroughline", () => {
  test("fails on orphan body sections with no linked claims", () => {
    const graph = buildThroughlineGraph({
      topic: "Setup guide",
      sections: [
        { name: "Hook", evidenceClaimIds: ["claim-observed"] },
        { name: "Tangent body", evidenceClaimIds: [] },
      ],
      evidenceClaims: [observed],
      ideaClaimIds: [observed.id],
    });

    const checks = checkThroughline(graph);
    assert.equal(checks.status, "fail");
    assert.ok(checks.issues.some((issue) => issue.code === "orphan_body_section" && issue.severity === "fail"));
  });

  test("warns when requires_studio claim text appears in spoken dialogue", () => {
    const graph = buildThroughlineGraph({
      topic: "Retention myths",
      sections: [
        {
          name: "Hook",
          evidenceClaimIds: ["claim-studio"],
          paragraphs: [
            { type: "dialogue", content: "Average view duration is above forty percent." },
            { type: "stage-direction", content: "Cut to chart" },
          ],
        },
        {
          name: "Proof",
          evidenceClaimIds: ["claim-observed"],
          paragraphs: [{ type: "dialogue", content: "Here is what the sample shows." }],
        },
      ],
      evidenceClaims: [observed, studio],
      ideaClaimIds: [observed.id, studio.id],
    });

    const checks = checkThroughline(graph);
    assert.equal(checks.status, "warn");
    assert.ok(
      checks.issues.some(
        (issue) => issue.code === "requires_studio_spoken_as_fact" && issue.severity === "warn",
      ),
    );
    assert.equal(checks.issues.some((issue) => issue.severity === "fail"), false);
  });

  test("warns on unused idea claims", () => {
    const graph = buildThroughlineGraph({
      topic: "Battery tips",
      sections: [
        { name: "Hook", evidenceClaimIds: ["claim-observed"] },
        { name: "Body", evidenceClaimIds: ["claim-observed"] },
      ],
      evidenceClaims: [observed, unused],
      ideaClaimIds: [observed.id, unused.id],
    });

    const checks = checkThroughline(graph);
    assert.ok(checks.issues.some((issue) => issue.code === "unused_idea_claim"));
    assert.notEqual(checks.status, "fail");
  });
});
