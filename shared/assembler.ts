import { z } from "zod";
import type { ProductionBoardOutput } from "./board-contracts";
import { OTIO_DEFAULT_FPS, OTIO_DEFAULT_SHOT_SECONDS } from "./otio";

/**
 * Cutroom Pro M1 — Assembler agent (pure plan layer).
 *
 * The assembler turns a production Board into an ordered assembly plan:
 * one step per Board shot (place clip on V1), a caption track from the
 * shot text, music ducking under narration, a loudness step, and an H.264
 * export. The plan is plain data — inspectable before anything executes —
 * and every step is an `assembler.*` command dispatched through the M0
 * command registry (shared/commands.ts), so each step leaves an audit
 * entry and no step executes without a receipt entry.
 *
 * Honesty rules, carried over from M0:
 * - Caption text comes only from caller-supplied text or the panel's
 *   `onScreenText`. A shot with neither gets NO caption cue, recorded as
 *   such — never invented narration.
 * - A shot with no media gets a place step marked skipped ("no media") —
 *   never an invented file path.
 * - Loudness is never an invented number. filmcraft-cli v0.20.1 has NO
 *   loudness-meter command (718 commands checked); loudness is applied at
 *   export via `loudnessLufs`, and the receipt says "not measured".
 * - Ducking is deterministic math in the plan (music at -12 dB under each
 *   narration segment, 0 dB between them); what the CLI actually returns
 *   (keyframes generated) is recorded separately in the receipt.
 */

export const ASSEMBLER_DEFAULT_FPS = OTIO_DEFAULT_FPS;
export const ASSEMBLER_DEFAULT_SHOT_SECONDS = OTIO_DEFAULT_SHOT_SECONDS;
/** Music bed reduction under narration, in dB (Essential Sound ducking). */
export const ASSEMBLER_DUCK_DB = -12;
/** Loudness target applied at export (LUFS). NOT a measurement. */
export const ASSEMBLER_LOUDNESS_TARGET_LUFS = -16;
/** FilmCraft demo-project media item ids (stable in the v0.20.1 demo project). */
export const DEMO_MEDIA_ITEMS = [5, 6, 7] as const;
export const DEMO_MUSIC_ITEM = 11;

export interface AssemblerMusicBed {
  /** File path or URL of the music bed, as supplied by the caller. */
  path?: string;
  /** Use the FilmCraft demo project's Ambient_Score.wav (item 11). */
  demo?: boolean;
}

export interface AssemblerPlanOptions {
  fps?: number;
  /** Media for shots, keyed by shot index (0-based, Board order). Never invented here. */
  mediaByShotIndex?: Readonly<Record<number, string>>;
  /** Caption/narration text per shot, keyed by shot index. Overrides panel onScreenText. */
  captionByShotIndex?: Readonly<Record<number, string>>;
  /** Music bed (file path, or { demo: true }). Omit for no music / no ducking. */
  musicBed?: AssemblerMusicBed;
  /** Use the FilmCraft demo project's media for the first shots + music. Try-it path; needs the CLI demo project. */
  demoMedia?: boolean;
  /** Sequence/export frame size. Default 1920x1080; the VM E2E uses 640x360 to keep renders fast. */
  exportWidth?: number;
  exportHeight?: number;
  /** Export file name inside the run directory. Default `cutroom-assemble-<snapshotId>.mp4`. */
  exportFileName?: string;
  /** Loudness target applied at export (LUFS). Default -16. Not a measurement. */
  loudnessTargetLufs?: number;
}

export const assemblerMusicBedSchema = z.union([
  z.object({ path: z.string().trim().min(1).max(2_000) }).strict(),
  z.object({ demo: z.literal(true) }).strict(),
]);

export const assemblerPlanOptionsSchema = z.object({
  fps: z.number().int().min(1).max(240).optional(),
  mediaByShotIndex: z.record(z.string(), z.string().trim().min(1).max(2_000)).optional(),
  captionByShotIndex: z.record(z.string(), z.string().trim().min(1).max(2_000)).optional(),
  musicBed: assemblerMusicBedSchema.optional(),
  demoMedia: z.boolean().optional(),
  exportWidth: z.number().int().min(16).max(7680).optional(),
  exportHeight: z.number().int().min(16).max(4320).optional(),
  exportFileName: z.string().trim().min(1).max(128).optional(),
  loudnessTargetLufs: z.number().min(-70).max(0).optional(),
}).strict();

export type AssemblerPlanOptionsInput = z.infer<typeof assemblerPlanOptionsSchema>;

