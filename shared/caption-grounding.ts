import type { EvidenceClaim } from "./evidence-contracts";

export interface CaptionExcerptInput {
  videoId: string;
  text: string;
}

export interface CaptionGroundedInsights<TClaim extends EvidenceClaim = EvidenceClaim> {
  evidenceClaims: TClaim[];
  methodology: { limitations: string[] };
}

const CAPTION_LIMITATION = "Quoted from a public caption excerpt only. Not a Studio metric, demand signal, or audience identity.";

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function excerptQuote(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 180);
}

function alreadyQuotesExcerpt(claims: readonly EvidenceClaim[], excerpt: CaptionExcerptInput): boolean {
  const text = normalizeText(excerpt.text);
  if (text.length < 12) return false;
  const needle = text.slice(0, Math.min(24, text.length));
  return claims.some((claim) => (
    claim.evidenceClass === "observed"
    && claim.sourceVideoIds.includes(excerpt.videoId)
    && normalizeText(claim.claim).includes(needle)
  ));
}

/**
 * Keep public caption excerpts on the insight record when a cheap or local
 * model drops them. Quotes are slices of the supplied excerpt only.
 */
export function groundInsightsWithCaptions<T extends CaptionGroundedInsights>(
  insights: T,
  excerpts: readonly CaptionExcerptInput[],
  snapshotId: string,
  allowedVideoIds: readonly string[],
): T {
  const allowed = new Set(allowedVideoIds);
  const usable = excerpts.filter((excerpt) => excerpt.videoId && excerpt.text.trim() && allowed.has(excerpt.videoId));
  if (usable.length === 0) return insights;

  const evidenceClaims = insights.evidenceClaims.map((claim) => ({
    ...claim,
    sourceVideoIds: [...claim.sourceVideoIds],
    limitations: [...claim.limitations],
  }));
  let added = false;

  for (const excerpt of usable) {
    if (alreadyQuotesExcerpt(evidenceClaims, excerpt)) continue;
    if (evidenceClaims.length >= 24) break;
    const quote = excerptQuote(excerpt.text);
    if (!quote) continue;
    const baseId = `caption-${excerpt.videoId}`;
    let id = baseId;
    let suffix = 2;
    const taken = new Set(evidenceClaims.map((claim) => claim.id));
    while (taken.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    evidenceClaims.push({
      id,
      claim: `Public caption excerpt: "${quote}"`,
      evidenceClass: "observed",
      sourceVideoIds: [excerpt.videoId],
      confidence: "high",
      limitations: [CAPTION_LIMITATION],
      snapshotId,
    } as T["evidenceClaims"][number]);
    added = true;
  }

  if (!added) {
    return { ...insights, evidenceClaims };
  }

  const limitations = insights.methodology.limitations.some((item) => /caption/i.test(item))
    || insights.methodology.limitations.length >= 10
    ? insights.methodology.limitations
    : [
      ...insights.methodology.limitations,
      "Public caption excerpts were attached as observed claims when the model omitted them.",
    ];

  return {
    ...insights,
    evidenceClaims,
    methodology: { ...insights.methodology, limitations },
  };
}

/** Compact instructions appended for non-Gemini text providers. */
export function localCaptionInsightInstructions(excerpts: readonly CaptionExcerptInput[]): string {
  if (excerpts.length === 0) {
    return "No public caption excerpts were supplied. Do not invent transcript lines, spoken quotes, or on-screen text.";
  }
  return [
    "Cheap or local model caption grounding:",
    "Treat each excerpt as observed public speech or on-screen text for that videoId only.",
    "Copy one short quoted phrase from each excerpt into an observed evidence claim with that exact source video ID.",
    "Do not invent transcript lines. Do not upgrade captions into Studio metrics, demand, or audience identity.",
    JSON.stringify(excerpts.map((excerpt) => ({
      videoId: excerpt.videoId,
      text: excerpt.text.slice(0, 4_000),
    }))),
  ].join("\n");
}
