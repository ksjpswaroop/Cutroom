import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  DEFAULT_OLLAMA_MODEL,
  listOllamaModels,
  ollamaHttpError,
  ollamaMaxTokens,
  ollamaModelName,
  ollamaNetworkError,
  ollamaOpenAiBaseUrl,
  ollamaRootUrl,
  ollamaStatus,
  ollamaTimeoutMs,
  suggestInstalledModel,
  type OllamaModel,
} from "./ollama";

function model(name: string, remote = false): OllamaModel {
  return { name, sizeBytes: 1, capabilities: ["completion"], remote };
}

const ENV_KEYS = ["OLLAMA_BASE_URL", "OLLAMA_MODEL", "OLLAMA_TIMEOUT_MS", "OLLAMA_MAX_TOKENS"] as const;
const saved = new Map<string, string | undefined>();
for (const key of ENV_KEYS) saved.set(key, process.env[key]);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("ollama base URL normalisation", () => {
  test("collapses the OpenAI shim suffix to the daemon root", () => {
    assert.equal(ollamaRootUrl("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434");
    assert.equal(ollamaRootUrl("http://127.0.0.1:11434/v1/"), "http://127.0.0.1:11434");
    assert.equal(ollamaRootUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434");
    assert.equal(ollamaRootUrl("http://127.0.0.1:11434///"), "http://127.0.0.1:11434");
  });

  test("accepts a remote host and preserves it", () => {
    assert.equal(ollamaRootUrl("http://gpu-box.lan:11434/v1"), "http://gpu-box.lan:11434");
  });

  test("falls back to the loopback default when unset or blank", () => {
    delete process.env.OLLAMA_BASE_URL;
    assert.equal(ollamaRootUrl(), "http://127.0.0.1:11434");
    assert.equal(ollamaRootUrl("   "), "http://127.0.0.1:11434");
  });

  test("reads the configured base URL from the environment", () => {
    process.env.OLLAMA_BASE_URL = "http://10.0.0.5:9999/v1";
    assert.equal(ollamaRootUrl(), "http://10.0.0.5:9999");
  });

  test("openai base always carries exactly one /v1 suffix", () => {
    assert.equal(ollamaOpenAiBaseUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434/v1");
    assert.equal(ollamaOpenAiBaseUrl("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434/v1");
  });
});

describe("ollama model + timeout resolution", () => {
  test("defaults to an installed-by-convention tagged model", () => {
    delete process.env.OLLAMA_MODEL;
    // A bare `llama3.2` 404s on Ollama; the default must carry a tag.
    assert.equal(ollamaModelName(), DEFAULT_OLLAMA_MODEL);
    assert.match(DEFAULT_OLLAMA_MODEL, /:/);
  });

  test("environment override wins", () => {
    process.env.OLLAMA_MODEL = "gpt-oss:20b";
    assert.equal(ollamaModelName(), "gpt-oss:20b");
  });

  test("explicit argument beats the environment", () => {
    process.env.OLLAMA_MODEL = "gpt-oss:20b";
    assert.equal(ollamaModelName("qwen2.5-coder:7b"), "qwen2.5-coder:7b");
  });

  test("timeout falls back when unset or invalid", () => {
    delete process.env.OLLAMA_TIMEOUT_MS;
    assert.equal(ollamaTimeoutMs(), 180_000);
    process.env.OLLAMA_TIMEOUT_MS = "not-a-number";
    assert.equal(ollamaTimeoutMs(), 180_000);
    process.env.OLLAMA_TIMEOUT_MS = "-5";
    assert.equal(ollamaTimeoutMs(), 180_000);
  });

  test("timeout honours a valid override", () => {
    process.env.OLLAMA_TIMEOUT_MS = "45000";
    assert.equal(ollamaTimeoutMs(), 45_000);
  });

  test("generation is capped so a repetition loop cannot run unbounded", () => {
    delete process.env.OLLAMA_MAX_TOKENS;
    assert.equal(ollamaMaxTokens(), 4_096);
    process.env.OLLAMA_MAX_TOKENS = "0";
    assert.equal(ollamaMaxTokens(), 4_096, "zero must not disable the cap");
    process.env.OLLAMA_MAX_TOKENS = "-1";
    assert.equal(ollamaMaxTokens(), 4_096);
    process.env.OLLAMA_MAX_TOKENS = "abc";
    assert.equal(ollamaMaxTokens(), 4_096);
  });

  test("generation cap honours a valid override", () => {
    process.env.OLLAMA_MAX_TOKENS = "8192";
    assert.equal(ollamaMaxTokens(), 8_192);
  });
});

describe("ollama error mapping", () => {
  test("404 names the pull command instead of reporting a bare HTTP code", () => {
    const error = ollamaHttpError(404, "model not found", "gpt-oss:20b", "http://127.0.0.1:11434/v1");
    assert.equal(error.code, "OLLAMA_MODEL_NOT_FOUND");
    assert.equal(error.retryable, false);
    assert.match(error.message, /ollama pull gpt-oss:20b/);
  });

  test("401 is reported as a key problem, not a server fault", () => {
    const error = ollamaHttpError(401, "", "llama3.2:3b", "http://127.0.0.1:11434/v1");
    assert.equal(error.category, "invalid_key");
    assert.equal(error.status, 401);
  });

  test("5xx is retryable and surfaces the daemon detail", () => {
    const error = ollamaHttpError(500, "runner crashed", "llama3.2:3b", "http://127.0.0.1:11434");
    assert.equal(error.retryable, true);
    assert.equal(error.status, 502);
    assert.match(error.message, /runner crashed/);
  });

  test("connection refusal advises starting the daemon and shows the root URL", () => {
    const error = ollamaNetworkError(new TypeError("fetch failed"), "http://127.0.0.1:11434/v1", "llama3.2:3b");
    assert.equal(error.code, "OLLAMA_UNREACHABLE");
    assert.match(error.message, /ollama serve/);
    // The advice concerns the daemon, so the /v1 shim path must not leak in.
    assert.ok(!error.message.includes("/v1"), error.message);
  });

  test("timeout is distinguished from refusal", () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const error = ollamaNetworkError(timeout, "http://127.0.0.1:11434", "qwen3.8:27b-mlx");
    assert.equal(error.category, "timeout");
    assert.equal(error.code, "OLLAMA_TIMEOUT");
    assert.equal(error.status, 504);
    assert.match(error.message, /qwen3\.8:27b-mlx/);
  });
});

describe("ollama discovery", () => {
  test("returns null when the daemon is unreachable", async () => {
    // Reserved-but-closed port: distinguishes "down" from "up with no models".
    const models = await listOllamaModels("http://127.0.0.1:11439", 500);
    assert.equal(models, null);
  });

  test("status reports not-running with actionable guidance", async () => {
    const status = await ollamaStatus({ baseUrl: "http://127.0.0.1:11439", timeoutMs: 500 });
    assert.equal(status.running, false);
    assert.equal(status.modelInstalled, false);
    assert.deepEqual(status.models, []);
    assert.match(status.error ?? "", /ollama serve/);
    assert.equal(status.baseUrl, "http://127.0.0.1:11439");
  });
});

describe("ollama model suggestion", () => {
  const installed = [
    model("llama3.2:3b"),
    model("gpt-oss:20b"),
    model("qwen2.5-coder:7b"),
    model("qwen3.5:cloud", true),
  ];

  test("expands an untagged name to the installed tag", () => {
    // The single most common misconfiguration: `llama3.2` is not a real tag.
    assert.equal(suggestInstalledModel("llama3.2", installed), "llama3.2:3b");
  });

  test("matches a different tag of the same family", () => {
    assert.equal(suggestInstalledModel("gpt-oss:120b", installed), "gpt-oss:20b");
  });

  test("returns undefined when nothing resembles the request", () => {
    assert.equal(suggestInstalledModel("mistral-nemo", installed), undefined);
  });

  test("ignores blank input", () => {
    assert.equal(suggestInstalledModel("   ", installed), undefined);
  });

  test("prefers a local model over a cloud-proxied one", () => {
    const withCloud = [model("qwen3.5:cloud", true), model("qwen3.5:7b")];
    assert.equal(suggestInstalledModel("qwen3.5", withCloud), "qwen3.5:7b");
  });

  test("falls back to a cloud entry when no local model matches", () => {
    const cloudOnly = [model("qwen3.5:cloud", true)];
    assert.equal(suggestInstalledModel("qwen3.5", cloudOnly), "qwen3.5:cloud");
  });
});
