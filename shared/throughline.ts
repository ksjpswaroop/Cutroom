import type { EvidenceClaim, EvidenceClass } from "./evidence-contracts";

export type ThroughlineNodeKind = "promise" | "section" | "claim" | "source_video";

export interface ThroughlineNode {
  id: string;
  kind: ThroughlineNodeKind;
  label: string;
  evidenceClass?: EvidenceClass;
  /** Present only for section nodes. */
  sectionRole?: "hook" | "body";
  /** Set at build time when a requires_studio claim's text appears in dialogue. */
  spokenInDialogue?: boolean;
}

export interface ThroughlineEdge {
  id: string;
  from: string;
  to: string;
  kind: "promise_to_section" | "section_to_claim" | "claim_to_source";
}

export interface ThroughlineGraph {
  nodes: ThroughlineNode[];
  edges: ThroughlineEdge[];
  /** Idea-package claim IDs supplied at build time (for unused-claim checks). */
  ideaClaimIds?: string[];
}

export type ThroughlineCheckStatus = "pass" | "warn" | "fail";

export type ThroughlineIssueCode =
  | "disconnected_node"
  | "unused_idea_claim"
  | "orphan_body_section"
  | "requires_studio_spoken_as_fact";

export interface ThroughlineIssue {
  code: ThroughlineIssueCode;
  severity: "warn" | "fail";
  message: string;
  nodeId?: string;
}

export interface ThroughlineCheck {
  status: ThroughlineCheckStatus;
  issues: ThroughlineIssue[];
}

export interface ThroughlineParagraphInput {
  type: string;
  content: string;
}

export interface ThroughlineSectionInput {
  name: string;
  evidenceClaimIds?: readonly string[];
  paragraphs?: readonly ThroughlineParagraphInput[];
}

export interface ThroughlineStructureInput {
  section: string;
  purpose?: string;
  evidenceClaimIds?: readonly string[];
}

export interface ThroughlineBuildInput {
  topic?: string;
  title?: string;
  script?: string;
  /** Parsed or named script sections. Prefer over re-parsing when provided. */
  sections?: readonly ThroughlineSectionInput[];
  /** Script plan structure with per-section claim IDs. */
  structure?: readonly ThroughlineStructureInput[];
  /** Allowed evidence claims. Claim nodes are only created from this set. */
  evidenceClaims?: readonly EvidenceClaim[];
  /** Idea-package claim IDs expected to appear in the script throughline. */
  ideaClaimIds?: readonly string[];
}

const HOOK_NAME_RE = /^(hook|intro|introduction|opening|teaser)\b/i;

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return normalizeLabel(value).toLowerCase();
}

function isHookSectionName(name: string, index: number): boolean {
  if (index === 0) return true;
  return HOOK_NAME_RE.test(normalizeLabel(name));
}

function parseHeadingSections(script: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of script.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
    if (!match) continue;
    const raw = match[2].replace(/\s*\[[^\]]*\]\s*$/, "").trim();
    const name = normalizeLabel(raw);
    if (!name) continue;
    const key = normalizeKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function collectSectionNames(input: ThroughlineBuildInput): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined) => {
    if (!raw) return;
    const name = normalizeLabel(raw);
    if (!name) return;
    const key = normalizeKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  if (input.sections?.length) {
    for (const section of input.sections) push(section.name);
  } else if (input.script?.trim()) {
    for (const name of parseHeadingSections(input.script)) push(name);
  }

  if (names.length === 0 && input.structure?.length) {
    for (const item of input.structure) push(item.section);
  }

  return names;
}

function resolveClaimIdsForSection(
  sectionName: string,
  sectionIndex: number,
  input: ThroughlineBuildInput,
): string[] {
  const fromSections = input.sections?.find((section) => normalizeKey(section.name) === normalizeKey(sectionName));
  if (fromSections?.evidenceClaimIds?.length) {
    return Array.from(new Set(fromSections.evidenceClaimIds.filter(Boolean)));
  }

  const structureExact = input.structure?.find(
    (item) => normalizeKey(item.section) === normalizeKey(sectionName),
  );
  if (structureExact?.evidenceClaimIds?.length) {
    return Array.from(new Set(structureExact.evidenceClaimIds.filter(Boolean)));
  }

  // Fall back to positional structure match only when names differ but counts align.
  const positional = input.structure?.[sectionIndex];
  if (positional?.evidenceClaimIds?.length && input.structure && input.structure.length > 0) {
    const sectionNames = collectSectionNames(input);
    if (sectionNames.length === input.structure.length) {
      return Array.from(new Set(positional.evidenceClaimIds.filter(Boolean)));
    }
  }

  return [];
}

function collectDialogueText(input: ThroughlineBuildInput): string {
  const chunks: string[] = [];
  if (input.sections?.length) {
    for (const section of input.sections) {
      for (const paragraph of section.paragraphs || []) {
        if (paragraph.type === "dialogue" && paragraph.content.trim()) {
          chunks.push(paragraph.content);
        }
      }
    }
  }
  return chunks.join("\n").toLowerCase();
}

function claimAppearsInDialogue(claim: EvidenceClaim, dialogueCorpus: string): boolean {
  if (!dialogueCorpus) return false;
  const claimText = claim.claim.trim().toLowerCase();
  if (claimText.length < 12) return false;
  return dialogueCorpus.includes(claimText);
}

/**
 * Build a throughline graph from an existing script and optional evidence.
 * Never invents nodes that are not present in the inputs.
 */
