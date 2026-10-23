/** Shot-list timeline for the Remotion side project. Not imported by the app. */

export const LAUNCH_VIDEO_FPS = 30;

export interface LaunchVideoScene {
  id: string;
  startSec: number;
  endSec: number;
  title: string;
}

export const LAUNCH_VIDEO_SCENES: readonly LaunchVideoScene[] = [
  { id: "montage", startSec: 0, endSec: 8, title: "Research, script, thumbnail" },
  { id: "promise", startSec: 8, endSec: 20, title: "From topic to ready to record" },
  { id: "problem", startSec: 20, endSec: 50, title: "Context disappears between tools" },
  { id: "search", startSec: 50, endSec: 65, title: "Search one public snapshot" },
  { id: "overview", startSec: 65, endSec: 100, title: "Scan the public sample" },
  { id: "sources", startSec: 100, endSec: 110, title: "Every source stays visible" },
  { id: "insights", startSec: 110, endSec: 145, title: "Observed, inferred, requires Studio" },
  { id: "ledger", startSec: 145, endSec: 155, title: "Open the evidence ledger" },
  { id: "ideas", startSec: 155, endSec: 185, title: "Choose one grounded idea" },
  { id: "script-form", startSec: 185, endSec: 205, title: "Carry the idea into the script" },
  { id: "teleprompter", startSec: 205, endSec: 235, title: "Read it on the teleprompter" },
  { id: "thumbnail", startSec: 235, endSec: 265, title: "Finish the thumbnail" },
  { id: "workflows", startSec: 265, endSec: 280, title: "Resume a local workflow" },
  { id: "settings", startSec: 280, endSec: 290, title: "Keys stay on this machine" },
  { id: "close", startSec: 290, endSec: 305, title: "Private preview" },
];

export function launchVideoDurationSec(scenes: readonly LaunchVideoScene[]): number {
  return scenes.at(-1)?.endSec ?? 0;
}

export function launchVideoFrameCount(scenes: readonly LaunchVideoScene[], fps = LAUNCH_VIDEO_FPS): number {
  return launchVideoDurationSec(scenes) * fps;
}

/** Returns an error string, or null when the timeline is contiguous. */
export function validateLaunchVideoTimeline(scenes: readonly LaunchVideoScene[]): string | null {
  if (scenes.length === 0) return "Launch video has no scenes.";
  if (scenes[0]?.startSec !== 0) return "Launch video must start at 0:00.";
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (!scene || scene.endSec <= scene.startSec) return `Scene ${scene?.id || index} has no duration.`;
    const previous = scenes[index - 1];
    if (previous && scene.startSec !== previous.endSec) {
      return `Scene ${scene.id} does not continue from ${previous.id}.`;
    }
  }
  return null;
}
