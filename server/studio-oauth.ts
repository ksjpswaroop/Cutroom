/**
 * Optional YouTube Studio OAuth mirror scaffold (L-314 / L-506).
 * Never required for the public Research → Package path.
 * Until OAuth credentials are configured, endpoints return clearly labeled requires_studio stubs.
 */
import { z } from "zod";

export const studioMirrorStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  label: z.literal("Observed-for-owner"),
  evidenceClass: z.literal("requires_studio"),
  message: z.string(),
});

export type StudioMirrorStatus = z.infer<typeof studioMirrorStatusSchema>;

export function getStudioMirrorStatus(): StudioMirrorStatus {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN?.trim();
  const configured = Boolean(clientId && clientSecret);
  const connected = Boolean(configured && refreshToken);

  if (!configured) {
    return {
      configured: false,
      connected: false,
      label: "Observed-for-owner",
      evidenceClass: "requires_studio",
      message: "Studio OAuth is optional and off. Core Cutroom uses public Data API only. Add YOUTUBE_OAUTH_CLIENT_ID/SECRET to enable an owner-only metrics mirror.",
    };
  }

  if (!connected) {
    return {
      configured: true,
      connected: false,
      label: "Observed-for-owner",
      evidenceClass: "requires_studio",
      message: "OAuth client is present, but no refresh token is stored yet. Complete the owner consent flow before reading Studio metrics.",
    };
  }

  return {
    configured: true,
    connected: true,
    label: "Observed-for-owner",
    evidenceClass: "requires_studio",
    message: "Owner Studio mirror credentials are present. Metrics must stay labeled Observed-for-owner and never mix into public snapshot evidence.",
  };
}

export function studioMetricsPlaceholder(videoId?: string) {
  const status = getStudioMirrorStatus();
  return {
    ...status,
    videoId: videoId || null,
    metrics: null as null,
    note: "No Studio metrics are returned until the OAuth mirror is fully connected. This response is intentionally empty rather than inventing CTR/retention.",
  };
}
