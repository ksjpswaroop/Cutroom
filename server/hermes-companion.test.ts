import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { preferencesSchema } from "./preferences";
import { buildHermesCronDigest, hermesCronSchedule, hermesProcessSpec } from "./hermes-companion";

describe("Hermes companion (L-508)", () => {
  test("stays off by default and never names a process to spawn", () => {
    const prefs = preferencesSchema.parse({});
    assert.equal(prefs.hermesCompanionEnabled, false);
    assert.equal(hermesProcessSpec(), null);
    assert.equal(hermesCronSchedule(false), null);
    assert.equal(buildHermesCronDigest({
      enabled: false,
      topic: "desk stability",
      snapshotId: "yt_hermes_digest_01",
      observedSignals: ["Three videos compare two-leg and four-leg frames."],
      generatedAt: "2026-10-22T20:00:00.000Z",
    }), null);
  });

  test("when enabled, writes a local cron digest that is not product truth and does not spawn Hermes", () => {
    const digest = buildHermesCronDigest({
      enabled: true,
      topic: "desk stability",
      snapshotId: "yt_hermes_digest_01",
      observedSignals: ["Three videos compare two-leg and four-leg frames."],
      generatedAt: "2026-10-22T20:00:00.000Z",
    });
    assert.ok(digest);
    assert.equal(digest?.productTruth, false);
    assert.equal(digest?.spawnedHermes, false);
    assert.equal(digest?.snapshotId, "yt_hermes_digest_01");
    assert.match(digest?.lines.join("\n") || "", /desk stability/);
    assert.match(digest?.lines.join("\n") || "", /Not product truth/);
    assert.equal(hermesCronSchedule(true), "0 9 * * 1");
    assert.equal(hermesProcessSpec(), null);
  });
});
