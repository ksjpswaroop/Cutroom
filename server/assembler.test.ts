import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { DryRunTransport } from "./assembler-transport";
import { getReceipt, listReceipts, runAssembly } from "./assembler";
import { writePreferences } from "./preferences";
import { proRegistry } from "./pro-commands";

// Isolate preferences + receipts: CUTROOM_APP_DATA is read per call by
// getEnvFilePaths(), so a fresh tmp root keeps these tests off the real
// preferences.json and off any other test file's state.
const appDataRoot = await mkdtemp(path.join(tmpdir(), "assembler-test-appdata-"));
process.env.CUTROOM_APP_DATA = appDataRoot;

const board = productionBoardOutputSchema.parse({
  snapshotId: "snap-run01",
  characters: [{ id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const }],
  storyboardPanels: [
    { id: "p1", section: "Hook", visual: "Timer", onScreenText: "First clip: the sunset.", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-run01" },
    { id: "p2", section: "Method", visual: "Steps", onScreenText: "Second clip: the aurora.", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-run01" },
    { id: "p3", section: "Close", visual: "Night", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-run01" },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p3", shot: "Screen recipe", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
  ],
});

describe("Assembler run — dry run receipt (Cutroom Pro M1)", () => {
  test("dry-run receipt: every step via the registry, honest about what did not happen", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const receipt = await runAssembly(
      { board, options: { demoMedia: true, exportWidth: 640, exportHeight: 360 } },
      { transportOverride: new DryRunTransport(), proEnabled: true },
    );
    assert.equal(receipt.status, "ok");
    assert.equal(receipt.transport.kind, "dry-run");
    assert.equal(receipt.transport.dryRun, true);
    assert.match(receipt.transport.dryRunReason || "", /Dry run/);
    assert.equal(receipt.transport.version, null);
    assert.equal(receipt.export.path, null);
    assert.match(receipt.export.note, /dry run/i);
    assert.equal(receipt.export.bytes, null);
    assert.equal(receipt.loudness.measured, false);
    assert.match(receipt.loudness.reason, /no loudness-meter command/);
    assert.deepEqual(receipt.cost, { amount: 0, currency: "USD", note: "Local filmcraft-cli only; no provider spend." });
    // Captions: 2 cues from on-screen text, third shot captionless.
    assert.equal(receipt.captions.cues, 2);
    assert.deepEqual(receipt.captions.captionless, ["Screen recipe"]);
    // Ducking: planned keyframes are in the receipt; the dry run returns none from a CLI.
    assert.equal(receipt.ducking.applied, true);
    assert.equal(receipt.ducking.reduceDb, -12);
    assert.equal(receipt.ducking.plannedKeyframes.length, 4);
    assert.equal(receipt.ducking.cliKeyframesReturned, 0);
    // Every non-skipped step went through the registry: audit entries match the steps.
    const executed = receipt.steps.filter((step) => step.status === "ok");
    assert.equal(executed.length, receipt.audit.length);
    assert.ok(receipt.audit.every((entry) => entry.ok));
    assert.ok(receipt.steps.every((step) => step.dryRun));
    // Receipt round-trips from disk.
    const reloaded = await getReceipt(receipt.runId);
    assert.ok(reloaded);
    assert.equal(reloaded?.runId, receipt.runId);
    assert.equal(reloaded?.status, "ok");
    const listed = await listReceipts();
    assert.ok(listed.some((item) => item.runId === receipt.runId));
  });

  test("no-media Board: place steps skipped, export skipped, status partial — never a fake render", async () => {
    await writePreferences({ cutroomProEnabled: true });
    const receipt = await runAssembly(
      { board, options: {} },
      { transportOverride: new DryRunTransport(), proEnabled: true },
    );
    assert.equal(receipt.status, "partial");
    assert.ok(receipt.steps.filter((s) => s.command === "assembler.place-clip").every((s) => s.status === "skipped"));
    const exportStep = receipt.steps.find((s) => s.command === "assembler.export");
    assert.equal(exportStep?.status, "skipped");
    assert.equal(receipt.export.path, null);
    assert.match(receipt.export.note, /no clips were placed/i);
  });
});

describe("Assembler Pro gating (Cutroom Pro M1)", () => {
  test("assembler.plan is 403-style disabled when Pro is off, and builds when on", async () => {
    await writePreferences({ cutroomProEnabled: false });
    await assert.rejects(
      proRegistry.dispatch("assembler.plan", { board }),
      /disabled/i,
    );
    await writePreferences({ cutroomProEnabled: true });
    const plan = (await proRegistry.dispatch("assembler.plan", { board })) as { snapshotId: string; steps: unknown[] };
    assert.equal(plan.snapshotId, "snap-run01");
    assert.ok(plan.steps.length > 0);
  });
});
