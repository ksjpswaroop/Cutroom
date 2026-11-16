import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  analyzeChannelIntelligence,
  buildAvatarMarkdown,
  buildPersona,
} from "./creator-ai";
import { buildCreatorArtifacts } from "./creator-export";

describe("export pack creator artifacts (L-808)", () => {
  test("includes creator/*.json + avatar.md, each carrying its evidence class, when provided", () => {
    const files = buildCreatorArtifacts({
      channelIntelligence: analyzeChannelIntelligence("ai tooling", ["a", "b"]),
      persona: buildPersona("p1", "ch1", "AI Builders", "ai tooling"),
      avatar: buildAvatarMarkdown("AI Builders", "ai tooling"),
    });
    assert.ok(files["creator/channel-intelligence.json"]);
    assert.ok(files["creator/persona.json"]);
    assert.ok(files["creator/avatar.md"]);

    // The evidence label survives into the exported JSON (no stripped claims).
    const intel = JSON.parse(files["creator/channel-intelligence.json"]);
    const persona = JSON.parse(files["creator/persona.json"]);
    assert.equal(intel.evidenceClass, "inferred");
    assert.equal(persona.evidenceClass, "inferred");
    assert.match(files["creator/avatar.md"], /Inferred audience archetype/i);

    // JSON files are newline-terminated.
    assert.ok(files["creator/channel-intelligence.json"].endsWith("\n"));
  });

  test("omits creator artifacts when nothing is provided (opt-in; default off)", () => {
    assert.deepEqual(buildCreatorArtifacts({}), {});
  });

  test("includes only the artifacts that are provided", () => {
    const files = buildCreatorArtifacts({
      persona: buildPersona("p1", "ch1", "AI Builders", "ai tooling"),
    });
    assert.deepEqual(Object.keys(files), ["creator/persona.json"]);
  });
});
