import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { WORKFLOW_HISTORY_LIMIT } from "../shared/workflow-history";
import { getEnvFilePaths } from "./env-path";
import {
  resolveWorkflowLibraryRoot,
  sanitizeTopicFolderName,
} from "./library-config";

export interface StoredWorkflowRecord<T = unknown> {
  id: string;
  createdAt: number;
  updatedAt: number;
  state: T;
}

const WORKFLOW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const WORKFLOW_FILE = "workflow.json";

export function isValidWorkflowId(id: string): boolean {
  return WORKFLOW_ID_PATTERN.test(id);
}

/** @deprecated Prefer resolveWorkflowLibraryRoot; kept for tests and fallbacks. */
export function getWorkflowsDirectory(root = getEnvFilePaths().root): string {
  return path.join(root, "workflows");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseWorkflowRecord<T>(value: unknown): StoredWorkflowRecord<T> | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  if (!isValidWorkflowId(id)) return null;
  const createdAt = typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? value.createdAt : null;
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : null;
  if (createdAt === null || updatedAt === null) return null;
  if (!("state" in value)) return null;
  return {
    id,
    createdAt,
    updatedAt,
    state: value.state as T,
  };
}

function titleFromState(state: unknown): string {
  if (!isRecord(state)) return "Untitled workflow";
  if (typeof state.title === "string" && state.title.trim()) return state.title.trim();
  if (isRecord(state.cachedResearch) && typeof state.cachedResearch.query === "string") {
    return state.cachedResearch.query.trim() || "Untitled workflow";
  }
  return "Untitled workflow";
}

async function listTopicWorkflowFiles(storageRoot: string): Promise<Array<{ id: string; filePath: string; dirPath: string }>> {
  let entries: string[] = [];
  try {
    entries = await readdir(storageRoot);
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const found: Array<{ id: string; filePath: string; dirPath: string }> = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const dirPath = path.join(storageRoot, entry);
    let isDirectory = false;
    try {
      isDirectory = (await stat(dirPath)).isDirectory();
    } catch {
      continue;
    }
    if (!isDirectory) {
      // Legacy flat `{id}.json` files in the storage root / workflows dir
      if (!entry.endsWith(".json") || entry.endsWith(".tmp.json")) continue;
      const id = entry.slice(0, -".json".length);
      if (!isValidWorkflowId(id)) continue;
      found.push({ id, filePath: dirPath, dirPath: storageRoot });
      continue;
    }
    const filePath = path.join(dirPath, WORKFLOW_FILE);
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = parseWorkflowRecord(JSON.parse(raw));
      if (parsed) found.push({ id: parsed.id, filePath, dirPath });
    } catch {
      // Skip corrupt / incomplete topic folders.
    }
  }
  return found;
}

async function findWorkflowFile(
  id: string,
  storageRoot: string,
): Promise<{ filePath: string; dirPath: string } | null> {
  if (!isValidWorkflowId(id)) return null;
  const matches = await listTopicWorkflowFiles(storageRoot);
  const hit = matches.find((item) => item.id === id);
  if (hit) return { filePath: hit.filePath, dirPath: hit.dirPath };

  // Legacy flat path under storageRoot or classic workflows/
  const legacyCandidates = [
    path.join(storageRoot, `${id}.json`),
    path.join(getEnvFilePaths().root, "workflows", `${id}.json`),
  ];
  for (const filePath of legacyCandidates) {
    try {
      await readFile(filePath, "utf8");
      return { filePath, dirPath: path.dirname(filePath) };
    } catch {
      // continue
    }
  }
  return null;
}

async function mirrorReadableArtifacts<T>(dirPath: string, record: StoredWorkflowRecord<T>): Promise<void> {
  const state = isRecord(record.state) ? record.state : null;
  if (!state) return;

  const writes: Array<Promise<void>> = [];
  const script = isRecord(state.cachedScript) && typeof state.cachedScript.script === "string"
    ? state.cachedScript.script
    : null;
  if (script) {
    writes.push(writeFile(path.join(dirPath, "script.md"), script, "utf8"));
  }

  const publish = isRecord(state.cachedPackage) ? state.cachedPackage.publishPackage : null;
  if (publish) {
    writes.push(writeFile(
      path.join(dirPath, "publish-package.json"),
      `${JSON.stringify(publish, null, 2)}\n`,
      "utf8",
    ));
  }

  const brief = isRecord(state.cachedPackage) ? state.cachedPackage.productionBrief : null;
  if (brief) {
    writes.push(writeFile(
      path.join(dirPath, "production-brief.json"),
      `${JSON.stringify(brief, null, 2)}\n`,
      "utf8",
    ));
  }

  const query = isRecord(state.cachedResearch) && typeof state.cachedResearch.query === "string"
    ? state.cachedResearch.query
    : null;
  if (query) {
    writes.push(writeFile(path.join(dirPath, "research-query.txt"), `${query}\n`, "utf8"));
  }

  const thumb = isRecord(state.cachedThumbnail) && typeof state.cachedThumbnail.thumbnailData === "string"
    ? state.cachedThumbnail.thumbnailData
    : null;
  if (thumb?.startsWith("data:")) {
    const match = thumb.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const ext = match[1].includes("jpeg") ? "jpg" : "png";
      writes.push(writeFile(path.join(dirPath, `thumbnail.${ext}`), Buffer.from(match[2], "base64")));
    }
  }

  await Promise.all(writes);
}

