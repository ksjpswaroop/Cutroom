import { ProviderError } from "../provider-errors";
import { MINIMAX_H3_DURATION_SEC, MINIMAX_H3_MODEL, minimaxConfigured } from "../minimax";
import { generateHailuoH3Clip } from "../minimax-h3";
import type {
  AiVideoClipRequest,
  AiVideoClipResult,
  AiVideoGenerateOptions,
  AiVideoProvider,
  AiVideoQuote,
} from "./types";

/**
 * PS-201: MiniMax Hailuo H3 video provider, wrapping `generateHailuoH3Clip` behind
 * the `AiVideoProvider` interface. `quote()` is pure (no network, no charge) and
 * caps shots at 5 (Shorts-first, PS-002). `generateClip()` is the charging call and
 * fails closed with a clear error when no key is configured; it forwards an injected
 * fetch so tests never hit the live provider.
 */
function clampShots(request: AiVideoClipRequest): number {
  const fromBoard = request.board?.shots?.length;
  return Math.min(5, Math.max(1, fromBoard || request.maxShots || 1));
}

function clampDuration(request: AiVideoClipRequest): number {
  return Math.min(15, Math.max(4, request.durationSec || MINIMAX_H3_DURATION_SEC));
}

export function createMiniMaxVideoProvider(): AiVideoProvider {
  return {
    id: "minimax",
    quote(request: AiVideoClipRequest): AiVideoQuote {
      const shots = clampShots(request);
      const estimatedDurationSec = clampDuration(request);
      return {
        provider: "minimax",
        model: MINIMAX_H3_MODEL,
        shots,
        estimatedDurationSec,
        note: `MiniMax Hailuo H3 (Pay-as-you-go). ~${estimatedDurationSec}s/clip, up to ${shots} shot(s). Quote only — nothing is charged until you confirm generate.`,
      };
    },
    async generateClip(
      request: AiVideoClipRequest,
      options: AiVideoGenerateOptions = {},
    ): Promise<AiVideoClipResult> {
      if (!minimaxConfigured()) {
        throw new ProviderError({
          message: "MiniMax API key is not configured.",
          category: "missing_key",
          code: "MINIMAX_MISSING_KEY",
          status: 503,
          retryable: false,
        });
      }
      const { durationSec, model } = await generateHailuoH3Clip({
        topic: request.topic,
        title: request.title,
        scriptContent: request.scriptContent,
        board: request.board,
        thumbnailDataUrl: request.thumbnailDataUrl,
        maxShots: request.maxShots,
        durationSec: request.durationSec,
        dest: request.dest,
        fetchImpl: options.fetchImpl,
        pollMs: options.pollMs,
        maxPolls: options.maxPolls,
      });
      return {
        path: request.dest,
        providerId: "minimax",
        model,
        durationSec,
        usesVeo: true,
      };
    },
  };
}
