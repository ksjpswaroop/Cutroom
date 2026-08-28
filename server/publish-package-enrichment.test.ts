import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PublishPackageOutput } from "./package-contract";
import {
  applyObservedPackageEvidence,
  applyPaceChapters,
  finalizePublishPackage,
  titleMatchesObservedSample,
} from "./publish-package-enrichment";

function samplePackage(overrides: Partial<PublishPackageOutput> = {}): PublishPackageOutput {
  return {
    titles: Array.from({ length: 5 }, (_, i) => ({
      title: i === 0 ? "Best Standing Desks for Remote Work" : `Title ${i + 1}`,
      rationale: "Model rationale.",
      evidenceClass: "inferred" as const,
    })),
    hooks: [
      { hook: "Hook one for the cold open.", rationale: "r", evidenceClass: "inferred" },
      { hook: "Hook two for the cold open.", rationale: "r", evidenceClass: "inferred" },
      { hook: "Hook three for the cold open.", rationale: "r", evidenceClass: "inferred" },
    ],
    description: "A".repeat(80),
    tags: ["cooking", "weeknight", "meal prep", "tutorial", "kitchen"],
    chapters: [{ timestamp: "0:00", title: "Only chapter" }],
    pinnedComment: "Which dinner do you want next?",
    endScreenSuggestions: ["Subscribe for next week's test"],
    measurementChecklist: [
      { metric: "Impressions CTR", why: "Validate title/thumb hypothesis", requiresStudio: true },
      { metric: "Average view duration", why: "Validate hook retention", requiresStudio: true },
      { metric: "Traffic source: Browse", why: "Check discovery surface", requiresStudio: true },
    ],
    ...overrides,
  };
}

describe("publish package enrichment", () => {
  test("titleMatchesObservedSample detects close snapshot titles", () => {
    assert.equal(
      titleMatchesObservedSample(
        "Best Standing Desks for Remote Work",
        ["Best Standing Desks for Remote Work (2024)"],
      ),
      true,
    );
    assert.equal(
      titleMatchesObservedSample("Totally different angle", ["Best Standing Desks for Remote Work"]),
      false,
    );
  });

  test("lists observed tags first and builds tagEvidence", () => {
    const enriched = applyObservedPackageEvidence(samplePackage(), {
      observedTags: ["standing desk", "remote work", "cooking"],
      observedTitleSamples: ["Best Standing Desks for Remote Work (Tested)"],
    });

    assert.equal(enriched.tags[0], "standing desk");
    assert.equal(enriched.tags[1], "remote work");
    assert.ok(enriched.tags.includes("cooking"));
    assert.equal(enriched.titles[0].evidenceClass, "observed");
    assert.equal(enriched.titles[1].evidenceClass, "inferred");
    assert.ok(enriched.tagEvidence);
    assert.equal(enriched.tagEvidence?.find((item) => item.tag === "standing desk")?.evidenceClass, "observed");
    assert.equal(enriched.tagEvidence?.find((item) => item.tag === "tutorial")?.evidenceClass, "inferred");
  });

  test("relabels falsely observed titles when snapshot samples are present", () => {
    const enriched = applyObservedPackageEvidence(samplePackage({
      titles: Array.from({ length: 5 }, (_, i) => ({
        title: `Invented Title ${i + 1}`,
        rationale: "Claimed observed.",
        evidenceClass: "observed" as const,
      })),
    }), {
      observedTitleSamples: ["Real Snapshot Title About Desks"],
    });
    assert.ok(enriched.titles.every((title) => title.evidenceClass === "inferred"));
  });

  test("replaces weak chapters using script pace when scriptContent is provided", () => {
    const script = `## Hook
${"word ".repeat(150).trim()}

## Body
${"word ".repeat(150).trim()}
`;
    const finalized = finalizePublishPackage(samplePackage(), {
      topic: "Standing desks",
      scriptContent: script,
      observedTags: ["standing desk"],
    });
    assert.equal(finalized.chapters.length, 2);
    assert.equal(finalized.chapters[0].timestamp, "0:00");
    assert.equal(finalized.chapters[1].timestamp, "1:00");
    assert.equal(finalized.tagEvidence?.[0]?.evidenceClass, "observed");
  });

  test("applyPaceChapters is a no-op without script content", () => {
    const pkg = samplePackage();
    assert.deepEqual(applyPaceChapters(pkg, null).chapters, pkg.chapters);
  });
});
