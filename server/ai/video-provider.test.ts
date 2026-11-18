import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { getVideoProvider, resolveAiVideoProviderId } from "./index";
import { createMiniMaxVideoProvider } from "./minimax-video-adapter";

describe("video provider abstraction (PS-201)", () => {
  test("quote() is pure (no network) and caps shots; nothing is charged", () => {
    const provider = createMiniMaxVideoProvider();
    const q = provider.quote({ topic: "t", dest: "/tmp/x.mp4", maxShots: 9, durationSec: 6 });
    assert.equal(q.provider, "minimax");
    assert.equal(q.model, "MiniMax-H3");
    assert.equal(q.shots, 5); // capped at 5 (Shorts-first, PS-002)
    assert.equal(q.estimatedDurationSec, 6);
    assert.match(q.note, /charged|quote only/i);
  });

  test("registry: resolveAiVideoProviderId + getVideoProvider accept 'minimax' and default", () => {
    assert.equal(resolveAiVideoProviderId("minimax"), "minimax");
    assert.equal(resolveAiVideoProviderId("bogus"), "minimax"); // falls back to default
    assert.equal(getVideoProvider("minimax").id, "minimax");
  });

  test("generateClip throws a missing-key error when MiniMax is not configured (no network)", async () => {
    const prev = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    try {
      const provider = createMiniMaxVideoProvider();
      await assert.rejects(
        () => provider.generateClip({ topic: "t", dest: "/tmp/x.mp4" }),
        /not configured/i,
      );
    } finally {
      if (prev === undefined) delete process.env.MINIMAX_API_KEY;
      else process.env.MINIMAX_API_KEY = prev;
    }
  });

  test("generateClip writes a clip via injected fetch (no live MiniMax call)", async () => {
    const prev = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "test-key";
    const dir = await mkdtemp(path.join(tmpdir(), "cutroom-video-"));
    const dest = path.join(dir, "clip.mp4");
    const fakeFetch = (async (url: any) => {
      const u = String(url);
      if (u.endsWith("/v2/video_generation")) {
        return new Response(JSON.stringify({ task_id: "task-1" }), { status: 200 });
      }
      if (u.includes("/v2/query/video_generation/")) {
        return new Response(
          JSON.stringify({ task: { status: "succeeded", content: { url: "https://cdn.test/clip.mp4" } } }),
          { status: 200 },
        );
      }
      return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200 }); // the clip download
    }) as unknown as typeof fetch;
    try {
      const provider = createMiniMaxVideoProvider();
      const result = await provider.generateClip(
        { topic: "t", dest, durationSec: 6 },
        { fetchImpl: fakeFetch, pollMs: 0, maxPolls: 2 },
      );
      assert.equal(result.providerId, "minimax");
      assert.equal(result.usesVeo, true);
      assert.equal(result.path, dest);
      const bytes = await readFile(dest);
      assert.equal(bytes.length, 4);
    } finally {
      if (prev === undefined) delete process.env.MINIMAX_API_KEY;
      else process.env.MINIMAX_API_KEY = prev;
    }
  });
});
