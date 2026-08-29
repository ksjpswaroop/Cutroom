/**
 * Render engines: shoot (pack only), slides+voice, cinematic Shorts.
 * No YouTube upload. Generated pixels/audio are inferred.
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkProductionBoard, type ProductionBoardOutput } from "@shared/board-contracts";
import {
  quoteCinematic,
  renderRequestSchema,
  type CinematicQuote,
  type RenderRequest,
  type RenderResult,
} from "@shared/render-contracts";
import {
  muxAudioOntoVideo,
  renderAssemblePreview,
  resolveFfmpegBinary,
  resolveRenderOutputPath,
} from "./assemble-preview";
import { cinematicChaptersFromBoard } from "./cinematic-render";
import { generateHailuoH3Clip } from "./minimax-h3";
import {
  hailuoH3UsdPerSecond,
  MINIMAX_H3_DURATION_SEC,
  MINIMAX_H3_MODEL,
  minimaxConfigured,
} from "./minimax";
import { synthesizeMiniMaxSpeech } from "./minimax-tts";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** Hailuo H3 is on whenever a MiniMax key is present unless the user opted out. */
export function hailuoH3Enabled(): boolean {
  if (!minimaxConfigured()) return false;
  return process.env.CUTROOM_VIDEO_ENABLED !== "0";
}

export function videoGeneratorConfigured(): boolean {
  return hailuoH3Enabled();
}

export function voiceCloneReady(consent: boolean | undefined): { ok: boolean; reason?: string } {
  if (!consent && process.env.CUTROOM_VOICE_CONSENT !== "1") {
    return { ok: false, reason: "Voice clone requires explicit consent in Settings (your voice only)." };
  }
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    return { ok: false, reason: "ElevenLabs API key is not configured." };
  }
  return { ok: true };
}

export function getRenderStatus() {
  return {
    engines: ["assemble", "shoot", "slides", "cinematic"] as const,
    youtubeUpload: false,
    ffmpegAvailable: true,
    elevenLabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    voiceConsent: process.env.CUTROOM_VOICE_CONSENT === "1",
    cinematicVeo: videoGeneratorConfigured(),
    hailuoH3: hailuoH3Enabled(),
    videoModel: hailuoH3Enabled() ? MINIMAX_H3_MODEL : undefined,
    evidenceClass: "inferred" as const,
  };
}

export function buildCinematicQuote(board: ProductionBoardOutput | undefined): CinematicQuote {
  const shotCount = Math.min(5, Math.max(1, board?.shots.length || 3));
  const usesH3 = hailuoH3Enabled();
  return quoteCinematic({
    shotCount,
    usesVeo: false,
    usesH3,
    durationSec: usesH3 ? MINIMAX_H3_DURATION_SEC : undefined,
    usdPerSecond: usesH3 ? hailuoH3UsdPerSecond() : undefined,
  });
}