export async function listWorkflowRecordsFromDisk<T>(
  _root?: string,
  limit = WORKFLOW_HISTORY_LIMIT,
): Promise<StoredWorkflowRecord<T>[]> {
  const { storageRoot } = await resolveWorkflowLibraryRoot();
  const files = await listTopicWorkflowFiles(storageRoot);
  const records: StoredWorkflowRecord<T>[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(file.filePath, "utf8");
      const parsed = parseWorkflowRecord<T>(JSON.parse(raw));
      if (parsed) records.push(parsed);
    } catch {
      // skip
    }
  }
  return records
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, limit));
}

export async function getWorkflowRecordFromDisk<T>(
  id: string,
  _root?: string,
): Promise<StoredWorkflowRecord<T> | null> {
  if (!isValidWorkflowId(id)) return null;
  const { storageRoot } = await resolveWorkflowLibraryRoot();
  const located = await findWorkflowFile(id, storageRoot);
  if (!located) return null;
  try {
    const raw = await readFile(located.filePath, "utf8");
    return parseWorkflowRecord<T>(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function putWorkflowRecordToDisk<T>(
  record: StoredWorkflowRecord<T>,
  _root?: string,
  limit = WORKFLOW_HISTORY_LIMIT,
): Promise<string[]> {
  const parsed = parseWorkflowRecord<T>(record);
  if (!parsed) throw new Error("Invalid workflow record.");

  const { storageRoot, arrangedByTopic } = await resolveWorkflowLibraryRoot();
  const title = titleFromState(parsed.state);

  if (!arrangedByTopic) {
    await mkdir(storageRoot, { recursive: true });
    const target = path.join(storageRoot, `${parsed.id}.json`);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, `${JSON.stringify(parsed)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, target);
    return pruneWorkflowRecordsOnDisk(limit);
  }

  const desiredFolder = sanitizeTopicFolderName(title, parsed.id);
  const desiredDir = path.join(storageRoot, desiredFolder);
  const existing = await findWorkflowFile(parsed.id, storageRoot);

  let dirPath = desiredDir;
  if (existing) {
    const existingIsFlat = path.basename(existing.filePath) === `${parsed.id}.json`;
    if (existingIsFlat) {
      await mkdir(desiredDir, { recursive: true });
      dirPath = desiredDir;
      try {
        await rm(existing.filePath, { force: true });
      } catch {
        // ignore
      }
    } else if (existing.dirPath !== desiredDir) {
      await mkdir(path.dirname(desiredDir), { recursive: true });
      try {
        await rename(existing.dirPath, desiredDir);
        dirPath = desiredDir;
      } catch {
        dirPath = existing.dirPath;
      }
    } else {
      dirPath = existing.dirPath;
    }
  } else {
    await mkdir(desiredDir, { recursive: true });
  }

  const target = path.join(dirPath, WORKFLOW_FILE);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, target);
  await mirrorReadableArtifacts(dirPath, parsed);

  return pruneWorkflowRecordsOnDisk(limit);
}

export async function deleteWorkflowRecordFromDisk(id: string, _root?: string): Promise<boolean> {
  if (!isValidWorkflowId(id)) return false;
  const { storageRoot } = await resolveWorkflowLibraryRoot();
  const located = await findWorkflowFile(id, storageRoot);
  if (!located) return false;
  try {
    if (path.basename(located.filePath) === WORKFLOW_FILE) {
      await rm(located.dirPath, { recursive: true, force: true });
    } else {
      await rm(located.filePath, { force: true });
    }
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function pruneWorkflowRecordsOnDisk(
  limit = WORKFLOW_HISTORY_LIMIT,
  _root?: string,
): Promise<string[]> {
  const records = await listWorkflowRecordsFromDisk(undefined, Number.MAX_SAFE_INTEGER);
  const expired = records.slice(Math.max(0, limit));
  for (const record of expired) {
    await deleteWorkflowRecordFromDisk(record.id);
  }
  return expired.map((record) => record.id);
}

export async function getWorkflowTopicDirectory(id: string): Promise<string | null> {
  if (!isValidWorkflowId(id)) return null;
  const { storageRoot } = await resolveWorkflowLibraryRoot();
  const located = await findWorkflowFile(id, storageRoot);
  if (!located) return null;
  if (path.basename(located.filePath) === WORKFLOW_FILE) return located.dirPath;
  return null;
}
