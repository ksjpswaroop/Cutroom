/**
 * Cutroom Pro M3 — live-provider acceptance harness (NOT part of `npm test`).
 *
 * Runs the M2 agent team end to end and records the result under
 * live-acceptance/<runId>.json, with a top-level `live: true/false`
 * flag. Live runs need a key; stub runs need nothing and are labelled
 * "stub — not a live result" everywhere.
 *
 * Live usage (on the user's Mac only — the VM has no keys):
 *   CUTROOM_LIVE_KEY=<throwaway billable key> \
 *   CUTROOM_AI_PROVIDER=gemini GEMINI_API_KEY=<same key> \
 *   npx tsx script/run-live-acceptance.ts --topic "How to sharpen a kitchen knife" \
 *     --snapshot-id snap-... --spend-cap 5
 *
 * CUTROOM_LIVE_KEY is the gate: it must be set to the same key the
 * configured provider uses (GEMINI_API_KEY, OPENROUTER_API_KEY,
 * OPENAI_API_KEY, ANTHROPIC_API_KEY, or MINIMAX_API_KEY). Only its last
 * 4 characters are recorded, never the key itself. Without it the
 * script prints the no-key message and runs NOTHING live (exit 2).
 *
 * Stub usage (safe anywhere, $0, no network, no key):
 *   CUTROOM_APP_DATA=/tmp/cutroom-m3-e2e npx tsx script/run-live-acceptance.ts --stub \
 *     --topic "How to sharpen a kitchen knife"
 *
 * Flags: --stub, --topic <text> (default: the knife topic below),
 * --snapshot-id <id>, --spend-cap <usd> (default 0 — a live run with
 * cap 0 pauses before the first live step, by design), --videos <path
 * to a JSON file of [{id,title,channelTitle}]> for the live Researcher
 * (it reuses a supplied snapshot; it does not search YouTube).
 */
import { readFile } from "node:fs/promises";
import { keyFingerprint, liveAcceptanceLabel } from "@shared/live-acceptance";
import { runLiveAcceptance } from "../server/live-acceptance";
import { readPreferences, writePreferences } from "../server/preferences";
import { resolveAiProviderId } from "../server/ai/index";

const DEFAULT_TOPIC = "How to sharpen a kitchen knife";

function argValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const stub = argv.includes("--stub");
  const topic = argValue(argv, "--topic") || DEFAULT_TOPIC;
  const snapshotId = argValue(argv, "--snapshot-id");
  const spendCap = Number(argValue(argv, "--spend-cap") ?? (stub ? "0" : "0"));
  const videosPath = argValue(argv, "--videos");

  if (!stub && !Number.isFinite(spendCap)) {
    console.error("Invalid --spend-cap: give a number of USD (0 = no paid call runs).");
    process.exitCode = 2;
    return;
  }

  // The live gate: no key, no live run. Nothing is attempted, nothing is spent.
  const liveKey = process.env.CUTROOM_LIVE_KEY;
  if (!stub && !liveKey?.trim()) {
    console.error(
      "no key — run on a Mac with CUTROOM_LIVE_KEY set\n"
      + "  This harness runs the agent team against a real provider, so it needs a\n"
      + "  throwaway billable key. Set CUTROOM_LIVE_KEY to the same key the configured\n"
      + "  provider uses (GEMINI_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY,\n"
      + "  ANTHROPIC_API_KEY, or MINIMAX_API_KEY), and raise the spend cap above $0\n"
      + "  if you want any paid call to run (default $0 pauses before the first\n"
      + "  live step). Nothing live ran — no key was read, no provider was called.\n"
      + "  To see the full flow at $0 with no key, run with --stub instead.",
    );
    process.exitCode = 2;
    return;
  }
  if (!stub && (keyFingerprint(liveKey) === null)) {
    console.error("CUTROOM_LIVE_KEY is too short to fingerprint (needs at least 4 characters) — refusing to run live.");
    process.exitCode = 2;
    return;
  }

  const preferences = await readPreferences();
  if (!preferences.cutroomProEnabled) {
    await writePreferences({ cutroomProEnabled: true });
    console.log("Cutroom Pro was off — enabled it for this acceptance run (local toggle only).");
  }

  let videos: Array<{ id: string; title: string; channelTitle: string }> | undefined;
  if (videosPath) {
    const raw = await readFile(videosPath, "utf8");
    videos = JSON.parse(raw) as Array<{ id: string; title: string; channelTitle: string }>;
  }
  if (!stub && !snapshotId && !videos) {
    console.error(
      "Live Researcher needs a snapshot: pass --snapshot-id <id> (and optionally\n"
      + "--videos <path to [{id,title,channelTitle}] JSON). The agent team does not\n"
      + "run YouTube searches on its own — start from a snapshot made on the\n"
      + "Research page. Nothing live ran.",
    );
    process.exitCode = 2;
    return;
  }

  const provider = stub ? "stub" : resolveAiProviderId();
  console.log(`\n=== LIVE ACCEPTANCE (${liveAcceptanceLabel(!stub)}) ===`);
  console.log(`provider: ${provider} · topic: ${topic} · snapshot: ${snapshotId ?? "—"} · spend cap: $${spendCap}`);

  const run = await runLiveAcceptance(
    { topic, snapshotId, videos },
    { mode: stub ? "stub" : "live", keyFingerprint: stub ? null : keyFingerprint(liveKey), spendCapUsd: spendCap },
  );

  console.log(`\n=== RESULT ${run.runId} (${run.label}) ===`);
  console.log(`status: ${run.status} · live: ${run.live} · provider: ${run.provider} · model: ${run.model ?? "not reported"} · key fingerprint: ${run.keyFingerprint ?? "—"}`);
  console.log(`agent run: ${run.agentRunId ?? "—"} · durationMs: ${run.durationMs}`);
  for (const check of run.checks) {
    console.log(`  ${check.id}: ${check.status}${check.latencyMs !== null ? ` · ${check.latencyMs} ms` : ""}${check.providerResponseId ? ` · response ${check.providerResponseId}` : ""}${check.usage ? ` · usage ${check.usage.totalTokens} tokens` : " · usage: not reported by provider"}`);
    console.log(`    ${check.detail}`);
  }
  console.log(`ledger totals: cost $${run.ledger.totals.costUsd ?? "not reported"} · quota ${run.ledger.totals.quotaUnits} · tokens ${run.ledger.totals.tokens ?? "not reported"} (unknown=${run.ledger.totals.tokensUnknown})`);
  console.log(`persisted: live-acceptance/${run.runId}.json (live=${run.live})`);

  if (run.status !== "pass") {
    console.error("ACCEPTANCE FAILED — see the failed check(s) above; the full run is in the persisted file.");
    process.exitCode = 1;
  }
}

await main();
