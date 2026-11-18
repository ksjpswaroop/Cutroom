import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import {
  fetchCommentQuestionsForVideos,
  fetchPublicCaptionsForVideos,
  searchVideos,
} from "./youtube";
import { getYouTubeQuotaUsage } from "./youtube-quota";
import { generateScript, generateIdeas, generateResearchInsights, regenerateTitles, regenerateSection, regenerateParagraph, generateThumbnail, generateThumbnailSuggestions, extractNarrationText, generatePublishPackage, generateProductionBrief, generateProductionBoard, critiqueThumbnail } from "./gemini";
import { inspectCompetitorThumbnailsWithGemini } from "./thumbnail-inspection";
import { thumbnailInspectionRequestSchema } from "@shared/thumbnail-inspection";
import {
  ideaGenerationRequestSchema,
  researchCaptionsRequestSchema,
  researchCommentQuestionsRequestSchema,
  researchInsightsRequestSchema,
  searchFiltersSchema,
  scriptInputSchema,
  productionBoardRequestSchema,
  productionBoardOutputSchema,
} from "@shared/schema";
import { z } from "zod";
import { apiKeySettingsSchema, getApiKeyStatusAsync, isLocalSettingsRequest, saveApiKeySettings } from "./settings";
import {
  buildDiagnosticBundle,
  diagnosticFileName,
  serializeDiagnosticBundle,
  writeDiagnosticBundleToPath,
} from "./diagnostics";
import { ollamaStatus } from "./ollama";
import {
  clearLibraryConfig,
  librarySettingsSchema,
  readLibraryConfig,
  writeLibraryConfig,
} from "./library-config";
import {
  preferencesUpdateSchema,
  readPreferences,
  writePreferences,
} from "./preferences";
import { proRegistry } from "./pro-commands";
import {
  assemblePreviewRequestSchema,
  getAssemblePreviewStatus,
  renderAssemblePreview,
  resolveWorkflowPreviewPath,
  resolveWorkflowRenderPath,
} from "./assemble-preview";
import { buildCinematicQuote, getRenderStatus, runRender } from "./render-engine";
import {
  brandKitUpdateSchema,
  readBrandKit,
  writeBrandKit,
} from "./brand-kit";
import { clipBriefsFromScript } from "@shared/clip-briefs";
import {
  calendarItemCreateSchema,
  calendarItemUpdateSchema,
  createCalendarItem,
  deleteCalendarItem,
  listCalendarItems,
  updateCalendarItem,
} from "./content-calendar";
import { getStudioMirrorStatus, studioMetricsPlaceholder } from "./studio-oauth";
import {
  addPersona,
  channelMemory,
  createChannel,
  createProductionItem,
  deleteChannel,
  deletePersona,
  deleteProductionItem,
  listChannels,
  listPersonas,
  listProduction,
  moveProductionItem,
  newPersonaId,
  updateChannel,
} from "./creator-store";
import {
  generateAvatarMarkdown,
  generateChannelIntelligence,
  generatePersona,
  humanizeText,
} from "./creator-ai";
import { buildCreatorLedger } from "./creator-ledger";
import { collectCreatorExport } from "./creator-export";
import {
  audienceAvatarRequestSchema,
  audiencePersonaRequestSchema,
  channelCreateSchema,
  channelIntelligenceRequestSchema,
  channelUpdateSchema,
  humanizeRequestSchema,
  productionItemCreateSchema,
  productionItemMoveSchema,
} from "@shared/creator-modules";
import { normalizeProviderError, providerErrorPayload } from "./provider-errors";
import { thumbnailGenerationRequestSchema, thumbnailSuggestionsRequestSchema } from "./thumbnail-contract";
import {
  paragraphRegenerationRequestSchema,
  sectionRegenerationRequestSchema,
} from "./script-regeneration-contract";
import {
  narrationExtractionRequestSchema,
  titleRegenerationRequestSchema,
} from "./api-contracts";
import {
  productionBriefRequestSchema,
  publishPackageRequestSchema,
  thumbnailCritiqueRequestSchema,
} from "./package-contract";
import { createRateLimiter, requireValidBody } from "./rate-limit";
import {
  deleteWorkflowRecordFromDisk,
  getWorkflowRecordFromDisk,
  getWorkflowTopicDirectory,
  isValidWorkflowId,
  listWorkflowRecordsFromDisk,
  parseWorkflowRecord,
  putWorkflowRecordToDisk,
  type StoredWorkflowRecord,
} from "./workflow-store";

const { middleware: rateLimit } = createRateLimiter();

const workflowRecordSchema = z.object({
  id: z.string().refine(isValidWorkflowId, "Invalid workflow id."),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  state: z.unknown(),
}).strict();

