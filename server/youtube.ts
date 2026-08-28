import type { Video, SearchFilters, SearchResponse } from "@shared/schema";
import { UploadDateFilter, DurationFilter, SortBy } from "@shared/schema";
import { createHash } from "node:crypto";
import { ProviderError } from "./provider-errors";
import { incrementYouTubeQuota } from "./youtube-quota";

const BASE_URL = "https://www.googleapis.com/youtube/v3";
const TIMEDTEXT_BASE_URL = "https://www.youtube.com/api/timedtext";
const YOUTUBE_TIMEOUT_MS = 15_000;
const CAPTION_TEXT_MAX_CHARS = 20_000;
const COMMENT_THREADS_PER_VIDEO = 50;
const COMMENT_QUESTIONS_PER_VIDEO = 12;

export type CaptionTrackMeta = {
  id?: string;
  language: string;
  name?: string;
  trackKind?: string;
  isAutoSynced?: boolean;
};

export type PublicCaptionResult = {
  videoId: string;
  text?: string;
  language?: string;
  trackKind?: string;
  tracks?: CaptionTrackMeta[];
  skipReason?: string;
  note?: string;
};

export type CommentQuestion = {
  question: string;
  sourceVideoId: string;
  likeCount?: number;
  publishedAt?: string;
  authorDisplayName?: string;
};

if (!process.env.YOUTUBE_API_KEY) {
  console.warn("Warning: YOUTUBE_API_KEY is not set. YouTube search will not work.");
}

function getPublishedAfter(uploadDate: UploadDateFilter): string | undefined {
  const now = new Date();

  switch (uploadDate) {
    case UploadDateFilter.HOUR:
      now.setHours(now.getHours() - 1);
      return now.toISOString();
    case UploadDateFilter.TODAY:
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    case UploadDateFilter.WEEK:
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    case UploadDateFilter.MONTH:
      now.setMonth(now.getMonth() - 1);
      return now.toISOString();
    case UploadDateFilter.YEAR:
      now.setFullYear(now.getFullYear() - 1);
      return now.toISOString();
    default:
      return undefined;
  }
}

function getVideoDuration(duration: DurationFilter): string | undefined {
  switch (duration) {
    case DurationFilter.SHORT:
      return "short";
    case DurationFilter.MEDIUM:
      return "medium";
    case DurationFilter.LONG:
      return "long";
    default:
      return undefined;
  }
}

function getOrderBy(sortBy: SortBy): string {
  switch (sortBy) {
    case SortBy.DATE:
      return "date";
    case SortBy.VIEW_COUNT:
      return "viewCount";
    case SortBy.RATING:
      return "rating";
    default:
      return "relevance";
  }
}

