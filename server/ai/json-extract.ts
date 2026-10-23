/**
 * Recover a JSON value from loosely-formatted model output.
 *
 * Hosted providers honour a strict JSON response mode, so callers can parse
 * their output directly. Local models are far less disciplined: they wrap
 * results in markdown fences, prefix them with prose ("Here is the JSON:"),
 * and — for reasoning models such as gpt-oss or qwen3 — emit a `<think>` block
 * before the answer. Every Cutroom caller does a bare `JSON.parse`, so the
 * recovery has to happen inside the provider rather than at each call site.
 */

/** Reasoning models emit their scratchpad inline; it is never part of the answer. */
function stripReasoningBlocks(input: string): string {
  return input
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<\|channel\|>analysis[\s\S]*?<\|message\|>/gi, "")
    // An unterminated block means the model was cut off mid-thought; drop the tail.
    .replace(/<think(?:ing)?>[\s\S]*$/gi, "");
}

function stripCodeFences(input: string): string {
  const fenced = input.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  // An opening fence with no closing fence (truncated output).
  const unclosed = input.match(/```(?:json|JSON)?\s*([\s\S]*)$/);
  if (unclosed?.[1]?.trim()) return unclosed[1].trim();
  return input;
}

/**
 * Scan for the first balanced JSON object or array, respecting string literals
 * and escapes so that braces inside strings do not end the scan early.
 */
function sliceBalancedValue(input: string): string | null {
  const start = input.search(/[{[]/);
  if (start < 0) return null;

  // Track the actual opener stack, not just a depth counter: a truncated
  // `{"a":[{...` must be closed as `]}`, which a depth count cannot express.
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
    } else if (char === "}" || char === "]") {
      if (stack.at(-1) !== char) return null; // Mismatched; not a JSON value.
      stack.pop();
      if (stack.length === 0) return input.slice(start, index + 1);
    }
  }

  // Unbalanced: the model was truncated. Close the open levels in reverse so
  // the partial result stays usable rather than discarding the whole response.
  if (stack.length > 0) {
    const tail = inString ? '"' : "";
    return input.slice(start) + tail + stack.reverse().join("");
  }
  return null;
}

/** Trailing commas before a closing brace/bracket are the most common defect. */
function repairTrailingCommas(input: string): string {
  return input.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Best-effort extraction of a JSON document from model output.
 * Returns the original trimmed text when nothing better can be recovered, so
 * the caller still surfaces a parse error carrying the real response.
 */
export function extractJsonText(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return trimmed;

  const candidates: string[] = [];
  const push = (value: string | null | undefined) => {
    const candidate = value?.trim();
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };

  push(trimmed);
  const withoutReasoning = stripReasoningBlocks(trimmed).trim();
  push(withoutReasoning);
  const unfenced = stripCodeFences(withoutReasoning).trim();
  push(unfenced);
  push(sliceBalancedValue(unfenced));
  push(sliceBalancedValue(withoutReasoning));

  for (const candidate of [...candidates]) {
    push(repairTrailingCommas(candidate));
  }

  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Try the next, more aggressive, candidate.
    }
  }

  return trimmed;
}

/** True when `raw` yields a parseable JSON document after extraction. */
export function isRecoverableJson(raw: string): boolean {
  const extracted = extractJsonText(raw);
  if (!extracted) return false;
  try {
    JSON.parse(extracted);
    return true;
  } catch {
    return false;
  }
}
