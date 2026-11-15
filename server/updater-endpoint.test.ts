import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

describe("desktop updater endpoint (L-507)", () => {
  test("points the Tauri updater at the GitHub latest.json download and does not embed a private key", () => {
    const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    const updater = config.plugins.updater;
    assert.equal(updater.active, true);
    assert.deepEqual(updater.endpoints, [
      "https://github.com/ksjpswaroop/Cutroom/releases/latest/download/latest.json",
    ]);
    assert.equal(JSON.stringify(config).includes("TAURI_SIGNING_PRIVATE_KEY"), false);
  });
});
