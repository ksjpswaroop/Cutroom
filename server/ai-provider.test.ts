import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getTextProvider, resolveAiProviderId } from "./ai";
import { ProviderError } from "./provider-errors";

describe("server/ai text provider", () => {
  test("getTextProvider() returns gemini by default", () => {
    const previous = process.env.CUTROOM_AI_PROVIDER;
    try {
      delete process.env.CUTROOM_AI_PROVIDER;
      assert.equal(resolveAiProviderId(), "gemini");
      assert.equal(getTextProvider().id, "gemini");
    } finally {
      if (previous === undefined) delete process.env.CUTROOM_AI_PROVIDER;
      else process.env.CUTROOM_AI_PROVIDER = previous;
    }
  });

  test("unknown CUTROOM_AI_PROVIDER falls back to gemini", () => {
    const previous = process.env.CUTROOM_AI_PROVIDER;
    try {
      process.env.CUTROOM_AI_PROVIDER = "not-a-provider";
      assert.equal(resolveAiProviderId(), "gemini");
      assert.equal(getTextProvider().id, "gemini");
    } finally {
      if (previous === undefined) delete process.env.CUTROOM_AI_PROVIDER;
      else process.env.CUTROOM_AI_PROVIDER = previous;
    }
  });

  test("OpenRouter stub returns a clear not-configured error", async () => {
    const provider = getTextProvider("openrouter");
    assert.equal(provider.id, "openrouter");
    await assert.rejects(
      () => provider.completeJson({ prompt: "{}" }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.category, "missing_key");
        assert.equal(error.code, "OPENROUTER_NOT_CONFIGURED");
        assert.match(error.message, /not configured/i);
        assert.match(error.message, /1\.2/i);
        return true;
      },
    );
  });

  test("Ollama stub returns a clear not-configured error", async () => {
    const provider = getTextProvider("ollama");
    assert.equal(provider.id, "ollama");
    await assert.rejects(
      () => provider.completeJson({ prompt: "{}" }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.category, "missing_key");
        assert.equal(error.code, "OLLAMA_NOT_CONFIGURED");
        assert.match(error.message, /not configured/i);
        return true;
      },
    );
  });

  test("openai_compatible stub returns a clear not-configured error", async () => {
    const provider = getTextProvider("openai_compatible");
    assert.equal(provider.id, "openai_compatible");
    await assert.rejects(
      () => provider.completeJson({ prompt: "{}" }),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.code, "OPENAI_COMPATIBLE_NOT_CONFIGURED");
        assert.match(error.message, /not configured/i);
        return true;
      },
    );
  });
});
