import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { formatSchemaIssues } from "./schema-issues";

function issuesFor(schema: z.ZodTypeAny, value: unknown): z.ZodError {
  const result = schema.safeParse(value);
  assert.equal(result.success, false);
  return (result as { success: false; error: z.ZodError }).error;
}

describe("formatSchemaIssues", () => {
  test("includes the field path so a repair prompt can act on it", () => {
    const schema = z.object({ script: z.string().max(10) });
    const formatted = formatSchemaIssues(issuesFor(schema, { script: "far too long to fit" }));
    assert.match(formatted, /^script: /);
    assert.match(formatted, /at most 10/);
  });

  test("renders nested array paths", () => {
    const schema = z.object({
      structure: z.array(z.object({ content: z.string().max(5) })),
    });
    const formatted = formatSchemaIssues(
      issuesFor(schema, { structure: [{ content: "ok" }, { content: "much too long" }] }),
    );
    assert.match(formatted, /structure\.1\.content/);
  });

  test("joins several issues and caps the list", () => {
    const schema = z.object({
      a: z.string(), b: z.string(), c: z.string(), d: z.string(),
    });
    const formatted = formatSchemaIssues(issuesFor(schema, {}));
    assert.equal(formatted.split(";").length, 3);
    assert.match(formatted, /and 1 more/);
  });

  test("respects a custom limit", () => {
    const schema = z.object({ a: z.string(), b: z.string() });
    const formatted = formatSchemaIssues(issuesFor(schema, {}), 1);
    assert.match(formatted, /and 1 more/);
    assert.ok(!formatted.includes(";"), formatted);
  });

  test("falls back for a root-level issue with no path", () => {
    const formatted = formatSchemaIssues(issuesFor(z.string(), 42));
    assert.ok(formatted.length > 0);
    assert.ok(!formatted.startsWith(":"), formatted);
  });
});
