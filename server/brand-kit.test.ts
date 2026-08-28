import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brandKitPromptFragment, readBrandKit, writeBrandKit } from "./brand-kit";

describe("brand-kit", () => {
  test("round-trips style memory and builds a prompt fragment", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-brand-"));
    const empty = await readBrandKit(root);
    assert.equal(empty.channelName, "");
    assert.equal(brandKitPromptFragment(empty), "");

    const saved = await writeBrandKit({
      channelName: "Desk Lab",
      voiceNotes: "Calm and practical",
      forbiddenClaims: ["guaranteed results"],
      thumbnailStyleNotes: "High-contrast product on desk",
    }, root);
    assert.equal(saved.channelName, "Desk Lab");
    const raw = await readFile(path.join(root, "brand-kit.json"), "utf8");
    assert.match(raw, /Desk Lab/);

    const fragment = brandKitPromptFragment(saved);
    assert.match(fragment, /Desk Lab/);
    assert.match(fragment, /guaranteed results/);
    assert.match(fragment, /High-contrast product/);
  });
});
