export interface CommentMineIdea {
  title: string;
  description: string;
  keywords: string[];
  honestPromise: string;
}

const NOTE_PREFIX = "Observed public comment (not demand): ";
const DESCRIPTION_LIMIT = 2_000;

function uniqueQuestions(questions: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const question of questions || []) {
    const trimmed = question.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length === 24) break;
  }
  return result;
}

function ideaBlob(idea: CommentMineIdea): string {
  return [idea.title, idea.description, idea.honestPromise, ...idea.keywords].join("\n").toLowerCase();
}

/**
 * If a cheap or local model drops mined public-comment questions, keep the
 * phrasing on the package and label it as an observed comment, not demand.
 */
export function applyCommentMineFallback<T extends { ideas: CommentMineIdea[] }>(
  output: T,
  audienceQuestions: readonly string[] | undefined,
): T {
  const questions = uniqueQuestions(audienceQuestions);
  if (questions.length === 0) return output;

  const ideas = output.ideas.map((idea) => ({
    ...idea,
    keywords: [...idea.keywords],
  }));

  for (const question of questions) {
    const needle = question.toLowerCase();
    if (ideas.some((idea) => ideaBlob(idea).includes(needle))) continue;
    const note = `${NOTE_PREFIX}"${question}"`;
    const host = ideas.find((idea) => idea.description.length + 1 + note.length <= DESCRIPTION_LIMIT);
    if (!host) continue;
    host.description = `${host.description} ${note}`.trim();
  }

  return { ...output, ideas };
}