function parseOptionalCount(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getYouTubeErrorReason(body: any): string {
  return [
    body?.error?.message,
    ...(Array.isArray(body?.error?.errors)
      ? body.error.errors.flatMap((entry: any) => [entry?.reason, entry?.message])
      : []),
  ].filter((value): value is string => typeof value === "string").join(" ");
}

function youtubeHttpError(status: number, body: unknown, stage: string): ProviderError {
  const reason = getYouTubeErrorReason(body).toLowerCase();
  const invalidKey = status === 401
    || reason.includes("keyinvalid")
    || reason.includes("api key not valid")
    || reason.includes("invalid api key");
  const quota = status === 429
    || reason.includes("quota")
    || reason.includes("dailylimit")
    || reason.includes("rate limit");

  if (invalidKey) {
    return new ProviderError({
      message: `YouTube rejected the API key during ${stage}.`,
      category: "invalid_key",
      code: "YOUTUBE_INVALID_KEY",
      status: 401,
      retryable: false,
    });
  }
  if (quota) {
    return new ProviderError({
      message: `YouTube quota was unavailable during ${stage}.`,
      category: "quota",
      code: "YOUTUBE_QUOTA",
      status: 429,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new ProviderError({
      message: `YouTube returned a server error during ${stage}.`,
      category: "provider_server",
      code: "YOUTUBE_PROVIDER_SERVER",
      status: 502,
      retryable: true,
    });
  }
  return new ProviderError({
    message: `YouTube rejected the ${stage} request.`,
    category: "unknown",
    code: "YOUTUBE_REQUEST_REJECTED",
    status: 502,
    retryable: false,
  });
}

function requireYouTubeApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderError({
      message: "YouTube API key is not configured.",
      category: "missing_key",
      code: "YOUTUBE_MISSING_KEY",
      status: 503,
      retryable: false,
    });
  }
  return apiKey;
}

async function fetchWithTimeout(url: string, stage: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YOUTUBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError({
        message: `YouTube timed out during ${stage}.`,
        category: "timeout",
        code: "YOUTUBE_TIMEOUT",
        status: 504,
        retryable: true,
        cause: error,
      });
    }
    throw new ProviderError({
      message: `YouTube could not be reached during ${stage}.`,
      category: "network",
      code: "YOUTUBE_NETWORK",
      status: 502,
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYouTubeJson(url: string, stage: string): Promise<any> {
  const response = await fetchWithTimeout(url, stage);
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new ProviderError({
      message: `YouTube returned malformed JSON during ${stage}.`,
      category: "invalid_response",
      code: "YOUTUBE_INVALID_RESPONSE",
      status: 502,
      retryable: false,
      cause: error,
    });
  }
  if (!response.ok) throw youtubeHttpError(response.status, body, stage);
  return body;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripHtml(value: string): string {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function truncateCaptionText(text: string): string {
  if (text.length <= CAPTION_TEXT_MAX_CHARS) return text;
  return `${text.slice(0, CAPTION_TEXT_MAX_CHARS - 1).trimEnd()}…`;
}

export function parseTimedTextTrackList(xml: string): CaptionTrackMeta[] {
  const tracks: CaptionTrackMeta[] = [];
  const trackRegex = /<track\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = trackRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const lang = /lang_code="([^"]+)"/i.exec(attrs)?.[1]
      || /lang_code='([^']+)'/i.exec(attrs)?.[1];
    if (!lang) continue;
    const name = /name="([^"]*)"/i.exec(attrs)?.[1] ?? /name='([^']*)'/i.exec(attrs)?.[1];
    const kind = /kind="([^"]*)"/i.exec(attrs)?.[1] ?? /kind='([^']*)'/i.exec(attrs)?.[1];
    tracks.push({
      language: lang,
      name: name || undefined,
      trackKind: kind || undefined,
    });
  }
  return tracks;
}

export function parseTimedTextBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  if (trimmed.includes("<text")) {
    const chunks: string[] = [];
    const textRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(trimmed)) !== null) {
      const piece = stripHtml(match[1] ?? "");
      if (piece) chunks.push(piece);
    }
    return truncateCaptionText(chunks.join(" ").replace(/\s+/g, " ").trim());
  }

  if (trimmed.includes("WEBVTT") || /^\d{2}:\d{2}/.test(trimmed)) {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line
        && line !== "WEBVTT"
        && !line.startsWith("NOTE")
        && !/^\d+$/.test(line)
        && !/^\d{2}:\d{2}/.test(line)
        && !line.includes("-->"));
    return truncateCaptionText(lines.join(" ").replace(/\s+/g, " ").trim());
  }

  return truncateCaptionText(stripHtml(trimmed));
}

export function isQuestionLikeComment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes("?")) return true;
  return /^(how|what|why|when|where|who|which|can|does|do|did|is|are|will|should|could|would|any|anyone)\b/i.test(trimmed);
}

export function extractQuestionLikeComments(
  comments: Array<{
    text: string;
    likeCount?: number;
    publishedAt?: string;
    authorDisplayName?: string;
  }>,
  sourceVideoId: string,
  limit = COMMENT_QUESTIONS_PER_VIDEO,
): CommentQuestion[] {
  const questions: CommentQuestion[] = [];
  const seen = new Set<string>();
  for (const comment of comments) {
    const question = comment.text.trim().replace(/\s+/g, " ");
    if (!isQuestionLikeComment(question)) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push({
      question: question.slice(0, 500),
      sourceVideoId,
      likeCount: comment.likeCount,
      publishedAt: comment.publishedAt,
      authorDisplayName: comment.authorDisplayName,
    });
    if (questions.length >= limit) break;
  }
  return questions;
}

