import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  fetchCommentQuestionsForVideos,
  fetchPublicCaptionsForVideos,
  searchVideos,
} from "./youtube";
import { getYouTubeQuotaUsage } from "./youtube-quota";
import { generateScript, generateIdeas, generateResearchInsights, regenerateTitles, regenerateSection, regenerateParagraph, generateThumbnail, generateThumbnailSuggestions, extractNarrationText, generatePublishPackage, generateProductionBrief, critiqueThumbnail } from "./gemini";
import {
  ideaGenerationRequestSchema,
  researchCaptionsRequestSchema,
  researchCommentQuestionsRequestSchema,
  researchInsightsRequestSchema,
  searchFiltersSchema,
  scriptInputSchema,
} from "@shared/schema";
import { z } from "zod";
import { apiKeySettingsSchema, getApiKeyStatusAsync, isLocalSettingsRequest, saveApiKeySettings } from "./settings";
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
import {
  assemblePreviewRequestSchema,
  getAssemblePreviewStatus,
  renderAssemblePreview,
  resolveWorkflowPreviewPath,
} from "./assemble-preview";
import {
  brandKitUpdateSchema,
  readBrandKit,
  writeBrandKit,
} from "./brand-kit";
import { createReadStream } from "node:fs";
import { access as fsAccess, constants as fsConstants } from "node:fs/promises";
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
import { createRateLimiter } from "./rate-limit";
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

function getUserFriendlyError(error: any, context: string): { message: string; suggestion: string } {
  const errorMessage = error?.message?.toLowerCase() || "";

  if (errorMessage.includes("api key") || errorMessage.includes("authentication") || errorMessage.includes("unauthorized")) {
    return {
      message: `${context} is temporarily unavailable`,
      suggestion: "Please try again in a moment. If the problem persists, contact support."
    };
  }

  if (errorMessage.includes("rate limit") || errorMessage.includes("quota") || errorMessage.includes("too many")) {
    return {
      message: `${context} is experiencing high demand`,
      suggestion: "Please wait a minute and try again."
    };
  }

  if (errorMessage.includes("timeout") || errorMessage.includes("timed out") || errorMessage.includes("network")) {
    return {
      message: `${context} took too long to respond`,
      suggestion: "Please check your connection and try again."
    };
  }

  if (errorMessage.includes("content") || errorMessage.includes("safety") || errorMessage.includes("blocked")) {
    return {
      message: `${context} couldn't process this content`,
      suggestion: "Try rephrasing your request or using different keywords."
    };
  }

  return {
    message: `${context} encountered an issue`,
    suggestion: "Please try again. If the problem persists, try refreshing the page."
  };
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

  app.put("/api/settings/preferences", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLocalSettingsRequest(req)) {
      return res.status(403).json({ error: "Settings are available only from this machine." });
    }
    try {
      const input = preferencesUpdateSchema.parse(req.body);
      const preferences = await writePreferences(input);
      const assemble = await getAssemblePreviewStatus();
      return res.json({ success: true, preferences, assemblePreview: assemble });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Unable to save preferences.",
      });
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

  app.post("/api/package/clip-briefs", rateLimit, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
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
      const briefs = clipBriefsFromScript(parsed.data.scriptContent, {
        wpm: parsed.data.wpm,
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
      return res.json(await getAssemblePreviewStatus());
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
      await fsAccess(previewPath, fsConstants.R_OK);
      res.setHeader("Content-Type", "video/mp4");
      createReadStream(previewPath).pipe(res);
    } catch (error) {
      console.error("Preview file error:", error);
      return res.status(500).json({ error: "Unable to read preview.mp4." });
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

  app.get("/api/youtube/search", rateLimit, async (req, res) => {
    try {
      const { query, uploadDate, duration, sortBy, maxResults, channelId } = req.query;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query parameter is required" });
      }

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
        return res.status(400).json({ error: "Invalid search parameters", details: error.errors });
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
          details: parsed.error.errors,
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

  app.post("/api/research/comment-questions", rateLimit, async (req, res) => {
    try {
      const parsed = researchCommentQuestionsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Between 1 and 3 video IDs are required.",
          code: "RESEARCH_COMMENT_QUESTIONS_REQUEST_INVALID",
          details: parsed.error.errors,
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

  app.post("/api/script/generate", rateLimit, async (req, res) => {
    try {
      const input = scriptInputSchema.parse(req.body);
      const result = await generateScript(input);
      res.json(result);
    } catch (error: any) {
      console.error("Script generation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid script input", details: error.errors });
      }
      const friendly = getUserFriendlyError(error, "Script generation");
      res.status(500).json({ error: friendly.message, suggestion: friendly.suggestion });
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
        return res.status(400).json({ error: "Invalid narration extraction request", details: error.errors });
      }
      const friendly = getUserFriendlyError(error, "Narration extraction");
      res.status(500).json({ error: friendly.message, suggestion: friendly.suggestion });
    }
  });

  app.post("/api/ideas/generate", rateLimit, async (req, res) => {
    try {
      const parsed = ideaGenerationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid grounded idea request", details: parsed.error.errors });
      }

      const result = await generateIdeas(parsed.data);
      res.json(result);
    } catch (error: unknown) {
      console.error("Ideas generation error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini Ideas"));
    }
  });

  app.post("/api/research/insights", rateLimit, async (req, res) => {
    try {
      const parsed = researchInsightsRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "A query and between 1 and 50 valid videos are required.",
          code: "RESEARCH_REQUEST_INVALID",
          details: parsed.error.errors,
        });
      }

      const result = await generateResearchInsights(parsed.data);
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
        return res.status(400).json({ error: "Invalid title regeneration request", details: error.errors });
      }
      const friendly = getUserFriendlyError(error, "Title regeneration");
      res.status(500).json({ error: friendly.message, suggestion: friendly.suggestion });
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

  app.post("/api/thumbnail/generate", rateLimit, async (req, res) => {
    try {
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

      const { topic, ...config } = parsed.data;
      const result = await generateThumbnail(topic, config);
      res.json(result);
    } catch (error: unknown) {
      console.error("Thumbnail generation error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini image generation"));
    }
  });

  app.post("/api/thumbnail/suggestions", rateLimit, async (req, res) => {
    try {
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

      const suggestions = await generateThumbnailSuggestions(parsed.data);
      res.json({ suggestions });
    } catch (error: unknown) {
      console.error("Thumbnail suggestions error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini thumbnail suggestions"));
    }
  });

  app.post("/api/package/generate", rateLimit, async (req, res) => {
    try {
      const parsed = publishPackageRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid publish package request",
          details: parsed.error.flatten(),
        });
      }
      const result = await generatePublishPackage(parsed.data);
      res.json(result);
    } catch (error: unknown) {
      console.error("Publish package error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini publish package"));
    }
  });

  app.post("/api/package/production-brief", rateLimit, async (req, res) => {
    try {
      const parsed = productionBriefRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid production brief request",
          details: parsed.error.flatten(),
        });
      }
      const result = await generateProductionBrief(parsed.data);
      res.json(result);
    } catch (error: unknown) {
      console.error("Production brief error:", error);
      const providerError = normalizeProviderError(error, "gemini");
      res.status(providerError.status).json(providerErrorPayload(providerError, "Gemini production brief"));
    }
  });

  app.post("/api/thumbnail/critique", rateLimit, async (req, res) => {
    try {
      const parsed = thumbnailCritiqueRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid thumbnail critique request",
          details: parsed.error.flatten(),
        });
      }
      const result = await critiqueThumbnail(parsed.data);
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