export function buildThroughlineGraph(input: ThroughlineBuildInput): ThroughlineGraph {
  const nodes: ThroughlineNode[] = [];
  const edges: ThroughlineEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: ThroughlineNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  const addEdge = (edge: Omit<ThroughlineEdge, "id">) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    const id = `${edge.kind}:${edge.from}->${edge.to}`;
    if (edges.some((existing) => existing.id === id)) return;
    edges.push({ ...edge, id });
  };

  const promiseLabel =
    (input.topic && normalizeLabel(input.topic))
    || (input.title && normalizeLabel(input.title))
    || undefined;

  const sectionNames = collectSectionNames(input);
  const firstHookName = sectionNames.find((name, index) => isHookSectionName(name, index));

  // Promise node: only from topic, title, or an existing first/hook section — never free-text invention.
  if (promiseLabel) {
    addNode({ id: "promise", kind: "promise", label: promiseLabel });
  } else if (firstHookName) {
    addNode({ id: "promise", kind: "promise", label: firstHookName });
  }

  for (let index = 0; index < sectionNames.length; index += 1) {
    const name = sectionNames[index];
    const role: "hook" | "body" = isHookSectionName(name, index) ? "hook" : "body";
    addNode({
      id: `section:${normalizeKey(name)}`,
      kind: "section",
      label: name,
      sectionRole: role,
    });
  }

  const claimsById = new Map<string, EvidenceClaim>();
  for (const claim of input.evidenceClaims || []) {
    if (!claimsById.has(claim.id)) claimsById.set(claim.id, claim);
  }

  const dialogueCorpus = collectDialogueText(input);

  for (let index = 0; index < sectionNames.length; index += 1) {
    const name = sectionNames[index];
    const sectionId = `section:${normalizeKey(name)}`;
    if (nodeIds.has("promise")) {
      addEdge({ from: "promise", to: sectionId, kind: "promise_to_section" });
    }

    for (const claimId of resolveClaimIdsForSection(name, index, input)) {
      const claim = claimsById.get(claimId);
      if (!claim) continue; // never invent claim nodes from bare IDs
      const claimNodeId = `claim:${claim.id}`;
      addNode({
        id: claimNodeId,
        kind: "claim",
        label: claim.claim,
        evidenceClass: claim.evidenceClass,
        spokenInDialogue: claim.evidenceClass === "requires_studio"
          ? claimAppearsInDialogue(claim, dialogueCorpus)
          : undefined,
      });
      addEdge({ from: sectionId, to: claimNodeId, kind: "section_to_claim" });

      for (const sourceVideoId of claim.sourceVideoIds) {
        const sourceId = `source:${sourceVideoId}`;
        addNode({
          id: sourceId,
          kind: "source_video",
          label: sourceVideoId,
        });
        addEdge({ from: claimNodeId, to: sourceId, kind: "claim_to_source" });
      }
    }
  }

  const ideaClaimIds = Array.from(new Set((input.ideaClaimIds || []).filter(Boolean)));

  return {
    nodes,
    edges,
    ideaClaimIds: ideaClaimIds.length > 0 ? ideaClaimIds : undefined,
  };
}

function connectedIds(graph: ThroughlineGraph): Set<string> {
  const linked = new Set<string>();
  for (const edge of graph.edges) {
    linked.add(edge.from);
    linked.add(edge.to);
  }
  return linked;
}

/**
 * Run throughline integrity checks. Fail beats warn; no issues → pass.
 */
export function checkThroughline(graph: ThroughlineGraph): ThroughlineCheck {
  const issues: ThroughlineIssue[] = [];
  const linked = connectedIds(graph);
  const claimIdsInGraph = new Set(
    graph.nodes.filter((node) => node.kind === "claim").map((node) => node.id.replace(/^claim:/, "")),
  );

  for (const node of graph.nodes) {
    if (!linked.has(node.id) && graph.nodes.length > 1) {
      issues.push({
        code: "disconnected_node",
        severity: "warn",
        message: `Disconnected node: ${node.label}`,
        nodeId: node.id,
      });
    }
  }

  for (const ideaClaimId of graph.ideaClaimIds || []) {
    if (!claimIdsInGraph.has(ideaClaimId)) {
      issues.push({
        code: "unused_idea_claim",
        severity: "warn",
        message: `Unused idea claim: ${ideaClaimId}`,
        nodeId: `claim:${ideaClaimId}`,
      });
    }
  }

  const sectionClaimDegree = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.kind !== "section_to_claim") continue;
    sectionClaimDegree.set(edge.from, (sectionClaimDegree.get(edge.from) || 0) + 1);
  }

  for (const node of graph.nodes) {
    if (node.kind !== "section" || node.sectionRole !== "body") continue;
    if ((sectionClaimDegree.get(node.id) || 0) === 0) {
      issues.push({
        code: "orphan_body_section",
        severity: "fail",
        message: `Orphan body section has no linked claims: ${node.label}`,
        nodeId: node.id,
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind !== "claim" || node.evidenceClass !== "requires_studio") continue;
    if (node.spokenInDialogue) {
      issues.push({
        code: "requires_studio_spoken_as_fact",
        severity: "warn",
        message: `requires_studio claim spoken as fact in dialogue: ${node.label}`,
        nodeId: node.id,
      });
    }
  }

  let status: ThroughlineCheckStatus = "pass";
  if (issues.some((issue) => issue.severity === "fail")) status = "fail";
  else if (issues.length > 0) status = "warn";

  return { status, issues };
}
