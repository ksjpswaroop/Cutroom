import { access, mkdir, readFile, rename, writeFile, constants as fsConstants } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnvFilePaths } from "./env-path";

const LIBRARY_CONFIG_NAME = "library.json";

export const librarySettingsSchema = z.object({
  path: z.string().trim().min(1).max(1024),
}).strict();

export interface LibraryConfig {
  path: string | null;
}

function configPath(root = getEnvFilePaths().root): string {
  return path.join(root, LIBRARY_CONFIG_NAME);
}

export function sanitizeTopicFolderName(title: string, id: string): string {
  const base = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 72)
    .trim()
    || "Untitled workflow";
  const shortId = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "workflow";
  return `${base} [${shortId}]`;
}

export async function readLibraryConfig(root = getEnvFilePaths().root): Promise<LibraryConfig> {
  try {
    const raw = await readFile(configPath(root), "utf8");
    const parsed = JSON.parse(raw) as { path?: unknown };
    const value = typeof parsed.path === "string" ? parsed.path.trim() : "";
    return { path: value || null };
  } catch (error: any) {
    if (error?.code === "ENOENT") return { path: null };
    throw error;
  }
}

export async function writeLibraryConfig(
  nextPath: string,
  root = getEnvFilePaths().root,
): Promise<LibraryConfig> {
  const trimmed = nextPath.trim();
  if (!path.isAbsolute(trimmed)) {
    throw new Error("Choose an absolute folder path.");
  }
  const resolved = path.resolve(trimmed);
  await mkdir(resolved, { recursive: true });
  await access(resolved, fsConstants.W_OK);

  await mkdir(root, { recursive: true });
  const temp = `${configPath(root)}.${process.pid}.tmp`;
  const payload = `${JSON.stringify({ path: resolved }, null, 2)}\n`;
  await writeFile(temp, payload, { encoding: "utf8", mode: 0o600 });
  await rename(temp, configPath(root));
  return { path: resolved };
}

export async function clearLibraryConfig(root = getEnvFilePaths().root): Promise<LibraryConfig> {
  await mkdir(root, { recursive: true });
  const temp = `${configPath(root)}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify({ path: null }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, configPath(root));
  return { path: null };
}

/** User library when configured; otherwise the app-data workflows root. */
export async function resolveWorkflowLibraryRoot(root = getEnvFilePaths().root): Promise<{
  libraryPath: string | null;
  storageRoot: string;
  arrangedByTopic: boolean;
}> {
  const config = await readLibraryConfig(root);
  if (config.path) {
    await mkdir(config.path, { recursive: true });
    return {
      libraryPath: config.path,
      storageRoot: config.path,
      arrangedByTopic: true,
    };
  }
  const fallback = path.join(root, "workflows");
  await mkdir(fallback, { recursive: true });
  return {
    libraryPath: null,
    storageRoot: fallback,
    arrangedByTopic: false,
  };
}