/** One step of an assembly plan. `filmcraftCommand` is null for steps the CLI cannot do (skips / notes). */
export const assemblerStepSchema = z.object({
  seq: z.number().int().min(1),
  command: z.string().min(1),
  label: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  filmcraftCommand: z.string().min(1).nullable(),
  filmcraftParams: z.record(z.string(), z.unknown()).nullable(),
  /** Present when the step is planned as skipped (e.g. shot has no media). */
  skipReason: z.string().min(1).optional(),
}).strict();

export type AssemblyStep = z.infer<typeof assemblerStepSchema>;

export interface CaptionCue {
  index: number;
  shotIndex: number;
  startSeconds: number;
  endSeconds: number;
  startFrame: number;
  endFrame: number;
  text: string;
  /** Where the text came from: caller-supplied, or the panel's on-screen text. */
  source: "supplied" | "onScreenText";
}

export interface CaptionPlan {
  cues: CaptionCue[];
  /** Shot names (Board order) with no caption text — no cue was invented for them. */
  captionless: string[];
  srt: string;
  vtt: string;
}

export interface DuckingKeyframe {
  atSeconds: number;
  levelDb: number;
}

export interface DuckingPlan {
  applied: boolean;
  reduceDb: number;
  /** Music level over time: -12 dB under each narration segment, 0 dB between them. */
  keyframes: DuckingKeyframe[];
  /** Narration segments the ducking follows (the caption cues). */
  segments: Array<{ startSeconds: number; endSeconds: number; levelDb: number }>;
  note: string;
}

export interface AssemblyPlan {
  snapshotId: string;
  fps: number;
  totalSeconds: number;
  demoMedia: boolean;
  steps: AssemblyStep[];
  captions: CaptionPlan;
  ducking: DuckingPlan;
  /** Shot names (Board order) with no media — their place steps are skipped. */
  placeholders: string[];
  loudness: {
    measured: false;
    reason: string;
    targetLufs: number;
    appliedAtExport: true;
  };
  exportFileName: string;
}

function shotSeconds(shot: ProductionBoardOutput["shots"][number]): number {
  return shot.durationHintSec && Number.isFinite(shot.durationHintSec) && shot.durationHintSec > 0
    ? shot.durationHintSec
    : ASSEMBLER_DEFAULT_SHOT_SECONDS;
}

function formatTimestamp(totalSeconds: number): { srt: string; vtt: string } {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const base = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return { srt: `${base},${pad(millis, 3)}`, vtt: `${base}.${pad(millis, 3)}` };
}

export function buildCaptions(
  board: ProductionBoardOutput,
  options: { fps?: number; captionByShotIndex?: Readonly<Record<number, string>> } = {},
): CaptionPlan {
  const fps = options.fps && Number.isFinite(options.fps) && options.fps > 0
    ? Math.floor(options.fps)
    : ASSEMBLER_DEFAULT_FPS;
  const panelById = new Map(board.storyboardPanels.map((panel) => [panel.id, panel]));
  const cues: CaptionCue[] = [];
  const captionless: string[] = [];
  let cursorSeconds = 0;
  board.shots.forEach((shot, index) => {
    const seconds = shotSeconds(shot);
    const startSeconds = cursorSeconds;
    const endSeconds = cursorSeconds + seconds;
    const supplied = options.captionByShotIndex?.[index];
    const panelText = panelById.get(shot.panelId)?.onScreenText;
    const text = (typeof supplied === "string" && supplied.trim().length > 0
      ? supplied.trim()
      : typeof panelText === "string" && panelText.trim().length > 0
        ? panelText.trim()
        : "");
    if (text) {
      cues.push({
        index: cues.length,
        shotIndex: index,
        startSeconds,
        endSeconds,
        startFrame: Math.round(startSeconds * fps),
        endFrame: Math.round(endSeconds * fps),
        text,
        source: typeof supplied === "string" && supplied.trim().length > 0 ? "supplied" : "onScreenText",
      });
    } else {
      captionless.push(shot.shot);
    }
    cursorSeconds = endSeconds;
  });

  const srt = cues.map((cue) => {
    const start = formatTimestamp(cue.startSeconds).srt;
    const end = formatTimestamp(cue.endSeconds).srt;
    return `${cue.index + 1}\n${start} --> ${end}\n${cue.text}`;
  }).join("\n\n") + (cues.length > 0 ? "\n" : "");
  const vtt = "WEBVTT\n\n" + cues.map((cue) => {
    const start = formatTimestamp(cue.startSeconds).vtt;
    const end = formatTimestamp(cue.endSeconds).vtt;
    return `${start} --> ${end}\n${cue.text}`;
  }).join("\n\n") + (cues.length > 0 ? "\n" : "");

  return { cues, captionless, srt, vtt };
}

