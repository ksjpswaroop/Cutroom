import { getTextProvider, resolveAiProviderId } from "./ai";
import { extractJsonText } from "./ai/json-extract";
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
