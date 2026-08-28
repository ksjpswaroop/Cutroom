import { WORKFLOW_HISTORY_LIMIT } from "@shared/workflow-history";

const DATABASE_NAME = "cutroom-workflows";
const LEGACY_DATABASE_NAMES = ["ledger-workflows", "youtube-pro-workflows"] as const;
const DATABASE_VERSION = 1;
const STORE_NAME = "workflows";

export interface StoredWorkflowRecord<T> {
  id: string;
  createdAt: number;
  updatedAt: number;
  state: T;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Workflow storage request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Workflow storage transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("Workflow storage transaction was aborted"));
  });
}

function openNamedDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Workflow storage could not be opened"));
  });
}

let migrationPromise: Promise<void> | null = null;

async function migrateFromLegacyDatabase(legacyName: string): Promise<void> {
  let legacy: IDBDatabase;
  try {
    legacy = await openNamedDatabase(legacyName);
  } catch {
    return;
  }
  try {
    const transaction = legacy.transaction(STORE_NAME, "readonly");
    const completion = transactionComplete(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as StoredWorkflowRecord<unknown>[];
    await completion;
    if (records.length === 0) return;
    const next = await openNamedDatabase(DATABASE_NAME);
    try {
      const write = next.transaction(STORE_NAME, "readwrite");
      const writeDone = transactionComplete(write);
      const store = write.objectStore(STORE_NAME);
      for (const record of records) store.put(record);
      await writeDone;
    } finally {
      next.close();
    }
  } finally {
    legacy.close();
  }
}

async function migrateLegacyWorkflowsOnce(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    if (typeof indexedDB === "undefined") return;
    for (const legacyName of LEGACY_DATABASE_NAMES) {
      await migrateFromLegacyDatabase(legacyName);
    }
  })().catch(() => undefined);
  return migrationPromise;
}

function openDatabase(): Promise<IDBDatabase> {
  return migrateLegacyWorkflowsOnce().then(() => openNamedDatabase(DATABASE_NAME));
}

async function listIndexedDbRecords<T>(): Promise<StoredWorkflowRecord<T>[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completion = transactionComplete(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as StoredWorkflowRecord<T>[];
    await completion;
    return records.sort((left, right) => right.updatedAt - left.updatedAt);
  } finally {
    database.close();
  }
}

async function getIndexedDbRecord<T>(id: string): Promise<StoredWorkflowRecord<T> | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completion = transactionComplete(transaction);
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id)) as StoredWorkflowRecord<T> | undefined;
    await completion;
    return record || null;
  } finally {
    database.close();
  }
}

async function putIndexedDbRecord<T>(record: StoredWorkflowRecord<T>): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completion = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).put(record);
    await completion;
  } finally {
    database.close();
  }
}

async function deleteIndexedDbRecord(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completion = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await completion;
  } finally {
    database.close();
  }
}

function mergeWorkflowRecords<T>(
  ...groups: StoredWorkflowRecord<T>[][]
): StoredWorkflowRecord<T>[] {
  const byId = new Map<string, StoredWorkflowRecord<T>>();
  for (const group of groups) {
    for (const record of group) {
      const existing = byId.get(record.id);
      if (!existing || existing.updatedAt < record.updatedAt) byId.set(record.id, record);
    }
  }
  return Array.from(byId.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}

async function fetchServerWorkflows<T>(): Promise<StoredWorkflowRecord<T>[] | null> {
  try {
    const response = await fetch("/api/workflows", { credentials: "include", cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json() as { records?: StoredWorkflowRecord<T>[] };
    return Array.isArray(body.records) ? body.records : null;
  } catch {
    return null;
  }
}

async function fetchServerWorkflow<T>(id: string): Promise<StoredWorkflowRecord<T> | null> {
  try {
    const response = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const body = await response.json() as { record?: StoredWorkflowRecord<T> };
    return body.record || null;
  } catch {
    return null;
  }
}

async function putServerWorkflow<T>(record: StoredWorkflowRecord<T>): Promise<string[] | null> {
  try {
    const response = await fetch(`/api/workflows/${encodeURIComponent(record.id)}`, {
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!response.ok) return null;
    const body = await response.json() as { removed?: string[] };
    return Array.isArray(body.removed) ? body.removed : [];
  } catch {
    return null;
  }
}

async function deleteServerWorkflow(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function listWorkflowRecords<T>(): Promise<StoredWorkflowRecord<T>[]> {
  const local = await listIndexedDbRecords<T>().catch(() => [] as StoredWorkflowRecord<T>[]);
  const remote = await fetchServerWorkflows<T>();
  const merged = mergeWorkflowRecords(local, remote || []);
  const limited = merged.slice(0, WORKFLOW_HISTORY_LIMIT);
  if (remote) {
    for (const record of limited) {
      await putIndexedDbRecord(record).catch(() => undefined);
      const serverCopy = remote.find((item) => item.id === record.id);
      if (!serverCopy || serverCopy.updatedAt < record.updatedAt) {
        await putServerWorkflow(record);
      }
    }
  }
  return limited;
}

export async function getWorkflowRecord<T>(id: string): Promise<StoredWorkflowRecord<T> | null> {
  const [local, remote] = await Promise.all([
    getIndexedDbRecord<T>(id).catch(() => null),
    fetchServerWorkflow<T>(id),
  ]);
  if (local && remote) return local.updatedAt >= remote.updatedAt ? local : remote;
  return remote || local;
}

export async function putWorkflowRecord<T>(record: StoredWorkflowRecord<T>): Promise<void> {
  await putIndexedDbRecord(record);
  const removed = await putServerWorkflow(record);
  if (removed) {
    for (const id of removed) {
      await deleteIndexedDbRecord(id).catch(() => undefined);
    }
  }
}

export async function deleteWorkflowRecord(id: string): Promise<void> {
  await Promise.all([
    deleteIndexedDbRecord(id).catch(() => undefined),
    deleteServerWorkflow(id),
  ]);
}

export async function pruneWorkflowRecords(limit = WORKFLOW_HISTORY_LIMIT): Promise<string[]> {
  const records = await listWorkflowRecords<unknown>();
  const expired = records.slice(Math.max(0, limit));
  if (expired.length === 0) return [];
  for (const record of expired) {
    await deleteWorkflowRecord(record.id);
  }
  return expired.map((record) => record.id);
}