function pickPreferredCaptionLanguage(tracks: CaptionTrackMeta[]): CaptionTrackMeta | undefined {
  if (tracks.length === 0) return undefined;
  const preferred = ["en", "en-US", "en-GB"];
  for (const language of preferred) {
    const match = tracks.find((track) => track.language.toLowerCase() === language.toLowerCase());
    if (match) return match;
  }
  const asr = tracks.find((track) => (track.trackKind || "").toLowerCase() === "asr");
  return asr || tracks[0];
}

async function listPublicTimedTextTracks(videoId: string): Promise<CaptionTrackMeta[]> {
  const url = `${TIMEDTEXT_BASE_URL}?${new URLSearchParams({ type: "list", v: videoId })}`;
  const response = await fetchWithTimeout(url, "timedtext list");
  if (!response.ok) return [];
  const body = await response.text();
  return parseTimedTextTrackList(body);
}

async function downloadPublicTimedText(videoId: string, language: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    v: videoId,
    lang: language,
    fmt: "srv3",
  });
  const response = await fetchWithTimeout(`${TIMEDTEXT_BASE_URL}?${params}`, "timedtext download");
  if (!response.ok) return undefined;
  const text = parseTimedTextBody(await response.text());
  return text || undefined;
}

async function listCaptionTracksViaDataApi(videoId: string, apiKey: string): Promise<{
  tracks: CaptionTrackMeta[];
  authRequired: boolean;
  errorMessage?: string;
}> {
  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    key: apiKey,
  });
  incrementYouTubeQuota("captions.list");
  try {
    const data = await fetchYouTubeJson(`${BASE_URL}/captions?${params}`, "captions list");
    const tracks: CaptionTrackMeta[] = (Array.isArray(data.items) ? data.items : []).flatMap((item: any) => {
      const language = item?.snippet?.language;
      if (typeof language !== "string" || !language.trim()) return [];
      return [{
        id: typeof item.id === "string" ? item.id : undefined,
        language,
        name: typeof item.snippet?.name === "string" ? item.snippet.name : undefined,
        trackKind: typeof item.snippet?.trackKind === "string" ? item.snippet.trackKind : undefined,
        isAutoSynced: typeof item.snippet?.isAutoSynced === "boolean" ? item.snippet.isAutoSynced : undefined,
      }];
    });
    return { tracks, authRequired: false };
  } catch (error) {
    if (error instanceof ProviderError) {
      if (
        error.category === "quota"
        || error.category === "timeout"
        || error.category === "network"
        || error.category === "provider_server"
        || error.category === "missing_key"
      ) {
        throw error;
      }
      // captions.list for arbitrary public videos usually requires OAuth.
      return {
        tracks: [],
        authRequired: true,
        errorMessage: error.message,
      };
    }
    throw error;
  }
}

/**
 * List public caption metadata via captions.list, then prefer the public timedtext
 * endpoint for text. captions.download requires OAuth and is not used here.
 */
export async function fetchPublicCaptionsForVideo(videoId: string): Promise<PublicCaptionResult> {
  const apiKey = requireYouTubeApiKey();
  const listed = await listCaptionTracksViaDataApi(videoId, apiKey);
  let tracks = listed.tracks;
  let note: string | undefined;

  if (listed.authRequired || tracks.length === 0) {
    const timedTextTracks = await listPublicTimedTextTracks(videoId);
    if (timedTextTracks.length > 0) {
      tracks = timedTextTracks;
      note = listed.authRequired
        ? "captions.list required owner OAuth for this video; used public timedtext instead."
        : "No Data API caption rows; used public timedtext tracks.";
    } else if (listed.authRequired) {
      return {
        videoId,
        tracks: [],
        skipReason: "Caption download needs OAuth for this video, and no public timedtext track was available.",
        note: listed.errorMessage,
      };
    }
  }

  if (tracks.length === 0) {
    return {
      videoId,
      tracks: [],
      skipReason: "No public caption tracks were found for this video.",
      note: listed.errorMessage,
    };
  }

  const preferred = pickPreferredCaptionLanguage(tracks);
  if (!preferred) {
    return {
      videoId,
      tracks,
      skipReason: "Caption tracks were listed but none could be selected.",
      note: "captions.download requires OAuth and was not attempted.",
    };
  }

  const text = await downloadPublicTimedText(videoId, preferred.language);
  if (!text) {
    return {
      videoId,
      language: preferred.language,
      trackKind: preferred.trackKind,
      tracks,
      skipReason: "Public caption tracks exist, but timedtext download returned no text. captions.download needs OAuth.",
      note: note || "Prefer owner OAuth for captions.download when timedtext is unavailable.",
    };
  }

  return {
    videoId,
    text,
    language: preferred.language,
    trackKind: preferred.trackKind,
    tracks,
    note,
  };
}

