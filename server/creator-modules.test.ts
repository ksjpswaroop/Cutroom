import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  audiencePersonaSchema,
  channelIntelligenceSchema,
  humanizeResultSchema,
  humanizeSummary,
  productionStages,
} from "@shared/creator-modules";
import type { AiProviderId, AiTextProvider } from "./ai";
import {
  analyzeChannelIntelligence,
  buildAvatarMarkdown,
  buildPersona,
  fallbackHumanize,
  generateAvatarMarkdown,
  generateChannelIntelligence,
  generatePersona,
  humanizeText,
} from "./creator-ai";
import {
  createChannel,
  createProductionItem,
  deleteProductionItem,
  listProduction,
  moveProductionItem,
} from "./creator-store";

// A fake text provider — no network. Records the prompts it receives so a test
// can assert what the generator grounded the model with (no live provider call).
function recordingProvider(payload: unknown, id: AiProviderId = "gemini") {
  const prompts: string[] = [];
  const provider: AiTextProvider = {
    id,
    completeJson: async ({ prompt }) => {
      prompts.push(prompt);
      return { text: JSON.stringify(payload), providerId: id, model: "fake-1" };
    },
  };
  return { provider, prompts };
}

function throwingProvider(id: AiProviderId = "gemini"): AiTextProvider {
  return {
    id,
    completeJson: async () => {
      throw new Error("no key configured");
    },
  };
}

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
    // Cite a snapshot so the L-803 publish gate is satisfied for the "published"
    // leg; this test only checks that each stage is an accepted move target.
    const item = await createProductionItem(
      { channelId: channel.id, title: "Episode 1", snapshotId: "snap-pipeline" },
      root,
    );
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

// ── L-801: provider-grounded channel intelligence ───────────────────────────────

describe("channel intelligence — provider-grounded (L-801)", () => {
  const payload = {
    performance: "Your cadence is steady and topic clustering is tight.",
    gaps: ["Beginner funnel is thin"],
    growth: ["Ship a 5-part beginner series"],
    benchmark: "Packaging is competitive versus comparable channels.",
  };

  test("uses an injected provider and labels the result inferred", async () => {
    const { provider } = recordingProvider(payload);
    const result = await generateChannelIntelligence("ai tooling", ["a"], { provider });
    assert.equal(result.provider, "gemini");
    assert.equal(result.evidenceClass, "inferred");
    assert.match(result.performance, /cadence is steady/);
    assert.doesNotThrow(() => channelIntelligenceSchema.parse(result));
  });

  test("grounds the prompt in channel memory when provided", async () => {
    const { provider, prompts } = recordingProvider(payload);
    const memory = {
      production: 7,
      personas: 2,
      stageBreakdown: { idea: 3, research: 1, scripting: 1, review: 1, published: 1 },
    };
    await generateChannelIntelligence("ai tooling", ["a"], { provider, memory });
    assert.match(prompts[0], /production items: 7/);
    assert.match(prompts[0], /published=1/);
  });

  test("a model cannot relabel a synthesized finding as observed", async () => {
    const { provider } = recordingProvider({ ...payload, evidenceClass: "observed", provider: "attacker" });
    const result = await generateChannelIntelligence("ai tooling", ["a"], { provider });
    assert.equal(result.evidenceClass, "inferred"); // code-controlled, not from the body
    assert.equal(result.provider, "gemini"); // from providerId, not the body
  });

  test("falls back to deterministic when the provider throws", async () => {
    const result = await generateChannelIntelligence("photography", [], { provider: throwingProvider() });
    assert.equal(result.provider, "deterministic");
    assert.equal(result.evidenceClass, "inferred");
  });

  test("falls back when the provider returns incomplete content", async () => {
    const { provider } = recordingProvider({ performance: "", gaps: [], growth: [], benchmark: "" });
    const result = await generateChannelIntelligence("photography", [], { provider });
    assert.equal(result.provider, "deterministic");
  });
});

// ── L-802: provider-grounded audience persona + avatar ───────────────────────────

