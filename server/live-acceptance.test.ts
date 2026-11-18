import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { stubClaims, stubPackaging, stubScript } from "@shared/agents";
import { STUB_LABEL } from "@shared/live-acceptance";
import { getLiveAcceptanceRun, listLiveAcceptanceRuns, runLiveAcceptance } from "./live-acceptance";
import { writePreferences } from "./preferences";
import type { AiTextProvider } from "./ai/types";

const appDataRoot = await mkdtemp(path.join(tmpdir(), "live-acceptance-test-appdata-"));
process.env.CUTROOM_APP_DATA = appDataRoot;

const topic = "How to sharpen a kitchen knife";
const snapshotId = "snap-test-01";
const videos = [
  { id: "vid-1", title: "Knife part 1", channelTitle: "Test channel" },
  { id: "vid-2", title: "Knife part 2", channelTitle: "Test channel" },
  { id: "vid-3", title: "Knife part 3", channelTitle: "Test channel" },
];
const claims = stubClaims(snapshotId, videos);
const script = stubScript(topic, claims);

/** A fake live provider that returns valid agent JSON, with usage + a response id. */
function reportingProvider(): AiTextProvider {
  return {
    id: "gemini",
    async completeJson({ prompt }: { prompt: string }) {
      const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      if (prompt.includes("Insight Auditor")) {
        return { text: JSON.stringify({ claims }), providerId: "gemini", model: "fake-gemini", usage, responseId: "resp-auditor-1" };
      }
      if (prompt.includes("Scriptwriter")) {
        return { text: JSON.stringify(script), providerId: "gemini", model: "fake-gemini", usage, responseId: "resp-script-1" };
      }
      return { text: JSON.stringify(stubPackaging(script)), providerId: "gemini", model: "fake-gemini", usage, responseId: "resp-pack-1" };
    },
  };
}

/** A fake live provider that returns malformed usage — the harness must not crash or invent numbers. */
function malformedUsageProvider(): AiTextProvider {
  const base = reportingProvider();
  return {
    id: "gemini",
    async completeJson(request: { prompt: string }) {
      const result = await base.completeJson(request);
      return { ...result, usage: { promptTokens: -5, completionTokens: 10, totalTokens: 5 } as never };
    },
  };
}

describe("live-acceptance harness (Cutroom Pro M3)", () => {
  test("stub run: live=false, stub label everywhere, all 5 checks pass, persisted + reloaded", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const run = await runLiveAcceptance(
      { topic, snapshotId, videos },
      { mode: "stub", keyFingerprint: null, spendCapUsd: 0 },
    );
    assert.equal(run.live, false);
    assert.equal(run.label, STUB_LABEL);
    assert.equal(run.status, "pass");
    assert.equal(run.keyFingerprint, null);
    assert.deepEqual(run.checks.map((c) => c.id), ["researcher", "agent-chain", "orchestrator-plan", "qa-gate", "ledger-vs-usage"]);
    assert.ok(run.checks.every((c) => c.status === "pass"));
    assert.ok(run.checks.every((c) => c.usage === null), "stub run reports no usage anywhere");
    assert.ok(run.agentRunId);
    const reloaded = await getLiveAcceptanceRun(run.runId);
    assert.equal(reloaded?.runId, run.runId);
    assert.equal(reloaded?.live, false);
    assert.ok((await listLiveAcceptanceRuns()).some((r) => r.runId === run.runId));
  });

  test("live run with a usage-reporting provider: usage flows into the ledger and the checks", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const run = await runLiveAcceptance(
      { topic, snapshotId, videos },
      { mode: "live", keyFingerprint: "1234", spendCapUsd: 5, textProviderOverride: reportingProvider() },
    );
    assert.equal(run.live, true);
    assert.equal(run.status, "pass");
    assert.equal(run.keyFingerprint, "1234");
    assert.equal(run.model, "fake-gemini");
    const chain = run.checks.find((c) => c.id === "agent-chain");
    assert.equal(chain?.status, "pass");
    assert.deepEqual(chain?.usage, { promptTokens: 300, completionTokens: 150, totalTokens: 450 });
    assert.equal(chain?.providerResponseId, "resp-pack-1");
    // The three chain entries carry the reported tokens; the Researcher
    // (no provider call) still records tokens as null, so the run total
    // stays "not reported" by the M2 ledger rule — the check compares
    // the chain entries, not the poisoned total.
    const chainTokens = run.ledger.entries
      .filter((e) => ["auditor", "scriptwriter", "packaging"].includes(e.agent))
      .reduce((n, e) => n + (e.tokens ?? 0), 0);
    assert.equal(chainTokens, 450);
    assert.equal(run.ledger.totals.tokens, null);
    const ledgerCheck = run.checks.find((c) => c.id === "ledger-vs-usage");
    assert.equal(ledgerCheck?.status, "pass");
    assert.match(ledgerCheck?.detail ?? "", /match the provider-reported total 450/);
  });

  test("live run with a provider returning malformed usage: no crash, no invented numbers, usage not reported", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const run = await runLiveAcceptance(
      { topic, snapshotId, videos },
      { mode: "live", keyFingerprint: "1234", spendCapUsd: 5, textProviderOverride: malformedUsageProvider() },
    );
    assert.equal(run.status, "pass");
    const chain = run.checks.find((c) => c.id === "agent-chain");
    assert.equal(chain?.status, "pass");
    assert.equal(chain?.usage, null);
    assert.equal(run.ledger.totals.tokens, null);
    assert.equal(run.ledger.totals.tokensUnknown, true);
    const ledgerCheck = run.checks.find((c) => c.id === "ledger-vs-usage");
    assert.equal(ledgerCheck?.status, "pass");
    assert.match(ledgerCheck?.detail ?? "", /not reported by provider/);
  });
});
