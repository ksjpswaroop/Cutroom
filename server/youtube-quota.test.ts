import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  YOUTUBE_QUOTA_LIMIT,
  getYouTubeQuotaCost,
  getYouTubeQuotaUsage,
  incrementYouTubeQuota,
  resetYouTubeQuotaForTests,
} from "./youtube-quota";

afterEach(() => {
  resetYouTubeQuotaForTests();
});

describe("YouTube session quota meter", () => {
  test("uses documented Data API unit costs", () => {
    assert.equal(getYouTubeQuotaCost("search.list"), 100);
    assert.equal(getYouTubeQuotaCost("videos.list"), 1);
    assert.equal(getYouTubeQuotaCost("captions.list"), 50);
    assert.equal(getYouTubeQuotaCost("commentThreads.list"), 1);
  });

  test("increments used units and reports remaining against the soft limit", () => {
    assert.deepEqual(getYouTubeQuotaUsage(), {
      used: 0,
      remaining: YOUTUBE_QUOTA_LIMIT,
      limit: 10_000,
      resetsAt: null,
    });

    incrementYouTubeQuota("search.list");
    incrementYouTubeQuota("videos.list", 2);
    incrementYouTubeQuota("captions.list");
    incrementYouTubeQuota("commentThreads.list", 3);

    assert.deepEqual(getYouTubeQuotaUsage(), {
      used: 100 + 2 + 50 + 3,
      remaining: YOUTUBE_QUOTA_LIMIT - 155,
      limit: 10_000,
      resetsAt: null,
    });
  });

  test("rejects non-positive increment counts", () => {
    assert.throws(() => incrementYouTubeQuota("videos.list", 0));
    assert.throws(() => incrementYouTubeQuota("videos.list", 1.5));
  });

  test("clamps remaining at zero after the soft limit", () => {
    incrementYouTubeQuota("search.list", 101);
    const usage = getYouTubeQuotaUsage();
    assert.equal(usage.used, 10_100);
    assert.equal(usage.remaining, 0);
    assert.equal(usage.resetsAt, null);
  });
});
