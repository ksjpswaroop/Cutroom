import type { ZodError } from "zod";

/**
 * Render Zod issues as `path: message` pairs.
 *
 * These strings are fed back to the model as a repair instruction, so the field
 * path is the load-bearing part: "String must contain at most 2000 character(s)"
 * tells a model nothing about which field to shorten, whereas
 * "structure.2.content: String must contain at most 2000 character(s)" does.
 * Smaller local models depend on that specificity to recover on the retry.
 */
export function formatSchemaIssues(error: ZodError, limit = 3): string {
  const issues = error.issues.slice(0, limit).map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  if (issues.length === 0) return "unknown error";
  const remaining = error.issues.length - issues.length;
  return issues.join("; ") + (remaining > 0 ? ` (and ${remaining} more)` : "");
}
