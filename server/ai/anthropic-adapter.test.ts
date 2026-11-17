import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createAnthropicTextProvider } from "./anthropic-adapter";
import { getTextProvider, resolveAiProviderId } from "./index";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: (url: any, init: any) => Promise<Response>) {
  globalThis.fetch = handler as unknown as typeof fetch;
}

describe("anthropic text provider (PS-101)", () => {
  test("conforms to AiTextProvider: returns {text, providerId:'anthropic', model} and posts to /v1/messages", async () => {
    let captured: any = null;
    mockFetch(async (url, init) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: '{"ok":true}' }] }),
        { status: 200 },
      );
    });
    // Inject baseUrl so the test is hermetic (independent of any ANTHROPIC_BASE_URL env).
    const provider = createAnthropicTextProvider({
      apiKey: "test-key",
      model: "claude-sonnet-5-5",
      baseUrl: "https://api.anthropic.test/v1",
    });
    const result = await provider.completeJson({ prompt: "hi" });

    assert.equal(provider.id, "anthropic");
    assert.equal(result.providerId, "anthropic");
    assert.equal(result.model, "claude-sonnet-5-5");
    assert.equal(result.text, '{"ok":true}');
    assert.equal(String(captured.url), "https://api.anthropic.test/v1/messages");
    assert.equal(captured.init.headers["x-api-key"], "test-key");
    assert.ok(captured.init.headers["anthropic-version"], "sends an anthropic-version header");
  });

  test("throws a missing-key error without calling fetch when no key is configured", async () => {
    let called = false;
    mockFetch(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    });
    const provider = createAnthropicTextProvider({ apiKey: "" });
    await assert.rejects(() => provider.completeJson({ prompt: "x" }), /not configured/i);
    assert.equal(called, false, "must not hit the network without a key");
  });

  test("maps HTTP 401 to an invalid_key ProviderError", async () => {
    mockFetch(async () => new Response("unauthorized", { status: 401 }));
    const provider = createAnthropicTextProvider({ apiKey: "bad-key" });
    await assert.rejects(
      () => provider.completeJson({ prompt: "x" }),
      (error: any) => error?.category === "invalid_key" || /401/.test(String(error?.message)),
    );
  });

  test("registry: resolveAiProviderId + getTextProvider accept 'anthropic'", () => {
    assert.equal(resolveAiProviderId("anthropic"), "anthropic");
    assert.equal(getTextProvider("anthropic").id, "anthropic");
  });
});
