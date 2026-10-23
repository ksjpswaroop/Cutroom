export type ResearchExportFormat = "pdf" | "xls" | "csv";

export interface ResearchExportLabelInput {
  format: ResearchExportFormat;
  searching: boolean;
  insightsLoading: boolean;
  ideasLoading: boolean;
  hasResults: boolean;
  hasInsights: boolean;
  insightsFailed: boolean;
  ideaCount: number;
  ideasFailed: boolean;
  exporting: ResearchExportFormat | null;
}

const DOWNLOAD_LABEL: Record<ResearchExportFormat, string> = {
  pdf: "Download PDF",
  xls: "Download XLS",
  csv: "Download CSV",
};

const BUILDING_LABEL: Record<ResearchExportFormat, string> = {
  pdf: "Building PDF",
  xls: "Building XLS",
  csv: "Building CSV",
};

function pipelineStage(input: ResearchExportLabelInput): "insights" | "ideas" | "ready" {
  const insightsPending = input.searching
    || input.insightsLoading
    || (input.hasResults && !input.hasInsights && !input.insightsFailed);
  if (insightsPending) return "insights";

  const ideasPending = input.ideasLoading
    || (input.hasResults && input.hasInsights && input.ideaCount === 0 && !input.ideasFailed);
  if (ideasPending) return "ideas";

  return "ready";
}

/** Button copy while Research export waits on Insights or Ideas (L-619). */
export function researchExportButtonLabel(input: ResearchExportLabelInput): string {
  if (input.exporting === input.format) return BUILDING_LABEL[input.format];
  const stage = pipelineStage(input);
  if (stage === "insights") return "Insights…";
  if (stage === "ideas") return "Ideas…";
  return DOWNLOAD_LABEL[input.format];
}

/** Status line for the same wait. Null once export is no longer blocked by the pipeline. */
export function researchExportPipelineMessage(input: ResearchExportLabelInput): string | null {
  const stage = pipelineStage(input);
  if (stage === "insights") return "Insights are still running. Exports stay closed until Insights and Ideas finish.";
  if (stage === "ideas") return "Ideas are still running. Exports stay closed until Ideas finish.";
  return null;
}
