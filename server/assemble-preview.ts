/**
 * Assemble-only preview renderer (L-613–L-615).
 * Local FFmpeg template: title card + Ken Burns thumbnail + chapter cards + narration captions.
 * No generative video APIs.
 */
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile, constants as fsConstants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  DEFAULT_TELEPROMPTER_WPM,
  chaptersFromScript,
  formatChapterTimestamp,
  parseChapterTimestampSeconds,
} from "@shared/pace-chapters";
import { getEnvFilePaths } from "./env-path";
import { resolveWorkflowLibraryRoot, sanitizeTopicFolderName } from "./library-config";
import { readPreferences } from "./preferences";
import { getWorkflowTopicDirectory } from "./workflow-store";

export const assemblePreviewRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(120).optional(),
  chapters: z.array(z.object({
    timestamp: z.string().trim().min(1).max(16),
    title: z.string().trim().min(1).max(120),
  })).max(40).optional(),
  scriptContent: z.string().trim().max(80_000).optional(),
  thumbnailDataUrl: z.string().max(12_000_000).optional(),
  workflowId: z.string().trim().min(1).max(120).optional(),
  workflowTitle: z.string().trim().max(120).optional(),
}).strict();

export type AssemblePreviewRequest = z.infer<typeof assemblePreviewRequestSchema>;

export interface AssemblePreviewResult {
  engine: "assemble";
  path: string;
  relativePath: string;
  durationSec: number;
  ffmpegAvailable: true;
  /** Present when the caller needs inline bytes (export pack). */
  previewDataUrl?: string;
}

export interface AssembleSegment {
  kind: "title" | "chapter" | "kenburns";
  label: string;
  startSec: number;
  durationSec: number;
}

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const TITLE_CARD_SEC = 3;
const CHAPTER_CARD_SEC = 2;
const MAX_TOTAL_SEC = 60;
const MIN_KEN_BURNS_SEC = 4;

export function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

export function escapeAssText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function formatAssTime(totalSeconds: number): string {
  const sec = Math.max(0, totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const centis = Math.floor((sec % 1) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function buildAssembleTimeline(input: {
  title: string;
  chapters: { timestamp: string; title: string }[];
  scriptContent?: string;
}): { segments: AssembleSegment[]; durationSec: number; captionCues: { startSec: number; endSec: number; text: string }[] } {
  const displayTitle = input.title.trim() || "Cutroom preview";
  const paceChapters = input.scriptContent?.trim()
    ? chaptersFromScript(input.scriptContent, DEFAULT_TELEPROMPTER_WPM).slice(0, 12)
    : [];

  const chapterSources = (paceChapters.length > 0
    ? paceChapters.map((chapter) => ({
      title: chapter.title,
      durationSec: Math.max(3, Math.min(18, chapter.durationSec)),
    }))
    : (input.chapters.length > 0
      ? input.chapters.map((chapter, index, all) => {
        const start = parseChapterTimestampSeconds(chapter.timestamp) ?? index * 30;
        const nextStart = index + 1 < all.length
          ? (parseChapterTimestampSeconds(all[index + 1].timestamp) ?? start + 30)
          : start + 30;
        return {
          title: chapter.title,
          durationSec: Math.max(3, Math.min(18, nextStart - start)),
        };
      })
      : [{ title: "Main", durationSec: 12 }]));

  const segments: AssembleSegment[] = [];
  const captionCues: { startSec: number; endSec: number; text: string }[] = [];
  let cursor = 0;

  segments.push({
    kind: "title",
    label: displayTitle,
    startSec: cursor,
    durationSec: TITLE_CARD_SEC,
  });
  captionCues.push({
    startSec: cursor + 0.4,
    endSec: cursor + TITLE_CARD_SEC - 0.2,
    text: displayTitle.slice(0, 80),
  });
  cursor += TITLE_CARD_SEC;

  for (const chapter of chapterSources) {
    if (cursor + CHAPTER_CARD_SEC + MIN_KEN_BURNS_SEC > MAX_TOTAL_SEC) break;

    segments.push({
      kind: "chapter",
      label: chapter.title,
      startSec: cursor,
      durationSec: CHAPTER_CARD_SEC,
    });
    captionCues.push({
      startSec: cursor + 0.2,
      endSec: cursor + CHAPTER_CARD_SEC - 0.15,
      text: chapter.title.slice(0, 60),
    });
    cursor += CHAPTER_CARD_SEC;

    const remaining = MAX_TOTAL_SEC - cursor;
    if (remaining < MIN_KEN_BURNS_SEC) break;
    const kenSec = Math.min(chapter.durationSec, remaining);
    segments.push({
      kind: "kenburns",
      label: chapter.title,
      startSec: cursor,
      durationSec: kenSec,
    });
    captionCues.push({
      startSec: cursor + 0.3,
      endSec: cursor + Math.min(kenSec, 6),
      text: `Chapter · ${formatChapterTimestamp(cursor)} · ${chapter.title}`.slice(0, 90),
    });
    cursor += kenSec;
  }

  if (segments.filter((segment) => segment.kind === "kenburns").length === 0) {
    const kenSec = Math.min(12, MAX_TOTAL_SEC - cursor);
    if (kenSec >= MIN_KEN_BURNS_SEC) {
      segments.push({
        kind: "kenburns",
        label: displayTitle,
        startSec: cursor,
        durationSec: kenSec,
      });
      cursor += kenSec;
    }
  }

  return { segments, durationSec: cursor, captionCues };
}

export function buildAssFile(
  cues: { startSec: number; endSec: number; text: string }[],
): string {
  const header = `[Script Info]
Title: Cutroom assemble preview
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Helvetica,42,&H00FFFFFF,&H000000FF,&H00404040,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,48,48,48,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues.map((cue) => (
    `Dialogue: 0,${formatAssTime(cue.startSec)},${formatAssTime(cue.endSec)},Default,,0,0,0,,${escapeAssText(cue.text)}`
  ));
  return `${header}${events.join("\n")}\n`;
}

export async function resolveFfmpegBinary(): Promise<string | null> {
  const candidates = [
    process.env.FFMPEG_PATH?.trim(),
    "ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (candidate.includes("/") || candidate.startsWith(".")) {
        await access(candidate, fsConstants.X_OK);
        return candidate;
      }
      const found = await new Promise<string | null>((resolve) => {
        const child = spawn("which", [candidate], { stdio: ["ignore", "pipe", "ignore"] });
        let out = "";
        child.stdout.on("data", (chunk) => { out += String(chunk); });
        child.on("close", (code) => resolve(code === 0 ? out.trim().split("\n")[0] || null : null));
        child.on("error", () => resolve(null));
      });
      if (found) return found;
    } catch {
      // try next
    }
  }
  return null;
}

async function writeThumbnailFile(dataUrl: string | undefined, dest: string): Promise<void> {
  if (dataUrl?.startsWith("data:")) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      await writeFile(dest, Buffer.from(match[2], "base64"));
      return;
    }
  }
  // 1x1 PNG placeholder — FFmpeg will scale/pad it
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await writeFile(dest, tinyPng);
}

export function runFfmpeg(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (exit ${code}). ${stderr.trim().slice(-800)}`));
    });
  });
}

