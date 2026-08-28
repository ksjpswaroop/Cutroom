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

  test("OpenRouter without key returns missing_key", async () => {
    const previous = process.env.OPENROUTER_API_KEY;
    try {
      delete process.env.OPENROUTER_API_KEY;
      const provider = getTextProvider("openrouter");
      assert.equal(provider.id, "openrouter");
      await assert.rejects(
        () => provider.completeJson({ prompt: "{}" }),
        (error: unknown) => {
          assert.ok(error instanceof ProviderError);
          assert.equal(error.category, "missing_key");
          assert.equal(error.code, "OPENROUTER_MISSING_KEY");
          return true;
        },
      );
    } finally {
      if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previous;
    }
  });

  test("openai_compatible without key returns missing_key", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousCompat = process.env.OPENAI_COMPATIBLE_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_COMPATIBLE_API_KEY;
      const provider = getTextProvider("openai_compatible");
      assert.equal(provider.id, "openai_compatible");
      await assert.rejects(
        () => provider.completeJson({ prompt: "{}" }),
        (error: unknown) => {
          assert.ok(error instanceof ProviderError);
          assert.equal(error.code, "OPENAI_COMPATIBLE_MISSING_KEY");
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
      if (previousCompat === undefined) delete process.env.OPENAI_COMPATIBLE_API_KEY;
      else process.env.OPENAI_COMPATIBLE_API_KEY = previousCompat;
    }
  });

  test("Ollama provider is selectable without an API key", () => {
    const provider = getTextProvider("ollama");
    assert.equal(provider.id, "ollama");
  });

  test("getImageProvider() returns gemini by default", async () => {
    const { getImageProvider, resolveAiImageProviderId } = await import("./ai");
    const previous = process.env.CUTROOM_IMAGE_PROVIDER;
    try {
      delete process.env.CUTROOM_IMAGE_PROVIDER;
      assert.equal(resolveAiImageProviderId(), "gemini");
      assert.equal(getImageProvider().id, "gemini");
    } finally {
      if (previous === undefined) delete process.env.CUTROOM_IMAGE_PROVIDER;
      else process.env.CUTROOM_IMAGE_PROVIDER = previous;
    }
  });

  test("ollama image provider is selectable", async () => {
    const { getImageProvider } = await import("./ai");
    assert.equal(getImageProvider("ollama").id, "ollama");
  });
});
