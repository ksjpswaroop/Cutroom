export const WORKFLOW_HISTORY_LIMIT = 8;
export const WORKFLOW_TITLE_LIMIT = 48;

export type WorkflowHistoryStep = "research" | "script" | "thumbnail" | "package" | "board" | "video";

export interface WorkflowTitleSignals {
  researchQuery?: string | null;
  scriptTitle?: string | null;
  scriptTopic?: string | null;
  thumbnailTopic?: string | null;
}

export interface WorkflowHistorySummary {
  id: string;
  title: string;
  currentStep: WorkflowHistoryStep;
  createdAt: number;
  updatedAt: number;
  hasResearch: boolean;
  hasScript: boolean;
  hasThumbnail: boolean;
  hasPackage?: boolean;
  hasBoard?: boolean;
}

/** Models and string concat sometimes leak the JS tokens `undefined`/`null` onto titles. */
export function stripLeakedUndefined(value: string): string {
  return value.replace(/(?:undefined|null)+$/gi, "").replace(/\s+/g, " ").trim();
}

export function normalizeCustomWorkflowTitle(value: string): string | null {
  const normalized = stripLeakedUndefined(value);
  if (!normalized) return null;
  return normalized.slice(0, WORKFLOW_TITLE_LIMIT).trimEnd();
}

export function deriveWorkflowTitle(signals: WorkflowTitleSignals): string {
  const candidates = [
    signals.researchQuery,
    signals.scriptTitle,
    signals.scriptTopic,
    signals.thumbnailTopic,
  ].map((candidate) => (typeof candidate === "string" ? stripLeakedUndefined(candidate) : ""));
  const selected = candidates.find((candidate) => candidate.length > 0);
  if (!selected) return "Untitled workflow";
  return selected.length > WORKFLOW_TITLE_LIMIT
    ? `${selected.slice(0, WORKFLOW_TITLE_LIMIT - 1).trimEnd()}…`
    : selected;
}

export function sortAndLimitWorkflowSummaries(
  summaries: readonly WorkflowHistorySummary[],
  limit = WORKFLOW_HISTORY_LIMIT,
): WorkflowHistorySummary[] {
  const unique = new Map<string, WorkflowHistorySummary>();
  for (const summary of summaries) {
    const existing = unique.get(summary.id);
    if (!existing || existing.updatedAt < summary.updatedAt) unique.set(summary.id, summary);
  }
  return Array.from(unique.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, limit));
}
