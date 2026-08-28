/**
 * In-process YouTube Data API v3 session quota soft meter.
 *
 * Costs (official Data API quota units; see
 * https://developers.google.com/youtube/v3/determine_quota_cost):
 * - search.list = 100
 * - videos.list = 1
 * - captions.list = 50
 * - commentThreads.list = 1
 *
 * This is a session meter for the current Node process only. It does not
 * sync with Google's daily project quota and does not reset on a calendar day
 * (`resetsAt` is always null). Restarting the server clears `used`.
 */

export const YOUTUBE_QUOTA_LIMIT = 10_000;

/** Documented Data API unit costs for tracked methods. */
export const YOUTUBE_QUOTA_COSTS = {
  "search.list": 100,
  "videos.list": 1,
  "captions.list": 50,
  "commentThreads.list": 1,
} as const;

export type YouTubeQuotaMethod = keyof typeof YOUTUBE_QUOTA_COSTS;

let usedUnits = 0;

export function getYouTubeQuotaCost(method: YouTubeQuotaMethod): number {
  return YOUTUBE_QUOTA_COSTS[method];
}

export function incrementYouTubeQuota(method: YouTubeQuotaMethod, times = 1): number {
  if (!Number.isInteger(times) || times < 1) {
    throw new Error("YouTube quota increment times must be a positive integer.");
  }
  const delta = getYouTubeQuotaCost(method) * times;
  usedUnits += delta;
  return usedUnits;
}

export function getYouTubeQuotaUsage(): {
  used: number;
  remaining: number;
  limit: typeof YOUTUBE_QUOTA_LIMIT;
  resetsAt: null;
} {
  const used = usedUnits;
  return {
    used,
    remaining: Math.max(0, YOUTUBE_QUOTA_LIMIT - used),
    limit: YOUTUBE_QUOTA_LIMIT,
    resetsAt: null,
  };
}

/** Test helper: clear the in-memory session meter. */
export function resetYouTubeQuotaForTests(): void {
  usedUnits = 0;
}
