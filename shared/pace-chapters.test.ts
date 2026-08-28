import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_TELEPROMPTER_WPM,
  areModelChaptersWeak,
  chaptersFromPace,
  chaptersFromScript,
  countWords,
  formatChapterTimestamp,
  parseChapterTimestampSeconds,
  resolveChaptersWithPace,
  sectionsFromScript,
} from "./pace-chapters";

describe("pace-chapters", () => {
  test("counts words and formats timestamps", () => {
    assert.equal(countWords("  one two   three "), 3);
    assert.equal(formatChapterTimestamp(0), "0:00");
    assert.equal(formatChapterTimestamp(75), "1:15");
    assert.equal(formatChapterTimestamp(3723), "1:02:03");
    assert.equal(parseChapterTimestampSeconds("1:15"), 75);
    assert.equal(parseChapterTimestampSeconds("1:02:03"), 3723);
    assert.equal(parseChapterTimestampSeconds("bad"), null);
  });

  test("emits cumulative chapter starts from WPM × section words", () => {
    // 150 words @ 150 WPM = 60s; 75 words = 30s
    const chapters = chaptersFromPace([
      { title: "Hook", wordCount: 150 },
      { title: "Body", wordCount: 75 },
      { title: "CTA", wordCount: 30 },
    ], DEFAULT_TELEPROMPTER_WPM);

    assert.deepEqual(chapters.map((chapter) => ({
      timestamp: chapter.timestamp,
      title: chapter.title,
      startSec: chapter.startSec,
    })), [
      { timestamp: "0:00", title: "Hook", startSec: 0 },
      { timestamp: "1:00", title: "Body", startSec: 60 },
      { timestamp: "1:30", title: "CTA", startSec: 90 },
    ]);
  });

  test("parses markdown and keyword script sections", () => {
    const script = `## Hook
One two three four five

## Main Content
${"word ".repeat(150).trim()}

CALL-TO-ACTION:
Thanks for watching today everyone
`;
    const sections = sectionsFromScript(script);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].title, "Hook");
    assert.equal(sections[0].wordCount, 5);
    assert.equal(sections[1].title, "Main Content");
    assert.equal(sections[1].wordCount, 150);
    assert.equal(sections[2].title, "CALL-TO-ACTION");

    const chapters = chaptersFromScript(script, 150);
    assert.equal(chapters[0].timestamp, "0:00");
    assert.equal(chapters[1].timestamp, "0:02"); // 5 words / 150 wpm * 60 ≈ 2s
    assert.equal(chapters[2].startSec, Math.floor((5 + 150) / 150 * 60));
  });

  test("replaces weak model chapters with pace chapters", () => {
    const pace = chaptersFromPace([
      { title: "Hook", wordCount: 150 },
      { title: "Body", wordCount: 150 },
    ]);
    assert.equal(areModelChaptersWeak([], 2), true);
    assert.equal(areModelChaptersWeak([{ timestamp: "0:00", title: "Only" }], 2), true);
    assert.equal(areModelChaptersWeak([
      { timestamp: "0:00", title: "A" },
      { timestamp: "0:00", title: "B" },
    ], 2), true);

    const resolved = resolveChaptersWithPace(
      [{ timestamp: "99:99", title: "Bad" }],
      pace,
    );
    assert.deepEqual(resolved, [
      { timestamp: "0:00", title: "Hook" },
      { timestamp: "1:00", title: "Body" },
    ]);
  });

  test("keeps model titles and corrects drifted timestamps when counts match", () => {
    const pace = chaptersFromPace([
      { title: "Hook", wordCount: 150 },
      { title: "Body", wordCount: 150 },
    ]);
    const resolved = resolveChaptersWithPace([
      { timestamp: "0:00", title: "Cold open" },
      { timestamp: "4:00", title: "Deep dive" }, // drifted from 1:00
    ], pace);
    assert.deepEqual(resolved, [
      { timestamp: "0:00", title: "Cold open" },
      { timestamp: "1:00", title: "Deep dive" },
    ]);
  });
});
