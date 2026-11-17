import { getTextProvider, resolveAiProviderId, type AiTextProvider } from "./ai";
import { extractJsonText } from "./ai/json-extract";
import type { ChannelMemory } from "./creator-store";
import {
  audienceAvatarSchema,
  audiencePersonaSchema,
  channelIntelligenceSchema,
  humanizeResultSchema,
  type AudiencePersona,
  type ChannelIntelligence,
  type HumanizeResult,
} from "@shared/creator-modules";

/**
 * Options for the provider-grounded generators (L-801 / L-802). A caller may
 * inject a text provider (tests pass a fake; production omits it and the active
 * Cutroom provider is resolved) and optional grounding context. When no provider
 * is configured or the call fails, each generator returns its deterministic
 * fallback — the label stays `inferred` on every path, and is never taken from
 * provider output, so a model cannot relabel a synthesized finding as observed.
 */
export interface CreatorGenOptions {
  provider?: AiTextProvider;
  memory?: ChannelMemory;
}

const asText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const asTextList = (value: unknown, max: number, itemMax: number): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => asText(item, itemMax))
        .filter((item) => item.length > 0)
        .slice(0, max)
    : [];

/**
 * Creator-intelligence generators folded into Cutroom. Channel intelligence,
 * personas, and the audience avatar are deterministic and labeled `inferred` —
 * they are
 * synthesized strategy, never observed snapshot claims. Humanize routes through
 * the active Cutroom text provider (Gemini / Ollama / OpenRouter /
 * OpenAI-compatible / MiniMax) and falls back to a deterministic rewrite when no
 * provider is configured or the call fails.
 */

// ── deterministic helpers (ported) ─────────────────────────────────────────────

const STOP = new Set(["the", "and", "for", "with", "how", "why", "your", "you", "that", "this", "are", "about"]);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

