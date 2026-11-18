import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { buildAssemblyPlan } from "@shared/assembler";
import { productionBoardOutputSchema } from "@shared/board-contracts";
import {
  DryRunTransport,
  LocalCliTransport,
  type TransportContext,
} from "./assembler-transport";

const board = productionBoardOutputSchema.parse({
  snapshotId: "snap-transport01",
  characters: [{ id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const }],
  storyboardPanels: [
    { id: "p1", section: "Hook", visual: "Timer", onScreenText: "Hello.", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-transport01" },
    { id: "p2", section: "Method", visual: "Steps", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-transport01" },
    { id: "p3", section: "Close", visual: "Night", evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const, snapshotId: "snap-transport01" },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "B-roll steps", camera: "b-roll" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p3", shot: "Screen close", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
  ],
});

function makeCtx(overrides: Partial<TransportContext> = {}): TransportContext {
  return {
    runId: "test-run",
    workDir: "/tmp/assembler-transport-test",
    demo: false,
    projectPath: "/tmp/assembler-transport-test/project.fcproj",
    items: new Map(),
    clips: new Map(),
    captionTrack: null,
    musicClipIds: [],
    duckingKeyframesReturned: 0,
    exportPath: "/tmp/assembler-transport-test/out.mp4",
    ...overrides,
  };
}

describe("DryRunTransport (Cutroom Pro M1)", () => {
  test("returns planned commands without executing anything", async () => {
    const transport = new DryRunTransport();
    assert.equal(transport.kind, "dry-run");
    assert.equal(await transport.version(), null);
    const plan = buildAssemblyPlan(board, { mediaByShotIndex: { 0: "/tmp/clips/a.mp4" } });
    const ctx = makeCtx();
    const begin = await transport.begin(ctx, { name: "T", width: 640, height: 360, fps: 24 });
    assert.equal(begin.ok, true);
    assert.equal(begin.dryRun, true);
    for (const step of plan.steps) {
      if (step.skipReason) continue;
      const result = await transport.executeStep(step, ctx);
      assert.equal(result.ok, true);
      assert.equal(result.dryRun, true);
      assert.match(String(result.note || ""), /Dry run/);
    }
    // Dry-run bookkeeping mirrors the real CLI: imports resolve, clips land.
    assert.equal(ctx.items.get("shot-0") !== undefined, true);
    assert.equal((ctx.clips.get("shot-0") || []).length, 1);
  });
});

/** A stub filmcraft-cli (Node script) that answers like the real binary for the commands M1 uses. */
const STUB_CLI = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("filmcraft-cli 0.20.1"); process.exit(0); }
if (args.includes("run")) {
  const saveAs = args[args.indexOf("--save-as") + 1];
  const scriptPath = args[args.indexOf("run") + 1];
  const lines = fs.readFileSync(scriptPath, "utf8").trim().split("\\n").filter(Boolean);
  if (saveAs) fs.writeFileSync(saveAs, "stub-project");
  lines.forEach((line, i) => {
    const parsed = JSON.parse(line);
    console.log(JSON.stringify({ id: parsed.id, line: i + 1, ok: true, result: { sequence: 7 } }));
  });
  process.exit(0);
}
const execAt = args.indexOf("exec");
const id = args[execAt + 1];
const params = JSON.parse(args[execAt + 2] || "{}");
const results = {
  "file.import": { items: [900001] },
  "timeline.place": { clips: [900010] },
  "captions.newTrack": { track: "C1" },
  "captions.add": { caption: 900020 },
  "essentialSound.setType": { clips: 1, type: "Music" },
  "essentialSound.set": { clips: 1 },
  "essentialSound.generateDucking": { clips: [{ clip: 900010, keyframes: [], regions: [], triggers: [] }] },
  "file.exportMedia": { path: params.path, result: { bytes: 123456, frames: 144, path: params.path } },
};
console.log(JSON.stringify(results[id] || {}));
`;

describe("LocalCliTransport against a stub CLI (Cutroom Pro M1)", () => {
  test("chains import → place → captions → ducking → export, resolving ids dynamically", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "assembler-stub-cli-"));
    const stubPath = path.join(dir, "filmcraft-cli-stub");
    await writeFile(stubPath, STUB_CLI, { mode: 0o755 });
    await chmod(stubPath, 0o755);
    const transport = new LocalCliTransport({ cliPath: stubPath });
    assert.equal(await transport.version(), "0.20.1");

    const plan = buildAssemblyPlan(board, {
      mediaByShotIndex: { 0: "/tmp/clips/a.mp4", 1: "/tmp/clips/b.mp4" },
      musicBed: { path: "/tmp/clips/bed.wav" },
      exportWidth: 640,
      exportHeight: 360,
    });
    const workDir = path.join(dir, "run");
    const ctx = makeCtx({ workDir, projectPath: path.join(workDir, "project.fcproj"), exportPath: path.join(workDir, "out.mp4") });
    const begin = await transport.begin(ctx, { name: "Stub", width: 640, height: 360, fps: 24 });
    assert.equal(begin.ok, true);
    assert.equal(begin.dryRun, false);

    const results = new Map<string, boolean>();
    for (const step of plan.steps) {
      if (step.skipReason) continue;
      const result = await transport.executeStep(step, ctx);
      results.set(step.command, result.ok);
      assert.equal(result.ok, true, `${step.command}: ${result.error || ""}`);
      assert.equal(result.dryRun, false);
    }
    assert.equal(results.get("assembler.import-media"), true);
    assert.equal(results.get("assembler.place-clip"), true);
    assert.equal(results.get("assembler.duck-music"), true);
    assert.equal(results.get("assembler.export"), true);
    // Ids were resolved dynamically from the import results, not hardcoded.
    assert.equal(ctx.items.get("shot-0"), 900001);
    assert.equal(ctx.musicClipIds.length, 1);
    assert.equal(ctx.duckingKeyframesReturned, 0);
  });
});
