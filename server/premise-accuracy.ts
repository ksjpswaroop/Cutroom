import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  comparePremises,
  emptyActuals,
  premiseLoopStatus,
  premiseRecordSchema,
  type PremiseActuals,
  type PremiseComparison,
  type PremiseRecord,
} from "@shared/premise-accuracy";
import { getEnvFilePaths } from "./env-path";

/**
 * Cutroom Pro M3 — premise-accuracy store (server).
 *
 * Premise records live in a plain JSON file under the app-data root
 * (<app-data>/premise-accuracy/<projectId>.json) — the same visible-file
 * pattern as agent memory. Records are created by the creator (or by a
 * pilot run, from the agent run's own handoff), and the actual numbers
 * are supplied by the creator by hand afterwards. Nothing here fetches
 * Studio data, scrapes YouTube, or uploads anything: there is no
 * network call in this module at all.
 */

const storeSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  records: z.array(premiseRecordSchema).max(200),
}).strict();

export function premiseAccuracyRoot(root = getEnvFilePaths().root): string {
  return path.join(root, "premise-accuracy");
}

export function premiseAccuracyPath(projectId: string, root = getEnvFilePaths().root): string {
  const safe = projectId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "default";
  return path.join(premiseAccuracyRoot(root), `${safe}.json`);
}

export async function listPremiseRecords(projectId: string, root = getEnvFilePaths().root): Promise<PremiseRecord[]> {
  try {
    const raw = await readFile(premiseAccuracyPath(projectId, root), "utf8");
    const parsed = storeSchema.parse(JSON.parse(raw) as unknown);
    return parsed.projectId === projectId ? parsed.records : parsed.records;
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function savePremiseRecords(projectId: string, records: PremiseRecord[], root = getEnvFilePaths().root): Promise<PremiseRecord[]> {
  const parsed = storeSchema.parse({ projectId, records });
  await mkdir(premiseAccuracyRoot(root), { recursive: true });
  const target = premiseAccuracyPath(projectId, root);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await rename(temp, target);
  return parsed.records;
}

export async function recordPremise(
  input: Omit<PremiseRecord, "id" | "actuals" | "createdAt">,
  root = getEnvFilePaths().root,
): Promise<PremiseRecord> {
  const record = premiseRecordSchema.parse({
    ...input,
    id: `prm-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
    actuals: emptyActuals(),
    createdAt: new Date().toISOString(),
  });
  const records = await listPremiseRecords(record.projectId, root);
  records.push(record);
  await savePremiseRecords(record.projectId, records, root);
  return record;
}

/**
 * Creator-supplied actuals (CTR / retention / views, by hand). Supplying
 * numbers is the only way a premise leaves "inconclusive" — the store
 * never fills actuals from any other source.
 */
export async function supplyPremiseActuals(
  projectId: string,
  recordId: string,
  actuals: Partial<PremiseActuals>,
  root = getEnvFilePaths().root,
): Promise<PremiseRecord | null> {
  const records = await listPremiseRecords(projectId, root);
  const index = records.findIndex((r) => r.id === recordId);
  if (index < 0) return null;
  const updated = premiseRecordSchema.parse({
    ...records[index],
    actuals: {
      ...records[index].actuals,
      ...actuals,
      suppliedAt: new Date().toISOString(),
    },
  });
  records[index] = updated;
  await savePremiseRecords(projectId, records, root);
  return updated;
}

export async function compareProjectPremises(
  projectId: string,
  root = getEnvFilePaths().root,
): Promise<{ records: PremiseRecord[]; comparisons: PremiseComparison[]; status: ReturnType<typeof premiseLoopStatus> }> {
  const records = await listPremiseRecords(projectId, root);
  const comparisons = comparePremises(records);
  return { records, comparisons, status: premiseLoopStatus(comparisons) };
}