async function resolveOutputPath(input: AssemblePreviewRequest): Promise<{ absolute: string; relative: string }> {
  if (input.workflowId) {
    const topicDir = await getWorkflowTopicDirectory(input.workflowId);
    if (topicDir) {
      await mkdir(topicDir, { recursive: true });
      return {
        absolute: path.join(topicDir, "preview.mp4"),
        relative: path.join(path.basename(topicDir), "preview.mp4"),
      };
    }
  }

  const { storageRoot, arrangedByTopic } = await resolveWorkflowLibraryRoot();
  const folderName = input.workflowId
    ? sanitizeTopicFolderName(input.workflowTitle || input.topic, input.workflowId)
    : sanitizeTopicFolderName(input.topic, "preview");
  const dir = arrangedByTopic
    ? path.join(storageRoot, folderName)
    : path.join(getEnvFilePaths().root, "previews", folderName);
  await mkdir(dir, { recursive: true });
  return {
    absolute: path.join(dir, "preview.mp4"),
    relative: arrangedByTopic ? path.join(folderName, "preview.mp4") : path.join("previews", folderName, "preview.mp4"),
  };
}

export async function resolveRenderOutputPath(input: AssemblePreviewRequest): Promise<{ absolute: string; relative: string }> {
  const preview = await resolveOutputPath(input);
  return {
    absolute: preview.absolute.replace(/preview\.mp4$/, "render.mp4"),
    relative: preview.relative.replace(/preview\.mp4$/, "render.mp4"),
  };
}

export async function muxAudioOntoVideo(options: {
  ffmpeg: string;
  videoPath: string;
  audioPath: string | null;
  outPath: string;
  cwd: string;
}): Promise<void> {
  if (options.audioPath) {
    await runFfmpeg(options.ffmpeg, [
      "-y",
      "-i", options.videoPath,
      "-i", options.audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      "-movflags", "+faststart",
      options.outPath,
    ], options.cwd);
    return;
  }
  await runFfmpeg(options.ffmpeg, [
    "-y",
    "-i", options.videoPath,
    "-f", "lavfi",
    "-i", "anullsrc=r=44100:cl=stereo",
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
    "-movflags", "+faststart",
    options.outPath,
  ], options.cwd);
}

