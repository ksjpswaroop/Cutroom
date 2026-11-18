/**
 * Cutroom Pro M2 — agent team end-to-end check (NOT part of `npm test`).
 *
 * One topic → plan → approved run with the deterministic stub provider
 * (no live keys, no network, $0) → receipts for all four agents + QA +
 * assembler (dry-run transport) + ledger, then a second run whose Board
 * breaks the throughline subset rule, proving QA Fail blocks the assembler.
 *
 * Usage:  CUTROOM_APP_DATA=/tmp/cutroom-m2-e2e npx tsx script/run-agents-e2e.ts
 * (CUTROOM_APP_DATA isolates preferences + receipts from the repo.)
 */
import { productionBoardOutputSchema } from "@shared/board-contracts";
import { proRegistry } from "../server/pro-commands";
import { writePreferences } from "../server/preferences";
import { planAgents, runAgents, getAgentReceipt, aggregateLedger } from "../server/orchestrator";
import { writeAgentMemory, readAgentMemory } from "../server/agent-memory";

const board = productionBoardOutputSchema.parse({
  snapshotId: "snap-e2e01",
  characters: [{ id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const }],
  storyboardPanels: [
    { id: "p1", section: "Hook", visual: "Timer and plate", onScreenText: "First clip: the sunset.", evidenceClaimIds: ["stub-claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-e2e01" },
    { id: "p2", section: "Method", visual: "Three steps", onScreenText: "Second clip: the aurora.", evidenceClaimIds: ["stub-claim-4"], evidenceClass: "inferred" as const, snapshotId: "snap-e2e01" },
    { id: "p3", section: "Close", visual: "City at night", evidenceClaimIds: ["stub-claim-7"], evidenceClass: "requires_studio" as const, snapshotId: "snap-e2e01" },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam host intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["stub-claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["stub-claim-4"], evidenceClass: "inferred" as const },
    { panelId: "p3", shot: "Screen recipe", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["stub-claim-7"], evidenceClass: "requires_studio" as const },
  ],
});

const topic = "How to sharpen a kitchen knife";

async function main(): Promise<void> {
  await writePreferences({ cutroomProEnabled: true, agentSpendCapUsd: 0 });

  // Agent memory: the run reads it (and records that it did).
  await writeAgentMemory({
    projectId: "default",
    channelFormatDna: ["timed walkthrough, host on camera"],
    packagingOutcomes: [],
    premiseNotes: ["premise: a knife skill video holds retention past the opening"],
  });
  const memory = await readAgentMemory("default");
  console.log(`agent memory: dna=${memory.channelFormatDna.length} premiseNotes=${memory.premiseNotes.length}`);

  // 1 — Plan first: inspect before anything runs.
  const plan = await planAgents({ topic, board, provider: "stub", spendCapUsd: 0 });
  console.log(`\n=== PLAN ${plan.runId} ===`);
  console.log(`status: ${plan.status} · mode: ${plan.provider} · spend cap: $${plan.spendCapUsd}`);
  for (const step of plan.steps) {
    console.log(`  ${step.seq}. ${step.agent} (${step.command}) — ${step.status}${step.skipReason ? ` — skipped: ${step.skipReason}` : ""} · est. $${step.estimatedCostUsd ?? "unknown"}`);
  }

  // 2 — Approved run: all four agents + QA + assembler (dry-run transport).
  const receipt = await runAgents({ topic, board, provider: "stub", spendCapUsd: 0 }, { transport: "dry-run" });
  console.log(`\n=== RUN ${receipt.runId} ===`);
  console.log(`status: ${receipt.status} · durationMs: ${receipt.durationMs} · memoryUsed: ${receipt.memoryUsed}`);
  for (const r of receipt.receipts) {
    console.log(`  ${r.agent}: ${r.status} · ${r.attempts} attempt(s) · cost $${r.cost.costUsd ?? "not reported"} · quota ${r.cost.quotaUnits} · tokens ${r.cost.tokens ?? "not reported"}${r.note ? ` · ${r.note}` : ""}${r.error ? ` · ERROR ${r.error}` : ""}`);
  }
  console.log(`QA: ${receipt.qa?.status ?? "—"}`);
  for (const check of receipt.qa?.checks ?? []) {
    console.log(`  ${check.id}: ${check.status} — ${check.reason}`);
  }
  console.log(`ledger totals: cost $${receipt.ledger.totals.costUsd ?? "not reported"} · quota ${receipt.ledger.totals.quotaUnits} · tokens ${receipt.ledger.totals.tokens ?? "not reported"} (unknown=${receipt.ledger.totals.tokensUnknown})`);
  console.log(`assembler: ${receipt.assemblerReceiptId ?? "blocked — none"} · status ${receipt.assemblerReceipt?.status ?? "—"} · transport ${receipt.assemblerReceipt?.transport.kind ?? "—"}`);
  const handoff = receipt.handoffs.auditor;
  console.log(`auditor handoff: ${handoff?.claims.length ?? 0} claims, all with evidence pointers: ${handoff?.claims.every((c) => Boolean(c.evidencePointer?.videoId))}`);
  const reloaded = await getAgentReceipt(receipt.runId);
  console.log(`receipt persisted + reloaded: ${Boolean(reloaded)}`);
  const ledger = await aggregateLedger();
  console.log(`aggregate ledger entries: ${ledger.entries.length} · quota ${ledger.totals.quotaUnits} · cost $${ledger.totals.costUsd ?? "not reported"}`);

  // 3 — QA Fail must block the assembler: a Board panel outside the throughline.
  const badBoard = productionBoardOutputSchema.parse({
    ...board,
    storyboardPanels: board.storyboardPanels.map((panel, i) => (i === 0 ? { ...panel, section: "Invented Section" } : panel)),
  });
  const blocked = await runAgents({ topic, board: badBoard, provider: "stub", spendCapUsd: 0 }, { transport: "dry-run" });
  console.log(`\n=== QA-FAIL RUN ${blocked.runId} ===`);
  console.log(`status: ${blocked.status} · escalation: ${blocked.escalation?.reason} — ${blocked.escalation?.message}`);
  console.log(`QA: ${blocked.qa?.status} · assembler receipt: ${blocked.assemblerReceiptId ?? "none (blocked)"}`);
  const auditEntries = proRegistry.auditLog().filter((e) => e.command.startsWith("agents."));
  console.log(`registry audit entries for agent commands: ${auditEntries.length}`);

  // Dry-run transport has no media, so the assembler is "partial" (export
  // none) by design — the run is still ok, QA passed, and nothing was blocked.
  if (receipt.status !== "ok" || receipt.qa?.status !== "pass" || !["ok", "partial"].includes(receipt.assemblerReceipt?.status ?? "")) {
    console.error("HAPPY-PATH RUN DID NOT REACH ok / QA pass / assembler ok-or-partial — see above.");
    process.exitCode = 1;
  }
  if (blocked.status !== "needs-human" || blocked.qa?.status !== "fail" || blocked.assemblerReceipt !== null) {
    console.error("QA-FAIL RUN DID NOT BLOCK THE ASSEMBLER — see above.");
    process.exitCode = 1;
  }
}

await main();
