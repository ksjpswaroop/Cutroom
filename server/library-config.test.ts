import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  readLibraryConfig,
  sanitizeTopicFolderName,
  writeLibraryConfig,
} from "./library-config";

describe("library config", () => {
  test("rejects relative library paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-libcfg-"));
    try {
      await assert.rejects(
        () => writeLibraryConfig("relative/not/absolute", root),
        /absolute folder path/i,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("persists an absolute library path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-libcfg-"));
    const library = await mkdtemp(path.join(os.tmpdir(), "cutroom-lib-"));
    try {
      const saved = await writeLibraryConfig(library, root);
      assert.equal(saved.path, path.resolve(library));
      assert.equal((await readLibraryConfig(root)).path, path.resolve(library));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(library, { recursive: true, force: true });
    }
  });

  test("sanitizes topic folder names for the filesystem", () => {
    assert.equal(sanitizeTopicFolderName('A/B:"C"', "id-1234"), "ABC [id1234]");
  });
});
