import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { readPreferences, writePreferences } from "./preferences";

describe("preferences — Cutroom Pro toggle (M0)", () => {
  test("Pro is OFF on a fresh settings state", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutroom-pro-prefs-"));
    try {
      const prefs = await readPreferences(root);
      assert.equal(prefs.cutroomProEnabled, false);
      // Every other toggle is Off on a fresh state too.
      assert.equal(prefs.assemblePreviewEnabled, false);
      assert.equal(prefs.creatorExportEnabled, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("Pro toggle round-trips through preferences.json and leaves other toggles alone", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutroom-pro-prefs-"));
    try {
      const on = await writePreferences({ cutroomProEnabled: true }, root);
      assert.equal(on.cutroomProEnabled, true);
      assert.equal(on.assemblePreviewEnabled, false);
      const stored = JSON.parse(await readFile(join(root, "preferences.json"), "utf8")) as Record<string, unknown>;
      assert.equal(stored.cutroomProEnabled, true);
      const off = await writePreferences({ cutroomProEnabled: false }, root);
      assert.equal(off.cutroomProEnabled, false);
      assert.equal((await readPreferences(root)).cutroomProEnabled, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
