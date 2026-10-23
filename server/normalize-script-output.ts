/**
 * Reshape structurally-sound but wrongly-typed script output before validation.
 *
 * Small local models reliably produce the right *content* while getting the
 * *types* wrong: the script arrives as an array of paragraphs rather than one
 * string, a structure entry as a bare heading rather than an object, or an
 * object carrying extra keys that the strict schema rejects. Re-prompting for
 * these costs another round trip and often fails again, so they are corrected
 * here instead.
 *
 * Every rule is conservative: it only reshapes what a value already contains
 * and never invents content. Anything ambiguous is left untouched so schema
 * validation still rejects genuinely wrong output.
 */

/** Keys the strict structure schema accepts. */
const STRUCTURE_KEYS = ["section", "purpose", "evidenceClaimIds"] as const;

/** Aliases models substitute for `section` / `purpose`. */
const SECTION_ALIASES = ["section", "heading", "title", "name"];
const PURPOSE_ALIASES = ["purpose", "content", "description", "summary", "body"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Join an array of strings into one block; leave anything else alone. */
function coerceToText(value: unknown, separator = "\n\n"): unknown {
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")) {
    return value.join(separator);
  }
  return value;
}

/**
 * Collapse a non-string to text for fields the schema types as a string.
 * Objects are rendered as `key: value` lines rather than raw JSON so the result
 * stays readable to the user who ends up seeing it.
 */
function coerceToPlainText(value: unknown): unknown {
  const joined = coerceToText(value, " ");
  if (typeof joined === "string") return joined;
  if (isRecord(value)) {
    const lines = Object.entries(value)
      .map(([key, entry]) => `${key}: ${typeof entry === "string" ? entry : JSON.stringify(entry)}`);
    if (lines.length > 0) return lines.join("; ");
  }
  return value;
}

function firstStringByAlias(record: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const candidate = record[alias];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function normalizeStructureEntry(entry: unknown): unknown {
  // A bare heading: use it for both fields rather than inventing a purpose.
  if (typeof entry === "string" && entry.trim()) {
    const text = entry.trim();
    return { section: text.slice(0, 120), purpose: text, evidenceClaimIds: [] };
  }
  if (!isRecord(entry)) return entry;

  const section = firstStringByAlias(entry, SECTION_ALIASES);
  const purpose = firstStringByAlias(entry, PURPOSE_ALIASES);
  if (!section && !purpose) return entry;

  const rawIds = entry.evidenceClaimIds ?? entry.evidenceIds ?? entry.claimIds;
  const evidenceClaimIds = Array.isArray(rawIds)
    ? rawIds.filter((id): id is string => typeof id === "string")
    : [];

  // Build only the accepted keys: the schema is strict, so extras would fail.
  return {
    section: (section ?? purpose)!.slice(0, 120),
    purpose: purpose ?? section,
    evidenceClaimIds,
  };
}

/** Pull `titles` out of objects such as `{ title: "..." }`. */
function normalizeTitles(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const flattened = value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (isRecord(entry)) return firstStringByAlias(entry, ["title", "text", "name", "value"]) ?? entry;
    return entry;
  });
  if (!flattened.every((entry) => typeof entry === "string")) return flattened;
  // The schema requires exactly three; dropping surplus is unambiguous, whereas
  // padding a short list would mean inventing titles.
  return flattened.length > 3 ? flattened.slice(0, 3) : flattened;
}

/**
 * Normalise a parsed script payload in place of the raw model output.
 * Returns the value unchanged when it is not a JSON object.
 */
export function normalizeScriptOutput(parsed: unknown): unknown {
  // Some models wrap the whole payload in a single-element array.
  const root = Array.isArray(parsed) && parsed.length === 1 && isRecord(parsed[0]) ? parsed[0] : parsed;
  if (!isRecord(root)) return root;

  const next: Record<string, unknown> = { ...root };

  if ("script" in next) next.script = coerceToText(next.script);
  for (const key of ["hook", "payoff", "primaryCta", "studioValidation"]) {
    if (key in next) next[key] = coerceToPlainText(next[key]);
  }

  // `studioValidation` records the Studio metric and decision rule, and models
  // return null when they have none to give. The schema requires a string, so
  // the absence is stated plainly. Only this field is defaulted: it is
  // descriptive metadata, whereas a null hook or script is missing substance
  // and must still fail validation rather than be papered over.
  if (next.studioValidation === null
    || next.studioValidation === undefined
    || (typeof next.studioValidation === "string" && !next.studioValidation.trim())) {
    next.studioValidation = "Not reported.";
  }
  if ("titles" in next) next.titles = normalizeTitles(next.titles);
  if (Array.isArray(next.structure)) {
    next.structure = next.structure.map(normalizeStructureEntry);
  }

  return next;
}

export { STRUCTURE_KEYS };
