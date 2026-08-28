import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ideaGenerationRequestSchema,
  providerErrorResponseSchema,
  researchCaptionsRequestSchema,
  researchCommentQuestionsRequestSchema,
  researchInsightsRequestSchema,
  researchInsightsResponseSchema,
  youtubeQuotaResponseSchema,
} from "./schema";

describe("research API contracts", () => {
  test("requires at least one source video for AI research", () => {
    const parsed = researchInsightsRequestSchema.safeParse({ query: "camera", videos: [] });
    assert.equal(parsed.success, false);
  });

  test("requires response identity and generation time", () => {
    const parsed = researchInsightsResponseSchema.safeParse({});
    assert.equal(parsed.success, false);
  });

  test("rejects snapshot provenance with a different ordered video set", () => {
    const parsed = researchInsightsRequestSchema.safeParse({
      query: "camera",
      snapshotId: "yt_snapshot_12345678",
      retrievedAt: "2026-08-24T10:00:00.000Z",
      videos: [{
        id: "video-1", title: "Camera", channelTitle: "Channel", channelId: "channel-1",
        publishedAt: "2026-08-20T10:00:00.000Z", thumbnailUrl: "https://example.test/image.jpg", description: "Review",
      }],
      provenance: {
        provider: "youtube-data-api-v3",
        query: "camera",
        filters: { uploadDate: "any", duration: "any", sortBy: "relevance", maxResults: 50 },
        orderedVideoIds: ["different-video"],
      },
      analytics: {
        totalVideos: 1, totalViews: 0, avgViews: 0, medianViews: 0, medianDailyViews: 0,
        avgEngagement: "N/A", uniqueChannels: 1, durationData: [], recencyData: [], topTags: [],
        coverage: { views: 0, engagement: 0, subscribers: 0, captions: 0, tags: 0, hd: 0 },
      },
      enrichment: {
        search: { status: "complete", requested: 1, returned: 1 },
        videoDetails: { status: "complete", requested: 1, returned: 1 },
        channels: { status: "complete", requested: 1, returned: 1 },
      },
      warnings: [],
    });
    assert.equal(parsed.success, false);
  });

  test("accepts optional caption excerpts that belong to the snapshot", () => {
    const base = {
      query: "camera",
      snapshotId: "yt_snapshot_12345678",
      retrievedAt: "2026-08-24T10:00:00.000Z",
      videos: [{
        id: "video-1", title: "Camera", channelTitle: "Channel", channelId: "channel-1",
        publishedAt: "2026-08-20T10:00:00.000Z", thumbnailUrl: "https://example.test/image.jpg", description: "Review",
      }],
      provenance: {
        provider: "youtube-data-api-v3",
        query: "camera",
        filters: { uploadDate: "any", duration: "any", sortBy: "relevance", maxResults: 50 },
        orderedVideoIds: ["video-1"],
      },
      analytics: {
        totalVideos: 1, totalViews: 0, avgViews: 0, medianViews: 0, medianDailyViews: 0,
        avgEngagement: "N/A", uniqueChannels: 1, durationData: [], recencyData: [], topTags: [],
        coverage: { views: 0, engagement: 0, subscribers: 0, captions: 0, tags: 0, hd: 0 },
      },
      enrichment: {
        search: { status: "complete", requested: 1, returned: 1 },
        videoDetails: { status: "complete", requested: 1, returned: 1 },
        channels: { status: "complete", requested: 1, returned: 1 },
      },
      warnings: [],
    };

    assert.equal(researchInsightsRequestSchema.safeParse({
      ...base,
      captionExcerpts: [{ videoId: "video-1", text: "Observed caption line" }],
    }).success, true);
    assert.equal(researchInsightsRequestSchema.safeParse({
      ...base,
      captionExcerpts: [{ videoId: "other-video", text: "Observed caption line" }],
    }).success, false);
  });

  test("bounds research depth request payloads", () => {
    assert.equal(researchCaptionsRequestSchema.safeParse({ videoIds: ["a", "b", "c", "d", "e"] }).success, true);
    assert.equal(researchCaptionsRequestSchema.safeParse({ videoIds: ["a", "b", "c", "d", "e", "f"] }).success, false);
    assert.equal(researchCommentQuestionsRequestSchema.safeParse({ videoIds: ["a", "b", "c"] }).success, true);
    assert.equal(researchCommentQuestionsRequestSchema.safeParse({ videoIds: ["a", "b", "c", "d"] }).success, false);
    assert.equal(youtubeQuotaResponseSchema.safeParse({
      used: 101,
      remaining: 9899,
      limit: 10_000,
      resetsAt: null,
    }).success, true);
  });

  test("allows optional audience questions on idea generation", () => {
    const parsed = ideaGenerationRequestSchema.safeParse({
      niche: "cameras",
      researchContext: {
        query: "camera",
        snapshotId: "yt_snapshot_12345678",
        sourceVideoIds: ["video-1"],
        evidenceClaims: [{
          id: "claim-1",
          claim: "Observed packaging pattern",
          evidenceClass: "observed",
          sourceVideoIds: ["video-1"],
          confidence: "high",
          limitations: ["Public metadata only"],
          snapshotId: "yt_snapshot_12345678",
        }],
      },
      audienceQuestions: ["Which lens is best for travel?"],
    });
    assert.equal(parsed.success, true);
  });

  test("keeps provider error categories machine-readable", () => {
    const result = providerErrorResponseSchema.parse({
      error: "YouTube Data API quota is unavailable",
      code: "YOUTUBE_QUOTA",
      category: "quota",
      retryable: true,
      suggestion: "Wait for quota to reset.",
    });
    assert.equal(result.category, "quota");
    assert.equal(result.retryable, true);
  });
});
