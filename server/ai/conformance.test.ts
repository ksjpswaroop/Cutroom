import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AI_IMAGE_PROVIDER_IDS,
  AI_PROVIDER_IDS,
  AI_VIDEO_PROVIDER_IDS,
  getImageProvider,
  getTextProvider,
  getVideoProvider,
  resolveAiImageProviderId,
  resolveAiProviderId,
  resolveAiVideoProviderId,
} from "./index";

/**
 * PS-106: shared provider conformance kit. Every registered provider (text, image,
 * video) must resolve from its registry and report an `id` that matches its registry
 * key — this locks the wiring so a new adapter cannot be half-registered (a missing
 * switch case, a mismatched id, or an id in the list with no factory). Pure: no key,
 * no network — construction never calls a provider.
 */
describe("provider registry conformance (PS-106)", () => {
  test("every text provider id resolves to a provider whose id matches", () => {
    for (const id of AI_PROVIDER_IDS) {
      assert.equal(getTextProvider(id).id, id, `text provider '${id}' id mismatch`);
    }
  });

  test("every image provider id resolves to a provider whose id matches", () => {
    for (const id of AI_IMAGE_PROVIDER_IDS) {
      assert.equal(getImageProvider(id).id, id, `image provider '${id}' id mismatch`);
    }
  });

  test("every video provider id resolves to a provider whose id matches", () => {
    for (const id of AI_VIDEO_PROVIDER_IDS) {
      assert.equal(getVideoProvider(id).id, id, `video provider '${id}' id mismatch`);
    }
  });

  test("resolvers round-trip valid ids and fall back to a safe default on garbage", () => {
    for (const id of AI_PROVIDER_IDS) assert.equal(resolveAiProviderId(id), id);
    for (const id of AI_VIDEO_PROVIDER_IDS) assert.equal(resolveAiVideoProviderId(id), id);
    assert.equal(resolveAiProviderId("not-a-provider"), "gemini");
    assert.equal(resolveAiVideoProviderId("not-a-provider"), "minimax");
    // Image resolver maps an unknown value to a safe default (gemini, unless MiniMax text is active).
    assert.ok(AI_IMAGE_PROVIDER_IDS.includes(resolveAiImageProviderId("not-a-provider")));
  });
});
