import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";
import { buildStoreZip } from "./zip-store";

describe("zip store", () => {
  test("packs nested files python zipfile can read", async () => {
    const zip = buildStoreZip([
      { name: "pack/README.md", data: new TextEncoder().encode("# Standing desk\n") },
      { name: "pack/render.mp4", data: new Uint8Array([0, 1, 2, 3, 4]) },
    ]);
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    const dir = await mkdtemp(path.join(os.tmpdir(), "cutroom-zip-"));
    const zipPath = path.join(dir, "pack.zip");
    try {
      await writeFile(zipPath, zip);
      const listed = spawnSync("python3", ["-c", "import zipfile,sys; print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", zipPath], {
        encoding: "utf8",
      });
      assert.equal(listed.status, 0, listed.stderr);
      assert.match(listed.stdout, /pack\/README\.md/);
      assert.match(listed.stdout, /pack\/render\.mp4/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