export async function fetchPublicCaptionsForVideos(videoIds: string[]): Promise<PublicCaptionResult[]> {
  const results: PublicCaptionResult[] = [];
  for (const videoId of videoIds) {
    results.push(await fetchPublicCaptionsForVideo(videoId));
  }
  return results;
}

export async function fetchCommentQuestionsForVideo(videoId: string): Promise<CommentQuestion[]> {
  const apiKey = requireYouTubeApiKey();
  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    maxResults: String(COMMENT_THREADS_PER_VIDEO),
    order: "relevance",
    textFormat: "plainText",
    key: apiKey,
  });
  incrementYouTubeQuota("commentThreads.list");
  const data = await fetchYouTubeJson(`${BASE_URL}/commentThreads?${params}`, "comment threads");
  const comments = (Array.isArray(data.items) ? data.items : []).flatMap((item: any) => {
    const top = item?.snippet?.topLevelComment?.snippet;
    const text = typeof top?.textDisplay === "string"
      ? top.textDisplay
      : typeof top?.textOriginal === "string"
        ? top.textOriginal
        : "";
    if (!text.trim()) return [];
    return [{
      text,
      likeCount: parseOptionalCount(top?.likeCount),
      publishedAt: typeof top?.publishedAt === "string" ? top.publishedAt : undefined,
      authorDisplayName: typeof top?.authorDisplayName === "string" ? top.authorDisplayName : undefined,
    }];
  });
  return extractQuestionLikeComments(comments, videoId);
}

export async function fetchCommentQuestionsForVideos(videoIds: string[]): Promise<CommentQuestion[]> {
  const questions: CommentQuestion[] = [];
  for (const videoId of videoIds) {
    try {
      questions.push(...await fetchCommentQuestionsForVideo(videoId));
    } catch (error) {
      if (error instanceof ProviderError) {
        if (
          error.category === "missing_key"
          || error.category === "quota"
          || error.category === "invalid_key"
        ) {
          throw error;
        }
        // Skip per-video failures such as disabled comments.
        continue;
      }
      throw error;
    }
  }
  return questions;
}

