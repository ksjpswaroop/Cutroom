import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { ProviderError } from "./provider-errors";
import { resetYouTubeQuotaForTests, getYouTubeQuotaUsage } from "./youtube-quota";
import {
  extractQuestionLikeComments,
  fetchCommentQuestionsForVideo,
  fetchPublicCaptionsForVideo,
  isQuestionLikeComment,
  parseTimedTextBody,
  parseTimedTextTrackList,
} from "./youtube";

const originalFetch = globalThis.fetch;
const originalKey = process.env.YOUTUBE_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetYouTubeQuotaForTests();
  if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = originalKey;
});

describe("public caption helpers", () => {
  test("parses timedtext track lists and caption bodies", () => {
    const tracks = parseTimedTextTrackList(`
      <?xml version="1.0"?>
      <transcript_list>
        <track id="0" name="English" lang_code="en" kind="asr" />
        <track id="1" name="Español" lang_code="es" />
      </transcript_list>
    `);
    assert.deepEqual(tracks, [
      { language: "en", name: "English", trackKind: "asr" },
      { language: "es", name: "Español", trackKind: undefined },
    ]);

    const text = parseTimedTextBody(`
      <transcript>
        <text start="0">Hello &amp; welcome</text>
        <text start="1">to the <b>demo</b></text>
      </transcript>
    `);
    assert.equal(text, "Hello & welcome to the demo");
  });

  test("falls back to public timedtext when captions.list requires OAuth", async () => {
    process.env.YOUTUBE_API_KEY = "test-key"; // pragma: allowlist secret, test fixture
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/captions?")) {
        return Response.json({
          error: { errors: [{ reason: "forbidden" }], message: "OAuth required" },
        }, { status: 403 });
      }
      if (url.includes("timedtext") && url.includes("type=list")) {
        return new Response('<transcript_list><track lang_code="en" kind="asr" /></transcript_list>', {
          status: 200,
          headers: { "content-type": "text/xml" },
        });
      }
      if (url.includes("timedtext") && url.includes("lang=en")) {
        return new Response('<transcript><text start="0">Observed spoken line</text></transcript>', {
          status: 200,
          headers: { "content-type": "text/xml" },
        });
      }
      throw new Error(`Unexpected test URL: ${url}`);
    }) as typeof fetch;

    const result = await fetchPublicCaptionsForVideo("video-a");
    assert.equal(result.videoId, "video-a");
    assert.equal(result.text, "Observed spoken line");
    assert.equal(result.language, "en");
    assert.match(result.note || "", /timedtext/i);
    assert.equal(getYouTubeQuotaUsage().used, 50);
  });

  test("returns a skip reason when no public caption text is available", async () => {
    process.env.YOUTUBE_API_KEY = "test-key"; // pragma: allowlist secret, test fixture
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/captions?")) {
        return Response.json({ items: [] });
      }
      if (url.includes("timedtext")) {
        return new Response("", { status: 404 });
      }
      throw new Error(`Unexpected test URL: ${url}`);
    }) as typeof fetch;

    const result = await fetchPublicCaptionsForVideo("video-b");
    assert.equal(result.text, undefined);
    assert.match(result.skipReason || "", /No public caption tracks/i);
  });
});

describe("comment question mining", () => {
  test("detects question-like comments", () => {
    assert.equal(isQuestionLikeComment("How do I set this up?"), true);
    assert.equal(isQuestionLikeComment("what camera is that"), true);
    assert.equal(isQuestionLikeComment("Great video, thanks"), false);

    const mined = extractQuestionLikeComments([
      { text: "How do I set this up?" },
      { text: "How do I set this up?" },
      { text: "Nice tip" },
      { text: "Which lens works best outdoors?" },
    ], "video-a", 5);

    assert.deepEqual(mined.map((item) => item.question), [
      "How do I set this up?",
      "Which lens works best outdoors?",
    ]);
    assert.equal(mined[0]?.sourceVideoId, "video-a");
  });

  test("lists public comment threads and extracts questions", async () => {
    process.env.YOUTUBE_API_KEY = "test-key"; // pragma: allowlist secret, test fixture
    globalThis.fetch = (async (input) => {
      const url = String(input);
      assert.match(url, /commentThreads/);
      return Response.json({
        items: [
          {
            snippet: {
              topLevelComment: {
                snippet: {
                  textDisplay: "What settings should I use?",
                  likeCount: "4",
                  publishedAt: "2026-08-01T00:00:00Z",
                  authorDisplayName: "Viewer",
                },
              },
            },
          },
          {
            snippet: {
              topLevelComment: {
                snippet: { textDisplay: "Awesome tutorial" },
              },
            },
          },
        ],
      });
    }) as typeof fetch;

    const questions = await fetchCommentQuestionsForVideo("video-c");
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.question, "What settings should I use?");
    assert.equal(questions[0]?.sourceVideoId, "video-c");
    assert.equal(getYouTubeQuotaUsage().used, 1);
  });

  test("requires a configured API key", async () => {
    delete process.env.YOUTUBE_API_KEY;
    await assert.rejects(
      fetchCommentQuestionsForVideo("video-d"),
      (error: unknown) => error instanceof ProviderError && error.category === "missing_key",
    );
  });
});
