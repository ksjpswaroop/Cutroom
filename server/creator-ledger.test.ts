import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analyzeChannelIntelligence, buildAvatarMarkdown, buildPersona } from "./creator-ai";
import { buildCreatorLedger } from "./creator-ledger";

describe("unified evidence ledger (L-807)", () => {
  test("collects channel-intel + persona + avatar, all labeled inferred", () => {
    const entries = buildCreatorLedger({
      channelIntelligence: analyzeChannelIntelligence("ai tooling", ["a", "b"]),
      personas: [buildPersona("p1", "ch1", "AI Builders", "ai tooling")],
      avatar: buildAvatarMarkdown("AI Builders", "ai tooling"),
    });
    assert.equal(entries.length, 3);
    assert.deepEqual(
      entries.map((e) => e.module),
      ["channel-intelligence", "persona", "avatar"],
    );
    assert.ok(entries.every((e) => e.evidenceClass === "inferred"));
    assert.ok(entries.every((e) => e.provider.length > 0));
  });

  test("rejects an entry that reaches the ledger without an evidence class", () => {
    assert.throws(
      () =>
        buildCreatorLedger({
          personas: [{ name: "X", provider: "gemini" } as never],
        }),
      /must be labeled "inferred"/,
    );
  });

  test("refuses to surface an observed label as fact", () => {
    const persona = buildPersona("p1", "ch1", "AI Builders", "ai tooling");
    assert.throws(
      () => buildCreatorLedger({ personas: [{ ...persona, evidenceClass: "observed" } as never] }),
      /must be labeled "inferred"/,
    );
  });

  test("empty input yields an empty ledger", () => {
    assert.deepEqual(buildCreatorLedger({}), []);
  });

  test("preserves the provider per entry", () => {
    const entries = buildCreatorLedger({
      personas: [buildPersona("p1", "ch1", "AI Builders", "ai tooling")],
    });
    assert.equal(entries[0].provider, "deterministic");
  });
});
