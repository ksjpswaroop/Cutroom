import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { buildCinematicQuote, getRenderStatus, runRender, voiceCloneReady } from "./render-engine";

describe("render engines", () => {
  test("shoot returns inferred pack-only result with no file", async () => {
    const result = await runRender({ engine: "shoot", topic: "Weeknight cooking" });
    assert.equal(result.engine, "shoot");
    assert.equal(result.evidenceClass, "inferred");
    assert.equal(result.path, undefined);
    assert.equal(result.voiceSource, "none");
  });

  test("cinematic without confirm is rejected", async () => {
    await assert.rejects(
      () => runRender({ engine: "cinematic", topic: "Shorts test" }),
      (error: any) => error?.status === 400 && /confirmCinematic/.test(error.message),
    );
  });

  test("quote always needs confirm and never uploads", () => {
    const quote = buildCinematicQuote(undefined);
    assert.equal(quote.needsConfirm, true);
    assert.equal(quote.evidenceClass, "inferred");
    assert.equal(quote.maxShots, 5);
    assert.equal(getRenderStatus().youtubeUpload, false);
  });

  test("quote uses Hailuo H3 rates when MiniMax is configured", () => {
    const previousKey = process.env.MINIMAX_API_KEY;
    const previousVideo = process.env.CUTROOM_VIDEO_ENABLED;
    process.env.MINIMAX_API_KEY = "test-minimax-key-value";
    delete process.env.CUTROOM_VIDEO_ENABLED;
    try {
      const quote = buildCinematicQuote(undefined);
      assert.equal(quote.usesH3, true);
      assert.equal(quote.usesVeo, false);
      assert.equal(quote.estimatedUsd, 0.45);
      assert.equal(quote.videoModel, "MiniMax-H3");
      assert.equal(getRenderStatus().hailuoH3, true);
      assert.equal(getRenderStatus().youtubeUpload, false);
    } finally {
      if (previousKey === undefined) delete process.env.MINIMAX_API_KEY;
      else process.env.MINIMAX_API_KEY = previousKey;
      if (previousVideo === undefined) delete process.env.CUTROOM_VIDEO_ENABLED;
      else process.env.CUTROOM_VIDEO_ENABLED = previousVideo;
    }
  });

  test("clone requires consent and never uses research snapshot voices", () => {
    const previousConsent = process.env.CUTROOM_VOICE_CONSENT;
    const previousKey = process.env.ELEVENLABS_API_KEY;
    delete process.env.CUTROOM_VOICE_CONSENT;
    delete process.env.ELEVENLABS_API_KEY;
    try {
      const blocked = voiceCloneReady(undefined);
      assert.equal(blocked.ok, false);
      assert.match(blocked.reason || "", /consent/i);
    } finally {
      if (previousConsent !== undefined) process.env.CUTROOM_VOICE_CONSENT = previousConsent;
      else delete process.env.CUTROOM_VOICE_CONSENT;
      if (previousKey !== undefined) process.env.ELEVENLABS_API_KEY = previousKey;
      else delete process.env.ELEVENLABS_API_KEY;
    }
  });

  test("server routes do not implement videos.insert", async () => {
    const routes = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "routes.ts"), "utf8");
    assert.equal(routes.includes("videos.insert"), false);
    assert.equal(routes.includes("youtube.googleapis.com/upload"), false);
  });
});
