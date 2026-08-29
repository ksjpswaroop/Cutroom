import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { hailuoH3Prompt, generateHailuoH3Clip } from "./minimax-h3";
import { synthesizeMiniMaxSpeech } from "./minimax-tts";
import type { ProductionBoardOutput } from "@shared/board-contracts";

const sampleBoard: ProductionBoardOutput = {
  snapshotId: "snap-12345678",
  characters: [{ id: "host", role: "Host", onScreen: true, evidenceClass: "inferred" }],
  storyboardPanels: [
    { id: "p1", section: "Hook", visual: "Hands at the stove", evidenceClaimIds: ["c1"], evidenceClass: "inferred", snapshotId: "snap-12345678" },
    { id: "p2", section: "Body", visual: "Garlic in oil", evidenceClaimIds: ["c1"], evidenceClass: "inferred", snapshotId: "snap-12345678" },
  ],
  shots: [
    { panelId: "p1", shot: "Close-up of garlic hitting oil", camera: "a-cam", evidenceClaimIds: ["c1"], evidenceClass: "inferred" },
    { panelId: "p2", shot: "Wide of the pan", camera: "b-roll", evidenceClaimIds: ["c1"], evidenceClass: "inferred" },
    { panelId: "p2", shot: "Insert of salt", camera: "insert", evidenceClaimIds: ["c1"], evidenceClass: "inferred" },
  ],
};

describe("MiniMax Hailuo H3", () => {
  test("prompt is inferred and includes topic plus board shots", () => {
    const prompt = hailuoH3Prompt({
      topic: "Weeknight cooking",
      title: "One-pan pasta",
      scriptContent: "Heat the pan. Add garlic.",
      board: sampleBoard,
    });
    assert.match(prompt, /inferred/);
    assert.match(prompt, /Weeknight cooking/);
    assert.match(prompt, /Close-up of garlic hitting oil/);
    assert.equal(prompt.includes("observed YouTube footage"), true);
  });

  test("create-poll-download uses MiniMax-H3 and never hits a live host", async () => {
    const previous = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "test-minimax-key-value";
    const destRoot = await mkdtemp(path.join(os.tmpdir(), "cutroom-h3-"));
    const dest = path.join(destRoot, "clip.mp4");
    const urls: string[] = [];
    try {
      const payload = Buffer.from("fake-mp4");
      const result = await generateHailuoH3Clip({
        topic: "Weeknight cooking",
        dest,
        pollMs: 0,
        maxPolls: 2,
        fetchImpl: (async (input: RequestInfo | URL) => {
          const url = String(input);
          urls.push(url);
          if (url.endsWith("/v2/video_generation")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ task_id: "task-h3-1" }),
            } as Response;
          }
          if (url.includes("/v2/query/video_generation/task-h3-1")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                task: { status: "succeeded", content: { url: "https://cdn.example.test/h3.mp4" } },
              }),
            } as Response;
          }
          if (url === "https://cdn.example.test/h3.mp4") {
            return {
              ok: true,
              status: 200,
              arrayBuffer: async () => payload,
            } as Response;
          }
          throw new Error(`unexpected fetch ${url}`);
        }) as typeof fetch,
      });
      assert.equal(result.model, "MiniMax-H3");
      assert.equal(result.durationSec, 5);
      assert.deepEqual(await readFile(dest), payload);
      assert.equal(urls.some((url) => url.includes("api.minimax.io/v2/video_generation")), true);
      assert.equal(urls.some((url) => url.includes("youtube.googleapis.com")), false);
    } finally {
      await rm(destRoot, { recursive: true, force: true });
      if (previous === undefined) delete process.env.MINIMAX_API_KEY;
      else process.env.MINIMAX_API_KEY = previous;
    }
  });

  test("TTS decodes hex audio without a live MiniMax call", async () => {
    const previous = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "test-minimax-key-value";
    const destRoot = await mkdtemp(path.join(os.tmpdir(), "cutroom-tts-"));
    const dest = path.join(destRoot, "voice.mp3");
    const audio = Buffer.from("ID3fake");
    try {
      await synthesizeMiniMaxSpeech({
        text: "Heat the pan.",
        dest,
        fetchImpl: (async () => ({
          ok: true,
          status: 200,
          json: async () => ({ data: { audio: audio.toString("hex") }, base_resp: { status_code: 0 } }),
        })) as typeof fetch,
      });
      assert.deepEqual(await readFile(dest), audio);
    } finally {
      await rm(destRoot, { recursive: true, force: true });
      if (previous === undefined) delete process.env.MINIMAX_API_KEY;
      else process.env.MINIMAX_API_KEY = previous;
    }
  });
});
