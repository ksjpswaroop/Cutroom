import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildOtioTimeline, OTIO_DEFAULT_FPS, OTIO_DEFAULT_SHOT_SECONDS } from "./otio";
import { productionBoardOutputSchema } from "./board-contracts";

// Golden fixture: a small Board brief in (same shape as board-contracts.test.ts).
const snapshotId = "snap-otio01";
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
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
    {
      id: "p2",
      section: "Method",
      visual: "Three steps",
      evidenceClaimIds: ["claim-1"],
      evidenceClass: "observed" as const,
      snapshotId,
    },
  ],
  shots: [
    { panelId: "p1", shot: "A-cam host intro", camera: "a-cam" as const, durationHintSec: 6, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p1", shot: "B-roll timer", camera: "b-roll" as const, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
    { panelId: "p2", shot: "Screen recipe", camera: "screen" as const, durationHintSec: 10, evidenceClaimIds: ["claim-1"], evidenceClass: "observed" as const },
  ],
});

function trackChildren(timeline: Record<string, unknown>): Array<Record<string, unknown>> {
  const tracks = timeline.tracks as Record<string, unknown>;
  const children = tracks.children as Array<Record<string, unknown>>;
  return children[0].children as Array<Record<string, unknown>>;
}

describe("OTIO export from Board (Cutroom Pro M0)", () => {
  test("golden: small Board brief in → valid OTIO 1.0 Timeline out", () => {
    const result = buildOtioTimeline(board);
    const { timeline } = result;
    assert.equal(timeline.OTIO_SCHEMA, "Timeline.1");
    assert.equal(result.fps, OTIO_DEFAULT_FPS);
    const tracks = timeline.tracks as Record<string, unknown>;
    assert.equal(tracks.OTIO_SCHEMA, "Stack.1");
    const trackList = tracks.children as Array<Record<string, unknown>>;
    assert.equal(trackList.length, 1);
    assert.equal(trackList[0].OTIO_SCHEMA, "Track.1");
    assert.equal(trackList[0].kind, "Video");
    assert.equal(trackList[0].name, "V1");
    // Clips in Board order, names preserved.
    const clips = trackChildren(timeline);
    assert.deepEqual(clips.map((clip) => clip.name), [
      "A-cam host intro",
      "B-roll timer",
      "Screen recipe",
    ]);
    assert.ok(clips.every((clip) => clip.OTIO_SCHEMA === "Clip.1"));
  });

  test("durations come from shot hints, default 8s when absent, at 24 fps", () => {
    const result = buildOtioTimeline(board);
    const clips = trackChildren(result.timeline);
    const durations = clips.map((clip) => {
      const range = clip.source_range as Record<string, unknown>;
      const duration = range.duration as Record<string, unknown>;
      return { value: duration.value as number, rate: duration.rate as number };
    });
    // 6s hint, no hint → 8s default, 10s hint; all at 24 fps.
    assert.deepEqual(durations, [
      { value: 6 * 24, rate: 24 },
      { value: OTIO_DEFAULT_SHOT_SECONDS * 24, rate: 24 },
      { value: 10 * 24, rate: 24 },
    ]);
    assert.equal(result.durationSeconds, 6 + 8 + 10);
  });

  test("clip metadata carries Board node id, section, camera, and snapshot", () => {
    const result = buildOtioTimeline(board);
    const clips = trackChildren(result.timeline);
    const first = clips[0].metadata as Record<string, unknown>;
    const cutroom = first.cutroom as Record<string, unknown>;
    assert.equal(cutroom.boardNodeId, "p1");
    assert.equal(cutroom.section, "Hook");
    assert.equal(cutroom.camera, "a-cam");
    assert.equal(cutroom.snapshotId, snapshotId);
    assert.equal(cutroom.shotIndex, 0);
    const third = (clips[2].metadata as Record<string, unknown>).cutroom as Record<string, unknown>;
    assert.equal(third.section, "Method");
    assert.equal(third.boardNodeId, "p2");
  });

  test("shots with no media are MissingReference placeholders — no path invented", () => {
    const result = buildOtioTimeline(board);
    const clips = trackChildren(result.timeline);
    assert.ok(clips.every((clip) => {
      const ref = clip.media_reference as Record<string, unknown>;
      return ref.OTIO_SCHEMA === "MissingReference.1";
    }));
    assert.deepEqual(result.placeholders, ["A-cam host intro", "B-roll timer", "Screen recipe"]);
    const metadata = result.timeline.metadata as Record<string, unknown>;
    const cutroom = metadata.cutroom as Record<string, unknown>;
    assert.match(String(cutroom.note), /No file path was invented/);
    // The timeline is still JSON-serialisable (round-trip checkable).
    const roundTripped = JSON.parse(JSON.stringify(result.timeline)) as Record<string, unknown>;
    assert.equal(roundTripped.OTIO_SCHEMA, "Timeline.1");
    assert.equal(trackChildren(roundTripped).length, 3);
  });

  test("supplied media becomes an ExternalReference with that exact URL", () => {
    const result = buildOtioTimeline(board, {
      mediaByShotIndex: { 1: "file:///Users/creator/clips/timer.mp4" },
    });
    const clips = trackChildren(result.timeline);
    const second = clips[1].media_reference as Record<string, unknown>;
    assert.equal(second.OTIO_SCHEMA, "ExternalReference.1");
    assert.equal(second.target_url, "file:///Users/creator/clips/timer.mp4");
    assert.deepEqual(result.placeholders, ["A-cam host intro", "Screen recipe"]);
  });

  test("fps option is honoured", () => {
    const result = buildOtioTimeline(board, { fps: 30 });
    assert.equal(result.fps, 30);
    const clips = trackChildren(result.timeline);
    const duration = (clips[0].source_range as Record<string, unknown>).duration as Record<string, unknown>;
    assert.deepEqual({ value: duration.value, rate: duration.rate }, { value: 6 * 30, rate: 30 });
  });
});
