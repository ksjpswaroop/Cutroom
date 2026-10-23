import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { extractJsonText, isRecoverableJson } from "./ai/json-extract";

const parse = (raw: string) => JSON.parse(extractJsonText(raw));

describe("server/ai json extraction", () => {
  test("passes through clean JSON unchanged", () => {
    const clean = '{"ideas":[{"title":"A"}]}';
    assert.equal(extractJsonText(clean), clean);
  });

  test("unwraps a fenced json block", () => {
    assert.deepEqual(parse('```json\n{"a":1}\n```'), { a: 1 });
  });

  test("unwraps a bare fenced block", () => {
    assert.deepEqual(parse('```\n{"a":1}\n```'), { a: 1 });
  });

  test("drops conversational prose around the object", () => {
    assert.deepEqual(
      parse('Sure! Here is the JSON you asked for:\n{"a":1}\nLet me know if you need changes.'),
      { a: 1 },
    );
  });

  test("strips a reasoning block emitted before the answer", () => {
    assert.deepEqual(
      parse('<think>The user wants two ideas. I should return {"x":0} maybe.</think>\n{"a":1}'),
      { a: 1 },
    );
  });

  test("strips an unterminated reasoning block", () => {
    assert.deepEqual(parse('{"a":1}\n<think>wait, let me reconsider'), { a: 1 });
  });

  test("does not end the scan on braces inside string values", () => {
    assert.deepEqual(
      parse('{"title":"Use {curly} braces","n":2}'),
      { title: "Use {curly} braces", n: 2 },
    );
  });

  test("respects escaped quotes inside strings", () => {
    assert.deepEqual(
      parse('prefix {"q":"say \\"hi\\" now"} suffix'),
      { q: 'say "hi" now' },
    );
  });

  test("repairs a trailing comma", () => {
    assert.deepEqual(parse('{"a":1,"b":2,}'), { a: 1, b: 2 });
  });

  test("recovers a top-level array", () => {
    assert.deepEqual(parse('Here you go:\n[{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
  });

  test("closes a truncated object so partial output stays usable", () => {
    const recovered = parse('{"ideas":[{"title":"A"},{"title":"B"}');
    assert.deepEqual(recovered, { ideas: [{ title: "A" }, { title: "B" }] });
  });

  test("closes a truncation that stops inside a string", () => {
    const recovered = parse('{"title":"An unfinished head');
    assert.deepEqual(recovered, { title: "An unfinished head" });
  });

  test("combines fences, prose and a reasoning block", () => {
    const messy = [
      "<think>I will answer in JSON.</think>",
      "Certainly — here is the result:",
      "```json",
      '{"ideas":[{"title":"Espresso","angle":"Chemistry"},],}',
      "```",
      "Hope that helps!",
    ].join("\n");
    assert.deepEqual(parse(messy), { ideas: [{ title: "Espresso", angle: "Chemistry" }] });
  });

  test("returns the original text when nothing is recoverable", () => {
    assert.equal(extractJsonText("I cannot help with that."), "I cannot help with that.");
    assert.equal(isRecoverableJson("I cannot help with that."), false);
  });

  test("handles empty input without throwing", () => {
    assert.equal(extractJsonText(""), "");
    assert.equal(extractJsonText("   "), "");
    assert.equal(isRecoverableJson(""), false);
  });

  test("isRecoverableJson accepts messy but valid output", () => {
    assert.equal(isRecoverableJson('```json\n{"ok":true}\n```'), true);
  });
});
