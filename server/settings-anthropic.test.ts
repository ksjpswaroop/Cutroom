import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { apiKeySettingsSchema, getApiKeyStatus } from "./settings";

const prev = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = prev;
});

describe("anthropic settings wiring (PS-105)", () => {
  test("getApiKeyStatus reflects ANTHROPIC_API_KEY and defaults the model", () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(getApiKeyStatus().anthropic, false);
    assert.equal(getApiKeyStatus().models.anthropicModel, "claude-sonnet-5-5");

    process.env.ANTHROPIC_API_KEY = "sk-ant-test-0123456789";
    assert.equal(getApiKeyStatus().anthropic, true);
  });

  test("anthropic appears in the provider options", () => {
    assert.ok(getApiKeyStatus().aiProviderOptions.some((o) => o.id === "anthropic"));
  });

  test("apiKeySettingsSchema accepts the anthropic fields and rejects a short key", () => {
    const ok = apiKeySettingsSchema.safeParse({
      anthropicApiKey: "sk-ant-abc12345",
      anthropicModel: "claude-sonnet-5-5",
    });
    assert.equal(ok.success, true);

    const bad = apiKeySettingsSchema.safeParse({ anthropicApiKey: "short" });
    assert.equal(bad.success, false);
  });
});
