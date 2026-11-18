import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ASSEMBLER_DUCK_DB,
  ASSEMBLER_LOUDNESS_TARGET_LUFS,
  buildAssemblyPlan,
  buildCaptions,
  buildDuckingPlan,
} from "./assembler";
import { productionBoardOutputSchema } from "./board-contracts";

// Golden fixture: the same 3-shot Board as the M0 OTIO test, plus
// on-screen text on two panels (the caption source) and none on the third.
const snapshotId = "snap-asm01";
const board = productionBoardOutputSchema.parse({
  snapshotId,
  characters: [
    { id: "host", role: "host", onScreen: true, evidenceClass: "inferred" as const },
  ],
  storyboardPanels: [
    {
      id: "p1",
      section: "Hook",
      visual: "Timer and plate",
      onScreenText: "First clip: the sunset.",
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
    {
      id: "p2",
      section: "Method",
      visual: "Three steps",
      onScreenText: "Second clip: the aurora.",
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
    {
      id: "p3",
      section: "Close",
      visual: "City at night",
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
    {
      id: "p3",
      section: "Close",
      visual: "City at night",
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam host intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p3", shot: "Screen recipe", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
  ],
});

describe("Assembler captions (Cutroom Pro M1)", () => {
  test("cues come from panel on-screen text, frame-exact at 24 fps", () => {
    const captions = buildCaptions(board);
    assert.equal(captions.cues.length, 2);
    assert.deepEqual(captions.cues.map((cue) => cue.text), [
      "First clip: the sunset.",
      "Second clip: the aurora.",
    ]);
    assert.deepEqual(captions.cues.map((cue) => cue.source), ["onScreenText", "onScreenText"]);
    // Shot 1: 0–6s; shot 2: 6–14s (8s default); shot 3 has no text.
    assert.deepEqual(
      captions.cues.map((cue) => [cue.startSeconds, cue.endSeconds, cue.startFrame, cue.endFrame]),
      [[0, 6, 0, 144], [6, 14, 144, 336]],
    );
    assert.deepEqual(captions.captionless, ["Screen recipe"]);
  });

  test("supplied caption text overrides on-screen text; no text means no cue — never invented", () => {
    const captions = buildCaptions(board, { captionByShotIndex: { 2: "Third clip: the city at night." } });
    assert.equal(captions.cues.length, 3);
    assert.equal(captions.cues[2].text, "Third clip: the city at night.");
    assert.equal(captions.cues[2].source, "supplied");
    assert.deepEqual(captions.captionless, []);
  });

  test("SRT and WebVTT are frame-exact and round-trippable", () => {
    const captions = buildCaptions(board);
    assert.equal(
      captions.srt,
      "1\n00:00:00,000 --> 00:00:06,000\nFirst clip: the sunset.\n\n2\n00:00:06,000 --> 00:00:14,000\nSecond clip: the aurora.\n",
    );
    assert.match(captions.vtt, /^WEBVTT\n\n00:00:00\.000 --> 00:00:06\.000\nFirst clip: the sunset\./);
    assert.match(captions.vtt, /00:00:06\.000 --> 00:00:14\.000\nSecond clip: the aurora\./);
  });
});

describe("Assembler ducking (Cutroom Pro M1)", () => {
  test("music drops to -12 dB under each narration segment, 0 dB between them", () => {
    const captions = buildCaptions(board);
    const ducking = buildDuckingPlan(captions.cues, true);
    assert.equal(ducking.applied, true);
    assert.equal(ducking.reduceDb, ASSEMBLER_DUCK_DB);
    assert.deepEqual(ducking.keyframes, [
      { atSeconds: 0, levelDb: -12 },
      { atSeconds: 6, levelDb: 0 },
      { atSeconds: 6, levelDb: -12 },
      { atSeconds: 14, levelDb: 0 },
    ]);
    assert.deepEqual(ducking.segments, [
      { startSeconds: 0, endSeconds: 6, levelDb: -12 },
      { startSeconds: 6, endSeconds: 14, levelDb: -12 },
    ]);
  });

  test("no music bed means no ducking, stated plainly", () => {
    const captions = buildCaptions(board);
    const ducking = buildDuckingPlan(captions.cues, false);
    assert.equal(ducking.applied, false);
    assert.deepEqual(ducking.keyframes, []);
    assert.match(ducking.note, /No music bed/);
  });
});

describe("Assembly plan (Cutroom Pro M1)", () => {
  test("golden: 3-shot Board with demo media → exact ordered steps", () => {
    const plan = buildAssemblyPlan(board, { demoMedia: true, exportWidth: 640, exportHeight: 360 });
    assert.equal(plan.snapshotId, snapshotId);
    assert.equal(plan.fps, 24);
    assert.equal(plan.totalSeconds, 24);
    assert.equal(plan.demoMedia, true);
    assert.deepEqual(plan.placeholders, []);
    assert.deepEqual(
      plan.steps.map((step) => step.command),
      [
        "assembler.new-sequence",
        "assembler.place-clip",
        "assembler.place-clip",
        "assembler.place-clip",
        "assembler.place-music",
        "assembler.duck-music",
        "assembler.add-captions",
        "assembler.check-loudness",
        "assembler.export",
      ],
    );
    // Place steps carry the demo item ids and frame-exact times.
    const places = plan.steps.filter((step) => step.command === "assembler.place-clip");
    assert.deepEqual(places.map((step) => step.filmcraftParams), [
      { item: 5, track: "V1", seconds: 0, duration: { seconds: 6 } },
      { item: 6, track: "V1", seconds: 6, duration: { seconds: 8 } },
      { item: 7, track: "V1", seconds: 14, duration: { seconds: 10 } },
    ]);
    assert.equal(plan.steps[0].filmcraftCommand, "file.newSequence");
    assert.equal(plan.steps[plan.steps.length - 1].filmcraftCommand, "file.exportMedia");
    assert.equal(plan.loudness.measured, false);
    assert.equal(plan.loudness.targetLufs, ASSEMBLER_LOUDNESS_TARGET_LUFS);
    assert.equal(plan.exportFileName, `cutroom-assemble-${snapshotId}.mp4`);
  });

  test("shots with no media get skipped place steps — no path invented", () => {
    const plan = buildAssemblyPlan(board, {});
    assert.deepEqual(plan.placeholders, ["A-cam host intro", "B-roll timer", "Screen recipe"]);
    const places = plan.steps.filter((step) => step.command === "assembler.place-clip");
    assert.equal(places.length, 3);
    assert.ok(places.every((step) => step.filmcraftCommand === null));
    assert.ok(places.every((step) => /no media/.test(step.skipReason || "")));
    // No music bed supplied → no place-music / duck-music steps.
    assert.ok(!plan.steps.some((step) => step.command === "assembler.place-music"));
    assert.ok(!plan.steps.some((step) => step.command === "assembler.duck-music"));
    assert.equal(plan.ducking.applied, false);
  });

  test("supplied media produces import + place steps with the exact path", () => {
    const plan = buildAssemblyPlan(board, {
      mediaByShotIndex: { 0: "/tmp/clips/intro.mp4", 2: "/tmp/clips/recipe.mp4" },
      musicBed: { path: "/tmp/clips/bed.wav" },
    });
    const imports = plan.steps.filter((step) => step.command === "assembler.import-media");
    assert.deepEqual(imports.map((step) => step.filmcraftParams), [
      { paths: ["/tmp/clips/intro.mp4"] },
      { paths: ["/tmp/clips/recipe.mp4"] },
      { paths: ["/tmp/clips/bed.wav"] },
    ]);
    const places = plan.steps.filter((step) => step.command === "assembler.place-clip");
    assert.equal(places[0].filmcraftParams?.item, "$item:shot-0");
    assert.equal(places[1].skipReason !== undefined, true);
    assert.equal(places[2].filmcraftParams?.item, "$item:shot-2");
    assert.equal(plan.ducking.applied, true);
  });

  test("plan is JSON-serialisable (round-trip) and carries the receipt fields", () => {
    const plan = buildAssemblyPlan(board, { demoMedia: true });
    const roundTripped = JSON.parse(JSON.stringify(plan)) as typeof plan;
    assert.equal(roundTripped.steps.length, plan.steps.length);
    assert.equal(roundTripped.captions.cues.length, 2);
    assert.equal(roundTripped.loudness.measured, false);
    assert.match(roundTripped.loudness.reason, /no loudness-meter command/);
  });
});
