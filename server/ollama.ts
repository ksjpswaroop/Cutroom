/**
 * Ollama runtime — first-class local AI path.
 *
 * The OpenAI-compatible shim at `/v1` is enough to send a chat completion, but
 * it cannot answer the questions that actually matter to a local-first product:
 * is the daemon running, which models are installed, and is the model the user
 * selected one of them. Those are served by Ollama's native API at the root,
 * so this module tracks both surfaces off a single configured base URL.
 */

import { ProviderError } from "./provider-errors";

/** Cold-loading a large quantized model into RAM can take minutes. */
export const DEFAULT_OLLAMA_TIMEOUT_MS = 180_000;
/**
 * Upper bound on generated tokens.
 *
 * Small local models intermittently fall into a repetition loop that never
 * emits a stop token; observed here as identical prompts finishing in 5s or
 * running past 300s. Nothing else terminates that, so generation is capped.
 * A complete script measures in the hundreds of tokens, so this leaves ample
 * headroom, and a response cut at the cap is still recovered by the JSON
 * extractor rather than being lost.
 */
export const DEFAULT_OLLAMA_MAX_TOKENS = 4_096;

/** Health/tags probes must stay fast — they gate UI rendering. */
export const DEFAULT_OLLAMA_PROBE_TIMEOUT_MS = 4_000;
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
  family?: string;
  capabilities: string[];
  modifiedAt?: string;
  /** Cloud-hosted entries (`:cloud`) are proxied by Ollama, not local weights. */
  remote: boolean;
}

export interface OllamaStatus {
  running: boolean;
  baseUrl: string;
  model: string;
  models: OllamaModel[];
  /** True when `model` is present in `models`. */
  modelInstalled: boolean;
  /**
   * Installed model the selection most likely meant, when it is not installed.
   * Untagged names are the common mistake: `llama3.2` is not a real tag, but
   * `llama3.2:3b` may well be pulled.
   */
  suggestedModel?: string;
  /** Populated when `running` is false. */
  error?: string;
}

/**
 * Normalise any user-entered base URL to the daemon root.
 *
 * Settings historically stored the OpenAI shim URL (`.../v1`), and users paste
 * either form, so both must collapse to the same root for the native API.
 */
export function ollamaRootUrl(raw?: string): string {
  const value = (raw ?? process.env.OLLAMA_BASE_URL ?? "").trim() || DEFAULT_OLLAMA_BASE_URL;
  return value.replace(/\/+$/, "").replace(/\/v1$/i, "") || DEFAULT_OLLAMA_BASE_URL;
}

/** OpenAI-compatible base (`<root>/v1`) used for chat completions. */
export function ollamaOpenAiBaseUrl(raw?: string): string {
  return `${ollamaRootUrl(raw)}/v1`;
}

export function ollamaModelName(raw?: string): string {
  return (raw ?? process.env.OLLAMA_MODEL ?? "").trim() || DEFAULT_OLLAMA_MODEL;
}

export function ollamaTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OLLAMA_TIMEOUT_MS;
}

