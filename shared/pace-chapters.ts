/** Pace-accurate YouTube chapter timestamps from teleprompter WPM × section words (L-612). */

export const DEFAULT_TELEPROMPTER_WPM = 150;

export interface PaceSectionInput {
  title: string;
  /** Spoken / body word count for the section. */
  wordCount: number;
}

export interface PaceChapter {
  timestamp: string;
  title: string;
  startSec: number;
  durationSec: number;
  wordCount: number;
}

export interface ChapterMarker {
  timestamp: string;
  title: string;
}

const KEYWORD_SECTION_RE =
  /^(?:#{1,6}\s+)?(?:\*\*)?(HOOK|INTRODUCTION|INTRO|OPENING|MAIN\s*CONTENT|BODY|CONTENT|CALL[\s-]*TO[\s-]*ACTION|CTA|OUTRO|CONCLUSION|CLOSING|SOLUTION\s*PROMISE)(?:\*\*)?\s*[:.\-]?/i;

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Format seconds as YouTube chapter timestamp (`M:SS` or `H:MM:SS`). */
export function formatChapterTimestamp(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Parse `M:SS` or `H:MM:SS` chapter timestamps. Returns null when invalid. */
export function parseChapterTimestampSeconds(timestamp: string): number | null {
  const trimmed = timestamp.trim();
  const three = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(trimmed);
  if (three) {
    return Number(three[1]) * 3600 + Number(three[2]) * 60 + Number(three[3]);
  }
  const two = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (two) {
    return Number(two[1]) * 60 + Number(two[2]);
  }
  return null;
}

function keywordSectionTitle(line: string): string | null {
  const match = KEYWORD_SECTION_RE.exec(line.trim());
  if (!match) return null;
  const raw = match[1].replace(/\s+/g, " ").toUpperCase();
  if (/^INTRO$/i.test(raw) || /^INTRODUCTION$/i.test(raw) || /^SOLUTION\s*PROMISE$/i.test(raw)) {
    return "INTRODUCTION";
  }
  if (/^OPENING$/i.test(raw) || /^HOOK$/i.test(raw)) return "HOOK";
  if (/^MAIN\s*CONTENT$/i.test(raw) || /^BODY$/i.test(raw) || /^CONTENT$/i.test(raw)) {
    return "MAIN CONTENT";
  }
  if (/^CALL/i.test(raw) || /^CTA$/i.test(raw) || /^OUTRO$/i.test(raw) || /^CONCLUSION$/i.test(raw) || /^CLOSING$/i.test(raw)) {
    return "CALL-TO-ACTION";
  }
  return normalizeTitle(raw);
}

function markdownSectionTitle(line: string): string | null {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
  if (!match) return null;
  const raw = match[2]
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .replace(/\*\*/g, "")
    .trim();
  return raw ? normalizeTitle(raw) : null;
}

function sectionTitleFromLine(line: string): string | null {
  const markdown = markdownSectionTitle(line);
  if (markdown) return markdown;
  return keywordSectionTitle(line);
}

/**
 * Split a script into titled sections and count words in each body.
 * Falls back to a single "Full script" section when no headers are found.
 */
export function sectionsFromScript(script: string): PaceSectionInput[] {
  const lines = script.split(/\r?\n/);
  const sections: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const title = sectionTitleFromLine(line);
    if (title) {
      if (current) sections.push(current);
      current = { title, body: [] };
      continue;
    }
    if (!current) {
      current = { title: "Full script", body: [] };
    }
    current.body.push(line);
  }
  if (current) sections.push(current);

  const counted = sections
    .map((section) => ({
      title: section.title,
      wordCount: countWords(section.body.join("\n")),
    }))
    .filter((section) => section.wordCount > 0 || sections.length === 1);

  if (counted.length === 0) {
    const words = countWords(script);
    return words > 0 ? [{ title: "Full script", wordCount: words }] : [];
  }

  // Drop a leading empty "Full script" shell if real headers follow.
  if (
    counted.length > 1
    && counted[0].title === "Full script"
    && counted[0].wordCount === 0
  ) {
    return counted.slice(1);
  }

  return counted;
}

/** Emit chapter markers: each section starts when prior sections finish at the given WPM. */
export function chaptersFromPace(
  sections: readonly PaceSectionInput[],
  wpm: number = DEFAULT_TELEPROMPTER_WPM,
): PaceChapter[] {
  const safeWpm = Number.isFinite(wpm) && wpm > 0 ? wpm : DEFAULT_TELEPROMPTER_WPM;
  let elapsed = 0;
  const chapters: PaceChapter[] = [];

  for (const section of sections) {
    const wordCount = Math.max(0, Math.floor(section.wordCount));
    const durationSec = wordCount === 0 ? 0 : (wordCount / safeWpm) * 60;
    const title = normalizeTitle(section.title) || "Section";
    chapters.push({
      timestamp: formatChapterTimestamp(elapsed),
      title,
      startSec: elapsed,
      durationSec,
      wordCount,
    });
    elapsed += durationSec;
  }

  return chapters;
}

export function chaptersFromScript(
  script: string,
  wpm: number = DEFAULT_TELEPROMPTER_WPM,
): PaceChapter[] {
  return chaptersFromPace(sectionsFromScript(script), wpm);
}

/** True when model chapters are missing or unreliable relative to pace-derived structure. */
export function areModelChaptersWeak(
  chapters: readonly ChapterMarker[],
  paceChapterCount: number,
): boolean {
  if (paceChapterCount <= 0) return false;
  if (!chapters.length) return true;
  if (paceChapterCount >= 2 && chapters.length < Math.max(2, Math.ceil(paceChapterCount * 0.5))) {
    return true;
  }

  const seconds = chapters.map((chapter) => parseChapterTimestampSeconds(chapter.timestamp));
  if (seconds.some((value) => value === null)) return true;
  if (seconds.every((value) => value === 0) && paceChapterCount > 1) return true;

  for (let index = 1; index < seconds.length; index += 1) {
    if ((seconds[index] as number) < (seconds[index - 1] as number)) return true;
  }

  return false;
}

/**
 * Prefer pace-derived chapters when the model output is missing/weak.
 * When counts match, keep model titles and correct drifted timestamps.
 */
export function resolveChaptersWithPace(
  modelChapters: readonly ChapterMarker[],
  paceChapters: readonly PaceChapter[],
): ChapterMarker[] {
  if (paceChapters.length === 0) {
    return modelChapters.map((chapter) => ({
      timestamp: chapter.timestamp,
      title: normalizeTitle(chapter.title),
    }));
  }

  if (areModelChaptersWeak(modelChapters, paceChapters.length)) {
    return paceChapters.map((chapter) => ({
      timestamp: chapter.timestamp,
      title: chapter.title,
    }));
  }

  if (modelChapters.length === paceChapters.length) {
    return modelChapters.map((chapter, index) => {
      const pace = paceChapters[index];
      const modelSec = parseChapterTimestampSeconds(chapter.timestamp);
      const driftLimit = Math.max(15, pace.startSec * 0.2);
      const usePaceTimestamp =
        modelSec === null || Math.abs(modelSec - pace.startSec) > driftLimit;
      return {
        timestamp: usePaceTimestamp ? pace.timestamp : formatChapterTimestamp(modelSec),
        title: normalizeTitle(chapter.title) || pace.title,
      };
    });
  }

  return modelChapters.map((chapter, index) => ({
    timestamp: index === 0 ? "0:00" : chapter.timestamp,
    title: normalizeTitle(chapter.title),
  }));
}
