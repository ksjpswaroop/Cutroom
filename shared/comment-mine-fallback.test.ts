import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyCommentMineFallback } from "./comment-mine-fallback";

function idea(title: string) {
  return {
    title,
    description: "A grounded package about camera setup.",
    keywords: ["camera"],
    honestPromise: "Show the setup steps.",
  };
}

describe("comment-mine fallback for cheap and local models (L-414)", () => {
  test("keeps a dropped public comment question as observed phrasing, not demand", () => {
    const result = applyCommentMineFallback({
      ideas: [idea("Compare two cages"), idea("Second package")],
    }, ["Which cage screws fit a small rig?"]);

    const combined = JSON.stringify(result.ideas);
    assert.match(combined, /Which cage screws fit a small rig\?/);
    assert.match(combined, /Observed public comment \(not demand\)/);
    assert.equal(/search volume|demand proof|algorithm/i.test(combined), false);
  });

  test("does not repeat a question the model already used", () => {
    const result = applyCommentMineFallback({
      ideas: [{
        ...idea("Which cage screws fit a small rig?"),
        description: "Which cage screws fit a small rig? Walk through the fit.",
      }],
    }, ["Which cage screws fit a small rig?"]);

    assert.equal((result.ideas[0]?.description.match(/Observed public comment/g) || []).length, 0);
  });

  test("leaves ideas unchanged when no mined questions were supplied", () => {
    const original = { ideas: [idea("Compare two cages")] };
    const result = applyCommentMineFallback(original, []);
    assert.equal(result, original);
  });
});
