import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EvidenceClaim } from "./evidence-contracts";
import { markScriptEvidence } from "./script-evidence-overlay";

const snapshotId = "yt_snapshot_overlay_01";

const observed: EvidenceClaim = {
  id: "claim-observed",
  claim: "Three sampled videos open with a comparison question.",
  evidenceClass: "observed",
  sourceVideoIds: ["video-a"],
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

describe("script evidence overlay (L-617)", () => {
  test("marks on-promise, tangent, and unsupported sentences from the throughline graph", () => {
    const spans = markScriptEvidence({
      topic: "Compare two setup paths",
      sections: [
        { name: "Hook", paragraphs: [{ type: "dialogue", content: "Welcome to the comparison." }] },
        {
          name: "Body",
          paragraphs: [{
            type: "dialogue",
            content: "Three sampled videos open with a comparison question. We will walk through the two paths.",
          }],
        },
        {
          name: "Tangent body",
          paragraphs: [{ type: "dialogue", content: "Here is an unrelated aside about the weather." }],
        },
        {
          name: "Studio aside",
          paragraphs: [{ type: "dialogue", content: "Average view duration is above forty percent." }],
        },
      ],
      structure: [
        { section: "Hook", evidenceClaimIds: [] },
        { section: "Body", evidenceClaimIds: ["claim-observed"] },
        { section: "Tangent body", evidenceClaimIds: [] },
        { section: "Studio aside", evidenceClaimIds: ["claim-studio"] },
      ],
      evidenceClaims: [observed, studio],
    });

    const byText = new Map(spans.map((span) => [span.text, span.mark]));
    assert.equal(byText.get("Welcome to the comparison."), "on_promise");
    assert.equal(byText.get("Three sampled videos open with a comparison question."), "on_promise");
    assert.equal(byText.get("We will walk through the two paths."), "on_promise");
    assert.equal(byText.get("Here is an unrelated aside about the weather."), "tangent");
    assert.equal(byText.get("Average view duration is above forty percent."), "unsupported");
    assert.equal(spans.some((span) => span.text.includes("invented")), false);
  });

  test("does not treat a body section as on-promise when its claim id is not in the graph", () => {
    const spans = markScriptEvidence({
      topic: "Compare two setup paths",
      sections: [
        { name: "Hook", paragraphs: [{ type: "dialogue", content: "Welcome." }] },
        { name: "Body", paragraphs: [{ type: "dialogue", content: "This section cites a missing claim." }] },
      ],
      structure: [
        { section: "Hook", evidenceClaimIds: [] },
        { section: "Body", evidenceClaimIds: ["missing-invented"] },
      ],
      evidenceClaims: [observed],
    });

    const body = spans.find((span) => span.text === "This section cites a missing claim.");
    assert.equal(body?.mark, "tangent");
  });
});