export function ollamaMaxTokens(): number {
  const parsed = Number.parseInt(process.env.OLLAMA_MAX_TOKENS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OLLAMA_MAX_TOKENS;
}

function parseModel(entry: any): OllamaModel {
  const details = entry?.details ?? {};
  const name = String(entry?.name ?? entry?.model ?? "").trim();
  return {
    name,
    sizeBytes: Number(entry?.size) || 0,
    parameterSize: details.parameter_size || undefined,
    quantization: details.quantization_level || undefined,
    contextLength: Number(details.context_length) || undefined,
    family: details.family || undefined,
    capabilities: Array.isArray(entry?.capabilities) ? entry.capabilities.map(String) : [],
    modifiedAt: entry?.modified_at || undefined,
    remote: Boolean(entry?.remote_model) || name.endsWith(":cloud"),
  };
}

/**
 * List installed models. Returns null when the daemon is unreachable, so the
 * caller can distinguish "not running" from "running with nothing installed".
 */
export async function listOllamaModels(
  baseUrl?: string,
  timeoutMs = DEFAULT_OLLAMA_PROBE_TIMEOUT_MS,
): Promise<OllamaModel[] | null> {
  const root = ollamaRootUrl(baseUrl);
  try {
    const response = await fetch(`${root}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = await response.json() as { models?: unknown[] };
    if (!Array.isArray(body?.models)) return [];
    return body.models
      .map(parseModel)
      .filter((model) => model.name.length > 0)
      // Embedding-only models cannot serve chat completions; hide them.
      .filter((model) => !(model.capabilities.length === 1 && model.capabilities[0] === "embedding"))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return null;
  }
}

/**
 * Find the installed model a mistyped selection most likely meant.
 * Prefers an exact tag expansion (`llama3.2` -> `llama3.2:3b`) over a looser
 * prefix match, and never suggests a cloud-proxied entry for a local intent.
 */
export function suggestInstalledModel(model: string, models: OllamaModel[]): string | undefined {
  const wanted = model.trim().toLowerCase();
  if (!wanted) return undefined;
  const local = models.filter((candidate) => !candidate.remote);
  const pool = local.length > 0 ? local : models;

  const tagExpansion = pool.find((candidate) => candidate.name.toLowerCase().startsWith(`${wanted}:`));
  if (tagExpansion) return tagExpansion.name;

  const base = wanted.split(":")[0];
  const familyMatch = pool.find((candidate) => candidate.name.toLowerCase().split(":")[0] === base);
  return familyMatch?.name;
}

/** Full status for Settings: reachability, installed models, selection validity. */
export async function ollamaStatus(options: {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
} = {}): Promise<OllamaStatus> {
  const baseUrl = ollamaRootUrl(options.baseUrl);
  const model = ollamaModelName(options.model);
  const models = await listOllamaModels(baseUrl, options.timeoutMs);

  if (models === null) {
    return {
      running: false,
      baseUrl,
      model,
      models: [],
      modelInstalled: false,
      error: `No Ollama daemon is answering at ${baseUrl}. Start it with \`ollama serve\`, or install it from https://ollama.com/download.`,
    };
  }

  const modelInstalled = models.some((candidate) => candidate.name === model);
  return {
    running: true,
    baseUrl,
    model,
    models,
    modelInstalled,
    suggestedModel: modelInstalled ? undefined : suggestInstalledModel(model, models),
  };
}

/**
 * Turn a failed Ollama call into an error a user can act on.
 *
 * The generic OpenAI-compatible adapter reports a bare `HTTP 404`, which for
 * Ollama almost always means the selected model simply is not pulled — a
 * one-command fix that the message should name outright.
 */
export function ollamaHttpError(status: number, body: string, model: string, rawBaseUrl: string): ProviderError {
  const baseUrl = ollamaRootUrl(rawBaseUrl);
  if (status === 404) {
    return new ProviderError({
      message: `Ollama has no model named "${model}". Pull it first with \`ollama pull ${model}\`, or pick an installed model in Settings.`,
      category: "invalid_response",
      code: "OLLAMA_MODEL_NOT_FOUND",
      status: 400,
      retryable: false,
    });
  }
  if (status === 401 || status === 403) {
    return new ProviderError({
      message: `Ollama at ${baseUrl} rejected the request (HTTP ${status}). Check OLLAMA_API_KEY if the endpoint is behind a proxy.`,
      category: "invalid_key",
      code: `OLLAMA_HTTP_${status}`,
      status,
      retryable: false,
    });
  }
  const detail = body.trim().slice(0, 200);
  return new ProviderError({
    message: `Ollama returned HTTP ${status}${detail ? `: ${detail}` : "."}`,
    category: "provider_server",
    code: `OLLAMA_HTTP_${status}`,
    status: status >= 500 ? 502 : 400,
    retryable: status >= 500,
  });
}

/** Connection failure → actionable message, distinguishing timeout from refusal. */
export function ollamaNetworkError(error: any, rawBaseUrl: string, model: string): ProviderError {
  const baseUrl = ollamaRootUrl(rawBaseUrl);
  const name = error?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new ProviderError({
      message: `Ollama did not respond within ${Math.round(ollamaTimeoutMs() / 1000)}s while running "${model}". Large models can exceed this on first load — try a smaller model, or raise OLLAMA_TIMEOUT_MS.`,
      category: "timeout",
      code: "OLLAMA_TIMEOUT",
      status: 504,
      retryable: true,
    });
  }
  return new ProviderError({
    message: `Could not reach Ollama at ${baseUrl}. Start it with \`ollama serve\`, or switch to a hosted provider in Settings.`,
    category: "network",
    code: "OLLAMA_UNREACHABLE",
    status: 502,
    retryable: true,
  });
}
