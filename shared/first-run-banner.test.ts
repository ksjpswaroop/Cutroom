import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { firstRunNeeds } from "./first-run-banner";

describe("first-run banner (L-204)", () => {
  test("asks for keys when either provider key is missing and the prompt was not dismissed", () => {
    assert.deepEqual(firstRunNeeds({
      youtube: false,
      gemini: true,
      libraryPath: "/tmp/library",
      isDesktop: true,
      dismissedKeys: false,
      dismissedLibrary: false,
    }), { keys: true, library: false });
  });

  test("asks for a library folder only on desktop when none is set", () => {
    assert.deepEqual(firstRunNeeds({
      youtube: true,
      gemini: true,
      libraryPath: null,
      isDesktop: true,
      dismissedKeys: false,
      dismissedLibrary: false,
    }), { keys: false, library: true });
    assert.deepEqual(firstRunNeeds({
      youtube: true,
      gemini: true,
      libraryPath: null,
      isDesktop: false,
      dismissedKeys: false,
      dismissedLibrary: false,
    }), { keys: false, library: false });
  });

  test("hides a prompt after it is dismissed", () => {
    assert.deepEqual(firstRunNeeds({
      youtube: false,
      gemini: false,
      libraryPath: null,
      isDesktop: true,
      dismissedKeys: true,
      dismissedLibrary: true,
    }), { keys: false, library: false });
  });
});
