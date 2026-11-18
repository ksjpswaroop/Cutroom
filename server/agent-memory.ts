import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnvFilePaths } from "./env-path";

/**
 * Cutroom Pro M2 — per-project agent memory.
 *
 * A plain JSON file the creator can open, edit, and delete — never an
 * invisible per-agent profile. Agents read it at plan time (and the
 * handoff records whether memory was used); they never write it on their
 * own. The UI edits it through the routes; the file lives under
 * <app-data root>/agent-memory/<projectId>.json and is never committed.
 */

export const agentMemorySchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  /** Channel format DNA, e.g. "timed walkthrough, host on camera". */
  channelFormatDna: z.array(z.string().trim().min(1).max(500)).max(32).default([]),
  /** Packaging outcomes, e.g. "title variant A won in Studio (CTR 6.1%)". */
  packagingOutcomes: z.array(z.string().trim().min(1).max(500)).max(32).default([]),
  /** Premise notes, e.g. "premise held: retention past the opening". */
  premiseNotes: z.array(z.string().trim().min(1).max(500)).max(32).default([]),
  updatedAt: z.string().datetime().optional(),
}).strict();
export type AgentMemory = z.infer<typeof agentMemorySchema>;

export function agentMemoryFileName(projectId: string): string {
  const safe = projectId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "default";
  return `${safe}.json`;
}

export function agentMemoryRoot(root = getEnvFilePaths().root): string {
  return path.join(root, "agent-memory");
}

export function agentMemoryPath(projectId: string, root = getEnvFilePaths().root): string {
  return path.join(agentMemoryRoot(root), agentMemoryFileName(projectId));
}

export function emptyAgentMemory(projectId: string): AgentMemory {
  return { projectId, channelFormatDna: [], packagingOutcomes: [], premiseNotes: [] };
}

export async function readAgentMemory(projectId: string, root = getEnvFilePaths().root): Promise<AgentMemory> {
  try {
    const raw = await readFile(agentMemoryPath(projectId, root), "utf8");
    const parsed = agentMemorySchema.parse(JSON.parse(raw) as unknown);
    return parsed.projectId === projectId ? parsed : { ...parsed, projectId };
  } catch (error: any) {
    if (error?.code === "ENOENT") return emptyAgentMemory(projectId);
    throw error;
  }
}

export async function writeAgentMemory(memory: AgentMemory, root = getEnvFilePaths().root): Promise<AgentMemory> {
  const parsed = agentMemorySchema.parse({ ...memory, updatedAt: new Date().toISOString() });
  await mkdir(agentMemoryRoot(root), { recursive: true });
  const target = agentMemoryPath(parsed.projectId, root);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await rename(temp, target);
  return parsed;
}

export async function deleteAgentMemory(projectId: string, root = getEnvFilePaths().root): Promise<boolean> {
  try {
    await unlink(agentMemoryPath(projectId, root));
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