function runPythonCard(args: string[]): Promise<void> {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "assemble-cards.py");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Card render failed (exit ${code}). ${stderr.trim().slice(-400)}`));
    });
  });
}

async function writeCardPng(
  mode: "title" | "chapter" | "caption",
  text: string,
  dest: string,
): Promise<void> {
  await runPythonCard([
    "--mode", mode,
    "--text", text.slice(0, 140),
    "--out", dest,
    "--width", String(WIDTH),
    "--height", String(HEIGHT),
  ]);
}

/**
 * Render assemble-only preview.mp4 into the workflow library folder.
 */
export async function renderAssemblePreview(
  raw: AssemblePreviewRequest,
  options: { includeDataUrl?: boolean; ignorePreference?: boolean } = {},
): Promise<AssemblePreviewResult> {
  const prefs = await readPreferences();
  if (!options.ignorePreference && !prefs.assemblePreviewEnabled) {
    throw Object.assign(new Error("Assemble preview is disabled in Settings."), { status: 400 });
  }

  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) {
    throw Object.assign(
      new Error("FFmpeg was not found. Install FFmpeg or set FFMPEG_PATH."),
      { status: 503 },
    );
  }

  const title = (raw.title || raw.topic).trim();
  const timeline = buildAssembleTimeline({
    title,
    chapters: raw.chapters || [],
    scriptContent: raw.scriptContent,
  });

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "cutroom-assemble-"));
  try {
    const thumbPath = path.join(tempRoot, "thumb.png");
    const outTemp = path.join(tempRoot, "preview.mp4");
    await writeThumbnailFile(raw.thumbnailDataUrl, thumbPath);

    const args: string[] = ["-y"];
    const filterParts: string[] = [];
    const concatLabels: string[] = [];
    let inputIndex = 0;

    for (let i = 0; i < timeline.segments.length; i += 1) {
      const segment = timeline.segments[i];
      const label = `v${i}`;
      concatLabels.push(`[${label}]`);
      const frames = Math.max(1, Math.round(segment.durationSec * FPS));

      if (segment.kind === "title" || segment.kind === "chapter") {
        const cardPath = path.join(tempRoot, `card-${i}.png`);
        await writeCardPng(segment.kind, segment.label, cardPath);
        args.push("-loop", "1", "-t", String(segment.durationSec), "-i", cardPath);
        filterParts.push(
          `[${inputIndex}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,`
          + `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},`
          + `trim=duration=${segment.durationSec},setpts=PTS-STARTPTS[${label}]`,
        );
        inputIndex += 1;
      } else {
        const captionPath = path.join(tempRoot, `caption-${i}.png`);
        await writeCardPng("caption", `Chapter · ${segment.label}`, captionPath);
        args.push("-loop", "1", "-t", String(segment.durationSec), "-i", thumbPath);
        args.push("-loop", "1", "-t", String(segment.durationSec), "-i", captionPath);
        const thumbIn = inputIndex;
        const capIn = inputIndex + 1;
        filterParts.push(
          `[${thumbIn}:v]scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase,`
          + `crop=${WIDTH * 2}:${HEIGHT * 2},`
          + `zoompan=z='min(zoom+0.0012,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':`
          + `d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},`
          + `trim=duration=${segment.durationSec},setpts=PTS-STARTPTS[kb${i}];`
          + `[${capIn}:v]scale=${WIDTH}:${HEIGHT},format=rgba[cap${i}];`
          + `[kb${i}][cap${i}]overlay=0:0:format=auto,format=yuv420p[${label}]`,
        );
        inputIndex += 2;
      }
    }

    const filter = `${filterParts.join(";")};${concatLabels.join("")}concat=n=${timeline.segments.length}:v=1:a=0[vout]`;
    args.push(
      "-filter_complex", filter,
      "-map", "[vout]",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-t", String(timeline.durationSec),
      outTemp,
    );

    await runFfmpeg(ffmpeg, args, tempRoot);

    const output = await resolveOutputPath(raw);
    const bytes = await readFile(outTemp);
    await writeFile(output.absolute, bytes);

    return {
      engine: "assemble",
      path: output.absolute,
      relativePath: output.relative,
      durationSec: timeline.durationSec,
      ffmpegAvailable: true,
      ...(options.includeDataUrl
        ? { previewDataUrl: `data:video/mp4;base64,${bytes.toString("base64")}` }
        : {}),
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Absolute path to a workflow's mirrored preview.mp4, if present. */
export async function resolveWorkflowPreviewPath(workflowId: string): Promise<string | null> {
  if (!workflowId.trim()) return null;
  const topicDir = await getWorkflowTopicDirectory(workflowId);
  if (!topicDir) return null;
  const candidate = path.join(topicDir, "preview.mp4");
  try {
    await access(candidate, fsConstants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

/** Absolute path to a workflow's render.mp4 (slides/cinematic), if present. */
export async function resolveWorkflowRenderPath(workflowId: string): Promise<string | null> {
  if (!workflowId.trim()) return null;
  const topicDir = await getWorkflowTopicDirectory(workflowId);
  if (!topicDir) return null;
  const candidate = path.join(topicDir, "render.mp4");
  try {
    await access(candidate, fsConstants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

export async function getAssemblePreviewStatus(): Promise<{
  assemblePreviewEnabled: boolean;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  engine: "assemble";
}> {
  const prefs = await readPreferences();
  const ffmpegPath = await resolveFfmpegBinary();
  return {
    assemblePreviewEnabled: prefs.assemblePreviewEnabled,
    ffmpegAvailable: Boolean(ffmpegPath),
    ffmpegPath,
    engine: "assemble",
  };
}