function sendWorkflowMp4(res: Response, filePath: string, missingLabel: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.sendFile(filePath, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
    },
  }, (error) => {
    if (!error || res.headersSent) return;
    console.error(`${missingLabel} file error:`, error);
    res.status(500).json({ error: `Unable to read ${missingLabel}.` });
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/settings/status", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }
    try {
      const library = await readLibraryConfig();
      const preferences = await readPreferences();
      const assemble = await getAssemblePreviewStatus();
      const brandKit = await readBrandKit();
      return res.json({
        ...await getApiKeyStatusAsync(),
        libraryPath: library.path,
        preferences,
        assemblePreview: assemble,
        brandKit,
      });
    } catch (error) {
      console.error("Settings status error:", error);
      return res.status(500).json({ error: "Unable to load settings." });
    }
  });

  /**
   * Opt-in, local-only diagnostics export. No telemetry: the bundle is redacted
   * and only ever leaves on a user action to a file the user chooses.
   *
   * GET streams the bundle inline (browser "save as"). POST { path } writes it
   * to an absolute path the user picked in the desktop save dialog.
   */
  app.get("/api/diagnostics/export", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Diagnostics are available only from this machine." });
    }
    try {
      const bundle = await buildDiagnosticBundle();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${diagnosticFileName()}"`);
      return res.send(serializeDiagnosticBundle(bundle));
    } catch (error) {
      console.error("Diagnostics export error:", error);
      return res.status(500).json({ error: "Unable to build diagnostics." });
    }
  });

  app.post("/api/diagnostics/export", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Diagnostics are available only from this machine." });
    }
    const target = typeof req.body?.path === "string" ? req.body.path : "";
    if (!target) {
      return res.status(400).json({ error: "Choose a file path for the diagnostics export." });
    }
    try {
      const result = await writeDiagnosticBundleToPath(target);
      return res.json({ saved: true, ...result });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to write diagnostics file." });
    }
  });

  /**
   * Local model discovery. Settings uses this to show which models are actually
   * installed rather than asking the user to type a model name blind, and to
   * report plainly when the daemon is not running.
   */
  app.get("/api/ai/ollama/status", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }
    try {
      const baseUrl = typeof req.query.baseUrl === "string" ? req.query.baseUrl : undefined;
      const model = typeof req.query.model === "string" ? req.query.model : undefined;
      return res.json(await ollamaStatus({ baseUrl, model }));
    } catch (error) {
      console.error("Ollama status error:", error);
      return res.status(500).json({ error: "Unable to query the local model daemon." });
    }
  });

  app.put("/api/settings/preferences", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }
    try {
      const input = preferencesUpdateSchema.parse(req.body);
      // The Cutroom Pro toggle goes through the Pro command registry (M0), so
      // the flip is validated and written to the audit log like every Pro
      // action. Other preference keys keep the existing direct path.
      const { cutroomProEnabled, ...rest } = input;
      const definedRest = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined),
      );
      let preferences = await readPreferences();
      if (cutroomProEnabled !== undefined) {
        preferences = await proRegistry.dispatch("pro.set-enabled", { enabled: cutroomProEnabled });
      }
      if (Object.keys(definedRest).length > 0) {
        preferences = await writePreferences(definedRest as typeof rest);
      }
      const assemble = await getAssemblePreviewStatus();
      return res.json({ success: true, preferences, assemblePreview: assemble });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Unable to save preferences.",
      });
    }
  });

  /**
   * Cutroom Pro M0 — OTIO export from the production Board, and the Pro
   * command audit log. Both are local-only. The export goes through the Pro
   * command registry, which enforces the Pro gate and validates the Board.
   */
  app.post("/api/board/otio", async (req, res) => {
    if (!localGuard(req, res, "OTIO export")) return;
    try {
      const result = await proRegistry.dispatch("pro.export-otio", req.body ?? {});
      return res.json({ success: true, ...(result as Record<string, unknown>) });
    } catch (error: any) {
      const message = error?.message || "Unable to export OTIO.";
      const status = /disabled/i.test(message) ? 403 : 400;
      return res.status(status).json({
        error: /disabled/i.test(message)
          ? "Cutroom Pro is off. Enable it in Settings to export OTIO."
          : message,
      });
    }
  });

  app.get("/api/pro/audit", async (req, res) => {
    if (!localGuard(req, res, "Pro audit log")) return;
    return res.json({ entries: proRegistry.auditLog() });
  });

  /**
   * Cutroom Pro M1 — Assembler agent. Plan first (inspect, approve),
   * then run (dispatches every step through the Pro registry and returns
   * the receipt). Both are local-only and Pro-gated (403 when off).
   * Receipts are persisted under <app-data root>/assembler-runs/<runId>/.
   */
  app.post("/api/assembler/plan", async (req, res) => {
    if (!localGuard(req, res, "Assembler plan")) return;
    try {
      const plan = await proRegistry.dispatch("assembler.plan", req.body ?? {});
      return res.json({ success: true, plan });
    } catch (error: any) {
      const message = error?.message || "Unable to build the assembly plan.";
      const status = /disabled/i.test(message) ? 403 : 400;
      return res.status(status).json({
        error: /disabled/i.test(message)
          ? "Cutroom Pro is off. Enable it in Settings to assemble."
          : message,
      });
    }
  });

  app.post("/api/assembler/run", async (req, res) => {
    if (!localGuard(req, res, "Assembler run")) return;
    try {
      const receipt = await proRegistry.dispatch("assembler.run", req.body ?? {}) as { status?: string };
      // M2 — a QA Fail blocks the run: 409 with the blocked receipt (and its QA report).
      if (receipt.status === "blocked") {
        return res.status(409).json({ error: "Assembler run blocked by QA.", receipt });
      }
      return res.json({ success: true, receipt });
    } catch (error: any) {
      const message = error?.message || "Unable to run the assembler.";
      const status = /disabled/i.test(message) ? 403 : 400;
      return res.status(status).json({
        error: /disabled/i.test(message)
          ? "Cutroom Pro is off. Enable it in Settings to assemble."
          : message,
      });
    }
  });

  app.get("/api/assembler/receipts", async (req, res) => {
    if (!localGuard(req, res, "Assembler receipts")) return;
    try {
      const { listReceipts } = await import("./assembler");
      return res.json({ receipts: await listReceipts() });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to list assembler receipts." });
    }
  });

  app.get("/api/assembler/receipts/:runId", async (req, res) => {
    if (!localGuard(req, res, "Assembler receipt")) return;
    const runId = req.params.runId;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) {
      return res.status(400).json({ error: "Invalid run id." });
    }
    try {
      const { getReceipt } = await import("./assembler");
      const receipt = await getReceipt(runId);
      if (!receipt) return res.status(404).json({ error: "Receipt not found." });
      return res.json({ receipt });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load the assembler receipt." });
    }
  });

  /**
   * Cutroom Pro M2 — Agent team. Plan first (inspect, approve), then run
   * (Orchestrator delegates each step through the Pro registry, QA-gates,
   * then assembles). All local-only and Pro-gated (403 when off). The
   * spend cap defaults to the Settings value (default $0) when the body
   * does not supply one. Agent receipts persist under
   * <app-data root>/agent-runs/<runId>/; agent memory under
   * <app-data root>/agent-memory/<projectId>.json.
   */
  const agentsGuard = async (req: Parameters<typeof isLocalSettingsRequest>[0], res: Response) => {
    if (!localGuard(req, res, "Agent team")) return false;
    const preferences = await readPreferences();
    if (!preferences.cutroomProEnabled) {
      res.status(403).json({ error: "Cutroom Pro is off. Enable it in Settings to use the agent team." });
      return false;
    }
    return true;
  };

  const withSpendCap = async (body: Record<string, unknown>) => {
    if (body.spendCapUsd !== undefined) return body;
    const preferences = await readPreferences();
    return { ...body, spendCapUsd: preferences.agentSpendCapUsd ?? 0 };
  };

  app.post("/api/agents/plan", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const plan = await proRegistry.dispatch("agents.plan", await withSpendCap(req.body ?? {}));
      return res.json({ success: true, plan });
    } catch (error: any) {
      const message = error?.message || "Unable to build the agent plan.";
      const status = /disabled/i.test(message) ? 403 : 400;
      return res.status(status).json({ error: message });
    }
  });

  app.post("/api/agents/run", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const receipt = await proRegistry.dispatch("agents.run", await withSpendCap(req.body ?? {}));
      return res.json({ success: true, receipt });
    } catch (error: any) {
      const message = error?.message || "Unable to run the agent team.";
      const status = /disabled/i.test(message) ? 403 : 400;
      return res.status(status).json({ error: message });
    }
  });

  app.get("/api/agents/runs/:runId", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    const runId = req.params.runId;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) {
      return res.status(400).json({ error: "Invalid run id." });
    }
    try {
      const { getAgentReceipt } = await import("./orchestrator");
      const receipt = await getAgentReceipt(runId);
      if (!receipt) return res.status(404).json({ error: "Agent run not found." });
      return res.json({ receipt });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load the agent run." });
    }
  });

  app.get("/api/agents/ledger", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const { aggregateLedger, listAgentReceipts } = await import("./orchestrator");
      const ledger = await aggregateLedger();
      const runs = (await listAgentReceipts()).map((receipt) => ({
        runId: receipt.runId,
        status: receipt.status,
        startedAt: receipt.startedAt,
        totals: receipt.ledger.totals,
      }));
      return res.json({ ledger, runs });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load the agent ledger." });
    }
  });

  const projectIdParam = (req: { query?: Record<string, unknown> }) => {
    const value = req.query?.projectId;
    return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 128) : "default";
  };

  app.get("/api/agents/memory", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const { readAgentMemory } = await import("./agent-memory");
      return res.json({ memory: await readAgentMemory(projectIdParam(req)) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load agent memory." });
    }
  });

  app.put("/api/agents/memory", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const { writeAgentMemory } = await import("./agent-memory");
      const memory = await writeAgentMemory({ ...req.body, projectId: projectIdParam(req) });
      return res.json({ success: true, memory });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to save agent memory." });
    }
  });

  app.delete("/api/agents/memory", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const { deleteAgentMemory } = await import("./agent-memory");
      const deleted = await deleteAgentMemory(projectIdParam(req));
      return res.json({ success: true, deleted });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to delete agent memory." });
    }
  });

  // Cutroom Pro M3 — premise-accuracy loop. Records and actuals are
  // creator-supplied only; nothing here fetches Studio data or scrapes
  // YouTube. All three routes are Pro-gated (403 when off).
  app.post("/api/agents/premise", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const { recordPremise } = await import("./premise-accuracy");
      const record = await recordPremise({ ...req.body, projectId: projectIdParam(req) });
      return res.json({ success: true, record });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to record the premise." });
    }
  });

  app.get("/api/agents/premise", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    try {
      const { compareProjectPremises } = await import("./premise-accuracy");
      return res.json(await compareProjectPremises(projectIdParam(req)));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load premises." });
    }
  });

  app.post("/api/agents/premise/:id/actuals", async (req, res) => {
    if (!(await agentsGuard(req, res))) return;
    const recordId = req.params.id;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(recordId)) {
      return res.status(400).json({ error: "Invalid premise id." });
    }
    try {
      const { premiseActualsInputSchema } = await import("@shared/premise-accuracy");
      const actuals = premiseActualsInputSchema.parse(req.body ?? {});
      const { supplyPremiseActuals, compareProjectPremises } = await import("./premise-accuracy");
      const record = await supplyPremiseActuals(projectIdParam(req), recordId, actuals);
      if (!record) return res.status(404).json({ error: "Premise not found." });
      const { comparisons } = await compareProjectPremises(projectIdParam(req));
      return res.json({ success: true, record, comparison: comparisons.find((c) => c.recordId === recordId) ?? null });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to save the actual numbers." });
    }
  });

  app.put("/api/settings/brand-kit", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }
    try {
      const input = brandKitUpdateSchema.parse(req.body);
      const brandKit = await writeBrandKit(input);
      return res.json({ success: true, brandKit });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Unable to save brand kit.",
      });
    }
  });

  app.post("/api/package/clip-briefs", (req, res, next) => {
    const parsed = z.object({
      scriptContent: z.string().trim().min(20).max(80_000),
      wpm: z.number().int().min(80).max(250).optional(),
    }).strict().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid clip briefs request",
        details: parsed.error.flatten(),
      });
    }
    res.locals.validatedBody = parsed.data;
    return next();
  }, rateLimit, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const parsed = res.locals.validatedBody as { scriptContent: string; wpm?: number };
      const briefs = clipBriefsFromScript(parsed.scriptContent, {
        wpm: parsed.wpm,
      });
      return res.json({ briefs, evidenceClass: "inferred" as const });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to derive clip briefs." });
    }
  });

  app.get("/api/calendar", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Calendar is available only from this machine." });
    }
    try {
      return res.json({ items: await listCalendarItems() });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load calendar." });
    }
  });

  app.post("/api/calendar", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Calendar is available only from this machine." });
    }
    try {
      const input = calendarItemCreateSchema.parse(req.body);
      const item = await createCalendarItem(input);
      return res.status(201).json({ item });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to create calendar item." });
    }
  });

  app.put("/api/calendar/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Calendar is available only from this machine." });
    }
    try {
      const input = calendarItemUpdateSchema.parse({ ...req.body, id: req.params.id });
      const item = await updateCalendarItem(input);
      return res.json({ item });
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      return res.status(status).json({ error: error?.message || "Unable to update calendar item." });
    }
  });

  app.delete("/api/calendar/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Calendar is available only from this machine." });
    }
    try {
      return res.json(await deleteCalendarItem(req.params.id));
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      return res.status(status).json({ error: error?.message || "Unable to delete calendar item." });
    }
  });

  // ── Creator modules (folded in): Channels, Audience, Operations, Humanize ──
  const localGuard = (req: Parameters<typeof isLocalSettingsRequest>[0], res: Response, label: string) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      res.status(403).json({ error: `${label} is available only from this machine.` });
      return false;
    }
    return true;
  };

  app.get("/api/channels", async (req, res) => {
    if (!localGuard(req, res, "Channels")) return;
    try {
      return res.json({ channels: await listChannels() });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load channels." });
    }
  });

  app.post("/api/channels", async (req, res) => {
    if (!localGuard(req, res, "Channels")) return;
    try {
      const channel = await createChannel(channelCreateSchema.parse(req.body));
      return res.status(201).json({ channel });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to create channel." });
    }
  });

  app.put("/api/channels/:id", async (req, res) => {
    if (!localGuard(req, res, "Channels")) return;
    try {
      const channel = await updateChannel(channelUpdateSchema.parse({ ...req.body, id: req.params.id }));
      return res.json({ channel });
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      return res.status(status).json({ error: error?.message || "Unable to update channel." });
    }
  });

  app.delete("/api/channels/:id", async (req, res) => {
    if (!localGuard(req, res, "Channels")) return;
    try {
      return res.json(await deleteChannel(req.params.id));
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      return res.status(status).json({ error: error?.message || "Unable to delete channel." });
    }
  });

  app.get("/api/channels/:id/memory", async (req, res) => {
    if (!localGuard(req, res, "Channel memory")) return;
    try {
      return res.json({ memory: await channelMemory(req.params.id) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load channel memory." });
    }
  });

  app.post("/api/channels/intelligence", async (req, res) => {
    if (!localGuard(req, res, "Channel intelligence")) return;
    try {
      const input = channelIntelligenceRequestSchema.parse(req.body);
      const memory = input.channelId ? await channelMemory(input.channelId) : undefined;
      const intelligence = await generateChannelIntelligence(input.niche, input.scriptTitles, { memory });
      return res.json({ intelligence });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to analyze channel." });
    }
  });

  // Operations / Kanban
  app.get("/api/production", async (req, res) => {
    if (!localGuard(req, res, "Production board")) return;
    try {
      const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
      return res.json({ items: await listProduction(channelId) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load production board." });
    }
  });

  app.post("/api/production", async (req, res) => {
    if (!localGuard(req, res, "Production board")) return;
    try {
      const item = await createProductionItem(productionItemCreateSchema.parse(req.body));
      return res.status(201).json({ item });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to add production item." });
    }
  });

  app.patch("/api/production/:id", async (req, res) => {
    if (!localGuard(req, res, "Production board")) return;
    try {
      const item = await moveProductionItem(productionItemMoveSchema.parse({ ...req.body, id: req.params.id }));
      return res.json({ item });
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      return res.status(status).json({ error: error?.message || "Unable to move production item." });
    }
  });

  app.delete("/api/production/:id", async (req, res) => {
    if (!localGuard(req, res, "Production board")) return;
    try {
      return res.json(await deleteProductionItem(req.params.id));
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      return res.status(status).json({ error: error?.message || "Unable to delete production item." });
    }
  });

  // Audience personas + avatar
  app.get("/api/personas", async (req, res) => {
    if (!localGuard(req, res, "Audience personas")) return;
    try {
      const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
      return res.json({ personas: await listPersonas(channelId) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to load personas." });
    }
  });

  app.post("/api/personas", async (req, res) => {
    if (!localGuard(req, res, "Audience personas")) return;
    try {
      const input = audiencePersonaRequestSchema.parse(req.body);
      const persona = await generatePersona(newPersonaId(), input.channelId, input.channelName, input.niche);
      return res.status(201).json({ persona: await addPersona(persona) });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to generate persona." });
    }
  });

  app.delete("/api/personas/:id", async (req, res) => {
    if (!localGuard(req, res, "Audience personas")) return;
    try {
      return res.json(await deletePersona(req.params.id));
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      return res.status(status).json({ error: error?.message || "Unable to delete persona." });
    }
  });

  app.post("/api/audience/avatar", async (req, res) => {
    if (!localGuard(req, res, "Audience avatar")) return;
    try {
      const input = audienceAvatarRequestSchema.parse(req.body);
      return res.json({ avatar: await generateAvatarMarkdown(input.channelName, input.niche) });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to build avatar." });
    }
  });

  // Humanize (routes through the active Cutroom text provider, Ollama included)
  app.post("/api/humanize", rateLimit, async (req, res) => {
    if (!localGuard(req, res, "Humanize")) return;
    try {
      const input = humanizeRequestSchema.parse(req.body);
      return res.json({ result: await humanizeText(input.text) });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Unable to humanize text." });
    }
  });

  // L-807: unified evidence ledger across creator modules for the active channel.
  // Every entry is synthesized (inferred); the aggregator rejects any that isn't.
  app.get("/api/creator/ledger", async (req, res) => {
    if (!localGuard(req, res, "Creator ledger")) return;
    try {
      const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
      const personas = await listPersonas(channelId);
      return res.json({ entries: buildCreatorLedger({ personas }) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to build creator ledger." });
    }
  });

  // L-808: creator artifacts for the project export pack, gated by the
  // `creatorExportEnabled` Settings toggle. Returns `{ files: {} }` when the
  // toggle is off or no channel is in context, so the pack is unchanged by default.
  app.get("/api/creator/export", async (req, res) => {
    if (!localGuard(req, res, "Creator export")) return;
    try {
      const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
      return res.json({ files: await collectCreatorExport(channelId) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unable to build creator export." });
    }
  });

  app.get("/api/studio/status", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Studio mirror status is available only from this machine." });
    }
    return res.json(getStudioMirrorStatus());
  });

  app.get("/api/studio/metrics", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Studio metrics are available only from this machine." });
    }
    const videoId = typeof req.query.videoId === "string" ? req.query.videoId : undefined;
    return res.json(studioMetricsPlaceholder(videoId));
  });

  app.get("/api/preview/status", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Preview status is available only from this machine." });
    }
    try {
      return res.json({
        ...(await getAssemblePreviewStatus()),
        render: getRenderStatus(),
      });
    } catch (error) {
      console.error("Preview status error:", error);
      return res.status(500).json({ error: "Unable to load preview status." });
    }
  });

  app.post("/api/preview/assemble", rateLimit, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Assemble preview is available only from this machine." });
    }
    try {
      const parsed = assemblePreviewRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid assemble preview request",
          details: parsed.error.flatten(),
        });
      }
      const includeDataUrl = req.query.includeDataUrl === "1";
      const result = await renderAssemblePreview(parsed.data, { includeDataUrl });
      return res.json(result);
    } catch (error: any) {
      console.error("Assemble preview error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      return res.status(status).json({
        error: error?.message || "Unable to assemble preview.",
      });
    }
  });

  app.get("/api/workflows/:id/preview", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Preview files are available only from this machine." });
    }
    if (!isValidWorkflowId(req.params.id)) {
      return res.status(400).json({ error: "Invalid workflow id." });
    }
    try {
      const previewPath = await resolveWorkflowPreviewPath(req.params.id);
      if (!previewPath) return res.status(404).json({ error: "No preview.mp4 for this workflow yet." });
      return sendWorkflowMp4(res, previewPath, "preview.mp4");
    } catch (error) {
      console.error("Preview file error:", error);
      return res.status(500).json({ error: "Unable to read preview.mp4." });
    }
  });

  app.get("/api/workflows/:id/render", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Render files are available only from this machine." });
    }
    if (!isValidWorkflowId(req.params.id)) {
      return res.status(400).json({ error: "Invalid workflow id." });
    }
    try {
      const renderPath = await resolveWorkflowRenderPath(req.params.id);
      if (!renderPath) return res.status(404).json({ error: "No render.mp4 for this workflow yet." });
      return sendWorkflowMp4(res, renderPath, "render.mp4");
    } catch (error) {
      console.error("Render file error:", error);
      return res.status(500).json({ error: "Unable to read render.mp4." });
    }
  });

  app.post("/api/preview/quote", rateLimit, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Render quotes are available only from this machine." });
    }
    const board = req.body && typeof req.body === "object" ? (req.body as { board?: unknown }).board : undefined;
    const parsedBoard = board ? productionBoardOutputSchema.safeParse(board) : undefined;
    return res.json(buildCinematicQuote(parsedBoard?.success ? parsedBoard.data : undefined));
  });

  app.post("/api/preview/render", rateLimit, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Render is available only from this machine." });
    }
    try {
      const result = await runRender(req.body);
      return res.json(result);
    } catch (error: any) {
      console.error("Render error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      return res.status(status).json({
        error: error?.message || "Unable to render.",
      });
    }
  });

  app.put("/api/settings/library", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }
    try {
      const input = librarySettingsSchema.parse(req.body);
      const library = await writeLibraryConfig(input.path);
      return res.json({ success: true, libraryPath: library.path });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Unable to save the library folder.",
      });
    }
  });

  app.delete("/api/settings/library", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }
    try {
      const library = await clearLibraryConfig();
      return res.json({ success: true, libraryPath: library.path });
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message || "Unable to clear the library folder.",
      });
    }
  });

  app.put("/api/settings/api-keys", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }

    try {
      const input = apiKeySettingsSchema.parse(req.body);
      const status = await saveApiKeySettings(input);
      return res.json({ success: true, status });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Unable to save API settings.",
      });
    }
  });

  app.get("/api/youtube/search", (req, res, next) => {
    const query = req.query.query;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "Query parameter is required" });
    }
    return next();
  }, rateLimit, async (req, res) => {
    try {
      const { query, uploadDate, duration, sortBy, maxResults, channelId } = req.query;

      const filters = searchFiltersSchema.parse({
        query,
        uploadDate: uploadDate || "any",
        duration: duration || "any",
        sortBy: sortBy || "relevance",
        maxResults: maxResults ? parseInt(maxResults as string, 10) : 25,
        ...(typeof channelId === "string" && channelId.trim()
          ? { channelId: channelId.trim() }
          : {}),
      });

      const result = await searchVideos(filters);
      res.json(result);
    } catch (error: any) {
      console.error("YouTube search error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid search parameters", details: error.issues });
      }
      const providerError = normalizeProviderError(error, "youtube");
      res.status(providerError.status).json(providerErrorPayload(providerError, "YouTube Data API"));
    }
  });

  app.get("/api/youtube/quota", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // Soft in-process session meter; does not sync with Google's daily project quota.
    res.json(getYouTubeQuotaUsage());
  });

  app.post("/api/research/captions", rateLimit, async (req, res) => {
    try {
      const parsed = researchCaptionsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Between 1 and 5 video IDs are required.",
          code: "RESEARCH_CAPTIONS_REQUEST_INVALID",
          details: parsed.error.issues,
        });
      }
      const captions = await fetchPublicCaptionsForVideos(parsed.data.videoIds);
      res.json({ captions });
    } catch (error: unknown) {
      console.error("Research captions error:", error);
      const providerError = normalizeProviderError(error, "youtube");
      res.status(providerError.status).json(providerErrorPayload(providerError, "YouTube captions"));
    }
  });

  app.post("/api/research/thumbnail-inspection", rateLimit, async (req, res) => {
    try {
      const parsed = thumbnailInspectionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "A snapshot and between 1 and 50 videos with thumbnail URLs are required.",
          code: "THUMBNAIL_INSPECTION_REQUEST_INVALID",
          details: parsed.error.issues,
        });
      }
      const result = await inspectCompetitorThumbnailsWithGemini(parsed.data);
      res.json(result);
    } catch (error: unknown) {
      console.error("Thumbnail inspection error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Thumbnail inspection"));
    }
  });

  app.post("/api/research/comment-questions", rateLimit, async (req, res) => {
    try {
      const parsed = researchCommentQuestionsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Between 1 and 3 video IDs are required.",
          code: "RESEARCH_COMMENT_QUESTIONS_REQUEST_INVALID",
          details: parsed.error.issues,
        });
      }
      const questions = await fetchCommentQuestionsForVideos(parsed.data.videoIds);
      res.json({ questions });
    } catch (error: unknown) {
      console.error("Research comment questions error:", error);
      const providerError = normalizeProviderError(error, "youtube");
      res.status(providerError.status).json(providerErrorPayload(providerError, "YouTube comments"));
    }
  });

  app.post(
    "/api/script/generate",
    requireValidBody(scriptInputSchema, "Invalid script input"),
    rateLimit,
    async (req, res) => {
    try {
      const input = res.locals.validatedBody as z.infer<typeof scriptInputSchema>;
      const result = await generateScript(input);
      res.json(result);
    } catch (error: unknown) {
      console.error("Script generation error:", error);
      const providerError = normalizeProviderError(error, "provider");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Script generation"));
    }
  });

  app.post("/api/script/extract-narration", rateLimit, async (req, res) => {
    try {
      const { scriptContent } = narrationExtractionRequestSchema.parse(req.body);
      const narration = await extractNarrationText(scriptContent);
      res.json({ narration });
    } catch (error: any) {
      console.error("Narration extraction error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid narration extraction request", details: error.issues });
      }
      const providerError = normalizeProviderError(error, "provider");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Narration extraction"));
    }
  });

  app.post(
    "/api/ideas/generate",
    requireValidBody(ideaGenerationRequestSchema, "Invalid grounded idea request"),
    rateLimit,
    async (_req, res) => {
    try {
      const result = await generateIdeas(res.locals.validatedBody);
      res.json(result);
    } catch (error: unknown) {
      console.error("Ideas generation error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini Ideas"));
    }
  });

  app.post(
    "/api/research/insights",
    (req, res, next) => {
      const parsed = researchInsightsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "A query and between 1 and 50 valid videos are required.",
          code: "RESEARCH_REQUEST_INVALID",
          details: parsed.error.issues,
        });
      }
      res.locals.validatedBody = parsed.data;
      return next();
    },
    rateLimit,
    async (_req, res) => {
    try {
      const result = await generateResearchInsights(res.locals.validatedBody);
      res.json(result);
    } catch (error: unknown) {
      console.error("Research insights error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini research"));
    }
  });

  app.post("/api/script/regenerate-titles", rateLimit, async (req, res) => {
    try {
      const { topic, format, audience, evidenceContext } = titleRegenerationRequestSchema.parse(req.body);
      const titles = await regenerateTitles(
        topic,
        format,
        audience,
        evidenceContext,
      );
      res.json({ titles });
    } catch (error: any) {
      console.error("Title regeneration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid title regeneration request", details: error.issues });
      }
      const providerError = normalizeProviderError(error, "provider");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Title regeneration"));
    }
  });

  app.post("/api/script/regenerate-section", rateLimit, async (req, res) => {
    try {
      const parsed = sectionRegenerationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid section regeneration request",
          code: "SCRIPT_SECTION_REGENERATION_REQUEST_INVALID",
          category: "invalid_response",
          retryable: false,
          suggestion: "Keep the current section and review its topic, format, audience, and evidence context.",
          details: parsed.error.flatten(),
        });
      }

      const result = await regenerateSection(parsed.data);
      res.json(result);
    } catch (error: unknown) {
      console.error("Section regeneration error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini section regeneration"));
    }
  });

  app.post("/api/script/regenerate-paragraph", rateLimit, async (req, res) => {
    try {
      const parsed = paragraphRegenerationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid paragraph regeneration request",
          code: "SCRIPT_PARAGRAPH_REGENERATION_REQUEST_INVALID",
          category: "invalid_response",
          retryable: false,
          suggestion: "Keep the current paragraph and review its section, topic, format, audience, and evidence context.",
          details: parsed.error.flatten(),
        });
      }

      const result = await regenerateParagraph(parsed.data);
      res.json(result);
    } catch (error: unknown) {
      console.error("Paragraph regeneration error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini paragraph regeneration"));
    }
  });

  app.post("/api/thumbnail/generate", (req, res, next) => {
    const parsed = thumbnailGenerationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid thumbnail generation request",
        code: "THUMBNAIL_REQUEST_INVALID",
        category: "invalid_response",
        retryable: false,
        suggestion: "Review the thumbnail fields and reference image requirements, then try again.",
        details: parsed.error.flatten(),
      });
    }
    res.locals.validatedBody = parsed.data;
    return next();
  }, rateLimit, async (_req, res) => {
    try {
      const { topic, ...config } = res.locals.validatedBody;
      const result = await generateThumbnail(topic, config);
      res.json(result);
    } catch (error: unknown) {
      console.error("Thumbnail generation error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini image generation"));
    }
  });

  app.post("/api/thumbnail/suggestions", (req, res, next) => {
    const parsed = thumbnailSuggestionsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid thumbnail suggestions request",
        code: "THUMBNAIL_SUGGESTIONS_REQUEST_INVALID",
        category: "invalid_response",
        retryable: false,
        suggestion: "Add a valid topic and shorten any supplied idea context.",
        details: parsed.error.flatten(),
      });
    }
    res.locals.validatedBody = parsed.data;
    return next();
  }, rateLimit, async (_req, res) => {
    try {
      const suggestions = await generateThumbnailSuggestions(res.locals.validatedBody);
      res.json({ suggestions });
    } catch (error: unknown) {
      console.error("Thumbnail suggestions error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini thumbnail suggestions"));
    }
  });

  app.post("/api/package/generate", (req, res, next) => {
    const parsed = publishPackageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid publish package request",
        details: parsed.error.flatten(),
      });
    }
    res.locals.validatedBody = parsed.data;
    return next();
  }, rateLimit, async (_req, res) => {
    try {
      const result = await generatePublishPackage(res.locals.validatedBody);
      res.json(result);
    } catch (error: unknown) {
      console.error("Publish package error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini publish package"));
    }
  });

  app.post("/api/package/production-brief", (req, res, next) => {
    const parsed = productionBriefRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid production brief request",
        details: parsed.error.flatten(),
      });
    }
    res.locals.validatedBody = parsed.data;
    return next();
  }, rateLimit, async (_req, res) => {
    try {
      const result = await generateProductionBrief(res.locals.validatedBody);
      res.json(result);
    } catch (error: unknown) {
      console.error("Production brief error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini production brief"));
    }
  });

  app.post("/api/package/production-board", (req, res, next) => {
    const parsed = productionBoardRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid production board request",
        details: parsed.error.flatten(),
      });
    }
    res.locals.validatedBody = parsed.data;
    return next();
  }, rateLimit, async (_req, res) => {
    try {
      const result = await generateProductionBoard(res.locals.validatedBody);
      res.json(result);
    } catch (error: unknown) {
      console.error("Production board error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini production board"));
    }
  });

  app.post("/api/thumbnail/critique", (req, res, next) => {
    const parsed = thumbnailCritiqueRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid thumbnail critique request",
        details: parsed.error.flatten(),
      });
    }
    res.locals.validatedBody = parsed.data;
    return next();
  }, rateLimit, async (_req, res) => {
    try {
      const result = await critiqueThumbnail(res.locals.validatedBody);
      res.json(result);
    } catch (error: unknown) {
      console.error("Thumbnail critique error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini thumbnail critique"));
    }
  });

  app.get("/api/workflows", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Workflow history is available only from this machine." });
    }
    try {
      const records = await listWorkflowRecordsFromDisk();
      return res.json({ records });
    } catch (error) {
      console.error("Workflow list error:", error);
      return res.status(500).json({ error: "Unable to load workflow history." });
    }
  });

  app.get("/api/workflows/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Workflow history is available only from this machine." });
    }
    if (!isValidWorkflowId(req.params.id)) {
      return res.status(400).json({ error: "Invalid workflow id." });
    }
    try {
      const record = await getWorkflowRecordFromDisk(req.params.id);
      if (!record) return res.status(404).json({ error: "Workflow not found." });
      return res.json({ record });
    } catch (error) {
      console.error("Workflow read error:", error);
      return res.status(500).json({ error: "Unable to open that workflow." });
    }
  });

  app.get("/api/workflows/:id/folder", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Workflow history is available only from this machine." });
    }
    if (!isValidWorkflowId(req.params.id)) {
      return res.status(400).json({ error: "Invalid workflow id." });
    }
    try {
      const folder = await getWorkflowTopicDirectory(req.params.id);
      if (!folder) return res.status(404).json({ error: "Workflow folder not found." });
      return res.json({ path: folder });
    } catch (error) {
      console.error("Workflow folder error:", error);
      return res.status(500).json({ error: "Unable to resolve the workflow folder." });
    }
  });

  app.put("/api/workflows/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Workflow history is available only from this machine." });
    }
    if (!isValidWorkflowId(req.params.id)) {
      return res.status(400).json({ error: "Invalid workflow id." });
    }
    try {
      const parsed = workflowRecordSchema.safeParse(req.body);
      if (!parsed.success || parsed.data.id !== req.params.id) {
        return res.status(400).json({ error: "Invalid workflow payload." });
      }
      const record = parseWorkflowRecord(parsed.data) as StoredWorkflowRecord;
      const removed = await putWorkflowRecordToDisk(record);
      return res.json({ success: true, removed });
    } catch (error) {
      console.error("Workflow save error:", error);
      return res.status(500).json({ error: "Unable to save workflow history." });
    }
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Workflow history is available only from this machine." });
    }
    if (!isValidWorkflowId(req.params.id)) {
      return res.status(400).json({ error: "Invalid workflow id." });
    }
    try {
      const deleted = await deleteWorkflowRecordFromDisk(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Workflow not found." });
      return res.json({ success: true });
    } catch (error) {
      console.error("Workflow delete error:", error);
      return res.status(500).json({ error: "Unable to delete that workflow." });
    }
  });

  return httpServer;
}
