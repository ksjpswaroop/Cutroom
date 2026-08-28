import {
  DEFAULT_TELEPROMPTER_WPM,
  chaptersFromScript,
  resolveChaptersWithPace,
} from "@shared/pace-chapters";
import type { PublishPackageOutput, PublishPackageRequest } from "./package-contract";

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(normalizeKey(value).split(" ").filter((token) => token.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** True when a package title is grounded in an observed research-title sample. */
export function titleMatchesObservedSample(title: string, samples: readonly string[]): boolean {
  const normalizedTitle = normalizeKey(title);
  if (!normalizedTitle || samples.length === 0) return false;
  const titleTokens = tokenize(title);

  for (const sample of samples) {
    const normalizedSample = normalizeKey(sample);
    if (!normalizedSample) continue;
    if (normalizedTitle === normalizedSample) return true;
    if (normalizedTitle.length >= 12 && normalizedSample.includes(normalizedTitle)) return true;
    if (normalizedSample.length >= 12 && normalizedTitle.includes(normalizedSample)) return true;
    if (jaccard(titleTokens, tokenize(sample)) >= 0.6) return true;
  }
  return false;
}

function dedupeTags(tags: readonly string[], max = 20): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, 60));
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Prefer snapshot-observed tags (listed first) and label titles/tags observed vs inferred (L-611).
 * Additive `tagEvidence` keeps the string[] `tags` field intact for existing clients.
 */
export function applyObservedPackageEvidence(
  pkg: PublishPackageOutput,
  request: Pick<PublishPackageRequest, "observedTags" | "observedTitleSamples">,
): PublishPackageOutput {
  const observedTags = dedupeTags(request.observedTags ?? [], 20);
  const titleSamples = (request.observedTitleSamples ?? [])
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, 30);
  const observedTagKeys = new Set(observedTags.map(normalizeKey));

  const titles = pkg.titles.map((item) => {
    if (item.evidenceClass === "requires_studio") return item;
    const matched = titleMatchesObservedSample(item.title, titleSamples);
    if (matched) {
      return {
        ...item,
        evidenceClass: "observed" as const,
        rationale: /observed|snapshot/i.test(item.rationale)
          ? item.rationale
          : `${item.rationale} Grounded in snapshot title sample.`,
      };
    }
    if (item.evidenceClass === "observed" && titleSamples.length > 0) {
      return {
        ...item,
        evidenceClass: "inferred" as const,
        rationale: /inferred/i.test(item.rationale)
          ? item.rationale
          : `${item.rationale} Relabeled inferred — not found in snapshot title samples.`,
      };
    }
    return item;
  });

  const mergedTags = dedupeTags([...observedTags, ...pkg.tags], 20);
  const tags = mergedTags.length >= 5 ? mergedTags : pkg.tags;
  const tagEvidence = tags.map((tag) => ({
    tag,
    evidenceClass: (observedTagKeys.has(normalizeKey(tag)) ? "observed" : "inferred") as
      | "observed"
      | "inferred",
  }));

  return {
    ...pkg,
    titles,
    tags,
    tagEvidence,
  };
}

/** Replace or validate model chapters with teleprompter-pace timestamps when script is present (L-612). */
export function applyPaceChapters(
  pkg: PublishPackageOutput,
  scriptContent: string | null | undefined,
  wpm: number = DEFAULT_TELEPROMPTER_WPM,
): PublishPackageOutput {
  const script = scriptContent?.trim();
  if (!script) return pkg;

  const paceChapters = chaptersFromScript(script, wpm);
  if (paceChapters.length === 0) return pkg;

  const chapters = resolveChaptersWithPace(pkg.chapters, paceChapters).slice(0, 40);
  return { ...pkg, chapters };
}

export function finalizePublishPackage(
  pkg: PublishPackageOutput,
  request: PublishPackageRequest,
): PublishPackageOutput {
  return applyPaceChapters(
    applyObservedPackageEvidence(pkg, request),
    request.scriptContent,
  );
}