function pickN<T>(arr: T[], n: number, seed: number): T[] {
  const r = rng(seed);
  const pool = arr.slice();
  const out: T[] = [];
  while (out.length < Math.min(n, arr.length) && pool.length) {
    out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const keywords = (topic: string): string[] =>
  topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

// ── Channel intelligence (inferred) ────────────────────────────────────────────

const CHANNEL_LIMITATIONS = [
  "Synthesized from your own channel inputs, not from a research snapshot or YouTube Studio.",
  "Directional strategy, not a measured forecast — validate against your own analytics.",
];

export function analyzeChannelIntelligence(niche: string, scriptTitles: string[]): ChannelIntelligence {
  const k = keywords(niche);
  const root = k[0] ?? "your niche";
  const bundle = {
    niche: niche.trim() || "your niche",
    evidenceClass: "inferred" as const,
    confidence: "low" as const,
    performance: `You have ${scriptTitles.length} script${scriptTitles.length === 1 ? "" : "s"} drafted in ${root}. Cadence and topic clustering look ${scriptTitles.length >= 4 ? "healthy" : "thin — aim for a tighter topical cluster"}.`,
    gaps: [
      `Intermediate-tier ${root} content (most channels skip it)`,
      `A "${cap(root)} mistakes" angle is underused`,
      "A beginner series to capture search intent",
    ],
    growth: [
      "Publish a 5-part beginner series to build session watch-time",
      "Repackage your best script as a Short plus a written post",
      "Add chapters to every video to lift retention",
    ],
    benchmark: `Versus comparable ${root} channels, your packaging is competitive; content-gap coverage is the biggest opportunity.`,
    limitations: CHANNEL_LIMITATIONS,
    provider: "deterministic",
    generatedAt: new Date().toISOString(),
  };
  return channelIntelligenceSchema.parse(bundle);
}

function channelPrompt(niche: string, scriptTitles: string[], memory?: ChannelMemory): string {
  const lines = [
    "You are a YouTube channel strategist. Analyze this channel and return strategy.",
    `Niche: ${niche || "(unspecified)"}`,
    `Drafted script count: ${scriptTitles.length}`,
  ];
  if (scriptTitles.length) lines.push(`Recent titles: ${scriptTitles.slice(0, 20).join(" | ")}`);
  if (memory) {
    lines.push(
      `Channel memory — production items: ${memory.production}, personas: ${memory.personas}, ` +
        `stage breakdown: ${Object.entries(memory.stageBreakdown)
          .map(([stage, count]) => `${stage}=${count}`)
          .join(", ")}.`,
    );
  }
  lines.push(
    "",
    "Return ONLY JSON of the form",
    '{"performance":"<one paragraph>","gaps":["<gap>",...],"growth":["<idea>",...],"benchmark":"<one paragraph>"}.',
    "Do not include scores, view counts, or any claim you cannot ground in the inputs above.",
  );
  return lines.join("\n");
}

/**
 * L-801: provider-grounded channel intelligence. Synthesizes performance / gaps /
 * growth / benchmark through the active (or injected) text provider, grounded in
 * the niche, drafted titles, and channel memory. The `inferred` label and the
 * limitations are stamped by this code, never read from the model, so no path can
 * emit an `observed` or unlabeled finding. Falls back to the deterministic
 * template when no provider is configured or the call/parse fails.
 */
export async function generateChannelIntelligence(
  niche: string,
  scriptTitles: string[],
  opts: CreatorGenOptions = {},
): Promise<ChannelIntelligence> {
  const fallback = analyzeChannelIntelligence(niche, scriptTitles);
  try {
    const provider = opts.provider ?? getTextProvider(resolveAiProviderId());
    const result = await provider.completeJson({ prompt: channelPrompt(niche, scriptTitles, opts.memory) });
    const parsed = JSON.parse(extractJsonText(result.text)) as Record<string, unknown>;
    const performance = asText(parsed.performance, 2_000);
    const gaps = asTextList(parsed.gaps, 8, 2_000);
    const growth = asTextList(parsed.growth, 8, 2_000);
    const benchmark = asText(parsed.benchmark, 2_000);
    if (performance && gaps.length && growth.length && benchmark) {
      return channelIntelligenceSchema.parse({
        niche: niche.trim() || "your niche",
        evidenceClass: "inferred" as const, // code-controlled; never from the model
        confidence: "low" as const,
        performance,
        gaps,
        growth,
        benchmark,
        limitations: CHANNEL_LIMITATIONS,
        provider: result.providerId,
        generatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // No provider configured, or the call/parse failed — deterministic fallback.
  }
  return fallback;
}

// ── Audience persona + avatar (inferred) ────────────────────────────────────────

const PERSONA_LIMITATIONS = [
  "A synthesized archetype, not a measured audience segment from YouTube Studio.",
  "Validate against your real comments, surveys, and retention data before acting.",
];

export function buildPersona(
  id: string,
  channelId: string,
  _channelName: string,
  niche: string,
): AudiencePersona {
  const k = keywords(niche);
  const root = k[0] ?? "the topic";
  const persona = {
    id,
    channelId,
    name: `${cap(root)} Learner`,
    demographics: "25–40, mixed gender, English-speaking, watches on mobile and desktop, values time-efficiency.",
    intent: `Wants a trustworthy guide to ${root} that respects their time and shows real results.`,
    messaging: "Speak to one person. Promise a concrete outcome fast. Prove it with a real example. Avoid hype.",
    painPoints: [
      `Overwhelmed by too much ${root} information`,
      "Tutorials are either too basic or too advanced",
      "Hard to tell which advice actually works",
    ],
    interests: pickN([root, "productivity", "side projects", "tools", "career growth", "automation"], 4, hash(niche)),
    evidenceClass: "inferred" as const,
    limitations: PERSONA_LIMITATIONS,
    provider: "deterministic",
    createdAt: Date.now(),
  };
  return audiencePersonaSchema.parse(persona);
}

export function buildAvatarMarkdown(channelName: string, niche: string) {
  const persona = buildPersona("preview", "preview", channelName, niche);
  const markdown = [
    `# Audience Avatar — ${persona.name}`,
    "",
    `**Channel:** ${channelName}`,
    "",
    `**Demographics:** ${persona.demographics}`,
    "",
    "**Behavioral segments:**",
    "- Skimmers — need chapters and tight pacing",
    "- Doers — want step-by-step they can follow along",
    "- Researchers — want sources and nuance",
    "",
    "**Content preferences:** practical > theoretical, examples > definitions, 8–14 min sweet spot.",
    "",
    `**Messaging optimization:** ${persona.messaging}`,
    "",
    "_Inferred audience archetype — synthesized, not measured from YouTube Studio._",
  ].join("\n");
  return audienceAvatarSchema.parse({
    markdown,
    evidenceClass: "inferred" as const,
    provider: "deterministic",
  });
}

function personaPrompt(channelName: string, niche: string): string {
  return [
    "You are an audience researcher. Build one synthesized audience persona for this channel.",
    `Channel: ${channelName}`,
    `Niche: ${niche || "(unspecified)"}`,
    "",
    "Return ONLY JSON of the form",
    '{"name":"<persona name>","demographics":"<one line>","intent":"<one line>",' +
      '"messaging":"<one line>","painPoints":["<pain>",...],"interests":["<interest>",...]}.',
    "This is a synthesized archetype, not measured data. Do not invent analytics or counts.",
  ].join("\n");
}

/**
 * L-802: provider-grounded audience persona. Synthesizes the persona fields
 * through the active (or injected) provider; the `inferred` label, limitations,
 * ids, and timestamps are code-controlled. Falls back to the deterministic
 * persona when no provider is configured or the call/parse fails.
 */
export async function generatePersona(
  id: string,
  channelId: string,
  channelName: string,
  niche: string,
  opts: CreatorGenOptions = {},
): Promise<AudiencePersona> {
  const fallback = buildPersona(id, channelId, channelName, niche);
  try {
    const provider = opts.provider ?? getTextProvider(resolveAiProviderId());
    const result = await provider.completeJson({ prompt: personaPrompt(channelName, niche) });
    const parsed = JSON.parse(extractJsonText(result.text)) as Record<string, unknown>;
    const name = asText(parsed.name, 120);
    const demographics = asText(parsed.demographics, 2_000);
    const intent = asText(parsed.intent, 2_000);
    const messaging = asText(parsed.messaging, 2_000);
    const painPoints = asTextList(parsed.painPoints, 8, 2_000);
    const interests = asTextList(parsed.interests, 12, 80);
    if (name && demographics && intent && messaging && painPoints.length && interests.length) {
      return audiencePersonaSchema.parse({
        id,
        channelId,
        name,
        demographics,
        intent,
        messaging,
        painPoints,
        interests,
        evidenceClass: "inferred" as const, // code-controlled; never from the model
        limitations: PERSONA_LIMITATIONS,
        provider: result.providerId,
        createdAt: Date.now(),
      });
    }
  } catch {
    // No provider configured, or the call/parse failed — deterministic fallback.
  }
  return fallback;
}

/**
 * L-802: provider-grounded audience avatar markdown. Builds the avatar from a
 * (possibly provider-generated) persona, keeping the "synthesized, not measured"
 * disclosure line. Falls back to the deterministic avatar on any failure.
 */
export async function generateAvatarMarkdown(
  channelName: string,
  niche: string,
  opts: CreatorGenOptions = {},
) {
  const persona = await generatePersona("preview", "preview", channelName, niche, opts);
  const markdown = [
    `# Audience Avatar — ${persona.name}`,
    "",
    `**Channel:** ${channelName}`,
    "",
    `**Demographics:** ${persona.demographics}`,
    "",
    "**Behavioral segments:**",
    "- Skimmers — need chapters and tight pacing",
    "- Doers — want step-by-step they can follow along",
    "- Researchers — want sources and nuance",
    "",
    `**Intent:** ${persona.intent}`,
    "",
    `**Messaging optimization:** ${persona.messaging}`,
    "",
    "_Inferred audience archetype — synthesized, not measured from YouTube Studio._",
  ].join("\n");
  return audienceAvatarSchema.parse({
    markdown,
    evidenceClass: "inferred" as const,
    provider: persona.provider,
  });
}

// ── Humanize (provider-backed, Ollama included) ─────────────────────────────────

const ROBOTIC: [RegExp, string][] = [
  [/\bin conclusion\b/gi, "so here's the bottom line"],
  [/\bit is important to note that\b/gi, "worth knowing:"],
  [/\bfurthermore\b/gi, "and"],
  [/\bmoreover\b/gi, "plus"],
  [/\butilize\b/gi, "use"],
  [/\bin order to\b/gi, "to"],
  [/\ba plethora of\b/gi, "plenty of"],
  [/\bdelve into\b/gi, "dig into"],
  [/\bleverage\b/gi, "use"],
  [/\bin today's world\b/gi, "right now"],
];

/** Deterministic rewrite — the fallback when no provider is configured. */
export function fallbackHumanize(text: string): { output: string; changes: number } {
  let changes = 0;
  let out = text;
  for (const [re, rep] of ROBOTIC) {
    out = out.replace(re, () => {
      changes++;
      return rep;
    });
  }
  if (!/\b(here's the thing|real talk|quick aside)\b/i.test(out) && out.includes("\n\n")) {
    out = out.replace("\n\n", "\n\nReal talk: ");
    changes++;
  }
  return { output: out, changes };
}

export async function humanizeText(text: string): Promise<HumanizeResult> {
  const deterministic = fallbackHumanize(text);
  try {
    const providerId = resolveAiProviderId();
    const provider = getTextProvider(providerId);
    const prompt = [
      "Rewrite this YouTube script to sound natural and human: remove robotic phrasing, vary sentence length,",
      "add light conversational connective tissue and one pattern interrupt. Keep the meaning and length similar.",
      "",
      'Return ONLY JSON of the form {"output": "<the rewritten script as a single string>"}.',
      "",
      "DRAFT:",
      text,
    ].join("\n");
    const result = await provider.completeJson({ prompt });
    const parsed = JSON.parse(extractJsonText(result.text)) as { output?: unknown };
    const output = typeof parsed.output === "string" ? parsed.output.trim().slice(0, 120_000) : "";
    if (output) {
      return humanizeResultSchema.parse({ output, changes: -1, provider: result.providerId });
    }
  } catch {
    // No provider configured, or the call/parse failed — use the deterministic rewrite.
  }
  return humanizeResultSchema.parse({
    output: deterministic.output || text,
    changes: deterministic.changes,
    provider: "deterministic",
  });
}
