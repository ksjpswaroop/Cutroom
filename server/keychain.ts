/**
 * OS keychain helpers for Cutroom API secrets (L-409).
 * macOS: `security` generic passwords. Other platforms fall back to `.env`.
 */
import { spawn } from "node:child_process";
import os from "node:os";

export const KEYCHAIN_SERVICE = "app.cutroom.desktop";

/** Env keys that must never linger in plaintext `.env` once keychain is active. */
export const SECRET_ENV_KEYS = [
  "YOUTUBE_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "OLLAMA_API_KEY",
] as const;

export type SecretEnvKey = (typeof SECRET_ENV_KEYS)[number];

export type SecretsBackend = "keychain" | "env";

function run(command: string, args: string[], input?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      resolve({ code: 127, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

export function isKeychainPreferred(): boolean {
  if (process.env.CUTROOM_SECRETS_BACKEND === "env") return false;
  if (process.env.CUTROOM_SECRETS_BACKEND === "keychain") return true;
  // Desktop app-data sessions prefer keychain on macOS.
  if (os.platform() !== "darwin") return false;
  return Boolean(process.env.CUTROOM_APP_DATA?.trim() || process.env.LEDGER_APP_DATA?.trim()
    || process.env.CUTROOM_USE_KEYCHAIN === "1");
}

export async function keychainAvailable(): Promise<boolean> {
  if (os.platform() !== "darwin") return false;
  const result = await run("which", ["security"]);
  return result.code === 0 && Boolean(result.stdout.trim());
}

export async function resolveSecretsBackend(): Promise<SecretsBackend> {
  if (!isKeychainPreferred()) return "env";
  return (await keychainAvailable()) ? "keychain" : "env";
}

export async function getKeychainSecret(account: SecretEnvKey): Promise<string | null> {
  if (!(await keychainAvailable())) return null;
  const result = await run("security", [
    "find-generic-password",
    "-s", KEYCHAIN_SERVICE,
    "-a", account,
    "-w",
  ]);
  if (result.code !== 0) return null;
  const value = result.stdout.replace(/\r?\n$/, "");
  return value || null;
}

export async function setKeychainSecret(account: SecretEnvKey, value: string): Promise<void> {
  if (!(await keychainAvailable())) {
    throw new Error("macOS keychain is not available.");
  }
  // Delete existing item (ignore missing), then add.
  await run("security", [
    "delete-generic-password",
    "-s", KEYCHAIN_SERVICE,
    "-a", account,
  ]);
  const add = await run("security", [
    "add-generic-password",
    "-U",
    "-s", KEYCHAIN_SERVICE,
    "-a", account,
    "-w", value,
    "-l", `Cutroom ${account}`,
  ]);
  if (add.code !== 0) {
    throw new Error(`Unable to store ${account} in the keychain (${add.stderr.trim() || "security failed"}).`);
  }
}

export async function deleteKeychainSecret(account: SecretEnvKey): Promise<void> {
  if (!(await keychainAvailable())) return;
  await run("security", [
    "delete-generic-password",
    "-s", KEYCHAIN_SERVICE,
    "-a", account,
  ]);
}

/**
 * Load secrets from keychain into process.env (does not overwrite non-empty env).
 */
export async function hydrateSecretsFromKeychain(): Promise<{ loaded: SecretEnvKey[]; backend: SecretsBackend }> {
  const backend = await resolveSecretsBackend();
  if (backend !== "keychain") return { loaded: [], backend };

  const loaded: SecretEnvKey[] = [];
  for (const key of SECRET_ENV_KEYS) {
    if (process.env[key]?.trim()) continue;
    const value = await getKeychainSecret(key);
    if (value?.trim()) {
      process.env[key] = value.trim();
      loaded.push(key);
    }
  }
  return { loaded, backend };
}

/**
 * Persist a secret to keychain when that backend is active.
 * Returns true when the value was stored in keychain (caller should omit from `.env`).
 */
export async function persistSecret(account: SecretEnvKey, value: string): Promise<boolean> {
  const backend = await resolveSecretsBackend();
  if (backend !== "keychain") return false;
  await setKeychainSecret(account, value);
  process.env[account] = value;
  return true;
}

export function stripSecretAssignments(envContents: string): string {
  const secretSet = new Set<string>(SECRET_ENV_KEYS);
  const lines = envContents.split(/\r?\n/).filter((line) => {
    const match = /^(?:export\s+)?([A-Z0-9_]+)=/.exec(line);
    if (!match) return true;
    return !secretSet.has(match[1]);
  });
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/**
 * One-shot migration: copy secret values from `.env` / process.env into keychain,
 * then return sanitized `.env` contents with secrets removed.
 */
export async function migrateEnvSecretsToKeychain(envContents: string): Promise<{
  migrated: SecretEnvKey[];
  contents: string;
}> {
  const backend = await resolveSecretsBackend();
  if (backend !== "keychain") {
    return { migrated: [], contents: envContents };
  }

  const migrated: SecretEnvKey[] = [];
  const values = new Map<SecretEnvKey, string>();

  for (const key of SECRET_ENV_KEYS) {
    const fromEnv = process.env[key]?.trim();
    if (fromEnv) values.set(key, fromEnv);
  }

  for (const line of envContents.split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as SecretEnvKey;
    if (!SECRET_ENV_KEYS.includes(key)) continue;
    let raw = match[2].trim();
    if ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) {
      try {
        raw = JSON.parse(raw.startsWith("'") ? `"${raw.slice(1, -1)}"` : raw) as string;
      } catch {
        raw = raw.slice(1, -1);
      }
    }
    if (raw.trim()) values.set(key, raw.trim());
  }

  for (const [key, value] of values) {
    const existing = await getKeychainSecret(key);
    if (!existing) {
      await setKeychainSecret(key, value);
      migrated.push(key);
    }
    process.env[key] = value;
  }

  return { migrated, contents: stripSecretAssignments(envContents) };
}