export function buildDuckingPlan(
  cues: CaptionCue[],
  hasMusic: boolean,
): DuckingPlan {
  if (!hasMusic) {
    return {
      applied: false,
      reduceDb: ASSEMBLER_DUCK_DB,
      keyframes: [],
      segments: [],
      note: "No music bed supplied — ducking not applied.",
    };
  }
  if (cues.length === 0) {
    return {
      applied: true,
      reduceDb: ASSEMBLER_DUCK_DB,
      keyframes: [{ atSeconds: 0, levelDb: 0 }],
      segments: [],
      note: "Music bed present but there are no narration segments, so the music stays at 0 dB throughout.",
    };
  }
  const keyframes: DuckingKeyframe[] = [];
  const segments = cues.map((cue) => ({
    startSeconds: cue.startSeconds,
    endSeconds: cue.endSeconds,
    levelDb: ASSEMBLER_DUCK_DB,
  }));
  if (cues[0].startSeconds > 0) keyframes.push({ atSeconds: 0, levelDb: 0 });
  for (const cue of cues) {
    keyframes.push({ atSeconds: cue.startSeconds, levelDb: ASSEMBLER_DUCK_DB });
    keyframes.push({ atSeconds: cue.endSeconds, levelDb: 0 });
  }
  return {
    applied: true,
    reduceDb: ASSEMBLER_DUCK_DB,
    keyframes,
    segments,
    note: `Music bed reduced to ${ASSEMBLER_DUCK_DB} dB under each of the ${cues.length} narration segment(s), restored to 0 dB between them.`,
  };
}

/**
 * Resolve the media for a shot: demo item id, caller-supplied path, or none.
 * Returns { kind: "demo", item } | { kind: "path", path } | { kind: "none" }.
 */
export function resolveShotMedia(
  shotIndex: number,
  options: AssemblerPlanOptions,
): { kind: "demo"; item: number } | { kind: "path"; path: string } | { kind: "none" } {
  if (options.demoMedia && shotIndex < DEMO_MEDIA_ITEMS.length) {
    return { kind: "demo", item: DEMO_MEDIA_ITEMS[shotIndex] };
  }
  const supplied = options.mediaByShotIndex?.[shotIndex];
  if (typeof supplied === "string" && supplied.trim().length > 0) {
    return { kind: "path", path: supplied.trim() };
  }
  return { kind: "none" };
}

