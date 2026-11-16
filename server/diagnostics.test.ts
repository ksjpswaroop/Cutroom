import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  buildDiagnosticBundle,
  diagnosticFileName,
  recordDiagnostic,
  redactDiagnosticText,
  resetDiagnostics,
  serializeDiagnosticBundle,
} from "./diagnostics";

describe("redactDiagnosticText", () => {
  test("removes Google API keys (YouTube / Gemini)", () => {
    const out = redactDiagnosticText("using key AIzaSyA1234567890abcdefghijklmnopqrstuv now");
    assert.doesNotMatch(out, /AIzaSy/);
    assert.match(out, /\[redacted-key\]/);
  });

  test("removes OpenAI-style and bearer secrets", () => {
    assert.doesNotMatch(redactDiagnosticText("sk-abcdEFGH1234567890zzzz"), /sk-abcd/);
    assert.match(redactDiagnosticText("Authorization: Bearer abc.def.ghi123"), /Bearer \[redacted-token\]/);
  });

  test("redacts KEY=value assignments for sensitive names", () => {
    const out = redactDiagnosticText('GEMINI_API_KEY="super-secret-value-123"');
    assert.doesNotMatch(out, /super-secret-value-123/);
    assert.match(out, /GEMINI_API_KEY=\[redacted\]/);
  });

  test("removes email addresses", () => {
    const out = redactDiagnosticText("owner creator@example.com reported a bug");
    assert.doesNotMatch(out, /creator@example\.com/);
    assert.match(out, /\[redacted-email\]/);
  });

  test("leaves ordinary diagnostic text intact", () => {
    const line = "GET /api/research/search 200 in 412ms";
    assert.equal(redactDiagnosticText(line), line);
  });
});

describe("buildDiagnosticBundle", () => {
  beforeEach(() => resetDiagnostics());

  test("recorded events are stored redacted and never carry a key", async () => {
    recordDiagnostic("loaded with GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", "process");
    const bundle = await buildDiagnosticBundle();
    const blob = JSON.stringify(bundle);
    assert.doesNotMatch(blob, /AIzaSy/);
    assert.ok(bundle.recentEvents.some((event) => event.includes("[redacted")));
  });

  test("exposes provider presence as booleans/names only, no values", async () => {
    const bundle = await buildDiagnosticBundle();
    assert.equal(typeof bundle.providers.youtubeKeyPresent, "boolean");
    assert.equal(typeof bundle.providers.geminiKeyPresent, "boolean");
    // No nested objects or arrays smuggled into providers.
    for (const value of Object.values(bundle.providers)) {
      assert.ok(value === null || ["boolean", "string"].includes(typeof value));
    }
  });

  test("carries the no-telemetry notice and runtime identity", async () => {
    const bundle = await buildDiagnosticBundle();
    assert.equal(bundle.app.name, "Cutroom");
    assert.match(bundle.notice, /no telemetry/i);
    assert.equal(bundle.runtime.node, process.version);
  });

  test("serialized bundle is newline-terminated JSON", async () => {
    const serialized = serializeDiagnosticBundle(await buildDiagnosticBundle());
    assert.ok(serialized.endsWith("\n"));
    assert.doesNotThrow(() => JSON.parse(serialized));
  });

  test("file name is filesystem-safe and scoped to cutroom", () => {
    const name = diagnosticFileName(new Date("2026-11-15T12:34:56.000Z"));
    assert.match(name, /^cutroom-diagnostics-[\w-]+\.json$/);
    assert.doesNotMatch(name, /[:]/);
  });
});
