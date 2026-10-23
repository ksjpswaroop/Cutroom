import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { inspectCompetitorThumbnails } from "./thumbnail-inspection";

const snapshotId = "yt_thumb_inspect_02";

describe("inspectCompetitorThumbnails", () => {
  test("sends fetched thumbnails to the vision completer and returns inferred claims", async () => {
    let prompt = "";
    const result = await inspectCompetitorThumbnails({
      snapshotId,
      videos: [
        { id: "top", title: "Top", thumbnailUrl: "https://i.ytimg.com/vi/top/hqdefault.jpg", viewCount: 50 },
        { id: "low", title: "Low", thumbnailUrl: "https://i.ytimg.com/vi/low/hqdefault.jpg", viewCount: 5 },
      ],
    }, {
      fetchImage: async (url) => ({ mimeType: "image/jpeg", base64: Buffer.from(url).toString("base64") }),
      complete: async (request) => {
        prompt = request.prompt;
        assert.equal(request.images.length, 2);
        return JSON.stringify({
          claims: [{
            id: "thumb-top",
            claim: "The leading thumbnail centers a face.",
            evidenceClass: "inferred",
            sourceVideoIds: ["top"],
            confidence: "medium",
            limitations: ["Visual inspection is inferred from pixels, not a Data API field."],
            snapshotId,
          }],
        });
      },
    });

    assert.match(prompt, /inferred/);
    assert.equal(result.inspected.map((video) => video.id).join(","), "top,low");
    assert.equal(result.claims[0]?.evidenceClass, "inferred");
    assert.equal(result.claims.every((claim) => claim.evidenceClass === "inferred"), true);
  });

  test("fails when the vision model labels a pixel claim as observed", async () => {
    await assert.rejects(
      () => inspectCompetitorThumbnails({
        snapshotId,
        videos: [{ id: "top", title: "Top", thumbnailUrl: "https://i.ytimg.com/vi/top/hqdefault.jpg", viewCount: 50 }],
      }, {
        fetchImage: async () => ({ mimeType: "image/jpeg", base64: "abc" }),
        complete: async () => JSON.stringify({
          claims: [{
            id: "thumb-top",
            claim: "The thumbnail shows a face.",
            evidenceClass: "observed",
            sourceVideoIds: ["top"],
            confidence: "high",
            limitations: ["Pixels."],
            snapshotId,
          }],
        }),
      }),
      /inferred/,
    );
  });
});
