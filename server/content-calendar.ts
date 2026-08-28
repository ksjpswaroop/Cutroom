import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnvFilePaths } from "./env-path";

const CALENDAR_NAME = "content-calendar.json";

export const calendarItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  theme: z.string().trim().min(1).max(200),
  plannedDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["idea", "scripted", "packaged", "published"]).default("idea"),
  notes: z.string().trim().max(2_000).default(""),
  workflowId: z.string().trim().max(120).optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
}).strict();

export const calendarFileSchema = z.object({
  items: z.array(calendarItemSchema).max(200).default([]),
}).strict();

export type CalendarItem = z.infer<typeof calendarItemSchema>;

export const calendarItemCreateSchema = z.object({
  theme: z.string().trim().min(1).max(200),
  plannedDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["idea", "scripted", "packaged", "published"]).optional(),
  notes: z.string().trim().max(2_000).optional(),
  workflowId: z.string().trim().max(120).optional(),
}).strict();

export const calendarItemUpdateSchema = calendarItemCreateSchema.partial().extend({
  id: z.string().trim().min(1).max(80),
}).strict();

function calendarPath(root = getEnvFilePaths().root): string {
  return path.join(root, CALENDAR_NAME);
}

async function readCalendarFile(root = getEnvFilePaths().root) {
  try {
    const raw = await readFile(calendarPath(root), "utf8");
    return calendarFileSchema.parse(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code === "ENOENT") return { items: [] as CalendarItem[] };
    throw error;
  }
}

async function writeCalendarFile(items: CalendarItem[], root = getEnvFilePaths().root) {
  await mkdir(root, { recursive: true });
  const temp = `${calendarPath(root)}.${process.pid}.tmp`;
  const payload = `${JSON.stringify({ items }, null, 2)}\n`;
  await writeFile(temp, payload, { encoding: "utf8", mode: 0o600 });
  await rename(temp, calendarPath(root));
  return { items };
}

export async function listCalendarItems(root = getEnvFilePaths().root) {
  const file = await readCalendarFile(root);
  return [...file.items].sort((a, b) => {
    const da = a.plannedDate || "";
    const db = b.plannedDate || "";
    if (da !== db) return da < db ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function createCalendarItem(
  input: z.infer<typeof calendarItemCreateSchema>,
  root = getEnvFilePaths().root,
) {
  const now = Date.now();
  const item: CalendarItem = calendarItemSchema.parse({
    id: `cal-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    theme: input.theme,
    plannedDate: input.plannedDate,
    status: input.status || "idea",
    notes: input.notes || "",
    workflowId: input.workflowId,
    createdAt: now,
    updatedAt: now,
  });
  const file = await readCalendarFile(root);
  const items = [item, ...file.items].slice(0, 200);
  await writeCalendarFile(items, root);
  return item;
}

export async function updateCalendarItem(
  input: z.infer<typeof calendarItemUpdateSchema>,
  root = getEnvFilePaths().root,
) {
  const file = await readCalendarFile(root);
  const index = file.items.findIndex((item) => item.id === input.id);
  if (index < 0) throw Object.assign(new Error("Calendar item not found."), { status: 404 });
  const current = file.items[index];
  const next = calendarItemSchema.parse({
    ...current,
    ...input,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  });
  const items = [...file.items];
  items[index] = next;
  await writeCalendarFile(items, root);
  return next;
}

export async function deleteCalendarItem(id: string, root = getEnvFilePaths().root) {
  const file = await readCalendarFile(root);
  const items = file.items.filter((item) => item.id !== id);
  if (items.length === file.items.length) {
    throw Object.assign(new Error("Calendar item not found."), { status: 404 });
  }
  await writeCalendarFile(items, root);
  return { success: true as const };
}
