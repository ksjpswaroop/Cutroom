import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  THUMBNAIL_INSPECTION_TOP_N,
  parseThumbnailInspectionClaims,
  selectCompetitorThumbnails,
  thumbnailInspectionPrompt,
} from "./thumbnail-inspection";

const snapshotId = "yt_thumb_inspect_01";

describe("competitor thumbnail inspection (L-616)", () => {
  test("selects the top snapshot thumbnails by views and skips missing urls", () => {
    const selected = selectCompetitorThumbnails([
      { id: "low", title: "Low", thumbnailUrl: "https://i.ytimg.com/vi/low/hqdefault.jpg", viewCount: 10 },
      { id: "missing", title: "Missing", viewCount: 999 },
      { id: "top", title: "Top", thumbnailUrl: "https://i.ytimg.com/vi/top/hqdefault.jpg", viewCount: 500 },
      { id: "mid", title: "Mid", thumbnailUrl: "https://i.ytimg.com/vi/mid/hqdefault.jpg", viewCount: 100 },
      { id: "b", title: "Tie B", thumbnailUrl: "https://i.ytimg.com/vi/b/hqdefault.jpg", viewCount: 40 },
      { id: "a", title: "Tie A", thumbnailUrl: "https://i.ytimg.com/vi/a/hqdefault.jpg", viewCount: 40 },
      { id: "extra", title: "Extra", thumbnailUrl: "https://i.ytimg.com/vi/extra/hqdefault.jpg", viewCount: 30 },
    ]);

    assert.equal(THUMBNAIL_INSPECTION_TOP_N, 5);
    assert.deepEqual(selected.map((video) => video.id), ["top", "mid", "a", "b", "extra"]);
  });

  test("prompt tells the vision model that pixel claims are inferred", () => {
    const prompt = thumbnailInspectionPrompt({
      snapshotId,
      videos: [{ id: "top", title: "Top video", thumbnailUrl: "https://i.ytimg.com/vi/top/hqdefault.jpg" }],
    });
    assert.match(prompt, /inferred/);
    assert.match(prompt, /do not label/i);
    assert.match(prompt, /top/);
    assert.match(prompt, new RegExp(snapshotId));
  });

  test("accepts only inferred claims tied to inspected videos and the active snapshot", () => {
    const claims = parseThumbnailInspectionClaims(JSON.stringify({
      claims: [{
        id: "thumb-top",
        claim: "The top thumbnail uses a face and a short contrast title.",
        evidenceClass: "inferred",
        sourceVideoIds: ["top"],
        confidence: "medium",
        limitations: ["Visual inspection is inferred from pixels, not a Data API field."],
        snapshotId,
      }],
    }), { snapshotId, videoIds: ["top"] });

    assert.equal(claims.length, 1);
    assert.equal(claims[0]?.evidenceClass, "inferred");
    assert.deepEqual(claims[0]?.sourceVideoIds, ["top"]);
  });

  test("rejects claims labeled observed or tied to an unknown video", () => {
    assert.throws(
      () => parseThumbnailInspectionClaims(JSON.stringify({
        claims: [{
          id: "thumb-top",
          claim: "The thumbnail shows a face.",
          evidenceClass: "observed",
          sourceVideoIds: ["top"],
          confidence: "high",
          limitations: ["Pixels."],
          snapshotId,
        }],
      }), { snapshotId, videoIds: ["top"] }),
      /inferred/,
    );

    assert.throws(
      () => parseThumbnailInspectionClaims(JSON.stringify({
        claims: [{
          id: "thumb-other",
          claim: "Another video uses red text.",
          evidenceClass: "inferred",
          sourceVideoIds: ["other"],
          confidence: "low",
          limitations: ["Visual inspection is inferred."],
          snapshotId,
        }],
      }), { snapshotId, videoIds: ["top"] }),
      /unknown video/,
    );
  });
});
