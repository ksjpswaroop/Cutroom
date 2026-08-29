import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  annotateShotDurations,
  checkProductionBoard,
  deriveCameraTree,
  groupShotsIntoClipBriefs,
  productionBoardOutputSchema,
  productionBoardRequestSchema,
} from "./board-contracts";

const snapshotId = "snap-board01";
const claim = {
  id: "claim-1",
  claim: "Titles emphasize speed.",
  evidenceClass: "observed" as const,
  sourceVideoIds: ["vid1"],
  confidence: "medium" as const,
  limitations: ["Public titles only"],
  snapshotId,
};

const idea = {
  title: "Fast weeknight meals",
  description: "A grounded format.",
  keywords: ["weeknight", "fast"],
  format: "Tutorial" as const,
  difficulty: "Easy" as const,
  honestPromise: "Show three public patterns.",
  discoverySurface: "search" as const,
  payoff: "A repeatable dinner plan.",
  thumbnailConcept: "Plate and timer.",
  studioMetric: "CTR in Studio.",
  experimentRule: "One variant.",
  evidenceClaims: [claim],
};

const validBoard = {
  snapshotId,
  characters: [
    { id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const },
  ],
  storyboardPanels: [
    {
      id: "p1",
      section: "Hook",
      visual: "Timer and plate",
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
    {
      id: "p2",
      section: "Method",
      visual: "Three steps",
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam host intro", camera: "a-cam" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p1", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "Screen recipe", camera: "screen" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
  ],
};

describe("production board contracts", () => {
  test("request requires idea, script, and evidence context", () => {
    assert.equal(productionBoardRequestSchema.safeParse({}).success, false);
    assert.equal(productionBoardRequestSchema.safeParse({
      topic: "Weeknight cooking",
      scriptContent: "A".repeat(40),
      selectedIdea: idea,
      evidenceContext: {
        snapshotId,
        sourceVideoIds: ["vid1"],
        evidenceClaims: [claim],
        ideaPackage: idea,
      },
    }).success, true);
  });

  test("output schema accepts a valid board and derives camera tree", () => {
    const parsed = productionBoardOutputSchema.parse(validBoard);
    const tree = deriveCameraTree(parsed.shots);
    assert.deepEqual(tree["a-cam"], [0]);
    assert.deepEqual(tree["b-roll"], [1]);
    assert.deepEqual(tree.screen, [2]);
  });

  test("stale snapshot and unknown claims fail", () => {
    const stale = checkProductionBoard(
      { ...validBoard, snapshotId: "snap-other1" },
      { snapshotId, allowedClaimIds: ["claim-1"], throughlineSections: ["Hook", "Method"] },
    );
    assert.equal(stale.status, "fail");
    assert.ok(stale.issues.some((issue) => issue.code === "stale_snapshot"));

    const unknown = checkProductionBoard(validBoard, {
      snapshotId,
      allowedClaimIds: ["other"],
      throughlineSections: ["Hook", "Method"],
    });
    assert.equal(unknown.status, "fail");
    assert.ok(unknown.issues.some((issue) => issue.code === "unknown_claim"));
  });

  test("invented section, orphan shot, and camera-tree mismatch fail", () => {
    const invented = checkProductionBoard(validBoard, {
      snapshotId,
      allowedClaimIds: ["claim-1"],
      throughlineSections: ["Hook"],
    });
    assert.ok(invented.issues.some((issue) => issue.code === "invented_section"));

    const orphan = checkProductionBoard(
      {
        ...validBoard,
        shots: [...validBoard.shots, {
          panelId: "missing",
          shot: "orphan",
          camera: "insert",
          evidenceClaimIds: ["claim-1"],
          evidenceClass: "observed",
        }],
      },
      { snapshotId, allowedClaimIds: ["claim-1"], throughlineSections: ["Hook", "Method"] },
    );
    assert.ok(orphan.issues.some((issue) => issue.code === "orphan_shot"));

    const mismatch = checkProductionBoard(
      {
        ...validBoard,
        cameraTree: { "a-cam": [9], "b-roll": [], screen: [], insert: [] },
      },
      { snapshotId, allowedClaimIds: ["claim-1"], throughlineSections: ["Hook", "Method"] },
    );
    assert.equal(mismatch.status, "fail");
    assert.ok(mismatch.issues.some((issue) => issue.code === "camera_tree_mismatch"));
  });

  test("requires_studio on-screen text fails", () => {
    const check = checkProductionBoard(
      {
        ...validBoard,
        storyboardPanels: [
          { ...validBoard.storyboardPanels[0], onScreenText: "Impressions CTR is 12 percent in Studio only." },
          validBoard.storyboardPanels[1],
        ],
      },
      {
        snapshotId,
        allowedClaimIds: ["claim-1"],
        throughlineSections: ["Hook", "Method"],
        requiresStudioClaimTexts: ["Impressions CTR is 12 percent in Studio only."],
      },
    );
    assert.ok(check.issues.some((issue) => issue.code === "studio_as_fact_onscreen"));
  });

  test("clip briefs are inferred planning cards", () => {
    const briefs = groupShotsIntoClipBriefs(validBoard);
    assert.equal(briefs.length, 3);
    assert.equal(briefs[0]?.evidenceClass, "inferred");
  });

  test("shots without claims warn and pace fills duration hints", () => {
    const check = checkProductionBoard(
      {
        ...validBoard,
        shots: validBoard.shots.map((shot) => ({ ...shot, evidenceClaimIds: [] })),
      },
      { snapshotId, allowedClaimIds: ["claim-1"], throughlineSections: ["Hook", "Method"] },
    );
    assert.equal(check.status, "warn");
    assert.ok(check.issues.some((issue) => issue.code === "shot_without_claims"));

    const annotated = annotateShotDurations(
      {
        ...validBoard,
        shots: validBoard.shots.map((shot) => ({ ...shot, durationHintSec: undefined })),
      },
      "## Hook\n" + "word ".repeat(150) + "\n## Method\n" + "word ".repeat(75),
    );
    assert.ok((annotated.shots[0]?.durationHintSec || 0) >= 1);
  });
});
