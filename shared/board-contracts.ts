import { z } from "zod";
import { evidenceClassSchema, ideaPackageSchema, scriptEvidenceContextSchema } from "./evidence-contracts";
import { DEFAULT_TELEPROMPTER_WPM, sectionsFromScript } from "./pace-chapters";

const bounded = z.string().trim().min(1).max(2_000);
const cameraKindSchema = z.enum(["a-cam", "b-roll", "screen", "insert"]);

export const boardCharacterSchema = z.object({
  id: z.string().trim().min(1).max(64),
  role: z.string().trim().min(1).max(80),
  onScreen: z.boolean(),
  wardrobeOrLook: z.string().trim().max(400).optional(),
  evidenceClass: evidenceClassSchema,
}).strict();

export const boardPanelSchema = z.object({
  id: z.string().trim().min(1).max(64),
  section: z.string().trim().min(1).max(120),
  visual: bounded.max(400),
  onScreenText: z.string().trim().max(120).optional(),
  evidenceClaimIds: z.array(z.string().trim().min(1).max(128)).max(8),
  evidenceClass: evidenceClassSchema,
  snapshotId: z.string().trim().min(8).max(128),
  limitations: z.array(bounded.max(400)).max(8).optional(),
}).strict();

export const boardShotSchema = z.object({
  panelId: z.string().trim().min(1).max(64),
  shot: bounded.max(400),
  camera: cameraKindSchema,
  durationHintSec: z.number().min(1).max(120).optional(),
  broll: bounded.max(400).optional(),
  continuity: bounded.max(400).optional(),
  evidenceClaimIds: z.array(z.string().trim().min(1).max(128)).max(8),
  evidenceClass: evidenceClassSchema,
}).strict();

export const cameraTreeSchema = z.object({
  "a-cam": z.array(z.number().int().min(0)).max(40),
  "b-roll": z.array(z.number().int().min(0)).max(40),
  screen: z.array(z.number().int().min(0)).max(40),
  insert: z.array(z.number().int().min(0)).max(40),
}).strict();

export const productionBoardOutputSchema = z.object({
  snapshotId: z.string().trim().min(8).max(128),
  characters: z.array(boardCharacterSchema).min(1).max(12),
  storyboardPanels: z.array(boardPanelSchema).min(2).max(24),
  shots: z.array(boardShotSchema).min(3).max(40),
  cameraTree: cameraTreeSchema.optional(),
}).strict();

export type ProductionBoardOutput = z.infer<typeof productionBoardOutputSchema>;
export type BoardCamera = z.infer<typeof cameraKindSchema>;

export const productionBoardRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  scriptContent: z.string().trim().min(40).max(80_000),
  selectedIdea: ideaPackageSchema,
  evidenceContext: scriptEvidenceContextSchema,
  throughlineSections: z.array(z.string().trim().min(1).max(120)).max(16).optional(),
}).strict();

export type ProductionBoardRequest = z.infer<typeof productionBoardRequestSchema>;

export type BoardCheckStatus = "pass" | "warn" | "fail";

export type BoardIssueCode =
  | "stale_snapshot"
  | "unknown_claim"
  | "invented_section"
  | "orphan_shot"
  | "shot_without_claims"
  | "studio_as_fact_onscreen"
  | "empty_inferred_without_limitation"
  | "camera_tree_mismatch";

export interface BoardIssue {
  code: BoardIssueCode;
  severity: "warn" | "fail";
  message: string;
}

export interface BoardCheck {
  status: BoardCheckStatus;
  issues: BoardIssue[];
}

export function deriveCameraTree(shots: ProductionBoardOutput["shots"]): z.infer<typeof cameraTreeSchema> {
  const tree: z.infer<typeof cameraTreeSchema> = {
    "a-cam": [],
    "b-roll": [],
    screen: [],
    insert: [],
  };
  shots.forEach((shot, index) => {
    tree[shot.camera].push(index);
  });
  return tree;
}

