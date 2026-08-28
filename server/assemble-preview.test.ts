import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildAssFile,
  buildAssembleTimeline,
  escapeAssText,
  escapeDrawtext,
} from "./assemble-preview";

describe("assemble-preview helpers", () => {
  test("escapeDrawtext escapes ffmpeg special characters", () => {
    assert.equal(escapeDrawtext("A:B'C%\\D"), "A\\:B\\'C\\%\\\\D");
  });

  test("escapeAssText escapes braces and newlines", () => {
    assert.equal(escapeAssText("Hello\n{world}"), "Hello\\N\\{world\\}");
  });

  test("timeline starts with title card then chapter and ken burns", () => {
    const timeline = buildAssembleTimeline({
      title: "Test Video",
      chapters: [
        { timestamp: "0:00", title: "Hook" },
        { timestamp: "0:30", title: "Body" },
      ],
    });
    assert.equal(timeline.segments[0]?.kind, "title");
    assert.ok(timeline.segments.some((segment) => segment.kind === "chapter"));
    assert.ok(timeline.segments.some((segment) => segment.kind === "kenburns"));
    assert.ok(timeline.durationSec > 5);
    assert.ok(timeline.durationSec <= 60);
    assert.ok(timeline.captionCues.length >= 2);
  });

  test("buildAssFile emits Dialogue lines", () => {
    const ass = buildAssFile([
      { startSec: 0.5, endSec: 2.5, text: "Hello" },
    ]);
    assert.match(ass, /\[Events\]/);
    assert.match(ass, /Dialogue: 0,0:00:00\.50,0:00:02\.50,Default,,0,0,0,,Hello/);
  });
});