export function buildAssemblyPlan(
  board: ProductionBoardOutput,
  options: AssemblerPlanOptions = {},
): AssemblyPlan {
  const fps = options.fps && Number.isFinite(options.fps) && options.fps > 0
    ? Math.floor(options.fps)
    : ASSEMBLER_DEFAULT_FPS;
  const loudnessTargetLufs = options.loudnessTargetLufs ?? ASSEMBLER_LOUDNESS_TARGET_LUFS;
  const exportWidth = options.exportWidth ?? 1920;
  const exportHeight = options.exportHeight ?? 1080;
  const safeSnapshot = board.snapshotId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "board";
  const exportFileName = options.exportFileName || `cutroom-assemble-${safeSnapshot}.mp4`;

  const captions = buildCaptions(board, { fps, captionByShotIndex: options.captionByShotIndex });
  const hasMusic = Boolean(options.demoMedia || options.musicBed);
  const ducking = buildDuckingPlan(captions.cues, hasMusic);

  const steps: AssemblyStep[] = [];
  const placeholders: string[] = [];
  let seq = 0;
  const next = (
    command: string,
    label: string,
    params: Record<string, unknown>,
    filmcraftCommand: string | null,
    filmcraftParams: Record<string, unknown> | null,
    skipReason?: string,
  ): void => {
    seq += 1;
    steps.push({
      seq,
      command,
      label,
      params,
      filmcraftCommand,
      filmcraftParams,
      ...(skipReason ? { skipReason } : {}),
    });
  };

  next(
    "assembler.new-sequence",
    "Create sequence",
    { name: `Cutroom — ${board.snapshotId}`, width: exportWidth, height: exportHeight, fps },
    "file.newSequence",
    { name: `Cutroom — ${board.snapshotId}`, width: exportWidth, height: exportHeight, fps, video: 3, audio: 3 },
  );

  let cursorSeconds = 0;
  board.shots.forEach((shot, index) => {
    const seconds = shotSeconds(shot);
    const startSeconds = cursorSeconds;
    cursorSeconds += seconds;
    const media = resolveShotMedia(index, options);
    if (media.kind === "path") {
      next(
        "assembler.import-media",
        `Import media for shot ${index + 1} (${shot.shot.slice(0, 40)})`,
        { shotIndex: index, path: media.path },
        "file.import",
        { paths: [media.path] },
      );
      next(
        "assembler.place-clip",
        `Place shot ${index + 1} on V1 at ${startSeconds}s for ${seconds}s`,
        { shotIndex: index, track: "V1", startSeconds, durationSeconds: seconds },
        "timeline.place",
        { item: "$item:shot-" + index, track: "V1", seconds: startSeconds, duration: { seconds } },
      );
    } else if (media.kind === "demo") {
      next(
        "assembler.place-clip",
        `Place shot ${index + 1} on V1 at ${startSeconds}s for ${seconds}s (demo footage)`,
        { shotIndex: index, track: "V1", startSeconds, durationSeconds: seconds, demoItem: media.item },
        "timeline.place",
        { item: media.item, track: "V1", seconds: startSeconds, duration: { seconds } },
      );
    } else {
      placeholders.push(shot.shot);
      next(
        "assembler.place-clip",
        `Place shot ${index + 1} on V1 — skipped, no media`,
        { shotIndex: index, track: "V1", startSeconds, durationSeconds: seconds },
        null,
        null,
        `Shot "${shot.shot}" has no media yet — no file path was invented.`,
      );
    }
  });

  if (options.demoMedia) {
    next(
      "assembler.place-music",
      "Place demo music bed (Ambient_Score) on A1",
      { track: "A1", startSeconds: 0, durationSeconds: cursorSeconds, demoItem: DEMO_MUSIC_ITEM },
      "timeline.place",
      { item: DEMO_MUSIC_ITEM, track: "A1", seconds: 0, duration: { seconds: cursorSeconds } },
    );
  } else if (options.musicBed?.path) {
    next(
      "assembler.import-media",
      "Import music bed",
      { shotIndex: -1, path: options.musicBed.path },
      "file.import",
      { paths: [options.musicBed.path] },
    );
    next(
      "assembler.place-music",
      "Place music bed on A1",
      { track: "A1", startSeconds: 0, durationSeconds: cursorSeconds },
      "timeline.place",
      { item: "$item:music", track: "A1", seconds: 0, duration: { seconds: cursorSeconds } },
    );
  }

  if (hasMusic) {
    next(
      "assembler.duck-music",
      `Duck music to ${ASSEMBLER_DUCK_DB} dB under narration`,
      { reduceDb: ASSEMBLER_DUCK_DB, segments: ducking.segments },
      "essentialSound.set",
      { key: "ducking.reduceDb", value: ASSEMBLER_DUCK_DB },
    );
  }

  if (captions.cues.length > 0) {
    next(
      "assembler.add-captions",
      `Add caption track (${captions.cues.length} cue(s))`,
      { cues: captions.cues.map((cue) => ({ shotIndex: cue.shotIndex, startSeconds: cue.startSeconds, endSeconds: cue.endSeconds, text: cue.text, source: cue.source })) },
      "captions.newTrack",
      { format: "Subtitle", name: "Captions", language: "en" },
    );
  } else {
    next(
      "assembler.add-captions",
      "Add caption track — skipped, no caption text",
      { cues: [] },
      null,
      null,
      "No shot has caption text (no supplied text, no panel on-screen text) — no cue was invented.",
    );
  }

  next(
    "assembler.check-loudness",
    "Loudness check (no meter in filmcraft-cli — applied at export)",
    { targetLufs: loudnessTargetLufs },
    null,
    null,
    "filmcraft-cli v0.20.1 has no loudness-meter command; loudness is applied at export via loudnessLufs and is not measured.",
  );

  next(
    "assembler.export",
    `Export H.264 MP4 (${exportWidth}x${exportHeight}, ${fps} fps, loudness ${loudnessTargetLufs} LUFS)`,
    { fileName: exportFileName, format: "h264", width: exportWidth, height: exportHeight, fps, loudnessLufs: loudnessTargetLufs },
    "file.exportMedia",
    { path: "$exportPath", format: "h264", width: exportWidth, height: exportHeight, fps, loudnessLufs: loudnessTargetLufs },
  );

  return {
    snapshotId: board.snapshotId,
    fps,
    totalSeconds: cursorSeconds,
    demoMedia: Boolean(options.demoMedia),
    steps,
    captions,
    ducking,
    placeholders,
    loudness: {
      measured: false,
      reason: "filmcraft-cli v0.20.1 has no loudness-meter command (718 commands checked); loudness is applied at export via loudnessLufs and is not measured.",
      targetLufs: loudnessTargetLufs,
      appliedAtExport: true,
    },
    exportFileName,
  };
}
