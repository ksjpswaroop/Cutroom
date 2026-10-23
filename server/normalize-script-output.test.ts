import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scriptGenerationOutputSchema } from "@shared/evidence-contracts";
import { normalizeScriptOutput } from "./normalize-script-output";

/** A payload that already satisfies the schema. */
function validPayload() {
  return {
    titles: ["One", "Two", "Three"],
    hook: "A hook.",
    structure: [
      { section: "Intro", purpose: "Set up the problem", evidenceClaimIds: [] },
      { section: "Body", purpose: "Explain the fix", evidenceClaimIds: [] },
    ],
    script: "Body text.",
    payoff: "The payoff.",
    primaryCta: "Subscribe.",
    studioValidation: "ok",
  };
}

const parses = (value: unknown) => scriptGenerationOutputSchema.safeParse(normalizeScriptOutput(value)).success;

describe("normalizeScriptOutput", () => {
  test("leaves already-valid output untouched", () => {
    const payload = validPayload();
    assert.deepEqual(normalizeScriptOutput(payload), payload);
    assert.equal(parses(payload), true);
  });

  test("joins a script returned as an array of paragraphs", () => {
    const payload = { ...validPayload(), script: ["First para.", "Second para."] };
    const result = normalizeScriptOutput(payload) as any;
    assert.equal(result.script, "First para.\n\nSecond para.");
    assert.equal(parses(payload), true);
  });

  test("wraps structure entries returned as bare strings", () => {
    const payload = { ...validPayload(), structure: ["Intro", "Body"] };
    const result = normalizeScriptOutput(payload) as any;
    assert.deepEqual(result.structure[0], { section: "Intro", purpose: "Intro", evidenceClaimIds: [] });
    assert.equal(parses(payload), true);
  });

  test("maps heading/content aliases onto section/purpose", () => {
    const payload = {
      ...validPayload(),
      structure: [
        { heading: "Intro", content: "Set up" },
        { title: "Body", description: "Explain" },
      ],
    };
    const result = normalizeScriptOutput(payload) as any;
    assert.deepEqual(result.structure[0], { section: "Intro", purpose: "Set up", evidenceClaimIds: [] });
    assert.deepEqual(result.structure[1], { section: "Body", purpose: "Explain", evidenceClaimIds: [] });
    assert.equal(parses(payload), true);
  });

  test("drops extra keys that the strict structure schema would reject", () => {
    const payload = {
      ...validPayload(),
      structure: [
        { section: "Intro", purpose: "Set up", evidenceClaimIds: [], durationSeconds: 30, notes: "x" },
        { section: "Body", purpose: "Explain", evidenceClaimIds: [] },
      ],
    };
    const result = normalizeScriptOutput(payload) as any;
    assert.deepEqual(Object.keys(result.structure[0]).sort(), ["evidenceClaimIds", "purpose", "section"]);
    assert.equal(parses(payload), true);
  });

  test("stringifies a studioValidation object", () => {
    const payload = { ...validPayload(), studioValidation: { status: "passed", note: "meets rules" } };
    const result = normalizeScriptOutput(payload) as any;
    assert.equal(typeof result.studioValidation, "string");
    assert.match(result.studioValidation, /status: passed/);
    assert.equal(parses(payload), true);
  });

  test("flattens titles returned as objects and trims a surplus", () => {
    const payload = {
      ...validPayload(),
      titles: [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }],
    };
    const result = normalizeScriptOutput(payload) as any;
    assert.deepEqual(result.titles, ["A", "B", "C"]);
    assert.equal(parses(payload), true);
  });

  test("unwraps a payload wrapped in a single-element array", () => {
    assert.equal(parses([validPayload()]), true);
  });

  test("keeps string-typed evidence claim ids and discards non-strings", () => {
    const payload = {
      ...validPayload(),
      structure: [
        { section: "Intro", purpose: "Set up", evidenceClaimIds: ["c1", 7, "c2"] },
        { section: "Body", purpose: "Explain", evidenceClaimIds: "not-an-array" },
      ],
    };
    const result = normalizeScriptOutput(payload) as any;
    assert.deepEqual(result.structure[0].evidenceClaimIds, ["c1", "c2"]);
    assert.deepEqual(result.structure[1].evidenceClaimIds, []);
    assert.equal(parses(payload), true);
  });

  test("states the absence when studioValidation is null", () => {
    const payload = { ...validPayload(), studioValidation: null };
    const result = normalizeScriptOutput(payload) as any;
    assert.equal(result.studioValidation, "Not reported.");
    assert.equal(parses(payload), true);
  });

  test("states the absence when studioValidation is blank or missing", () => {
    assert.equal((normalizeScriptOutput({ ...validPayload(), studioValidation: "   " }) as any).studioValidation, "Not reported.");
    const { studioValidation, ...without } = validPayload();
    assert.equal((normalizeScriptOutput(without) as any).studioValidation, "Not reported.");
  });

  test("a null hook is still rejected rather than defaulted", () => {
    // Substantive content must not be papered over the way metadata is.
    assert.equal(parses({ ...validPayload(), hook: null }), false);
    assert.equal(parses({ ...validPayload(), script: null }), false);
  });

  test("does not invent titles when too few are returned", () => {
    // Padding would fabricate content, so this must still fail validation.
    assert.equal(parses({ ...validPayload(), titles: ["Only one"] }), false);
  });

  test("does not rescue genuinely missing fields", () => {
    const { script, ...withoutScript } = validPayload();
    assert.equal(parses(withoutScript), false);
  });

  test("passes through non-object input unchanged", () => {
    assert.equal(normalizeScriptOutput("nope"), "nope");
    assert.equal(normalizeScriptOutput(null), null);
  });

  test("truncates an over-long section heading to the schema bound", () => {
    const long = "x".repeat(400);
    const payload = { ...validPayload(), structure: [long, "Body"] };
    const result = normalizeScriptOutput(payload) as any;
    assert.equal(result.structure[0].section.length, 120);
    assert.equal(parses(payload), true);
  });
});