async function synthesizeVoice(options: {
  text: string;
  dest: string;
  consent?: boolean;
}): Promise<"clone" | "tts" | "captions_only"> {
  const clone = voiceCloneReady(options.consent);
  if (clone.ok) {
    const key = process.env.ELEVENLABS_API_KEY!.trim();
    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: options.text.slice(0, 4_000),
        model_id: "eleven_monolingual_v1",
      }),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Voice synthesis failed (${response.status}).`), { status: 502 });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(options.dest, bytes);
    return "clone";
  }
  if (minimaxConfigured()) {
    await synthesizeMiniMaxSpeech({ text: options.text, dest: options.dest });
    return "tts";
  }
  return "captions_only";
}

function narrationFromScript(script: string | undefined): string {
  if (!script?.trim()) return "Cutroom slides. Inferred preview, not observed YouTube footage.";
  return script
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3_500);
}

async function finalizeRenderFile(
  request: RenderRequest,
  videoPath: string,
  audioPath: string | null,
): Promise<{ absolute: string; relative: string }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) {
    throw Object.assign(new Error("FFmpeg was not found. Install FFmpeg or set FFMPEG_PATH."), { status: 503 });
  }
  const output = await resolveRenderOutputPath({
    topic: request.topic,
    title: request.title,
    workflowId: request.workflowId,
    workflowTitle: request.workflowTitle,
  });
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "cutroom-mux-"));
  const muxed = path.join(tempRoot, "render.mp4");
  await muxAudioOntoVideo({
    ffmpeg,
    videoPath,
    audioPath,
    outPath: muxed,
    cwd: tempRoot,
  });
  const bytes = await readFile(muxed);
  await writeFile(output.absolute, bytes);
  return output;
}

export async function runRender(raw: unknown): Promise<RenderResult> {
  const parsed = renderRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid render request"), { status: 400, details: parsed.error.flatten() });
  }
  const request = parsed.data;

  if (request.engine === "shoot") {
    return { engine: "shoot", evidenceClass: "inferred", voiceSource: "none" };
  }

  if (request.engine === "cinematic") {
    if (request.board) {
      const snapshotId = request.snapshotId || request.board.snapshotId;
      const allowed = Array.from(new Set(request.board.storyboardPanels.flatMap((panel) => panel.evidenceClaimIds)));
      const sections = Array.from(new Set(request.board.storyboardPanels.map((panel) => panel.section)));
      const check = checkProductionBoard(request.board, {
        snapshotId,
        allowedClaimIds: allowed,
        throughlineSections: sections,
      });
      if (check.status === "fail") {
        throw Object.assign(new Error(check.issues.map((issue) => issue.message).join(" ")), { status: 400 });
      }
    }
    if (!request.confirmCinematic) {
      throw Object.assign(new Error("Cinematic render requires confirmCinematic after the cost quote."), { status: 400 });
    }
    if (hailuoH3Enabled()) {
      const output = await resolveRenderOutputPath({
        topic: request.topic,
        title: request.title,
        workflowId: request.workflowId,
        workflowTitle: request.workflowTitle,
      });
      const h3 = await generateHailuoH3Clip({
        topic: request.topic,
        title: request.title,
        scriptContent: request.scriptContent,
        board: request.board,
        thumbnailDataUrl: request.thumbnailDataUrl,
        maxShots: request.maxShots || 5,
        dest: output.absolute,
        durationSec: MINIMAX_H3_DURATION_SEC,
      });
      const shotCount = Math.min(5, request.board?.shots.length || request.maxShots || 3);
      return {
        engine: "cinematic",
        path: output.absolute,
        relativePath: output.relative,
        durationSec: h3.durationSec,
        evidenceClass: "inferred",
        voiceSource: "none",
        usesVeo: false,
        usesH3: true,
        videoModel: h3.model,
        shotCount,
      };
    }
  }

  const chapters = request.engine === "cinematic"
    ? (cinematicChaptersFromBoard(request.board, request.maxShots || 5) || request.chapters)
    : request.chapters;

  const assemble = await renderAssemblePreview({
    topic: request.topic,
    title: request.title,
    chapters,
    scriptContent: request.scriptContent,
    thumbnailDataUrl: request.thumbnailDataUrl,
    workflowId: request.workflowId,
    workflowTitle: request.workflowTitle,
  }, { ignorePreference: true });

  let voiceSource: RenderResult["voiceSource"] = "captions_only";
  let audioPath: string | null = null;
  if (request.engine === "slides" || request.engine === "cinematic") {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "cutroom-voice-"));
    const dest = path.join(tempRoot, "voice.mp3");
    try {
      voiceSource = await synthesizeVoice({
        text: narrationFromScript(request.scriptContent),
        dest,
        consent: request.voiceConsent,
      });
      if (voiceSource === "clone" || voiceSource === "tts") audioPath = dest;
    } catch {
      voiceSource = "captions_only";
      audioPath = null;
    }
  }

  const output = await finalizeRenderFile(request, assemble.path, audioPath);
  const shotCount = Math.min(5, request.board?.shots.length || request.maxShots || 3);

  return {
    engine: request.engine,
    path: output.absolute,
    relativePath: output.relative,
    durationSec: assemble.durationSec,
    evidenceClass: "inferred",
    voiceSource,
    usesVeo: false,
    usesH3: false,
    shotCount: request.engine === "cinematic" ? shotCount : undefined,
  };
}
