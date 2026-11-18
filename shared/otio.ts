import type { ProductionBoardOutput } from "./board-contracts";

/**
 * OpenTimelineIO 1.0 export from a Cutroom production Board (Cutroom Pro M0).
 *
 * One video track, clips in Board (shot) order, 24 fps by default. Clip names
 * and metadata carry the Board node id and throughline section, so a timeline
 * opened in FilmCraft / Premiere / DaVinci can be traced back to the Board
 * that produced it — and to the evidence ledger behind that Board.
 *
 * Media: the Board schema carries no media paths, so a shot with no supplied
 * media becomes a placeholder clip (`MissingReference`) with its shot name —
 * never an invented file path. Callers that do have media pass
 * `mediaByShotIndex` (shot index → file path or URL); those clips get an
 * `ExternalReference` instead. The export reports which shots were
 * placeholders so the UI can say so plainly.
 */

export const OTIO_DEFAULT_FPS = 24;
export const OTIO_DEFAULT_SHOT_SECONDS = 8;

export interface OtioBuildOptions {
  /** Frames per second. Default 24. */
  fps?: number;
  /** Timeline name. Default `Cutroom Board — <snapshotId>`. */
  name?: string;
  /**
   * Media for shots, keyed by shot index (0-based, Board order).
   * Values are file paths or URLs as supplied by the caller — never invented
   * here. A shot with no entry is a placeholder.
   */
  mediaByShotIndex?: Readonly<Record<number, string>>;
}

export interface OtioBuildResult {
  /** The OTIO 1.0 Timeline object, JSON-serialisable. */
  timeline: Record<string, unknown>;
  /** Shot names (in Board order) that have no media and were placeholders. */
  placeholders: string[];
  /** Total timeline duration in seconds. */
  durationSeconds: number;
  /** Frames per second used. */
  fps: number;
}

function rationalTime(value: number, rate: number): Record<string, unknown> {
  return { OTIO_SCHEMA: "RationalTime.1", rate, value };
}

function timeRange(startFrames: number, durationFrames: number, rate: number): Record<string, unknown> {
  return {
    OTIO_SCHEMA: "TimeRange.1",
    start_time: rationalTime(startFrames, rate),
    duration: rationalTime(durationFrames, rate),
  };
}

export function buildOtioTimeline(
  board: ProductionBoardOutput,
  options: OtioBuildOptions = {},
): OtioBuildResult {
  const fps = options.fps && Number.isFinite(options.fps) && options.fps > 0
    ? Math.floor(options.fps)
    : OTIO_DEFAULT_FPS;
  const panelById = new Map(board.storyboardPanels.map((panel) => [panel.id, panel]));
  const mediaByShotIndex = options.mediaByShotIndex || {};

  let cursorFrames = 0;
  const placeholders: string[] = [];
  const clips = board.shots.map((shot, index) => {
    const panel = panelById.get(shot.panelId);
    const seconds = shot.durationHintSec && Number.isFinite(shot.durationHintSec) && shot.durationHintSec > 0
      ? shot.durationHintSec
      : OTIO_DEFAULT_SHOT_SECONDS;
    const durationFrames = Math.max(1, Math.round(seconds * fps));
    const media = mediaByShotIndex[index];
    const hasMedia = typeof media === "string" && media.trim().length > 0;
    if (!hasMedia) placeholders.push(shot.shot);
    const clip = {
      OTIO_SCHEMA: "Clip.1",
      name: shot.shot,
      metadata: {
        cutroom: {
          boardNodeId: shot.panelId,
          shotIndex: index,
          section: panel?.section || "Section",
          camera: shot.camera,
          evidenceClass: shot.evidenceClass,
          evidenceClaimIds: [...shot.evidenceClaimIds],
          snapshotId: board.snapshotId,
          durationHintSeconds: seconds,
          durationHintInferred: !shot.durationHintSec,
          hasMedia,
        },
      },
      source_range: timeRange(0, durationFrames, fps),
      media_reference: hasMedia
        ? {
          OTIO_SCHEMA: "ExternalReference.1",
          target_url: media.trim(),
          available_range: timeRange(0, durationFrames, fps),
        }
        : { OTIO_SCHEMA: "MissingReference.1" },
    };
    cursorFrames += durationFrames;
    return clip;
  });

  const timeline = {
    OTIO_SCHEMA: "Timeline.1",
    name: options.name || `Cutroom Board — ${board.snapshotId}`,
    metadata: {
      cutroom: {
        snapshotId: board.snapshotId,
        source: "cutroom-production-board",
        fps,
        placeholders,
        note: placeholders.length > 0
          ? `${placeholders.length} of ${board.shots.length} shot(s) have no media yet and are placeholder clips (MissingReference). No file path was invented.`
          : "Every shot has a media reference.",
      },
    },
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "tracks",
      children: [
        {
          OTIO_SCHEMA: "Track.1",
          name: "V1",
          kind: "Video",
          children: clips,
        },
      ],
    },
  };

  return {
    timeline,
    placeholders,
    durationSeconds: cursorFrames / fps,
    fps,
  };
}
