import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnvFilePaths } from "./env-path";
import {
  audiencePersonaSchema,
  channelSchema,
  productionItemSchema,
  productionStageSchema,
  type AudiencePersona,
  type Channel,
  type ProductionItem,
  type ProductionStage,
  channelCreateSchema,
  channelUpdateSchema,
  productionItemCreateSchema,
  productionItemMoveSchema,
} from "@shared/creator-modules";

/**
 * Local-only persistence for the folded-in creator modules. One JSON file under
 * the same app-data root as the calendar and brand kit. No remote store; this is
 * the same local-first posture as the rest of Cutroom.
 */

const STORE_NAME = "creator-modules.json";

const storeFileSchema = z.object({
  channels: z.array(channelSchema).max(200).default([]),
  production: z.array(productionItemSchema).max(1_000).default([]),
  personas: z.array(audiencePersonaSchema).max(500).default([]),
}).strict();

type StoreFile = z.infer<typeof storeFileSchema>;

function storePath(root = getEnvFilePaths().root): string {
  return path.join(root, STORE_NAME);
}

async function readStore(root = getEnvFilePaths().root): Promise<StoreFile> {
  try {
    const raw = await readFile(storePath(root), "utf8");
    return storeFileSchema.parse(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code === "ENOENT") return { channels: [], production: [], personas: [] };
    throw error;
  }
}

