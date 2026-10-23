import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EvidenceClaim } from "./evidence-contracts";
import {
  groundInsightsWithCaptions,
  localCaptionInsightInstructions,
} from "./caption-grounding";

const snapshotId = "yt_caption_ground_01";

function claim(partial: Partial<EvidenceClaim> & Pick<EvidenceClaim, "id" | "claim" | "evidenceClass">): EvidenceClaim {
  return {
    sourceVideoIds: partial.evidenceClass === "observed" ? ["video-1"] : [],
    confidence: "medium",
    limitations: ["Limited to this public snapshot."],
    snapshotId,
    ...partial,
  };
}

const baseClaims = Array.from({ length: 9 }, (_, index) => claim({
  id: `claim-${index + 1}`,
  claim: `Evidence claim ${index + 1} from metadata only.`,
  evidenceClass: index < 3 ? "observed" : index < 6 ? "inferred" : "requires_studio",
  sourceVideoIds: index < 3 ? ["video-1"] : [],
}));

describe("caption-grounded insights for cheap and local models (L-413)", () => {
  test("adds an observed claim quoting a caption the model dropped", () => {
    const excerpt = "The public caption says the cage is printed in PETG not resin.";
    const grounded = groundInsightsWithCaptions({
      evidenceClaims: baseClaims,
      methodology: { limitations: ["Missing owner-only Analytics metrics"] },
    }, [{ videoId: "video-1", text: excerpt }], snapshotId, ["video-1"]);

    const added = grounded.evidenceClaims.find((item) => item.claim.includes("PETG not resin"));
    assert.ok(added);
    assert.equal(added?.evidenceClass, "observed");
    assert.deepEqual(added?.sourceVideoIds, ["video-1"]);
    assert.equal(added?.snapshotId, snapshotId);
    assert.match(added?.limitations.join(" ") || "", /caption/i);
    assert.equal(excerpt.includes("PETG not resin"), true);
  });

  test("does not duplicate a caption the model already quoted as observed", () => {
    const excerpt = "The public caption says the cage is printed in PETG not resin.";
    const existing = claim({
      id: "claim-caption",
      claim: `Spoken on video-1: "${excerpt}"`,
      evidenceClass: "observed",
      sourceVideoIds: ["video-1"],
      confidence: "high",
    });
    const grounded = groundInsightsWithCaptions({
      evidenceClaims: [existing, ...baseClaims.slice(0, 8)],
      methodology: { limitations: ["Missing owner-only Analytics metrics"] },
    }, [{ videoId: "video-1", text: excerpt }], snapshotId, ["video-1"]);

    assert.equal(grounded.evidenceClaims.filter((item) => item.claim.includes("PETG not resin")).length, 1);
  });

  test("ignores caption excerpts for videos outside the snapshot", () => {
    const grounded = groundInsightsWithCaptions({
      evidenceClaims: baseClaims,
      methodology: { limitations: ["Missing owner-only Analytics metrics"] },
    }, [{ videoId: "other-video", text: "This transcript is not in the snapshot." }], snapshotId, ["video-1"]);

    assert.equal(grounded.evidenceClaims.length, baseClaims.length);
  });

  test("local-model instructions require quoted observed captions and forbid invented transcripts", () => {
    const instructions = localCaptionInsightInstructions([
      { videoId: "video-1", text: "Observed spoken line about battery life." },
    ]);
    assert.match(instructions, /local|cheap/i);
    assert.match(instructions, /observed/i);
    assert.match(instructions, /video-1/);
    assert.match(instructions, /Observed spoken line about battery life/);
    assert.match(instructions, /do not invent/i);

    const empty = localCaptionInsightInstructions([]);
    assert.match(empty, /do not invent/i);
  });
});
