import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  quoteCinematic,
  renderRequestSchema,
  renderResultSchema,
} from "./render-contracts";

describe("render contracts", () => {
  test("engines are closed and shoot needs no file", () => {
    assert.equal(renderRequestSchema.safeParse({ engine: "veo", topic: "x" }).success, false);
    assert.equal(renderRequestSchema.safeParse({ engine: "shoot", topic: "Weeknight cooking" }).success, true);
    const shoot = renderResultSchema.parse({
      engine: "shoot",
      evidenceClass: "inferred",
    });
    assert.equal(shoot.path, undefined);
  });

  test("cinematic quote always needs confirm and caps at 5 shots", () => {
    const veo = quoteCinematic({ shotCount: 12, usesVeo: true, usdPerShot: 0.5 });
    assert.equal(veo.shotCount, 5);
    assert.equal(veo.needsConfirm, true);
    assert.equal(veo.estimatedUsd, 2.5);
    assert.equal(veo.evidenceClass, "inferred");

    const stills = quoteCinematic({ shotCount: 3, usesVeo: false });
    assert.equal(stills.estimatedUsd, 0);
    assert.equal(stills.usesVeo, false);
    assert.equal(stills.usesH3, false);

    const h3 = quoteCinematic({ shotCount: 12, usesH3: true, durationSec: 5, usdPerSecond: 0.09 });
    assert.equal(h3.shotCount, 5);
    assert.equal(h3.estimatedUsd, 0.45);
    assert.equal(h3.usesH3, true);
    assert.equal(h3.videoModel, "MiniMax-H3");
    assert.match(h3.note, /Hailuo H3/);
  });

  test("cinematic render without confirm is still a valid request shape (server enforces confirm)", () => {
    const parsed = renderRequestSchema.parse({
      engine: "cinematic",
      topic: "Shorts test",
      snapshotId: "snap-12345678",
      maxShots: 5,
    });
    assert.equal(parsed.confirmCinematic, undefined);
  });
});
