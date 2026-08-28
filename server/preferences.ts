import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnvFilePaths } from "./env-path";

const PREFERENCES_NAME = "preferences.json";

export const preferencesSchema = z.object({
  /** Optional assemble-only preview after Package (L-613). Default Off. */
  assemblePreviewEnabled: z.boolean().default(false),
}).strict();

export type AppPreferences = z.infer<typeof preferencesSchema>;

export const preferencesUpdateSchema = z.object({
  assemblePreviewEnabled: z.boolean().optional(),
}).strict();

const DEFAULTS: AppPreferences = {
  assemblePreviewEnabled: false,
};

function preferencesPath(root = getEnvFilePaths().root): string {
  return path.join(root, PREFERENCES_NAME);
}

export async function readPreferences(root = getEnvFilePaths().root): Promise<AppPreferences> {
  try {
    const raw = await readFile(preferencesPath(root), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return preferencesSchema.parse({ ...DEFAULTS, ...(parsed && typeof parsed === "object" ? parsed : {}) });
  } catch (error: any) {
    if (error?.code === "ENOENT") return { ...DEFAULTS };
    throw error;
  }
}

export async function writePreferences(
  patch: z.infer<typeof preferencesUpdateSchema>,
  root = getEnvFilePaths().root,
): Promise<AppPreferences> {
  const current = await readPreferences(root);
  const next = preferencesSchema.parse({
    ...current,
    ...patch,
  });
  await mkdir(root, { recursive: true });
  const temp = `${preferencesPath(root)}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, preferencesPath(root));
  return next;
}
