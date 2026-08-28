import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clipBriefsFromScript } from "./clip-briefs";

describe("clip-briefs", () => {
  test("builds inferred briefs from markdown sections", () => {
    const script = `## HOOK
Standing desks fail after six months of daily use for many remote workers who skip maintenance.

## BODY
Frame quality and motors matter more than gimmicks when you compare lasting desks.

## CTA
Buy once with a warranty you can actually use.
`;
    const briefs = clipBriefsFromScript(script);
    assert.ok(briefs.length >= 2);
    assert.equal(briefs[0]?.evidenceClass, "inferred");
    assert.ok((briefs[0]?.estimatedSec ?? 0) >= 15);
  });

  test("returns empty for tiny scripts", () => {
    assert.deepEqual(clipBriefsFromScript("Hi"), []);
    assert.deepEqual(clipBriefsFromScript("one two three"), []);
  });
});
