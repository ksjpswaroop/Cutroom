import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getApiKeyStatus } from "./settings";
import { readPreferences } from "./preferences";

/**
 * Local-only field diagnostics.
 *
 * Cutroom ships no telemetry by design, which also means that when a stranger
 * hits a bug, neither of you can see it. This module is the opt-in alternative:
 * a bounded in-memory ring of recent server log lines plus a redacted snapshot
 * of the runtime, which the user exports to a file they choose and inspect
 * before sending. Nothing here leaves the machine on its own.
 *
 * The buffer stores redacted text only. Request and response bodies are never
 * logged (see README), and `recordDiagnostic` scrubs anything that still looks
 * like a secret or an email before it is kept, so the export cannot carry a key
 * even if a future log line were careless.
 */

const MAX_EVENTS = 300;

interface DiagnosticEvent {
  ts: string;
  source: string;
  message: string;
}

const ring: DiagnosticEvent[] = [];

const REDACTIONS: { pattern: RegExp; label: string }[] = [
  // Google API keys (YouTube Data API, Gemini).
  { pattern: /AIza[0-9A-Za-z\-_]{10,}/g, label: "[redacted-key]" },
  // OpenAI / OpenAI-compatible / OpenRouter style keys.
  { pattern: /sk-[A-Za-z0-9\-_]{10,}/g, label: "[redacted-key]" },
  // Bearer tokens in any logged header echo.
  { pattern: /[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g, label: "Bearer [redacted-token]" },
  // KEY=value / KEY: value assignments for sensitive-looking names.
  {
    pattern: /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/g,
    label: "$1=[redacted]",
  },
  // Email addresses — never part of a diagnostic, always personal.
  { pattern: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, label: "[redacted-email]" },
];

/**
 * Remove anything that resembles a secret or personal identifier from a string.
 * Exported so the export route and tests can assert the privacy contract on the
 * whole bundle, not only on individual log lines.
 */
export function redactDiagnosticText(input: string): string {
  let output = input;
  for (const { pattern, label } of REDACTIONS) {
    output = output.replace(pattern, label);
  }
  return output;
}

export function recordDiagnostic(message: string, source = "express"): void {
  ring.push({
    ts: new Date().toISOString(),
    source,
    message: redactDiagnosticText(message),
  });
  if (ring.length > MAX_EVENTS) {
    ring.splice(0, ring.length - MAX_EVENTS);
  }
}

/** Test-only: clear the ring so assertions do not see prior process events. */
export function resetDiagnostics(): void {
  ring.length = 0;
}

export interface DiagnosticBundle {
  generatedAt: string;
  app: { name: string; version: string };
  runtime: {
    node: string;
    platform: string;
    arch: string;
    uptimeSec: number;
  };
  providers: {
    aiProvider: string | null;
    youtubeKeyPresent: boolean;
    geminiKeyPresent: boolean;
    secretsBackend?: string;
    [flag: string]: unknown;
  };
  preferences: unknown;
  recentEvents: string[];
  notice: string;
}

/**
 * Build the redacted diagnostic snapshot. Provider fields are booleans and names
 * only — never key values — and the recent-events list is already redacted on
 * the way into the ring.
 */
export async function buildDiagnosticBundle(): Promise<DiagnosticBundle> {
  const status = getApiKeyStatus() as Record<string, unknown>;
  let preferences: unknown = null;
  try {
    preferences = await readPreferences();
  } catch {
    preferences = null;
  }

  const providers: DiagnosticBundle["providers"] = {
    aiProvider: typeof status.aiProvider === "string" ? status.aiProvider : null,
    youtubeKeyPresent: Boolean(status.youtube),
    geminiKeyPresent: Boolean(status.gemini),
  };
  // Carry through any other boolean/string status flags, but never arrays,
  // objects, or anything that could smuggle a value.
  for (const [key, value] of Object.entries(status)) {
    if (key in providers) continue;
    if (typeof value === "boolean" || typeof value === "string") {
      providers[key] = typeof value === "string" ? redactDiagnosticText(value) : value;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    app: {
      name: "Cutroom",
      version: process.env.CUTROOM_VERSION || process.env.npm_package_version || "unknown",
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.round(process.uptime()),
    },
    providers,
    preferences,
    recentEvents: ring.map((event) => `${event.ts} [${event.source}] ${event.message}`),
    notice:
      "Redacted, local diagnostics. API keys, tokens, and emails are removed; no request or response bodies are recorded. Review this file before sharing it. Cutroom sends no telemetry.",
  };
}

export function serializeDiagnosticBundle(bundle: DiagnosticBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function diagnosticFileName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `cutroom-diagnostics-${stamp}.json`;
}

/**
 * Write the redacted bundle to a user-chosen absolute path (desktop save
 * dialog). Loopback-only callers only; the path comes from a native save dialog
 * the user drove, and the parent directory must already exist.
 */
export async function writeDiagnosticBundleToPath(targetPath: string): Promise<{ path: string; bytes: number }> {
  const trimmed = targetPath.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    throw new Error("Choose an absolute file path for the diagnostics export.");
  }
  const resolved = path.resolve(trimmed);
  const bundle = await buildDiagnosticBundle();
  const payload = serializeDiagnosticBundle(bundle);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.tmp`;
  await writeFile(temp, payload, { encoding: "utf8", mode: 0o600 });
  await rename(temp, resolved);
  return { path: resolved, bytes: Buffer.byteLength(payload) };
}

/** Exposed for diagnostics about the host; not currently in the bundle body. */
export function hostLabel(): string {
  return `${os.type()} ${os.release()}`;
}