function cameraTreesEqual(
  a: z.infer<typeof cameraTreeSchema>,
  b: z.infer<typeof cameraTreeSchema>,
): boolean {
  const keys: BoardCamera[] = ["a-cam", "b-roll", "screen", "insert"];
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

export function checkProductionBoard(
  board: ProductionBoardOutput,
  input: {
    snapshotId: string;
    allowedClaimIds: readonly string[];
    throughlineSections: readonly string[];
    requiresStudioClaimTexts?: readonly string[];
  },
): BoardCheck {
  const issues: BoardIssue[] = [];
  if (board.snapshotId !== input.snapshotId) {
    issues.push({
      code: "stale_snapshot",
      severity: "fail",
      message: `Board snapshot ${board.snapshotId} does not match active snapshot ${input.snapshotId}.`,
    });
  }

  const allowedClaims = new Set(input.allowedClaimIds);
  const allowedSections = new Set(input.throughlineSections.map((section) => section.trim().toLowerCase()));
  const panelIds = new Set(board.storyboardPanels.map((panel) => panel.id));

  for (const panel of board.storyboardPanels) {
    if (panel.snapshotId !== input.snapshotId) {
      issues.push({
        code: "stale_snapshot",
        severity: "fail",
        message: `Panel ${panel.id} cites snapshot ${panel.snapshotId}.`,
      });
    }
    if (allowedSections.size > 0 && !allowedSections.has(panel.section.trim().toLowerCase())) {
      issues.push({
        code: "invented_section",
        severity: "fail",
        message: `Panel ${panel.id} section "${panel.section}" is not a throughline section.`,
      });
    }
    for (const claimId of panel.evidenceClaimIds) {
      if (!allowedClaims.has(claimId)) {
        issues.push({
          code: "unknown_claim",
          severity: "fail",
          message: `Panel ${panel.id} cites unknown claim ${claimId}.`,
        });
      }
    }
    if (panel.evidenceClaimIds.length === 0 && panel.evidenceClass === "inferred" && !(panel.limitations && panel.limitations.length > 0)) {
      issues.push({
        code: "empty_inferred_without_limitation",
        severity: "warn",
        message: `Panel ${panel.id} is inferred without limitations.`,
      });
    }
    const onScreen = (panel.onScreenText || "").toLowerCase();
    for (const text of input.requiresStudioClaimTexts || []) {
      const needle = text.trim().toLowerCase().slice(0, 40);
      if (needle.length >= 12 && onScreen.includes(needle)) {
        issues.push({
          code: "studio_as_fact_onscreen",
          severity: "fail",
          message: `On-screen text on panel ${panel.id} states a requires_studio claim as fact.`,
        });
      }
    }
  }

  for (const shot of board.shots) {
    if (!panelIds.has(shot.panelId)) {
      issues.push({
        code: "orphan_shot",
        severity: "fail",
        message: `Shot "${shot.shot.slice(0, 40)}" references missing panel ${shot.panelId}.`,
      });
    }
    if (shot.evidenceClaimIds.length === 0) {
      issues.push({
        code: "shot_without_claims",
        severity: "warn",
        message: `Shot "${shot.shot.slice(0, 40)}" has no evidence claims (label inferred).`,
      });
    }
    for (const claimId of shot.evidenceClaimIds) {
      if (!allowedClaims.has(claimId)) {
        issues.push({
          code: "unknown_claim",
          severity: "fail",
          message: `Shot cites unknown claim ${claimId}.`,
        });
      }
    }
  }

  const derived = deriveCameraTree(board.shots);
  if (board.cameraTree && !cameraTreesEqual(board.cameraTree, derived)) {
    issues.push({
      code: "camera_tree_mismatch",
      severity: "fail",
      message: "Camera tree disagrees with shots; shots win — regenerate or omit cameraTree.",
    });
  }

  const hasFail = issues.some((issue) => issue.severity === "fail");
  const hasWarn = issues.some((issue) => issue.severity === "warn");
  return {
    status: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    issues,
  };
}

export function groupShotsIntoClipBriefs(board: ProductionBoardOutput): Array<{
  title: string;
  sectionTitle: string;
  hook: string;
  estimatedSec: number;
  evidenceClass: "inferred";
  camera: BoardCamera;
}> {
  const panelById = new Map(board.storyboardPanels.map((panel) => [panel.id, panel]));
  return board.shots.slice(0, 12).map((shot) => {
    const panel = panelById.get(shot.panelId);
    return {
      title: shot.shot.slice(0, 80),
      sectionTitle: panel?.section || "Section",
      hook: (panel?.visual || shot.shot).slice(0, 200),
      estimatedSec: Math.round(shot.durationHintSec || 8),
      evidenceClass: "inferred" as const,
      camera: shot.camera,
    };
  });
}

/** Fill missing shot durations from teleprompter WPM × section words (L-714). Model-supplied hints stay. */
export function annotateShotDurations(
  board: ProductionBoardOutput,
  scriptContent: string,
  wpm = DEFAULT_TELEPROMPTER_WPM,
): ProductionBoardOutput {
  const safeWpm = Number.isFinite(wpm) && wpm > 0 ? wpm : DEFAULT_TELEPROMPTER_WPM;
  const secByTitle = new Map(
    sectionsFromScript(scriptContent).map((section) => [
      section.title.trim().toLowerCase(),
      Math.max(2, Math.round((section.wordCount / safeWpm) * 60)),
    ]),
  );
  const panelById = new Map(board.storyboardPanels.map((panel) => [panel.id, panel]));
  const shotsPerPanel = new Map<string, number>();
  for (const shot of board.shots) {
    shotsPerPanel.set(shot.panelId, (shotsPerPanel.get(shot.panelId) || 0) + 1);
  }
  return {
    ...board,
    shots: board.shots.map((shot) => {
      if (shot.durationHintSec) return shot;
      const panel = panelById.get(shot.panelId);
      const sectionSec = panel ? secByTitle.get(panel.section.trim().toLowerCase()) : undefined;
      const split = Math.max(1, shotsPerPanel.get(shot.panelId) || 1);
      const hint = sectionSec ? Math.max(1, Math.round(sectionSec / split)) : 8;
      return { ...shot, durationHintSec: Math.min(120, hint) };
    }),
  };
}