describe("audience persona — provider-grounded (L-802)", () => {
  const payload = {
    name: "Indie Maker",
    demographics: "25–40, builds on weekends, watches on mobile.",
    intent: "Ship a profitable side project without quitting the day job.",
    messaging: "Promise one concrete outcome and prove it with a real example.",
    painPoints: ["Too many tutorials, too little signal"],
    interests: ["automation", "saas", "no-code"],
  };

  test("injected provider yields an inferred persona with its provider id", async () => {
    const { provider } = recordingProvider(payload);
    const persona = await generatePersona("p1", "ch1", "AI Builders", "ai tooling", { provider });
    assert.equal(persona.evidenceClass, "inferred");
    assert.equal(persona.provider, "gemini");
    assert.equal(persona.name, "Indie Maker");
    assert.doesNotThrow(() => audiencePersonaSchema.parse(persona));
  });

  test("falls back to the deterministic persona when the provider fails", async () => {
    const persona = await generatePersona("p1", "ch1", "AI Builders", "ai tooling", {
      provider: throwingProvider(),
    });
    assert.equal(persona.provider, "deterministic");
    assert.equal(persona.evidenceClass, "inferred");
  });

  test("avatar markdown keeps the synthesized-not-measured line and the provider", async () => {
    const { provider } = recordingProvider(payload);
    const avatar = await generateAvatarMarkdown("AI Builders", "ai tooling", { provider });
    assert.match(avatar.markdown, /synthesized, not measured/i);
    assert.match(avatar.markdown, /AI Builders/);
    assert.equal(avatar.evidenceClass, "inferred");
    assert.equal(avatar.provider, "gemini");
  });

  test("a model cannot relabel the persona as observed", async () => {
    const { provider } = recordingProvider({ ...payload, evidenceClass: "observed" });
    const persona = await generatePersona("p1", "ch1", "AI Builders", "ai tooling", { provider });
    assert.equal(persona.evidenceClass, "inferred");
  });
});

// ── L-803: operations wired to the workflow ──────────────────────────────────────

describe("operations — workflow link (L-803)", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cutroom-ops-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("creates an item carrying an optional snapshotId and dueDate, persisted across reload", async () => {
    const channel = await createChannel({ name: "C" }, root);
    const item = await createProductionItem(
      { channelId: channel.id, title: "Ep", snapshotId: "snap-1", dueDate: "2026-12-01" },
      root,
    );
    assert.equal(item.snapshotId, "snap-1");
    assert.equal(item.dueDate, "2026-12-01");
    const [onDisk] = await listProduction(channel.id, root);
    assert.equal(onDisk.snapshotId, "snap-1");
    assert.equal(onDisk.dueDate, "2026-12-01");
  });

  test("blocks a move to published without a cited snapshot", async () => {
    const channel = await createChannel({ name: "C" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Ep" }, root);
    await assert.rejects(() => moveProductionItem({ id: item.id, stage: "published" }, root), /snapshot/i);
  });

  test("allows published when the item already cites a snapshot", async () => {
    const channel = await createChannel({ name: "C" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Ep", snapshotId: "snap-9" }, root);
    const moved = await moveProductionItem({ id: item.id, stage: "published" }, root);
    assert.equal(moved.stage, "published");
  });

  test("allows published when the move itself supplies the snapshot", async () => {
    const channel = await createChannel({ name: "C" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Ep" }, root);
    const moved = await moveProductionItem({ id: item.id, stage: "published", snapshotId: "snap-late" }, root);
    assert.equal(moved.stage, "published");
    assert.equal(moved.snapshotId, "snap-late");
  });

  test("non-publish moves still work without a snapshot", async () => {
    const channel = await createChannel({ name: "C" }, root);
    const item = await createProductionItem({ channelId: channel.id, title: "Ep" }, root);
    const moved = await moveProductionItem({ id: item.id, stage: "scripting" }, root);
    assert.equal(moved.stage, "scripting");
  });
});

// ── L-804: humanize summary (pure presentation) ──────────────────────────────────

describe("humanize summary (L-804)", () => {
  test("renders 'fully rewritten' when a provider rewrote the whole draft", () => {
    const s = humanizeSummary({ output: "x", changes: -1, provider: "gemini" });
    assert.match(s.headline, /fully rewritten/i);
    assert.equal(s.isFallback, false);
    assert.equal(s.provider, "gemini");
  });

  test("flags the deterministic fallback and counts fixes", () => {
    const s = humanizeSummary({ output: "x", changes: 3, provider: "deterministic" });
    assert.equal(s.isFallback, true);
    assert.match(s.headline, /3 phrasing fixes/);
  });

  test("uses the singular 'fix' for one change", () => {
    const s = humanizeSummary({ output: "x", changes: 1, provider: "deterministic" });
    assert.match(s.headline, /1 phrasing fix\b/);
  });
});
