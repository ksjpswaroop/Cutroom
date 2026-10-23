import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { envForNestedNpm } from "./prepare-desktop-bundle";

describe("sidecar npm env", () => {
  test("drops npm_config_allow_scripts so a nested project install is not rejected", () => {
    const env = envForNestedNpm({
      PATH: "/usr/bin",
      npm_config_allow_scripts: "esbuild",
      NPM_CONFIG_ALLOW_SCRIPTS: "esbuild",
      npm_config_allow_scripts_pending: "false",
    });
    assert.equal(env.PATH, "/usr/bin");
    assert.equal("npm_config_allow_scripts" in env, false);
    assert.equal("NPM_CONFIG_ALLOW_SCRIPTS" in env, false);
    assert.equal("npm_config_allow_scripts_pending" in env, false);
  });
});
