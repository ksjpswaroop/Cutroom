import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnvFilePaths } from "./env-path";

const BRAND_KIT_NAME = "brand-kit.json";

export const brandKitSchema = z.object({
  channelName: z.string().trim().max(120).default(""),
  voiceNotes: z.string().trim().max(2_000).default(""),
  primaryColor: z.string().trim().max(32).default(""),
  accentColor: z.string().trim().max(32).default(""),
  fontPreference: z.string().trim().max(80).default(""),
  thumbnailStyleNotes: z.string().trim().max(2_000).default(""),
  forbiddenClaims: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  updatedAt: z.number().int().positive().optional(),
}).strict();

export type BrandKit = z.infer<typeof brandKitSchema>;

export const brandKitUpdateSchema = brandKitSchema.partial().strict();

const EMPTY: BrandKit = {
  channelName: "",
  voiceNotes: "",
  primaryColor: "",
  accentColor: "",
  fontPreference: "",
  thumbnailStyleNotes: "",
  forbiddenClaims: [],
};

function brandKitPath(root = getEnvFilePaths().root): string {
  return path.join(root, BRAND_KIT_NAME);
}

export async function readBrandKit(root = getEnvFilePaths().root): Promise<BrandKit> {
  try {
    const raw = await readFile(brandKitPath(root), "utf8");
    return brandKitSchema.parse({ ...EMPTY, ...JSON.parse(raw) });
  } catch (error: any) {
    if (error?.code === "ENOENT") return { ...EMPTY };
    throw error;
  }
}

export async function writeBrandKit(
  patch: z.infer<typeof brandKitUpdateSchema>,
  root = getEnvFilePaths().root,
): Promise<BrandKit> {
  const current = await readBrandKit(root);
  const next = brandKitSchema.parse({
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
  await mkdir(root, { recursive: true });
  const temp = `${brandKitPath(root)}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, brandKitPath(root));
  return next;
}

/** Compact prompt fragment for Gemini / local models (never invents claims). */
export function brandKitPromptFragment(kit: BrandKit): string {
  const lines: string[] = [];
  if (kit.channelName.trim()) lines.push(`Channel / brand name: ${kit.channelName.trim()}`);
  if (kit.voiceNotes.trim()) lines.push(`Voice & tone: ${kit.voiceNotes.trim()}`);
  if (kit.fontPreference.trim()) lines.push(`Preferred on-screen type feel: ${kit.fontPreference.trim()}`);
  if (kit.thumbnailStyleNotes.trim()) lines.push(`Thumbnail style memory: ${kit.thumbnailStyleNotes.trim()}`);
  if (kit.primaryColor.trim() || kit.accentColor.trim()) {
    lines.push(`Brand colors (guide only): primary ${kit.primaryColor || "n/a"}, accent ${kit.accentColor || "n/a"}`);
  }
  if (kit.forbiddenClaims.length > 0) {
    lines.push(`Never claim or imply: ${kit.forbiddenClaims.join("; ")}`);
  }
  if (lines.length === 0) return "";
  return `Brand kit (style memory — follow when compatible with evidence; do not invent proof):\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
