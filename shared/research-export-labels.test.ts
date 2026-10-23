import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  researchExportButtonLabel,
  researchExportPipelineMessage,
  type ResearchExportLabelInput,
} from "./research-export-labels";

function input(overrides: Partial<ResearchExportLabelInput> = {}): ResearchExportLabelInput {
  return {
    format: "pdf",
    searching: false,
    insightsLoading: false,
    ideasLoading: false,
    hasResults: true,
    hasInsights: true,
    insightsFailed: false,
    ideaCount: 6,
    ideasFailed: false,
    exporting: null,
    ...overrides,
  };
}

describe("research export button labels (L-619)", () => {
  test("names Insights while search or insights are still running", () => {
    for (const format of ["pdf", "xls", "csv"] as const) {
      assert.equal(researchExportButtonLabel(input({ format, searching: true, hasInsights: false, ideaCount: 0 })), "Insights…");
      assert.equal(researchExportButtonLabel(input({ format, insightsLoading: true, hasInsights: false, ideaCount: 0 })), "Insights…");
      assert.equal(researchExportButtonLabel(input({ format, hasInsights: false, ideaCount: 0 })), "Insights…");
    }
  });

  test("names Ideas while grounded ideas are still running", () => {
    assert.equal(researchExportButtonLabel(input({ ideasLoading: true, ideaCount: 0 })), "Ideas…");
    assert.equal(researchExportButtonLabel(input({ format: "xls", ideaCount: 0 })), "Ideas…");
    assert.equal(researchExportButtonLabel(input({ format: "csv", hasInsights: true, ideaCount: 0 })), "Ideas…");
  });

  test("uses download and building labels and never a waiting label", () => {
    assert.equal(researchExportButtonLabel(input({ format: "pdf" })), "Download PDF");
    assert.equal(researchExportButtonLabel(input({ format: "xls" })), "Download XLS");
    assert.equal(researchExportButtonLabel(input({ format: "csv" })), "Download CSV");
    assert.equal(researchExportButtonLabel(input({ format: "pdf", exporting: "pdf" })), "Building PDF");
    assert.equal(researchExportButtonLabel(input({ format: "xls", exporting: "xls" })), "Building XLS");
    assert.equal(researchExportButtonLabel(input({ format: "csv", exporting: "csv" })), "Building CSV");

    const labels = [
      researchExportButtonLabel(input({ searching: true, hasInsights: false, ideaCount: 0 })),
      researchExportButtonLabel(input({ ideasLoading: true, ideaCount: 0 })),
      researchExportButtonLabel(input()),
      researchExportButtonLabel(input({ exporting: "pdf" })),
    ];
    for (const label of labels) {
      assert.equal(/waiting/i.test(label), false);
    }
  });

  test("does not announce Insights or Ideas after that stage has failed", () => {
    assert.equal(researchExportButtonLabel(input({ hasInsights: false, insightsFailed: true, ideaCount: 0 })), "Download PDF");
    assert.equal(researchExportButtonLabel(input({ ideaCount: 0, ideasFailed: true })), "Download PDF");
  });

  test("pipeline status names the stage that is blocking export", () => {
    assert.match(researchExportPipelineMessage(input({ insightsLoading: true, hasInsights: false, ideaCount: 0 })) || "", /Insights/);
    assert.match(researchExportPipelineMessage(input({ ideasLoading: true, ideaCount: 0 })) || "", /Ideas/);
    assert.equal(researchExportPipelineMessage(input()), null);
  });
});
