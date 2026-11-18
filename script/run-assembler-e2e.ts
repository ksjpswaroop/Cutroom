/**
 * Cutroom Pro M1 — end-to-end check (NOT part of `npm test`).
 *
 * Runs the assembler on the 3-shot fixture Board twice:
 *   1. DryRunTransport — plan, registry, captions, ducking math, receipt.
 *   2. Real filmcraft-cli (tools/filmcraft-cli, demo media) — real render.
 *
 * Usage:  CUTROOM_APP_DATA=/tmp/cutroom-m1-e2e npx tsx script/run-assembler-e2e.ts
 * (CUTROOM_APP_DATA isolates preferences + receipts from the repo.)
 */
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { DryRunTransport } from "../server/assembler-transport";
import { getReceipt, runAssembly } from "../server/assembler";
import { writePreferences } from "../server/preferences";

const board = productionBoardOutputSchema.parse({
  snapshotId: "snap-e2e01",
  characters: [{ id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const }],
  storyboardPanels: [
    { id: "p1", section: "Hook", visual: "Timer and plate", onScreenText: "First clip: the sunset.", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-e2e01" },
    { id: "p2", section: "Method", visual: "Three steps", onScreenText: "Second clip: the aurora.", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-e2e01" },
    { id: "p3", section: "Close", visual: "City at night", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-e2e01" },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam host intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p3", shot: "Screen recipe", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
  ],
});

function summarize(label: string, receipt: Awaited<ReturnType<typeof runAssembly>>): void {
  console.log(`\n=== ${label} ===`);
  console.log(`runId: ${receipt.runId}`);
  console.log(`status: ${receipt.status} · durationMs: ${receipt.durationMs}`);
  console.log(`transport: ${receipt.transport.kind} (${receipt.transport.label}) version=${receipt.transport.version} dryRun=${receipt.transport.dryRun}`);
  if (receipt.transport.dryRunReason) console.log(`dryRunReason: ${receipt.transport.dryRunReason}`);
  console.log(`steps: ${receipt.steps.map((s) => `${s.command.split(".")[1]}:${s.status}`).join(" ")}`);
  console.log(`audit entries: ${receipt.audit.length}`);
  console.log(`captions: ${receipt.captions.cues} cue(s), captionless=[${receipt.captions.captionless.join(", ")}]`);
  console.log(`ducking: applied=${receipt.ducking.applied} reduceDb=${receipt.ducking.reduceDb} plannedKeyframes=${receipt.ducking.plannedKeyframes.length} cliKeyframesReturned=${receipt.ducking.cliKeyframesReturned}`);
  console.log(`loudness: measured=${receipt.loudness.measured} (${receipt.loudness.reason.slice(0, 80)}…)`);
  console.log(`export: path=${receipt.export.path} bytes=${receipt.export.bytes} frames=${receipt.export.frames} — ${receipt.export.note}`);
  console.log(`cost: ${receipt.cost.amount} ${receipt.cost.currency} — ${receipt.cost.note}`);
  console.log(`workDir: ${receipt.workDir}`);
}

async function main(): Promise<void> {
  await writePreferences({ cutroomProEnabled: true });
  const options = { demoMedia: true, exportWidth: 640, exportHeight: 360 } as const;

  const dry = await runAssembly({ board, options }, { transportOverride: new DryRunTransport(), proEnabled: true });
  summarize("DRY RUN", dry);
  const dryReloaded = await getReceipt(dry.runId);
  console.log(`receipt persisted + reloaded: ${Boolean(dryReloaded)}`);

  const real = await runAssembly({ board, options }, { proEnabled: true });
  summarize("REAL CLI (demo media)", real);
  const realReloaded = await getReceipt(real.runId);
  console.log(`receipt persisted + reloaded: ${Boolean(realReloaded)}`);
  if (real.status !== "ok") {
    console.error("REAL RUN DID NOT REACH ok — see steps above.");
    process.exitCode = 1;
  }
}

await main();
