import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cinematicChaptersFromBoard } from "./cinematic-render";

describe("cinematic Shorts planning", () => {
  test("caps at 5 shots and emits chapter timestamps", () => {
    const chapters = cinematicChaptersFromBoard({
      snapshotId: "snap-12345678",
      characters: [{ id: "host", role: "host", onScreen: true, evidenceClass: "inferred" }],
      storyboardPanels: [
        { id: "p1", section: "Hook", visual: "Timer", evidenceClaimIds: ["c1"], evidenceClass: "observed", snapshotId: "snap-12345678" },
        { id: "p2", section: "Body", visual: "Steps", evidenceClaimIds: ["c1"], evidenceClass: "observed", snapshotId: "snap-12345678" },
      ],
      shots: Array.from({ length: 8 }, (_, index) => ({
        panelId: index < 4 ? "p1" : "p2",
        shot: `Shot ${index + 1}`,
        camera: "b-roll" as const,
        durationHintSec: 4,
        evidenceClaimIds: ["c1"],
        evidenceClass: "observed" as const,
      })),
    });
    assert.equal(chapters?.length, 5);
    assert.equal(chapters?.[0]?.timestamp, "0:00");
    assert.equal(chapters?.[1]?.timestamp, "0:04");
  });
});
