import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { proRegistry } from "./pro-commands";
import { writePreferences } from "./preferences";
import { runAssembly } from "./assembler";
import { DryRunTransport } from "./assembler-transport";
import { runAgents, getAgentReceipt, aggregateLedger } from "./orchestrator";
import { runQaChecks } from "@shared/qa";
import { stubClaims, stubSnapshotVideos } from "@shared/agents";
import { readAgentMemory, writeAgentMemory, deleteAgentMemory } from "./agent-memory";

const appDataRoot = await mkdtemp(path.join(tmpdir(), "agents-test-appdata-"));
process.env.CUTROOM_APP_DATA = appDataRoot;

const board = productionBoardOutputSchema.parse({
  snapshotId: "snap-run01",
  characters: [{ id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const }],
  storyboardPanels: [
    { id: "p1", section: "Hook", visual: "Timer", onScreenText: "First clip: the sunset.", evidenceClaimIds: ["stub-claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-run01" },
    { id: "p2", section: "Method", visual: "Steps", onScreenText: "Second clip: the aurora.", evidenceClaimIds: ["stub-claim-4"], evidenceClass: "inferred" as const, snapshotId: "snap-run01" },
    { id: "p3", section: "Close", visual: "Night", evidenceClaimIds: ["stub-claim-7"], evidenceClass: "requires_studio" as const, snapshotId: "snap-run01" },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["stub-claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["stub-claim-4"], evidenceClass: "inferred" as const },
    { panelId: "p3", shot: "Screen recipe", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["stub-claim-7"], evidenceClass: "requires_studio" as const },
  ],
});

const topic = "How to sharpen a kitchen knife";

describe("Agent team — stub run end to end (Cutroom Pro M2)", () => {
  test("one topic → plan → approved run: all four agents + QA + assembler (dry-run), receipts + ledger", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const plan = (await proRegistry.dispatch("agents.plan", { topic, board, provider: "stub", spendCapUsd: 0 })) as { steps: Array<{ agent: string }> };
    assert.deepEqual(plan.steps.map((s) => s.agent), ["researcher", "auditor", "scriptwriter", "packaging", "qa", "assembler"]);

    const receipt = await runAgents(
      { topic, board, provider: "stub", spendCapUsd: 0 },
      { transport: "dry-run" },
    );
    assert.equal(receipt.status, "ok", JSON.stringify(receipt, null, 2).slice(0, 2_000));
    assert.equal(receipt.receipts.length, 6);
    assert.deepEqual(receipt.receipts.map((r) => r.agent), ["researcher", "auditor", "scriptwriter", "packaging", "qa", "assembler"]);
    assert.ok(receipt.receipts.every((r) => r.status === "ok"));
    // Every agent action went through the registry: audit entries exist for the agent commands.
    const audit = proRegistry.auditLog().filter((e) => e.command.startsWith("agents."));
    assert.ok(audit.length >= 5, `expected agent audit entries, got ${audit.length}`);
    // QA passed; the receipt says so.
    assert.equal(receipt.qa?.status, "pass");
    // Ledger: stub costs, quota from the researcher, tokens never invented.
    // Every step — including QA and the assembler — has a cost entry.
    assert.equal(receipt.ledger.entries.length, 6);
    assert.deepEqual(receipt.ledger.entries.map((e) => e.agent), ["researcher", "auditor", "scriptwriter", "packaging", "qa", "assembler"]);
    assert.equal(receipt.ledger.totals.quotaUnits, 100);
    assert.equal(receipt.ledger.totals.costUsd, 0);
    assert.equal(receipt.ledger.totals.tokens, null);
    assert.equal(receipt.ledger.totals.tokensUnknown, true);
    // Assembler ran in dry-run and produced a receipt id.
    assert.ok(receipt.assemblerReceiptId);
    assert.equal(receipt.assemblerReceipt?.transport.kind, "dry-run");
    // Handoffs carry claims with evidence pointers.
    const auditorHandoff = receipt.handoffs.auditor;
    assert.ok(auditorHandoff);
    assert.equal(auditorHandoff.claims.length, 9);
    assert.ok(auditorHandoff.claims.every((c) => c.evidencePointer?.videoId));
    // The receipt persisted and reloads from disk.
    const reloaded = await getAgentReceipt(receipt.runId);
    assert.equal(reloaded?.runId, receipt.runId);
    assert.equal(reloaded?.status, "ok");
    // Aggregate ledger sees this run.
    const ledger = await aggregateLedger();
    assert.ok(ledger.totals.quotaUnits >= 100);
  });

  test("QA Fail blocks the assembler and pauses the run as needs-human", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const badBoard = productionBoardOutputSchema.parse({
      ...board,
      storyboardPanels: board.storyboardPanels.map((panel, i) => (i === 0 ? { ...panel, section: "Invented Section" } : panel)),
    });
    const receipt = await runAgents(
      { topic, board: badBoard, provider: "stub", spendCapUsd: 0 },
      { transport: "dry-run" },
    );
    assert.equal(receipt.status, "needs-human");
    assert.equal(receipt.qa?.status, "fail");
    assert.equal(receipt.assemblerReceipt, null);
    assert.equal(receipt.escalation?.reason, "qa-fail");
  });

  test("assembler.run with a failing QA report returns a blocked receipt (409 at the route)", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const { snapshotId, videos } = stubSnapshotVideos(topic);
    const claims = stubClaims(snapshotId, videos);
    const qa = runQaChecks({
      board,
      throughlineSections: ["Hook"],
      scriptLines: [],
      claims,
      packagingVariants: [],
    });
    assert.equal(qa.status, "fail");
    const blocked = await runAssembly(
      { board, options: { demoMedia: true }, qaReport: qa },
      { transportOverride: new DryRunTransport(), proEnabled: true },
    );
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.qa?.status, "fail");
    assert.equal(blocked.export.path, null);
    assert.ok(blocked.steps.every((s) => s.status === "not-run"));
  });

  test("a no-spend failure is retried once and then succeeds", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const receipt = await runAgents(
      { topic, provider: "stub", spendCapUsd: 0 },
      { failOnce: { auditor: true } },
    );
    assert.equal(receipt.status, "partial"); // no Board supplied, so the assembler step is skipped by design
    const auditor = receipt.receipts.find((r) => r.agent === "auditor");
    assert.equal(auditor?.status, "ok");
    assert.equal(auditor?.attempts, 2);
  });

  test("spend cap $0 pauses a live run before any provider call", async () => {
    await writePreferences({ cutroomProEnabled: true });
    let calls = 0;
    const fakeProvider = {
      id: "gemini" as const,
      async completeJson() {
        calls += 1;
        return { text: "{}", providerId: "gemini" as const, model: "fake" };
      },
    };
    const receipt = await runAgents(
      { topic, provider: "live", spendCapUsd: 0 },
      { textProviderOverride: fakeProvider },
    );
    assert.equal(receipt.status, "needs-human");
    assert.equal(receipt.escalation?.reason, "spend-cap");
    assert.equal(calls, 0);
  });

  test("agent commands are Pro-gated (403-equivalent: disabled when Pro is off)", async () => {
    await writePreferences({ cutroomProEnabled: false });
    await assert.rejects(
      () => proRegistry.dispatch("agents.plan", { topic, provider: "stub", spendCapUsd: 0 }),
      /disabled/i,
    );
    await writePreferences({ cutroomProEnabled: true });
  });
});

describe("Agent memory (Cutroom Pro M2)", () => {
  test("read / write / delete round-trip; missing memory is empty, not an error", async () => {
    const projectId = "proj-memory-test";
    assert.deepEqual(await readAgentMemory(projectId), { projectId, channelFormatDna: [], packagingOutcomes: [], premiseNotes: [] });
    const saved = await writeAgentMemory({
      projectId,
      channelFormatDna: ["timed walkthrough, host on camera"],
      packagingOutcomes: ["title variant A won in Studio"],
      premiseNotes: ["premise held: retention past the opening"],
    });
    assert.equal(saved.channelFormatDna.length, 1);
    assert.deepEqual((await readAgentMemory(projectId)).premiseNotes, ["premise held: retention past the opening"]);
    assert.equal(await deleteAgentMemory(projectId), true);
    assert.equal(await deleteAgentMemory(projectId), false);
    assert.deepEqual((await readAgentMemory(projectId)).channelFormatDna, []);
  });
});
