import assert from "node:assert/strict";
import test from "node:test";
import {
  productionBriefOutputSchema,
  publishPackageOutputSchema,
  publishPackageRequestSchema,
  thumbnailCritiqueOutputSchema,
} from "./package-contract";

const sampleIdea = {
  title: "Home cooking under 20 minutes",
  description: "A practical weeknight cooking format grounded in the snapshot.",
  keywords: ["weeknight", "fast meals"],
  format: "Tutorial" as const,
  difficulty: "Easy" as const,
  honestPromise: "Show three public patterns for fast meal videos.",
  discoverySurface: "search" as const,
  payoff: "Viewers leave with a repeatable dinner plan.",
  thumbnailConcept: "Creator + plated meal, high contrast.",
  studioMetric: "Validate CTR and average view duration in Studio.",
  experimentRule: "Ship one variant, keep thumbnail constant.",
  evidenceClaims: [{
    id: "claim-1",
    claim: "Top sample videos emphasize speed in titles.",
    evidenceClass: "observed" as const,
    sourceVideoIds: ["vid1"],
    confidence: "medium" as const,
    limitations: ["Public titles only"],
    snapshotId: "snap-12345678",
  }],
};

test("publish package request requires a topic", () => {
  assert.equal(publishPackageRequestSchema.safeParse({}).success, false);
  assert.equal(publishPackageRequestSchema.safeParse({ topic: "Weeknight cooking" }).success, true);
  assert.equal(publishPackageRequestSchema.safeParse({
    topic: "Weeknight cooking",
    selectedIdea: sampleIdea,
  }).success, true);
  assert.equal(publishPackageRequestSchema.safeParse({
    topic: "Weeknight cooking",
    selectedIdea: null,
    scriptContent: null,
    evidenceContext: null,
  }).success, true);
  assert.equal(publishPackageRequestSchema.safeParse({
    topic: "Weeknight cooking",
    observedTags: ["weeknight meals", "meal prep"],
    observedTitleSamples: ["20 Minute Weeknight Dinners"],
  }).success, true);
});

test("publish package output keeps evidence classes and Studio checklist", () => {
  const parsed = publishPackageOutputSchema.parse({
    titles: Array.from({ length: 5 }, (_, i) => ({
      title: `Title ${i + 1}`,
      rationale: "Observed keyword clustering in the sample.",
      evidenceClass: i === 0 ? "observed" : "inferred",
    })),
    hooks: [
      { hook: "Stop scrolling if dinner feels impossible.", rationale: "Inferred cold-open pattern.", evidenceClass: "inferred" },
      { hook: "Three public patterns from this week's sample.", rationale: "Observed framing.", evidenceClass: "observed" },
      { hook: "One plate, twenty minutes, no fake volume claims.", rationale: "Honest promise.", evidenceClass: "inferred" },
    ],
    description: "A".repeat(80),
    tags: ["cooking", "weeknight", "meal prep", "tutorial", "kitchen"],
    tagEvidence: [
      { tag: "cooking", evidenceClass: "observed" },
      { tag: "weeknight", evidenceClass: "observed" },
      { tag: "meal prep", evidenceClass: "inferred" },
      { tag: "tutorial", evidenceClass: "inferred" },
      { tag: "kitchen", evidenceClass: "inferred" },
    ],
    chapters: [{ timestamp: "0:00", title: "Hook" }, { timestamp: "0:45", title: "Method" }],
    pinnedComment: "Which dinner do you want next?",
    endScreenSuggestions: ["Subscribe for next week's test"],
    measurementChecklist: [
      { metric: "Impressions CTR", why: "Validate title/thumb hypothesis", requiresStudio: true },
      { metric: "Average view duration", why: "Validate hook retention", requiresStudio: true },
      { metric: "Traffic source: Browse", why: "Check discovery surface", requiresStudio: true },
    ],
  });
  assert.equal(parsed.titles.length, 5);
  assert.equal(parsed.tagEvidence?.[0]?.evidenceClass, "observed");
  assert.equal(parsed.measurementChecklist.every((item) => item.requiresStudio), true);
});

test("production brief and thumbnail critique schemas reject empty payloads", () => {
  assert.equal(productionBriefOutputSchema.safeParse({}).success, false);
  assert.equal(thumbnailCritiqueOutputSchema.safeParse({}).success, false);
  assert.equal(thumbnailCritiqueOutputSchema.safeParse({
    scores: { textReadability: 7, subjectFocus: 8, contrast: 6, clutter: 5 },
    findings: ["Text may be small on mobile.", "Subject is clear."],
    variationDirections: [
      { label: "Bigger text", direction: "Increase main text size and reduce background detail." },
      { label: "Closer crop", direction: "Tighten face/plate crop for mobile." },
      { label: "Higher contrast", direction: "Darken background behind text." },
    ],
  }).success, true);
});
