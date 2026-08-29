import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  SECRET_ENV_KEYS,
  isKeychainPreferred,
  stripSecretAssignments,
} from "./keychain";

describe("keychain helpers", () => {
  test("stripSecretAssignments removes secret keys only", () => {
    const input = [
      "YOUTUBE_API_KEY=\"secret-youtube\"",
      "GEMINI_API_KEY=secret-gemini",
      "GEMINI_TEXT_MODEL=gemini-2.5-flash",
      "CUTROOM_AI_PROVIDER=gemini",
      "OPENROUTER_API_KEY=or-key",
      "",
    ].join("\n");
    const stripped = stripSecretAssignments(input);
    assert.equal(stripped.includes("YOUTUBE_API_KEY"), false);
    assert.equal(stripped.includes("GEMINI_API_KEY"), false);
    assert.equal(stripped.includes("OPENROUTER_API_KEY"), false);
    assert.match(stripped, /GEMINI_TEXT_MODEL=gemini-2\.5-flash/);
    assert.match(stripped, /CUTROOM_AI_PROVIDER=gemini/);
  });

  test("SECRET_ENV_KEYS covers primary providers", () => {
    assert.ok(SECRET_ENV_KEYS.includes("YOUTUBE_API_KEY"));
    assert.ok(SECRET_ENV_KEYS.includes("GEMINI_API_KEY"));
    assert.ok(SECRET_ENV_KEYS.includes("OPENROUTER_API_KEY"));
    assert.ok(SECRET_ENV_KEYS.includes("ELEVENLABS_API_KEY"));
    assert.ok(SECRET_ENV_KEYS.includes("MINIMAX_API_KEY"));
  });

  test("isKeychainPreferred respects CUTROOM_SECRETS_BACKEND=env", () => {
    const previous = process.env.CUTROOM_SECRETS_BACKEND;
    try {
      process.env.CUTROOM_SECRETS_BACKEND = "env";
      assert.equal(isKeychainPreferred(), false);
    } finally {
      if (previous === undefined) delete process.env.CUTROOM_SECRETS_BACKEND;
      else process.env.CUTROOM_SECRETS_BACKEND = previous;
    }
  });
});
