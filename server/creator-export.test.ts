import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import type { AiProviderId, AiTextProvider } from "./ai";
import {
  analyzeChannelIntelligence,
  buildAvatarMarkdown,
  buildPersona,
} from "./creator-ai";
import { buildCreatorArtifacts, collectCreatorExport } from "./creator-export";
import { addPersona, createChannel, newPersonaId } from "./creator-store";
import { preferencesSchema, writePreferences } from "./preferences";

// Force the deterministic synthesis path so the gate tests make no live call.
function throwingProvider(id: AiProviderId = "gemini"): AiTextProvider {
  return {
    id,
    completeJson: async () => {
      throw new Error("no key configured");
    },
  };
}

async function freshRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "cutroom-creator-export-"));
}

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

describe("creator export gate (L-808)", () => {
  test("the creatorExportEnabled preference defaults off", () => {
    assert.equal(preferencesSchema.parse({}).creatorExportEnabled, false);
  });

  test("omits creator artifacts when the toggle is off (default)", async () => {
    const root = await freshRoot();
    const channel = await createChannel({ name: "AI Builders", niche: "ai tooling" }, root);
    await addPersona(buildPersona(newPersonaId(), channel.id, channel.name, channel.niche), root);
    // No preferences.json written → creatorExportEnabled defaults false.
    const files = await collectCreatorExport(channel.id, { root, provider: throwingProvider() });
    assert.deepEqual(files, {});
  });

  test("includes creator/* with the inferred label when the toggle is on", async () => {
    const root = await freshRoot();
    await writePreferences({ creatorExportEnabled: true }, root);
    const channel = await createChannel({ name: "AI Builders", niche: "ai tooling" }, root);
    await addPersona(buildPersona(newPersonaId(), channel.id, channel.name, channel.niche), root);

    const files = await collectCreatorExport(channel.id, { root, provider: throwingProvider() });
    assert.ok(files["creator/channel-intelligence.json"]);
    assert.ok(files["creator/persona.json"]);
    assert.ok(files["creator/avatar.md"]);

    const intel = JSON.parse(files["creator/channel-intelligence.json"]);
    const persona = JSON.parse(files["creator/persona.json"]);
    assert.equal(intel.evidenceClass, "inferred");
    assert.equal(persona.evidenceClass, "inferred");
    assert.match(files["creator/avatar.md"], /Inferred audience archetype/i);
  });

  test("omits creator artifacts when enabled but no channel is in context", async () => {
    const root = await freshRoot();
    await writePreferences({ creatorExportEnabled: true }, root);
    assert.deepEqual(await collectCreatorExport(undefined, { root, provider: throwingProvider() }), {});
    assert.deepEqual(await collectCreatorExport("ch-does-not-exist", { root, provider: throwingProvider() }), {});
  });
});
