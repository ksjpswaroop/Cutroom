import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { stubClaims, stubPackaging, stubScript, stubSnapshotVideos } from "./agents";
import { runQaChecks } from "./qa";
import { productionBoardOutputSchema } from "./board-contracts";

const topic = "How to sharpen a kitchen knife";
const { snapshotId, videos } = stubSnapshotVideos(topic);
const claims = stubClaims(snapshotId, videos);
const script = stubScript(topic, claims);

const board = productionBoardOutputSchema.parse({
  snapshotId,
  characters: [{ id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const }],
  storyboardPanels: [
    { id: "p1", section: "Hook", visual: "Timer", onScreenText: "First clip.", evidenceClaimIds: ["stub-claim-1"], evidenceClass: "observed" as const, snapshotId },
    { id: "p2", section: "Method", visual: "Steps", evidenceClaimIds: ["stub-claim-4"], evidenceClass: "inferred" as const, snapshotId },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["stub-claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["stub-claim-4"], evidenceClass: "inferred" as const },
    { panelId: "p2", shot: "Screen recipe", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["stub-claim-4"], evidenceClass: "inferred" as const },
  ],
});

const lines = script.sections.flatMap((s) => s.lines);
const variants = stubPackaging(script).variants;

describe("QA / Compliance gate (Cutroom Pro M2)", () => {
  test("clean run passes", () => {
    const report = runQaChecks({
      board,
      throughlineSections: ["Hook", "Method", "Close"],
      scriptLines: lines,
      claims,
      packagingVariants: variants,
      narrationPresent: true,
      captionsPresent: true,
    });
    assert.equal(report.status, "pass");
    assert.ok(report.checks.every((c) => c.status === "pass"));
  });

  test("Board panel outside the throughline fails", () => {
    const report = runQaChecks({
      board,
      throughlineSections: ["Hook"],
      scriptLines: lines,
      claims,
      packagingVariants: variants,
    });
    assert.equal(report.status, "fail");
    assert.equal(report.checks.find((c) => c.id === "board-subset-throughline")?.status, "fail");
  });

  test("a Requires Studio claim spoken as fact fails", () => {
    const studio = claims.find((c) => c.evidenceClass === "requires_studio")!;
    const badLines = [...lines, { text: studio.claim, claimIds: [studio.id] }];
    const report = runQaChecks({
      scriptLines: badLines,
      claims,
      packagingVariants: variants,
    });
    assert.equal(report.status, "fail");
    assert.equal(report.checks.find((c) => c.id === "requires-studio-not-spoken")?.status, "fail");
  });

  test("snapshot voice clone fails; narration without captions warns but does not fail", () => {
    const clone = runQaChecks({ voiceCloneFromSnapshotCreator: true, scriptLines: lines, claims, packagingVariants: variants });
    assert.equal(clone.status, "fail");
    const warn = runQaChecks({ narrationPresent: true, captionsPresent: false, scriptLines: lines, claims, packagingVariants: variants });
    assert.equal(warn.status, "warn");
    assert.equal(warn.checks.find((c) => c.id === "captions-present")?.status, "warn");
  });

  test("an invented metric in packaging fails", () => {
    const bad = [...variants, { kind: "title", text: "x", source: "test", critique: { clarity: "strong", promiseMatch: "strong", brandFit: "strong" }, ctr: 0.5 } as never];
    const report = runQaChecks({ packagingVariants: bad, scriptLines: lines, claims });
    assert.equal(report.status, "fail");
    assert.equal(report.checks.find((c) => c.id === "no-invented-metrics")?.status, "fail");
  });
});