export function createSnapshotId(filters: SearchFilters, orderedVideoIds: string[], retrievedAt: string): string {
  const identity = JSON.stringify({
    query: filters.query.trim(),
    uploadDate: filters.uploadDate,
    duration: filters.duration,
    sortBy: filters.sortBy,
    maxResults: filters.maxResults,
    channelId: filters.channelId?.trim() || undefined,
    orderedVideoIds,
    retrievedAt,
  });
  return `yt_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function provenanceFilters(filters: SearchFilters) {
  return {
    uploadDate: filters.uploadDate,
    duration: filters.duration,
    sortBy: filters.sortBy,
    maxResults: filters.maxResults,
    ...(filters.channelId?.trim() ? { channelId: filters.channelId.trim() } : {}),
  };
}

export async function searchVideos(filters: SearchFilters): Promise<SearchResponse> {
  const apiKey = requireYouTubeApiKey();

  const params = new URLSearchParams({
    part: "snippet",
    q: filters.query,
    type: "video",
    maxResults: String(filters.maxResults || 25),
    key: apiKey,
    order: getOrderBy(filters.sortBy),
  });

  const publishedAfter = getPublishedAfter(filters.uploadDate);
  if (publishedAfter) {
    params.set("publishedAfter", publishedAfter);
  }

  const videoDuration = getVideoDuration(filters.duration);
  if (videoDuration) {
    params.set("videoDuration", videoDuration);
  }
  if (filters.channelId?.trim()) {
    params.set("channelId", filters.channelId.trim());
  }

  const searchUrl = `${BASE_URL}/search?${params}`;
  incrementYouTubeQuota("search.list");
  const searchData = await fetchYouTubeJson(searchUrl, "search");
  const retrievedAt = new Date().toISOString();
  const warnings: SearchResponse["warnings"] = [];
  if (!Array.isArray(searchData.items)) {
    throw new ProviderError({
      message: "YouTube returned an invalid search response.",
      category: "invalid_response",
      code: "YOUTUBE_INVALID_RESPONSE",
      status: 502,
      retryable: false,
    });
  }

  if (searchData.items.length === 0) {
    const orderedVideoIds: string[] = [];
    return {
      videos: [],
      totalResults: 0,
      resultsPerPage: 0,
      regionCode: typeof searchData.regionCode === "string" ? searchData.regionCode : undefined,
      snapshotId: createSnapshotId(filters, orderedVideoIds, retrievedAt),
      retrievedAt,
      totalResultsIsApproximate: true,
      provenance: {
        provider: "youtube-data-api-v3",
        query: filters.query.trim(),
        filters: provenanceFilters(filters),
        orderedVideoIds,
      },
      enrichment: {
        search: { status: "complete", requested: filters.maxResults, returned: 0 },
        videoDetails: { status: "skipped", requested: 0, returned: 0 },
        channels: { status: "skipped", requested: 0, returned: 0 },
      },
      warnings,
    };
  }

  const orderedVideoIds: string[] = searchData.items
    .map((item: any) => item.id?.videoId)
    .filter((id: unknown): id is string => typeof id === "string");
  if (orderedVideoIds.length !== searchData.items.length) {
    warnings.push({
      code: "SEARCH_ITEMS_OMITTED",
      stage: "search",
      message: "Some search rows did not contain a public video identifier and were omitted.",
    });
  }
  if (orderedVideoIds.length === 0) {
    return {
      videos: [],
      totalResults: parseOptionalCount(searchData.pageInfo?.totalResults) ?? 0,
      resultsPerPage: parseOptionalCount(searchData.pageInfo?.resultsPerPage) ?? 0,
      regionCode: typeof searchData.regionCode === "string" ? searchData.regionCode : undefined,
      snapshotId: createSnapshotId(filters, orderedVideoIds, retrievedAt),
      retrievedAt,
      totalResultsIsApproximate: true,
      provenance: {
        provider: "youtube-data-api-v3",
        query: filters.query.trim(),
        filters: provenanceFilters(filters),
        orderedVideoIds,
      },
      enrichment: {
        search: { status: "partial", requested: filters.maxResults, returned: 0 },
        videoDetails: { status: "skipped", requested: 0, returned: 0 },
        channels: { status: "skipped", requested: 0, returned: 0 },
      },
      warnings,
    };
  }
  const videoIds = orderedVideoIds.join(",");

  const detailsParams = new URLSearchParams({
    part: "snippet,statistics,contentDetails,status,topicDetails,paidProductPlacementDetails,liveStreamingDetails",
    id: videoIds,
    key: apiKey,
  });

  const detailsUrl = `${BASE_URL}/videos?${detailsParams}`;
  incrementYouTubeQuota("videos.list");
  const detailsData = await fetchYouTubeJson(detailsUrl, "video details");
  if (!Array.isArray(detailsData.items)) {
    throw new ProviderError({
      message: "YouTube returned an invalid video-details response.",
      category: "invalid_response",
      code: "YOUTUBE_INVALID_RESPONSE",
      status: 502,
      retryable: false,
    });
  }
  if (detailsData.items.length !== orderedVideoIds.length) {
    warnings.push({
      code: "VIDEO_DETAILS_PARTIAL",
      stage: "video_details",
      message: "Some search results no longer had public video details and were omitted.",
    });
  }
  const channelIds = Array.from(new Set(
    detailsData.items
      .map((item: any) => item.snippet?.channelId)
      .filter((id: unknown): id is string => typeof id === "string"),
  ));

  const channelDetails = new Map<string, any>();
  let channelStatus: "complete" | "partial" | "skipped" = channelIds.length > 0 ? "complete" : "skipped";
  if (channelIds.length > 0) {
    const channelParams = new URLSearchParams({
      part: "snippet,statistics,topicDetails,brandingSettings",
      id: channelIds.join(","),
      maxResults: "50",
      key: apiKey,
    });

    try {
      const channelData = await fetchYouTubeJson(`${BASE_URL}/channels?${channelParams}`, "channel enrichment");
      for (const channel of Array.isArray(channelData.items) ? channelData.items : []) {
        channelDetails.set(channel.id, channel);
      }
      if (channelDetails.size !== channelIds.length) channelStatus = "partial";
    } catch {
      channelStatus = "partial";
    }
    if (channelStatus === "partial") {
      warnings.push({
        code: "CHANNEL_ENRICHMENT_PARTIAL",
        stage: "channel_enrichment",
        message: "Channel-level public metadata was unavailable for some or all videos.",
      });
    }
  }

  const detailsById = new Map<string, any>(
    detailsData.items.map((item: any) => [item.id, item]),
  );

  const videos: Video[] = orderedVideoIds.flatMap((id) => {
    const item = detailsById.get(id);
    if (!item) return [];
    const channel = channelDetails.get(item.snippet.channelId);
    const channelStats = channel?.statistics;

    return [{
      id: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails?.maxres?.url
        || item.snippet.thumbnails?.standard?.url
        || item.snippet.thumbnails?.high?.url
        || item.snippet.thumbnails?.medium?.url
        || item.snippet.thumbnails?.default?.url,
      description: item.snippet.description,
      viewCount: parseOptionalCount(item.statistics?.viewCount),
      likeCount: parseOptionalCount(item.statistics?.likeCount),
      commentCount: parseOptionalCount(item.statistics?.commentCount),
      duration: item.contentDetails?.duration,
      tags: item.snippet.tags,
      categoryId: item.snippet.categoryId,
      liveBroadcastContent: item.snippet.liveBroadcastContent,
      defaultLanguage: item.snippet.defaultLanguage,
      defaultAudioLanguage: item.snippet.defaultAudioLanguage,
      definition: item.contentDetails?.definition,
      hasCaptions: item.contentDetails?.caption === "true"
        ? true
        : item.contentDetails?.caption === "false"
          ? false
          : undefined,
      licensedContent: item.contentDetails?.licensedContent,
      embeddable: item.status?.embeddable,
      madeForKids: item.status?.madeForKids,
      hasPaidProductPlacement: item.paidProductPlacementDetails?.hasPaidProductPlacement,
      topicCategories: item.topicDetails?.topicCategories,
      liveStreamingDetails: item.liveStreamingDetails ? {
        actualStartTime: item.liveStreamingDetails.actualStartTime,
        actualEndTime: item.liveStreamingDetails.actualEndTime,
        scheduledStartTime: item.liveStreamingDetails.scheduledStartTime,
        concurrentViewers: parseOptionalCount(item.liveStreamingDetails.concurrentViewers),
      } : undefined,
      channelStatistics: channel ? {
        subscriberCount: channelStats?.hiddenSubscriberCount
          ? undefined
          : parseOptionalCount(channelStats?.subscriberCount),
        hiddenSubscriberCount: Boolean(channelStats?.hiddenSubscriberCount),
        videoCount: parseOptionalCount(channelStats?.videoCount),
        viewCount: parseOptionalCount(channelStats?.viewCount),
        publishedAt: channel.snippet?.publishedAt,
        country: channel.snippet?.country,
        thumbnailUrl: channel.snippet?.thumbnails?.default?.url,
        description: channel.snippet?.description,
        customUrl: channel.snippet?.customUrl,
        defaultLanguage: channel.brandingSettings?.channel?.defaultLanguage,
        keywords: channel.brandingSettings?.channel?.keywords,
        topicCategories: channel.topicDetails?.topicCategories,
      } : undefined,
    }];
  });

  return {
    videos,
    totalResults: searchData.pageInfo?.totalResults || videos.length,
    nextPageToken: searchData.nextPageToken,
    resultsPerPage: searchData.pageInfo?.resultsPerPage || videos.length,
    regionCode: searchData.regionCode,
    snapshotId: createSnapshotId(filters, orderedVideoIds, retrievedAt),
    retrievedAt,
    totalResultsIsApproximate: true,
    provenance: {
      provider: "youtube-data-api-v3",
      query: filters.query.trim(),
      filters: provenanceFilters(filters),
      orderedVideoIds,
    },
    enrichment: {
      search: { status: "complete", requested: filters.maxResults, returned: orderedVideoIds.length },
      videoDetails: {
        status: detailsData.items.length === orderedVideoIds.length ? "complete" : "partial",
        requested: orderedVideoIds.length,
        returned: detailsData.items.length,
      },
      channels: {
        status: channelStatus,
        requested: channelIds.length,
        returned: channelDetails.size,
      },
    },
    warnings,
  };
}
