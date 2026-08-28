/**
 * Derive Shorts / clip briefs from a long-form script (L-313 / L-505).
 * Planning artifacts only — no renderer.
 */
import { chaptersFromScript, countWords, DEFAULT_TELEPROMPTER_WPM } from "./pace-chapters";

export interface ClipBrief {
  title: string;
  sectionTitle: string;
  hook: string;
  estimatedSec: number;
  sourceWordCount: number;
  evidenceClass: "inferred";
}

export function clipBriefsFromScript(
  script: string,
  options: { wpm?: number; maxClips?: number } = {},
): ClipBrief[] {
  const wpm = options.wpm ?? DEFAULT_TELEPROMPTER_WPM;
  const maxClips = options.maxClips ?? 8;
  const chapters = chaptersFromScript(script, wpm).filter((chapter) => chapter.wordCount >= 8);
  if (chapters.length === 0) {
    const words = countWords(script);
    if (words < 8) return [];
    const firstLine = script.trim().split(/\n/).find((line) => line.trim()) || "Clip";
    return [{
      title: firstLine.replace(/^#+\s*/, "").slice(0, 60),
      sectionTitle: "Full script",
      hook: firstLine.replace(/^#+\s*/, "").slice(0, 120),
      estimatedSec: Math.max(15, Math.round((words / wpm) * 60)),
      sourceWordCount: words,
      evidenceClass: "inferred",
    }];
  }

  return chapters.slice(0, maxClips).map((chapter) => {
    const estimatedSec = Math.max(15, Math.min(90, Math.round(chapter.durationSec)));
    return {
      title: chapter.title.slice(0, 60),
      sectionTitle: chapter.title,
      hook: `${chapter.title} — ${estimatedSec}s vertical cut`.slice(0, 120),
      estimatedSec,
      sourceWordCount: chapter.wordCount,
      evidenceClass: "inferred" as const,
    };
  });
}
