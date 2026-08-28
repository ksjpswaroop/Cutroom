import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  deleteWorkflowRecordFromDisk,
  getWorkflowRecordFromDisk,
  isValidWorkflowId,
  listWorkflowRecordsFromDisk,
  parseWorkflowRecord,
  putWorkflowRecordToDisk,
} from "./workflow-store";
import { sanitizeTopicFolderName, writeLibraryConfig } from "./library-config";

describe("workflow store", () => {
  test("rejects unsafe workflow ids", () => {
    assert.equal(isValidWorkflowId("workflow-abc_123"), true);
    assert.equal(isValidWorkflowId("../etc/passwd"), false);
    assert.equal(isValidWorkflowId("a/b"), false);
    assert.equal(isValidWorkflowId(""), false);
  });

  test("parses only well-formed records", () => {
    assert.equal(parseWorkflowRecord({ id: "ok", createdAt: 1, updatedAt: 2, state: { title: "x" } })?.id, "ok");
    assert.equal(parseWorkflowRecord({ id: "../x", createdAt: 1, updatedAt: 2, state: {} }), null);
    assert.equal(parseWorkflowRecord({ id: "ok", createdAt: "1", updatedAt: 2, state: {} }), null);
  });

  test("persists flat files when no library is configured", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-workflows-"));
    try {
      process.env.CUTROOM_APP_DATA = root;
      await putWorkflowRecordToDisk({
        id: "older",
        createdAt: 1,
        updatedAt: 10,
        state: { title: "Older", cachedResearch: { query: "old topic" } },
      }, root, 2);
      await putWorkflowRecordToDisk({
        id: "newest",
        createdAt: 2,
        updatedAt: 30,
        state: { title: "Newest", cachedResearch: { query: "new topic" } },
      }, root, 2);
      await putWorkflowRecordToDisk({
        id: "middle",
        createdAt: 3,
        updatedAt: 20,
        state: { title: "Middle" },
      }, root, 2);

      const listed = await listWorkflowRecordsFromDisk<{ title: string }>(root, 8);
      assert.deepEqual(listed.map((record) => record.id), ["newest", "middle"]);
      assert.equal(listed[0]?.state.title, "Newest");

      const loaded = await getWorkflowRecordFromDisk<{ title: string }>("newest", root);
      assert.equal(loaded?.state.title, "Newest");

      assert.equal(await deleteWorkflowRecordFromDisk("newest", root), true);
      assert.equal(await getWorkflowRecordFromDisk("newest", root), null);
    } finally {
      delete process.env.CUTROOM_APP_DATA;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("arranges workflows into topic folders when a library is set", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-appdata-"));
    const library = await mkdtemp(path.join(os.tmpdir(), "cutroom-library-"));
    try {
      process.env.CUTROOM_APP_DATA = root;
      await writeLibraryConfig(library, root);
      await putWorkflowRecordToDisk({
        id: "abc12345-bbbb-cccc-dddd-eeeeeeeeeeee",
        createdAt: 1,
        updatedAt: 2,
        state: {
          title: "Standing desk reviews",
          cachedScript: { script: "# Hello" },
          cachedPackage: { publishPackage: { titles: [] } },
        },
      }, undefined, 8);

      const folder = sanitizeTopicFolderName("Standing desk reviews", "abc12345-bbbb-cccc-dddd-eeeeeeeeeeee");
      const listed = await listWorkflowRecordsFromDisk(undefined, 8);
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.state.title, "Standing desk reviews");

      const mirrored = await import("node:fs/promises").then((fs) =>
        fs.readFile(path.join(library, folder, "script.md"), "utf8"));
      assert.equal(mirrored, "# Hello");
    } finally {
      delete process.env.CUTROOM_APP_DATA;
      await rm(root, { recursive: true, force: true });
      await rm(library, { recursive: true, force: true });
    }
  });

  test("sanitizes topic folder names", () => {
    assert.equal(sanitizeTopicFolderName('Bad/Name:"x"', "abc-def-ghi"), "BadNamex [abcdefgh]");
    assert.equal(sanitizeTopicFolderName("Standing desks", "uuid-here"), "Standing desks [uuidhere]");
  });
});
