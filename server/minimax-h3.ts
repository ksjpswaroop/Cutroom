/**
 * MiniMax Hailuo H3 (MiniMax-H3) cinematic Shorts.
 * POST /v2/video_generation then poll /v2/query/video_generation/{task_id}.
 * Output is inferred. Never uploads to YouTube. Tests inject fetch — no live MiniMax.
 */
import { writeFile } from "node:fs/promises";
import type { ProductionBoardOutput } from "@shared/board-contracts";
import {
  hailuoH3Resolution,
  MINIMAX_H3_DURATION_SEC,
  MINIMAX_H3_MODEL,
  MINIMAX_H3_RATIO,
  minimaxAuthHeaders,
  minimaxBaseUrl,
  minimaxConfigured,
} from "./minimax";

export type MiniMaxFetch = typeof fetch;

export function hailuoH3Prompt(input: {
  topic: string;
  title?: string;
  scriptContent?: string;
  board?: ProductionBoardOutput;
  maxShots?: number;
}): string {
  const shots = (input.board?.shots || []).slice(0, input.maxShots || 5);
  const shotLines = shots
    .map((shot, index) => `${index + 1}. ${shot.shot} [${shot.camera}]`)
    .join("\n");
  const gist = (input.scriptContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_200);
  return [
    "YouTube Short. Generative video is inferred, not observed YouTube footage.",
    `Topic: ${input.topic}`,
    input.title ? `Title: ${input.title}` : "",
    shotLines ? `Board shots:\n${shotLines}` : "",
    gist ? `Narration gist: ${gist}` : "",
    "Vertical 9:16, cinematic but grounded. No invented Studio metrics or search volume.",
  ].filter(Boolean).join("\n").slice(0, 7_000);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateHailuoH3Clip(input: {
  topic: string;
  title?: string;
  scriptContent?: string;
  board?: ProductionBoardOutput;
  thumbnailDataUrl?: string;
  maxShots?: number;
  dest: string;
  durationSec?: number;
  fetchImpl?: MiniMaxFetch;
  pollMs?: number;
  maxPolls?: number;
}): Promise<{ durationSec: number; model: typeof MINIMAX_H3_MODEL }> {
  if (!minimaxConfigured()) {
    throw Object.assign(new Error("MiniMax API key is not configured."), { status: 503 });
  }
  const fetcher = input.fetchImpl || fetch;
  const duration = Math.min(15, Math.max(4, input.durationSec || MINIMAX_H3_DURATION_SEC));
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: hailuoH3Prompt(input) },
  ];
  if (input.thumbnailDataUrl?.startsWith("data:image/")) {
    content.push({
      type: "image_url",
      image_url: { url: input.thumbnailDataUrl },
      role: "first_frame",
    });
  }
  const create = await fetcher(`${minimaxBaseUrl()}/v2/video_generation`, {
    method: "POST",
    headers: minimaxAuthHeaders(),
    body: JSON.stringify({
      model: MINIMAX_H3_MODEL,
      content,
      resolution: hailuoH3Resolution(),
      duration,
      ratio: MINIMAX_H3_RATIO,
    }),
  });
  const created = await create.json().catch(() => ({})) as {
    task_id?: string;
    task?: { id?: string };
    error?: { message?: string };
  };
  const taskId = created.task_id || created.task?.id;
  if (!create.ok || !taskId) {
    throw Object.assign(
      new Error(created.error?.message || `MiniMax H3 create failed (${create.status}).`),
      { status: create.status === 401 ? 401 : 502 },
    );
  }

  const pollMs = input.pollMs ?? 10_000;
  const maxPolls = input.maxPolls ?? 36;
  let videoUrl: string | undefined;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await sleep(pollMs);
    const query = await fetcher(
      `${minimaxBaseUrl()}/v2/query/video_generation/${taskId}`,
      { headers: minimaxAuthHeaders() },
    );
    const body = await query.json().catch(() => ({})) as {
      task?: { status?: string; content?: { url?: string }; error?: { message?: string } };
    };
    const status = body.task?.status;
    if (status === "succeeded") {
      videoUrl = body.task?.content?.url;
      break;
    }
    if (status === "failed" || status === "cancelled") {
      throw Object.assign(
        new Error(body.task?.error?.message || `MiniMax H3 ${status}.`),
        { status: 502 },
      );
    }
  }
  if (!videoUrl) {
    throw Object.assign(new Error("MiniMax H3 timed out waiting for the clip."), { status: 504 });
  }

  const download = await fetcher(videoUrl);
  if (!download.ok) {
    throw Object.assign(new Error(`MiniMax H3 download failed (${download.status}).`), { status: 502 });
  }
  const bytes = Buffer.from(await download.arrayBuffer());
  await writeFile(input.dest, bytes);
  return { durationSec: duration, model: MINIMAX_H3_MODEL };
}
