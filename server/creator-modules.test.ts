import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  audiencePersonaSchema,
  channelIntelligenceSchema,
  humanizeResultSchema,
  productionStages,
} from "@shared/creator-modules";
import {
  analyzeChannelIntelligence,
  buildAvatarMarkdown,
  buildPersona,
  fallbackHumanize,
  humanizeText,
} from "./creator-ai";
import {
  createChannel,
  createProductionItem,
  deleteProductionItem,
  listProduction,
  moveProductionItem,
} from "./creator-store";

// ── Channel intelligence ───────────────────────────────────────────────────────

describe("channel intelligence", () => {
  test("is labeled inferred and reflects the number of scripts", () => {
    const result = analyzeChannelIntelligence("ai tooling for developers", ["a", "b", "c", "d"]);
    assert.equal(result.evidenceClass, "inferred");
    assert.match(result.performance, /4 scripts/);
    assert.ok(result.gaps.length > 0 && result.growth.length > 0);
    // Round-trips through the contract.
    assert.doesNotThrow(() => channelIntelligenceSchema.parse(result));
  });

  test("contract rejects an unlabeled claim (missing evidenceClass)", () => {
    const base = analyzeChannelIntelligence("photography", []);
    const { evidenceClass, ...unlabeled } = base;
    void evidenceClass;
    assert.equal(channelIntelligenceSchema.safeParse(unlabeled).success, false);
  });

  test("contract rejects a claim labeled observed (no snapshot sources exist)", () => {
    const base = analyzeChannelIntelligence("photography", []);
    const observed = { ...base, evidenceClass: "observed" as const };
    assert.equal(channelIntelligenceSchema.safeParse(observed).success, false);
  });
});

// ── Audience export ────────────────────────────────────────────────────────────

describe("audience export", () => {
  test("avatar export is markdown that names the channel and declares it inferred", () => {
    const avatar = buildAvatarMarkdown("AI Builders", "ai tooling");
    assert.match(avatar.markdown, /^# Audience Avatar/m);
    assert.match(avatar.markdown, /AI Builders/);
    assert.match(avatar.markdown, /Inferred audience archetype/i);
    assert.equal(avatar.evidenceClass, "inferred");
  });

  test("persona is inferred and round-trips through the contract", () => {
    const persona = buildPersona("persona-1", "ch-1", "AI Builders", "ai tooling");
    assert.equal(persona.evidenceClass, "inferred");
    assert.ok(persona.painPoints.length > 0 && persona.interests.length > 0);
    assert.doesNotThrow(() => audiencePersonaSchema.parse(persona));
  });

  test("persona contract rejects an observed label", () => {
    const persona = buildPersona("persona-1", "ch-1", "AI Builders", "ai tooling");
    assert.equal(
      audiencePersonaSchema.safeParse({ ...persona, evidenceClass: "observed" }).success,
      false,
    );
  });
});

// ── Operations / Kanban moves ───────────────────────────────────────────────────

describe("Kanban moves", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cutroom-kanban-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("a new item starts in Idea and advances through the pipeline", async () => {
    const channel = await createChannel({ name: "Test channel" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Episode 1" }, root);
    assert.equal(item.stage, "idea");

    const moved = await moveProductionItem({ id: item.id, stage: "review" }, root);
    assert.equal(moved.stage, "review");

    const onDisk = await listProduction(channel.id, root);
    assert.equal(onDisk.length, 1);
    assert.equal(onDisk[0].stage, "review");
  });

  test("every pipeline stage is a valid move target", async () => {
    const channel = await createChannel({ name: "Test channel" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Episode 1" }, root);
    for (const stage of productionStages) {
      const moved = await moveProductionItem({ id: item.id, stage }, root);
      assert.equal(moved.stage, stage);
    }
  });

  test("an unknown stage is rejected", async () => {
    const channel = await createChannel({ name: "Test channel" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Episode 1" }, root);
    await assert.rejects(() => moveProductionItem({ id: item.id, stage: "shipped" as never }, root));
  });

  test("deleting an item removes it from the board", async () => {
    const channel = await createChannel({ name: "Test channel" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Episode 1" }, root);
    await deleteProductionItem(item.id, root);
    assert.equal((await listProduction(channel.id, root)).length, 0);
  });
});

// ── Humanize ────────────────────────────────────────────────────────────────────

describe("humanize", () => {
  const original = process.env.CUTROOM_AI_PROVIDER;
  beforeEach(() => {
    // Pin to Gemini with no key so the provider fails fast (no network) and the
    // deterministic fallback runs — no live provider call, per the test boundary.
    process.env.CUTROOM_AI_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CUTROOM_AI_PROVIDER;
    else process.env.CUTROOM_AI_PROVIDER = original;
  });

  test("deterministic rewrite strips robotic phrasing and counts edits", () => {
    const result = fallbackHumanize("We utilize this in order to delve into the topic.");
    assert.match(result.output, /\buse\b/);
    assert.match(result.output, /\bto dig into\b/);
    assert.doesNotMatch(result.output, /utilize|in order to|delve into/);
    assert.ok(result.changes >= 3);
  });

  test("humanizeText falls back to the deterministic rewrite with no provider", async () => {
    const result = await humanizeText("Furthermore, we utilize synergy.");
    assert.equal(result.provider, "deterministic");
    assert.doesNotMatch(result.output, /Furthermore|utilize/);
    assert.doesNotThrow(() => humanizeResultSchema.parse(result));
  });

  test("result contract rejects a missing provider label", () => {
    assert.equal(humanizeResultSchema.safeParse({ output: "x", changes: 0 }).success, false);
  });
});
