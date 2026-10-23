import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  LAUNCH_VIDEO_FPS,
  LAUNCH_VIDEO_SCENES,
  launchVideoDurationSec,
  launchVideoFrameCount,
  validateLaunchVideoTimeline,
} from "../launch-video/timeline";

describe("launch-video Remotion side project (L-620)", () => {
  test("covers the shot list from 0:00 through 5:05 without gaps or an in-app route", () => {
    assert.equal(validateLaunchVideoTimeline(LAUNCH_VIDEO_SCENES), null);
    assert.equal(launchVideoDurationSec(LAUNCH_VIDEO_SCENES), 305);
    assert.equal(LAUNCH_VIDEO_FPS, 30);
    assert.equal(launchVideoFrameCount(LAUNCH_VIDEO_SCENES), 305 * 30);
    assert.equal(LAUNCH_VIDEO_SCENES[0]?.id, "montage");
    assert.equal(LAUNCH_VIDEO_SCENES.at(-1)?.id, "close");

    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    assert.equal(app.includes("launch-video"), false);
    assert.equal(app.includes("/launch"), false);

    const spoken = LAUNCH_VIDEO_SCENES.map((scene) => scene.title).join(" ").toLowerCase();
    assert.equal(/algorithm|go viral|open source|private analytics/.test(spoken), false);
  });
});