async function writeStore(store: StoreFile, root = getEnvFilePaths().root): Promise<StoreFile> {
  await mkdir(root, { recursive: true });
  const temp = `${storePath(root)}.${process.pid}.tmp`;
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  await writeFile(temp, payload, { encoding: "utf8", mode: 0o600 });
  await rename(temp, storePath(root));
  return store;
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Channels ────────────────────────────────────────────────────────────────

export async function listChannels(root = getEnvFilePaths().root): Promise<Channel[]> {
  const store = await readStore(root);
  return [...store.channels].sort((a, b) => b.createdAt - a.createdAt);
}

export async function createChannel(
  input: z.infer<typeof channelCreateSchema>,
  root = getEnvFilePaths().root,
): Promise<Channel> {
  const channel = channelSchema.parse({
    id: id("ch"),
    name: input.name,
    niche: input.niche ?? "",
    description: input.description ?? "",
    subscribers: input.subscribers ?? 0,
    createdAt: Date.now(),
  });
  const store = await readStore(root);
  await writeStore({ ...store, channels: [channel, ...store.channels].slice(0, 200) }, root);
  return channel;
}

export async function updateChannel(
  input: z.infer<typeof channelUpdateSchema>,
  root = getEnvFilePaths().root,
): Promise<Channel> {
  const store = await readStore(root);
  const index = store.channels.findIndex((c) => c.id === input.id);
  if (index < 0) throw Object.assign(new Error("Channel not found."), { status: 404 });
  const current = store.channels[index];
  const next = channelSchema.parse({
    ...current,
    name: input.name ?? current.name,
    niche: input.niche ?? current.niche,
    description: input.description ?? current.description,
    subscribers: input.subscribers ?? current.subscribers,
    id: current.id,
    createdAt: current.createdAt,
  });
  const channels = [...store.channels];
  channels[index] = next;
  await writeStore({ ...store, channels }, root);
  return next;
}

export async function deleteChannel(channelId: string, root = getEnvFilePaths().root) {
  const store = await readStore(root);
  const channels = store.channels.filter((c) => c.id !== channelId);
  if (channels.length === store.channels.length) {
    throw Object.assign(new Error("Channel not found."), { status: 404 });
  }
  // Cascade: a deleted channel takes its board cards and personas with it.
  const production = store.production.filter((p) => p.channelId !== channelId);
  const personas = store.personas.filter((p) => p.channelId !== channelId);
  await writeStore({ channels, production, personas }, root);
  return { success: true as const };
}

export interface ChannelMemory {
  production: number;
  personas: number;
  stageBreakdown: Record<ProductionStage, number>;
}

export async function channelMemory(channelId: string, root = getEnvFilePaths().root): Promise<ChannelMemory> {
  const store = await readStore(root);
  const stageBreakdown = { idea: 0, research: 0, scripting: 0, review: 0, published: 0 } as Record<ProductionStage, number>;
  let production = 0;
  for (const item of store.production) {
    if (item.channelId !== channelId) continue;
    production += 1;
    stageBreakdown[item.stage] += 1;
  }
  const personas = store.personas.filter((p) => p.channelId === channelId).length;
  return { production, personas, stageBreakdown };
}

// ── Operations (Kanban) ────────────────────────────────────────────────────────

export async function listProduction(
  channelId: string | undefined,
  root = getEnvFilePaths().root,
): Promise<ProductionItem[]> {
  const store = await readStore(root);
  const items = channelId ? store.production.filter((p) => p.channelId === channelId) : store.production;
  return [...items].sort((a, b) => a.createdAt - b.createdAt);
}

export async function createProductionItem(
  input: z.infer<typeof productionItemCreateSchema>,
  root = getEnvFilePaths().root,
): Promise<ProductionItem> {
  const item = productionItemSchema.parse({
    id: id("prod"),
    channelId: input.channelId,
    title: input.title,
    stage: "idea" satisfies ProductionStage,
    snapshotId: input.snapshotId,
    dueDate: input.dueDate,
    createdAt: Date.now(),
  });
  const store = await readStore(root);
  await writeStore({ ...store, production: [...store.production, item].slice(0, 1_000) }, root);
  return item;
}

export async function moveProductionItem(
  input: z.infer<typeof productionItemMoveSchema>,
  root = getEnvFilePaths().root,
): Promise<ProductionItem> {
  // Reject an unknown stage before touching disk.
  const stage = productionStageSchema.parse(input.stage);
  const store = await readStore(root);
  const index = store.production.findIndex((p) => p.id === input.id);
  if (index < 0) throw Object.assign(new Error("Production item not found."), { status: 404 });
  const current = store.production[index];
  const snapshotId = input.snapshotId ?? current.snapshotId;
  // L-803 gate: an item may only enter "published" if it cites a workflow
  // snapshot. Publishing without evidence of the work it came from is rejected.
  if (stage === "published" && !snapshotId) {
    throw Object.assign(
      new Error("Cite a workflow snapshot before marking an item published."),
      { status: 400 },
    );
  }
  const next = productionItemSchema.parse({
    ...current,
    stage,
    assignee: input.assignee ?? current.assignee,
    snapshotId,
  });
  const production = [...store.production];
  production[index] = next;
  await writeStore({ ...store, production }, root);
  return next;
}

export async function deleteProductionItem(itemId: string, root = getEnvFilePaths().root) {
  const store = await readStore(root);
  const production = store.production.filter((p) => p.id !== itemId);
  if (production.length === store.production.length) {
    throw Object.assign(new Error("Production item not found."), { status: 404 });
  }
  await writeStore({ ...store, production }, root);
  return { success: true as const };
}

// ── Personas ──────────────────────────────────────────────────────────────────

export async function listPersonas(
  channelId: string | undefined,
  root = getEnvFilePaths().root,
): Promise<AudiencePersona[]> {
  const store = await readStore(root);
  const items = channelId ? store.personas.filter((p) => p.channelId === channelId) : store.personas;
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

export async function addPersona(
  persona: AudiencePersona,
  root = getEnvFilePaths().root,
): Promise<AudiencePersona> {
  const parsed = audiencePersonaSchema.parse(persona);
  const store = await readStore(root);
  await writeStore({ ...store, personas: [parsed, ...store.personas].slice(0, 500) }, root);
  return parsed;
}

export async function deletePersona(personaId: string, root = getEnvFilePaths().root) {
  const store = await readStore(root);
  const personas = store.personas.filter((p) => p.id !== personaId);
  if (personas.length === store.personas.length) {
    throw Object.assign(new Error("Persona not found."), { status: 404 });
  }
  await writeStore({ ...store, personas }, root);
  return { success: true as const };
}

export function newPersonaId(): string {
  return id("persona");
}
