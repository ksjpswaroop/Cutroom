import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  assemblePreviewRequestSchema,
  buildAssFile,
  buildAssembleTimeline,
  escapeAssText,
  escapeDrawtext,
  resolveWorkflowRenderPath,
} from "./assemble-preview";
import { writeLibraryConfig } from "./library-config";
import { ensureWorkflowTopicDirectory } from "./workflow-store";

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

  test("assemble schema strips board so post-cinematic assemble still works", () => {
    const parsed = assemblePreviewRequestSchema.safeParse({
      topic: "Standing desk reviews",
      title: "Does a 4-leg standing desk stay still?",
      board: { snapshotId: "snap-h3-live01" },
      snapshotId: "snap-h3-live01",
      voiceConsent: true,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal("board" in parsed.data, false);
    }
  });

  test("resolveWorkflowRenderPath finds cinematic render.mp4 after ensure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-appdata-"));
    const library = await mkdtemp(path.join(os.tmpdir(), "cutroom-library-"));
    const previous = process.env.CUTROOM_APP_DATA;
    try {
      process.env.CUTROOM_APP_DATA = root;
      await writeLibraryConfig(library, root);
      const id = "post-cinematic-flow-01";
      const dir = await ensureWorkflowTopicDirectory({ id, title: "Cinematic A+V" });
      assert.ok(dir);
      await writeFile(path.join(dir!, "render.mp4"), "fake-cinematic-mp4");
      const located = await resolveWorkflowRenderPath(id);
      assert.equal(located, path.join(dir!, "render.mp4"));
    } finally {
      if (previous === undefined) delete process.env.CUTROOM_APP_DATA;
      else process.env.CUTROOM_APP_DATA = previous;
      await rm(root, { recursive: true, force: true });
      await rm(library, { recursive: true, force: true });
    }
  });

  test("resolveWorkflowRenderPath finds render.mp4 in flat media folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-appdata-"));
    const previous = process.env.CUTROOM_APP_DATA;
    try {
      process.env.CUTROOM_APP_DATA = root;
      const id = "flat-media-render-01";
      const dir = await ensureWorkflowTopicDirectory({ id, title: "Flat cinematic" });
      assert.ok(dir);
      await writeFile(path.join(dir!, "render.mp4"), "flat-cinematic-mp4");
      const located = await resolveWorkflowRenderPath(id);
      assert.equal(located, path.join(dir!, "render.mp4"));
    } finally {
      if (previous === undefined) delete process.env.CUTROOM_APP_DATA;
      else process.env.CUTROOM_APP_DATA = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});
