import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAiProviderUsage, parseProviderResponseId } from "./usage";

/**
 * Cutroom Pro M3 — provider usage parsing. The parser accepts the three
 * shapes providers actually return (OpenAI-compatible, Anthropic,
 * Gemini), derives a total when one is not reported, and rejects
 * malformed usage — never inventing a number, never crashing.
 */
describe("parseAiProviderUsage (Cutroom Pro M3)", () => {
  test("the already-normalised shape (AiProviderUsage) passes through unchanged", () => {
    const parsed = parseAiProviderUsage({ promptTokens: 120, completionTokens: 80, totalTokens: 200 });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.usage : null, { promptTokens: 120, completionTokens: 80, totalTokens: 200 });
  });

  test("OpenAI-compatible shape passes through as reported", () => {
    const parsed = parseAiProviderUsage({ prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.usage : null, { promptTokens: 120, completionTokens: 80, totalTokens: 200 });
  });

  test("Anthropic shape derives the total (no total reported)", () => {
    const parsed = parseAiProviderUsage({ input_tokens: 90, output_tokens: 40 });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.usage : null, { promptTokens: 90, completionTokens: 40, totalTokens: 130 });
  });

  test("Gemini shape passes through as reported", () => {
    const parsed = parseAiProviderUsage({ promptTokenCount: 50, candidatesTokenCount: 25, totalTokenCount: 75 });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.usage : null, { promptTokens: 50, completionTokens: 25, totalTokens: 75 });
  });

  test("no usage at all is 'not reported', not an error", () => {
    assert.deepEqual(parseAiProviderUsage(undefined), { ok: true, usage: undefined });
    assert.deepEqual(parseAiProviderUsage(null), { ok: true, usage: undefined });
  });

  test("malformed usage is rejected, never repaired: negative, float, string, missing count", () => {
    for (const bad of [
      { prompt_tokens: -1, completion_tokens: 10, total_tokens: 9 },
      { prompt_tokens: 10.5, completion_tokens: 10 },
      { prompt_tokens: "120", completion_tokens: 80 },
      { completion_tokens: 80 },
      { prompt_tokens: 120 },
      { prompt_tokens: 120, completion_tokens: 80, total_tokens: -5 },
      "120 tokens",
      [120, 80],
    ]) {
      const parsed = parseAiProviderUsage(bad);
      assert.equal(parsed.ok, false, `expected rejection for ${JSON.stringify(bad)}`);
    }
  });
});

describe("parseProviderResponseId (Cutroom Pro M3)", () => {
  test("a non-empty string passes through; anything else is 'not reported'", () => {
    assert.equal(parseProviderResponseId("resp-abc123"), "resp-abc123");
    assert.equal(parseProviderResponseId(""), undefined);
    assert.equal(parseProviderResponseId("   "), undefined);
    assert.equal(parseProviderResponseId(undefined), undefined);
    assert.equal(parseProviderResponseId(42), undefined);
  });
});
