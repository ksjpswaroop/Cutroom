import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { Request } from "express";
import { z } from "zod";
import { AI_PROVIDER_IDS, isAiProviderId, type AiProviderId } from "./ai";
import {
  migrateEnvSecretsToKeychain,
  persistSecret,
  resolveSecretsBackend,
  stripSecretAssignments,
  type SecretsBackend,
} from "./keychain";
import { getEnvFilePaths } from "./env-path";
import { configureGeminiApiKey, configureGeminiModels } from "./gemini";
import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  DEFAULT_GEMINI_TEXT_MODEL,
  GEMINI_IMAGE_MODELS,
  GEMINI_TEXT_MODELS,
  isGeminiImageModel,
  isGeminiTextModel,
  type GeminiImageModel,
  type GeminiTextModel,
} from "./gemini-models";

const SUPPORTED_KEYS = [
  "YOUTUBE_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_TEXT_MODEL",
  "GEMINI_IMAGE_MODEL",
  "CUTROOM_AI_PROVIDER",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
] as const;

type SupportedKey = (typeof SUPPORTED_KEYS)[number];

export interface ApiKeySettings {
  youtubeApiKey?: string;
  geminiApiKey?: string;
  geminiTextModel?: string;
  geminiImageModel?: string;
  aiProvider?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export const apiKeySettingsSchema = z.object({
  youtubeApiKey: z.string().trim().min(8).max(512).optional(),
  geminiApiKey: z.string().trim().min(8).max(512).optional(),
  geminiTextModel: z.string().refine(isGeminiTextModel, "Select a supported Gemini text model.").optional(),
  geminiImageModel: z.string().refine(isGeminiImageModel, "Select a supported Gemini image model.").optional(),
  aiProvider: z.string().refine(isAiProviderId, "Select a supported AI text provider.").optional(),
  openrouterApiKey: z.string().trim().min(8).max(512).optional(),
  openrouterModel: z.string().trim().min(1).max(200).optional(),
  openaiApiKey: z.string().trim().min(8).max(512).optional(),
  openaiBaseUrl: z.string().trim().url().max(500).optional(),
  openaiModel: z.string().trim().min(1).max(200).optional(),
  ollamaBaseUrl: z.string().trim().url().max(500).optional(),
  ollamaModel: z.string().trim().min(1).max(200).optional(),
}).strict();

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === "127.0.0.1"
    || address === "::1"
    || address.startsWith("::ffff:127.");
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export interface LocalSettingsRequestMetadata {
  remoteAddress?: string;
  host?: string;
  origin?: string;
  forwarded?: string;
  xForwardedFor?: string;
  xForwardedHost?: string;
  xForwardedProto?: string;
  via?: string;
  secFetchSite?: string;
}

export function isTrustedLocalSettingsMetadata(input: LocalSettingsRequestMetadata): boolean {
  if (!isLoopbackAddress(input.remoteAddress)) return false;
  if (
    input.forwarded
    || input.xForwardedFor
    || input.xForwardedHost
    || input.xForwardedProto
    || input.via
  ) return false;

  if (!input.host) return false;
  if (/[@/\\\s%]/.test(input.host)) return false;
  let hostUrl: URL;
  try {
    hostUrl = new URL(`http://${input.host}`);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;

  if (input.origin) {
    try {
      const origin = new URL(input.origin);
      if (
        !["http:", "https:"].includes(origin.protocol)
        || !isLoopbackHostname(origin.hostname)
        || origin.host !== hostUrl.host
      ) return false;
    } catch {
      return false;
    }
  }

  return !input.secFetchSite || input.secFetchSite === "same-origin" || input.secFetchSite === "none";
}

export function isLocalSettingsRequest(req: Request): boolean {
  return isTrustedLocalSettingsMetadata({
    remoteAddress: req.socket.remoteAddress,
    host: req.get("host"),
    origin: req.get("origin"),
    forwarded: req.get("forwarded"),
    xForwardedFor: req.get("x-forwarded-for"),
    xForwardedHost: req.get("x-forwarded-host"),
    xForwardedProto: req.get("x-forwarded-proto"),
    via: req.get("via"),
    secFetchSite: req.get("sec-fetch-site"),
  });
}

export function getApiKeyStatus() {
  const textModel = isGeminiTextModel(process.env.GEMINI_TEXT_MODEL || "")
    ? process.env.GEMINI_TEXT_MODEL as GeminiTextModel
    : DEFAULT_GEMINI_TEXT_MODEL;
  const imageModel = isGeminiImageModel(process.env.GEMINI_IMAGE_MODEL || "")
    ? process.env.GEMINI_IMAGE_MODEL as GeminiImageModel
    : DEFAULT_GEMINI_IMAGE_MODEL;
  const aiProvider: AiProviderId = isAiProviderId(process.env.CUTROOM_AI_PROVIDER || "")
    ? (process.env.CUTROOM_AI_PROVIDER as AiProviderId)
    : "gemini";

  return {
    youtube: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    openaiCompatible: Boolean(
      process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_COMPATIBLE_API_KEY?.trim(),
    ),
    ollama: true,
    aiProvider,
    aiProviderOptions: AI_PROVIDER_IDS.map((id) => ({
      id,
      label:
        id === "gemini"
          ? "Gemini"
          : id === "openrouter"
            ? "OpenRouter"
            : id === "ollama"
              ? "Ollama (local)"
              : "OpenAI-compatible",
    })),
    models: {
      text: textModel,
      image: imageModel,
      textOptions: GEMINI_TEXT_MODELS,
      imageOptions: GEMINI_IMAGE_MODELS,
      openrouterModel: process.env.OPENROUTER_MODEL?.trim() || "openrouter/auto",
      openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      ollamaModel: process.env.OLLAMA_MODEL?.trim() || "llama3.2",
      openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1",
    },
    storage: (process.env.CUTROOM_APP_DATA?.trim() || process.env.LEDGER_APP_DATA?.trim())
      ? "app-data"
      : "cwd",
    secretsBackend: "env" as SecretsBackend,
  };
}

/** Async status with resolved secrets backend (keychain vs env). */
export async function getApiKeyStatusAsync() {
  const status = getApiKeyStatus();
  const secretsBackend = await resolveSecretsBackend();
  return { ...status, secretsBackend };
}

function validateApiKey(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length < 8 || trimmed.length > 512) {
    throw new Error(`${label} must be between 8 and 512 characters.`);
  }
  if (/\r|\n|\0/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return trimmed;
}

function setEnvValue(contents: string, key: SupportedKey, value: string): string {
  const assignment = `${key}=${JSON.stringify(value)}`;
  const lines = contents.split(/\r?\n/);
  const lineIndex = lines.findIndex((line) => line.startsWith(`${key}=`));

  if (lineIndex >= 0) {
    lines[lineIndex] = assignment;
  } else {
    if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
    lines.push(assignment);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export async function saveApiKeySettings(input: ApiKeySettings) {
  const youtubeApiKey = validateApiKey(input.youtubeApiKey, "YouTube API key");
  const geminiApiKey = validateApiKey(input.geminiApiKey, "Gemini API key");
  const openrouterApiKey = validateApiKey(input.openrouterApiKey, "OpenRouter API key");
  const openaiApiKey = validateApiKey(input.openaiApiKey, "OpenAI-compatible API key");
  const currentStatus = getApiKeyStatus();
  const textModel = input.geminiTextModel ?? currentStatus.models.text;
  const imageModel = input.geminiImageModel ?? currentStatus.models.image;
  const aiProvider = input.aiProvider ?? currentStatus.aiProvider;

  const hasProviderExtras = Boolean(
    input.aiProvider
    || openrouterApiKey
    || openaiApiKey
    || input.openrouterModel
    || input.openaiBaseUrl
    || input.openaiModel
    || input.ollamaBaseUrl
    || input.ollamaModel,
  );

  if (!youtubeApiKey && !geminiApiKey
    && input.geminiTextModel === undefined
    && input.geminiImageModel === undefined
    && !hasProviderExtras) {
    throw new Error("Enter a replacement key or select a model to save.");
  }

  if (!isGeminiTextModel(textModel)) {
    throw new Error("Select a supported Gemini text model.");
  }
  if (!isGeminiImageModel(imageModel)) {
    throw new Error("Select a supported Gemini image model.");
  }
  if (!isAiProviderId(aiProvider)) {
    throw new Error("Select a supported AI text provider.");
  }

  const { root, envPath, envTempPath } = getEnvFilePaths();
  await mkdir(root, { recursive: true });

  let contents = "";
  try {
    contents = await readFile(envPath, "utf8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  // Migrate any existing plaintext secrets into the OS keychain when available.
  const migration = await migrateEnvSecretsToKeychain(contents);
  contents = migration.contents;

  if (youtubeApiKey) {
    const storedInKeychain = await persistSecret("YOUTUBE_API_KEY", youtubeApiKey);
    if (!storedInKeychain) {
      contents = setEnvValue(contents, "YOUTUBE_API_KEY", youtubeApiKey);
    }
  }
  if (geminiApiKey) {
    const storedInKeychain = await persistSecret("GEMINI_API_KEY", geminiApiKey);
    if (!storedInKeychain) {
      contents = setEnvValue(contents, "GEMINI_API_KEY", geminiApiKey);
    }
  }
  contents = setEnvValue(contents, "GEMINI_TEXT_MODEL", textModel);
  contents = setEnvValue(contents, "GEMINI_IMAGE_MODEL", imageModel);
  contents = setEnvValue(contents, "CUTROOM_AI_PROVIDER", aiProvider);

  if (openrouterApiKey) {
    const storedInKeychain = await persistSecret("OPENROUTER_API_KEY", openrouterApiKey);
    if (!storedInKeychain) {
      contents = setEnvValue(contents, "OPENROUTER_API_KEY", openrouterApiKey);
    }
  }
  if (input.openrouterModel?.trim()) {
    contents = setEnvValue(contents, "OPENROUTER_MODEL", input.openrouterModel.trim());
  }
  if (openaiApiKey) {
    const storedInKeychain = await persistSecret("OPENAI_API_KEY", openaiApiKey);
    if (!storedInKeychain) {
      contents = setEnvValue(contents, "OPENAI_API_KEY", openaiApiKey);
    }
  }
  if (input.openaiBaseUrl?.trim()) {
    contents = setEnvValue(contents, "OPENAI_BASE_URL", input.openaiBaseUrl.trim());
  }
  if (input.openaiModel?.trim()) {
    contents = setEnvValue(contents, "OPENAI_MODEL", input.openaiModel.trim());
  }
  if (input.ollamaBaseUrl?.trim()) {
    contents = setEnvValue(contents, "OLLAMA_BASE_URL", input.ollamaBaseUrl.trim());
  }
  if (input.ollamaModel?.trim()) {
    contents = setEnvValue(contents, "OLLAMA_MODEL", input.ollamaModel.trim());
  }

  const secretsBackend = await resolveSecretsBackend();
  if (secretsBackend === "keychain") {
    contents = stripSecretAssignments(contents);
  }

  await writeFile(envTempPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(envTempPath, envPath);
  await chmod(envPath, 0o600);

  if (youtubeApiKey) process.env.YOUTUBE_API_KEY = youtubeApiKey;
  if (geminiApiKey) configureGeminiApiKey(geminiApiKey);
  configureGeminiModels(textModel, imageModel);
  process.env.CUTROOM_AI_PROVIDER = aiProvider;
  if (openrouterApiKey) process.env.OPENROUTER_API_KEY = openrouterApiKey;
  if (input.openrouterModel?.trim()) process.env.OPENROUTER_MODEL = input.openrouterModel.trim();
  if (openaiApiKey) process.env.OPENAI_API_KEY = openaiApiKey;
  if (input.openaiBaseUrl?.trim()) process.env.OPENAI_BASE_URL = input.openaiBaseUrl.trim();
  if (input.openaiModel?.trim()) process.env.OPENAI_MODEL = input.openaiModel.trim();
  if (input.ollamaBaseUrl?.trim()) process.env.OLLAMA_BASE_URL = input.ollamaBaseUrl.trim();
  if (input.ollamaModel?.trim()) process.env.OLLAMA_MODEL = input.ollamaModel.trim();

  return getApiKeyStatusAsync();
}
