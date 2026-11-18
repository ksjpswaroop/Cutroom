import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  LIVE_LABEL,
  STUB_LABEL,
  keyFingerprint,
  liveAcceptanceLabel,
  liveAcceptanceRunSchema,
} from "./live-acceptance";

/**
 * Cutroom Pro M3 — live-acceptance record shape. A stub run is labelled
 * "stub — not a live result" everywhere, and no key is ever stored —
 * only its last 4 characters.
 */
describe("live-acceptance record (Cutroom Pro M3)", () => {
  test("stub and live labels are distinct and the stub label says what it is", () => {
    assert.equal(liveAcceptanceLabel(false), STUB_LABEL);
    assert.equal(liveAcceptanceLabel(true), LIVE_LABEL);
    assert.match(STUB_LABEL, /not a live result/);
  });

  test("key fingerprint is the last 4 characters only; short keys have none", () => {
    assert.equal(keyFingerprint("sk-abcdef1234"), "1234");
    assert.equal(keyFingerprint("  sk-abcdef1234  "), "1234");
    assert.equal(keyFingerprint("abc"), null);
    assert.equal(keyFingerprint(undefined), null);
    assert.equal(keyFingerprint(""), null);
  });

  test("a stub run record validates, and a live run without a fingerprint is rejected", () => {
    const base = {
      runId: "acc-test-01",
      label: STUB_LABEL,
      provider: "stub",
      model: null,
      keyFingerprint: null,
      topic: "How to sharpen a kitchen knife",
      snapshotId: null,
      spendCapUsd: 0,
      agentRunId: "agt-test-01",
      checks: [{
        id: "researcher",
        label: "Researcher — end to end on the supplied snapshot",
        status: "pass",
        latencyMs: null,
        providerResponseId: null,
        usage: null,
        detail: "Researcher ok.",
      }],
      status: "pass",
      ledger: { entries: [], totals: { tokens: 0, tokensUnknown: false, quotaUnits: 0, costUsd: 0, costUnknown: false } },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 10,
    };
    assert.equal(liveAcceptanceRunSchema.parse({ ...base, live: false }).live, false);
    // A live run must carry a 4-char fingerprint — a full key or a
    // missing fingerprint never validates.
    assert.equal(liveAcceptanceRunSchema.parse({ ...base, live: true, label: LIVE_LABEL, keyFingerprint: "1234" }).live, true);
    assert.throws(() => liveAcceptanceRunSchema.parse({ ...base, live: true, label: LIVE_LABEL, keyFingerprint: "sk-abcdef1234" }));
    assert.throws(() => liveAcceptanceRunSchema.parse({ ...base, live: true, label: LIVE_LABEL, keyFingerprint: null }));
  });
});
