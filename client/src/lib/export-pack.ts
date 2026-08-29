export interface ProjectPackInput {
  topic: string;
  workflowId?: string | null;
  researchQuery?: string;
  script?: string;
  thumbnailDataUrl?: string;
  publishPackage?: unknown;
  productionBrief?: unknown;
  productionBoard?: unknown;
  previewDataUrl?: string;
  renderDataUrl?: string;
}

export interface ProjectPackResult {
  mode: "desktop" | "browser";
  path?: string;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "cutroom-project";
}

function downloadBlob(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function isTauri(): Promise<boolean> {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function resolveDefaultExportDirectory(workflowId?: string | null): Promise<string | undefined> {
  if (!workflowId) return undefined;
  try {
    const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/folder`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { path?: string };
    if (!body.path) return undefined;
    const stamp = new Date().toISOString().slice(0, 10);
    return `${body.path}/exports/${stamp}`;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function briefFilesFromBoard(base: string, board: unknown): { filename: string; content: string }[] {
  if (!isRecord(board)) return [];
  const characters = board.characters || [];
  const storyboard = board.storyboardPanels || [];
  const shots = board.shots || [];
  const cameraTree = board.cameraTree || {};
  return [
    { filename: `${base}/brief/board.json`, content: JSON.stringify(board, null, 2) },
    { filename: `${base}/brief/characters.json`, content: JSON.stringify(characters, null, 2) },
    { filename: `${base}/brief/storyboard.json`, content: JSON.stringify(storyboard, null, 2) },
    { filename: `${base}/brief/shots.json`, content: JSON.stringify(shots, null, 2) },
    { filename: `${base}/brief/camera-tree.json`, content: JSON.stringify(cameraTree, null, 2) },
  ];
}

export async function exportProjectPack(input: ProjectPackInput): Promise<ProjectPackResult> {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${stamp}-${slugify(input.topic)}`;
  const files: { filename: string; content: string; is_base64?: boolean }[] = [
    {
      filename: `${base}/README.md`,
      content: `# ${input.topic}\n\nExported from Cutroom on ${new Date().toISOString()}.\nGenerated pixels and clones are inferred. Upload in YouTube Studio yourself — Cutroom does not publish.\n`,
    },
  ];

  if (input.researchQuery) {
    files.push({
      filename: `${base}/research-query.txt`,
      content: input.researchQuery,
    });
  }
  if (input.script) {
    files.push({
      filename: `${base}/script.md`,
      content: input.script,
    });
    files.push({
      filename: `${base}/script.txt`,
      content: input.script,
    });
  }
  if (input.publishPackage) {
    files.push({
      filename: `${base}/publish-package.json`,
      content: JSON.stringify(input.publishPackage, null, 2),
    });
  }
  if (input.productionBrief) {
    files.push({
      filename: `${base}/production-brief.json`,
      content: JSON.stringify(input.productionBrief, null, 2),
    });
  }
  files.push(...briefFilesFromBoard(base, input.productionBoard));
  if (input.thumbnailDataUrl?.startsWith("data:")) {
    const match = input.thumbnailDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const ext = match[1].includes("jpeg") ? "jpg" : "png";
      files.push({
        filename: `${base}/thumbnail.${ext}`,
        content: match[2],
        is_base64: true,
      });
    }
  }
  if (input.previewDataUrl?.startsWith("data:video/mp4;base64,")) {
    files.push({
      filename: `${base}/preview.mp4`,
      content: input.previewDataUrl.slice("data:video/mp4;base64,".length),
      is_base64: true,
    });
  }
  if (input.renderDataUrl?.startsWith("data:video/mp4;base64,")) {
    files.push({
      filename: `${base}/render.mp4`,
      content: input.renderDataUrl.slice("data:video/mp4;base64,".length),
      is_base64: true,
    });
  }

  if (await isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const defaultDirectory = await resolveDefaultExportDirectory(input.workflowId);
    const path = await invoke<string>("cmd_export_project_pack", {
      files,
      defaultDirectory: defaultDirectory || null,
    });
    return { mode: "desktop", path };
  }

  for (const file of files) {
    if (file.is_base64) {
      const binary = atob(file.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename.split("/").pop() || "file.bin";
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      downloadBlob(file.filename.split("/").pop() || "file.txt", file.content);
    }
  }
  return { mode: "browser" };
}
