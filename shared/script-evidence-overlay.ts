import type { EvidenceClaim } from "./evidence-contracts";
import { buildThroughlineGraph, type ThroughlineBuildInput } from "./throughline";

export type ScriptEvidenceMark = "on_promise" | "tangent" | "unsupported";

export interface ScriptEvidenceSpan {
  sectionName: string;
  text: string;
  mark: ScriptEvidenceMark;
}

export interface ScriptEvidenceParagraph {
  type: string;
  content: string;
}

export interface ScriptEvidenceSection {
  name: string;
  paragraphs?: readonly ScriptEvidenceParagraph[];
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sectionNodeId(name: string): string {
  return `section:${normalizeText(name)}`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function claimAppears(sentence: string, claim: EvidenceClaim): boolean {
  const claimText = normalizeText(claim.claim);
  if (claimText.length < 12) return false;
  return normalizeText(sentence).includes(claimText);
}

/**
 * Highlight script sentences against the same throughline graph as L-604.
 * Does not invent sentences or claim nodes.
 */
export function markScriptEvidence(input: ThroughlineBuildInput & {
  sections?: readonly ScriptEvidenceSection[];
}): ScriptEvidenceSpan[] {
  const graph = buildThroughlineGraph(input);
  const claims = input.evidenceClaims || [];
  const sections = input.sections?.length
    ? input.sections
    : [];

  const spans: ScriptEvidenceSpan[] = [];

  for (const section of sections) {
    const nodeId = sectionNodeId(section.name);
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) continue;

    const linkedClaimIds = new Set(
      graph.edges
        .filter((edge) => edge.kind === "section_to_claim" && edge.from === nodeId)
        .map((edge) => edge.to.replace(/^claim:/, "")),
    );

    for (const paragraph of section.paragraphs || []) {
      for (const sentence of splitSentences(paragraph.content || "")) {
        const spokenStudio = claims.some((claim) => claim.evidenceClass === "requires_studio" && claimAppears(sentence, claim));
        const spokenUnlinked = claims.some((claim) => (
          claim.evidenceClass !== "requires_studio"
          && claimAppears(sentence, claim)
          && !linkedClaimIds.has(claim.id)
        ));

        let mark: ScriptEvidenceMark;
        if (spokenStudio || spokenUnlinked) mark = "unsupported";
        else if (node.sectionRole === "body" && linkedClaimIds.size === 0) mark = "tangent";
        else mark = "on_promise";

        spans.push({ sectionName: section.name, text: sentence, mark });
      }
    }
  }

  return spans;
}
