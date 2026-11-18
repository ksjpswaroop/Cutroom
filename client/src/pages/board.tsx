import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Clapperboard, FileDown, LayoutGrid, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useWorkflow } from "@/lib/workflow-context";
import { createProClientRegistry, useProEnabled, type AssemblerPlanResult, type AssemblerReceiptResult, type OtioExportResult } from "@/lib/pro-commands";
import {
  checkProductionBoard,
  groupShotsIntoClipBriefs,
  type ProductionBoardOutput,
} from "@shared/board-contracts";

export default function BoardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { state, setBoardData, goToStep } = useWorkflow();
  const [busy, setBusy] = useState(false);
  const [otioBusy, setOtioBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<ProductionBoardOutput | null>(
    (state.cachedBoard?.board as ProductionBoardOutput | undefined) || null,
  );
  const [cameraFilter, setCameraFilter] = useState<string>("all");

  useEffect(() => {
    goToStep("board");
  }, [goToStep]);

  const topic = state.cachedPackage?.topic
    || state.cachedScript?.topic
    || state.idea?.selectedIdea?.title
    || "";

  const snapshotId = state.cachedScript?.evidenceContext?.snapshotId || "";
  const allowedClaimIds = useMemo(() => {
    const claims = [
      ...(state.cachedScript?.evidenceContext?.evidenceClaims || []),
      ...(state.idea?.selectedIdea?.evidenceClaims || []),
    ];
    return Array.from(new Set(claims.map((claim) => claim.id)));
  }, [state.cachedScript?.evidenceContext?.evidenceClaims, state.idea?.selectedIdea?.evidenceClaims]);

  const throughlineSections = useMemo(() => {
    const fromResult = (state.cachedScript?.result?.structure || [])
      .map((section) => section.section)
      .filter(Boolean);
    if (fromResult.length > 0) return fromResult;
    return board ? Array.from(new Set(board.storyboardPanels.map((panel) => panel.section))) : [];
  }, [state.cachedScript?.result?.structure, board]);

  const canGenerate = Boolean(
    state.idea?.selectedIdea
    && state.cachedScript?.script
    && snapshotId,
  );

  const boardCheck = useMemo(() => {
    if (!board || !snapshotId) return null;
    return checkProductionBoard(board, {
      snapshotId,
      allowedClaimIds,
      throughlineSections,
      requiresStudioClaimTexts: [
        ...(state.cachedScript?.evidenceContext?.evidenceClaims || []),
        ...(state.idea?.selectedIdea?.evidenceClaims || []),
      ].filter((claim) => claim.evidenceClass === "requires_studio").map((claim) => claim.claim),
    });
  }, [board, snapshotId, allowedClaimIds, throughlineSections, state.cachedScript?.evidenceContext?.evidenceClaims, state.idea?.selectedIdea?.evidenceClaims]);

  const clipBriefs = useMemo(() => (board ? groupShotsIntoClipBriefs(board) : []), [board]);

  // Cutroom Pro M0 — OTIO export goes through the client Pro command
  // registry (pro.export-otio); the server re-checks the Pro gate.
  const { enabled: proEnabled } = useProEnabled();
  const proRegistry = useMemo(
    () => createProClientRegistry((path) => setLocation(path)),
    [setLocation],
  );

  const handleExportOtio = async () => {
    if (!board) return;
    setOtioBusy(true);
    setError(null);
    try {
      const result = (await proRegistry.dispatch("pro.export-otio", { board })) as OtioExportResult;
      toast({
        title: "OTIO exported",
        description: result.placeholders.length > 0
          ? `${board.shots.length} clips at ${result.fps} fps · ${result.placeholders.length} placeholder clip(s) with no media yet — no file path was invented.`
          : `${board.shots.length} clips at ${result.fps} fps · every shot has media.`,
      });
    } catch (err: any) {
      setError(err?.message || "Unable to export OTIO.");
    } finally {
      setOtioBusy(false);
    }
  };

  // Cutroom Pro M1 — Assembler agent. Plan first (inspect it, then approve
  // the run); the run goes through the server registry and returns a
  // receipt. The Board carries no media paths, so a plain run skips every
  // place step — "Use demo footage" assembles the plan with FilmCraft's
  // built-in demo clips + music bed instead (real CLI when present).
  const [assembleBusy, setAssembleBusy] = useState(false);
  const [demoMedia, setDemoMedia] = useState(false);
  const [assemblyPlan, setAssemblyPlan] = useState<AssemblerPlanResult | null>(null);
  const [assemblyReceipt, setAssemblyReceipt] = useState<AssemblerReceiptResult | null>(null);

  const handleAssemblePlan = async () => {
    if (!board) return;
    setAssembleBusy(true);
    setError(null);
    setAssemblyReceipt(null);
    try {
      const plan = (await proRegistry.dispatch("assembler.plan", {
        board,
        options: { demoMedia, exportWidth: 640, exportHeight: 360 },
      })) as AssemblerPlanResult;
      setAssemblyPlan(plan);
      toast({
        title: "Assembly plan ready",
        description: `${plan.steps.length} steps · ${plan.totalSeconds}s · ${plan.placeholders.length} shot(s) without media. Review it, then approve the run.`,
      });
    } catch (err: any) {
      setError(err?.message || "Unable to build the assembly plan.");
    } finally {
      setAssembleBusy(false);
    }
  };

  const handleAssembleRun = async () => {
    if (!board) return;
    setAssembleBusy(true);
    setError(null);
    try {
      const receipt = (await proRegistry.dispatch("assembler.run", {
        board,
        options: { demoMedia, exportWidth: 640, exportHeight: 360 },
      })) as AssemblerReceiptResult;
      setAssemblyReceipt(receipt);
      toast({
        title: receipt.status === "ok" ? "Assembly complete" : `Assembly ${receipt.status}`,
        description: receipt.transport.dryRun
          ? "Dry run — the plan, captions, and ducking are real; no render happened (no filmcraft-cli found)."
          : receipt.export.path
            ? `Exported ${receipt.export.bytes ?? "?"} bytes. Loudness was applied at export, not measured.`
            : receipt.export.note,
      });
    } catch (err: any) {
      setError(err?.message || "Unable to run the assembler.");
    } finally {
      setAssembleBusy(false);
    }
  };

  const handleGenerate = async () => {
    if (!state.idea?.selectedIdea || !state.cachedScript?.script || !state.cachedScript.evidenceContext) {
      setError("Board requires a selected idea, generated script, and matching snapshot.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest("POST", "/api/package/production-board", {
        topic: topic || "Untitled",
        scriptContent: state.cachedScript.script,
        selectedIdea: state.idea.selectedIdea,
        evidenceContext: state.cachedScript.evidenceContext,
        throughlineSections: throughlineSections.length > 0 ? throughlineSections : undefined,
      }) as ProductionBoardOutput;
      setBoard(result);
      setBoardData({ topic: topic || "Untitled", board: result, timestamp: Date.now() });
      toast({ title: "Board ready", description: `${result.storyboardPanels.length} panels · inferred pixels later.` });
    } catch (err: any) {
      setError(err?.message || "Unable to generate the production board.");
    } finally {
      setBusy(false);
    }
  };

  const shots = (board?.shots || []).filter((shot) => cameraFilter === "all" || shot.camera === cameraFilter);
  const canOpenRender = Boolean(board && boardCheck && boardCheck.status !== "fail");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Production board</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One throughline-bound storyboard. Then choose shoot myself, slides + voice, or cinematic on Render.
            Generated pictures and clones are always inferred. Cutroom does not upload to YouTube.
          </p>
        </div>
        <Badge variant="outline">v3 · no upload</Badge>
      </div>

      {!canGenerate && (
        <Alert>
          <AlertTitle>Board needs a grounded script</AlertTitle>
          <AlertDescription>
            Select an idea and generate a script first.
            <Button variant="outline" size="sm" className="ml-2" onClick={() => setLocation("/script")}>
              Open Script Writer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Board failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {boardCheck && (
        <Alert variant={boardCheck.status === "fail" ? "destructive" : "default"}>
          <AlertTitle>Board check: {boardCheck.status}</AlertTitle>
          <AlertDescription>
            {boardCheck.issues.length === 0
              ? "Throughline subset, snapshot, and shots look consistent. Open Render when you are ready."
              : boardCheck.issues.map((issue) => issue.message).join(" ")}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void handleGenerate()} disabled={busy || !canGenerate} data-testid="button-generate-board">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LayoutGrid className="mr-2 h-4 w-4" />}
          Generate board
        </Button>
        <Button
          variant="outline"
          onClick={() => setLocation("/video")}
          disabled={!canOpenRender}
          data-testid="button-open-render"
        >
          <Clapperboard className="mr-2 h-4 w-4" />
          Open Render
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleExportOtio()}
          disabled={otioBusy || !board || !proEnabled}
          data-testid="button-export-otio"
          title={proEnabled ? "Download this Board as an OpenTimelineIO timeline" : "Cutroom Pro feature — enable it in Settings"}
        >
          {otioBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
          Export OTIO{!proEnabled ? " (Pro)" : ""}
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleAssemblePlan()}
          disabled={assembleBusy || !board || !proEnabled}
          data-testid="button-assemble-plan"
          title={proEnabled ? "Build the assembly plan for this Board (FilmCraft)" : "Cutroom Pro feature — enable it in Settings"}
        >
          {assembleBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
          Assemble (Pro)
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={demoMedia}
            disabled={!proEnabled}
            onChange={(event) => setDemoMedia(event.target.checked)}
            data-testid="checkbox-assemble-demo-media"
          />
          Use FilmCraft demo footage (try it without your own clips)
        </label>
      </div>
      {!proEnabled && board && (
        <p className="text-xs text-muted-foreground">
          OTIO export is a Cutroom Pro feature — enable Cutroom Pro in Settings to download this Board as a timeline for FilmCraft, Premiere, or DaVinci.
        </p>
      )}

      {assemblyPlan && (
        <Card>
          <CardHeader>
            <CardTitle>Assembly plan — review before running</CardTitle>
            <CardDescription>
              {assemblyPlan.totalSeconds}s · {assemblyPlan.fps} fps · {assemblyPlan.placeholders.length} shot(s) without media
              {assemblyPlan.demoMedia ? " · demo footage" : ""} · loudness is applied at export, not measured.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {assemblyPlan.steps.map((step) => (
                <li key={step.seq}>
                  {step.label}
                  {step.skipReason ? <span className="text-muted-foreground"> — skipped: {step.skipReason}</span> : null}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Captions: {assemblyPlan.captions.cues.length} cue(s)
              {assemblyPlan.captions.captionless.length > 0 ? ` · no caption text for: ${assemblyPlan.captions.captionless.join(", ")}` : ""}
              {assemblyPlan.ducking.applied ? ` · music ducks to ${assemblyPlan.ducking.reduceDb} dB under narration.` : " · no music bed, no ducking."}
            </p>
            <div>
              <Button
                onClick={() => void handleAssembleRun()}
                disabled={assembleBusy || !board}
                data-testid="button-assemble-run"
              >
                {assembleBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
                Approve &amp; run assembly
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {assemblyReceipt && (
        <Card>
          <CardHeader>
            <CardTitle>Assembly receipt — {assemblyReceipt.runId}</CardTitle>
            <CardDescription>
              Status: {assemblyReceipt.status}
              {assemblyReceipt.transport.dryRun
                ? " · dry run — no render happened."
                : assemblyReceipt.export.path
                  ? ` · exported: ${assemblyReceipt.export.path}`
                  : ` · ${assemblyReceipt.export.note}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {assemblyReceipt.steps.map((step) => (
                <li key={step.seq}>
                  {step.label} — {step.status}
                  {step.error ? <span className="text-destructive"> — {step.error}</span> : null}
                  {step.note ? <span className="text-muted-foreground"> — {step.note}</span> : null}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Captions: {assemblyReceipt.captions.cues} cue(s)
              {assemblyReceipt.captions.captionless.length > 0 ? ` · no caption text for: ${assemblyReceipt.captions.captionless.join(", ")}` : ""}
              {assemblyReceipt.ducking.applied ? ` · music ducked to ${assemblyReceipt.ducking.reduceDb} dB; CLI returned ${assemblyReceipt.ducking.cliKeyframesReturned} keyframe(s).` : " · no ducking."}
              {" "}Loudness: not measured{assemblyReceipt.loudness.reason ? ` — ${assemblyReceipt.loudness.reason}` : "."}
              {" "}Cost: ${assemblyReceipt.cost.amount} {assemblyReceipt.cost.currency}.
            </p>
          </CardContent>
        </Card>
      )}

      {board && (
        <>
          <p className="text-xs text-muted-foreground">
            Snapshot {board.snapshotId.slice(0, 12)} · {board.characters.length} characters · {board.shots.length} shots
          </p>
          <Card>
            <CardHeader>
              <CardTitle>Talent / continuity</CardTitle>
              <CardDescription>Inferred unless you supplied notes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {board.characters.map((character) => (
                <div key={character.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{character.role}</p>
                    <Badge variant="outline">{character.evidenceClass}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {character.onScreen ? "On camera" : "Voice only"}
                    {character.wardrobeOrLook ? ` · ${character.wardrobeOrLook}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Storyboard</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3 overflow-x-auto pb-2">
              {board.storyboardPanels.map((panel) => (
                <div key={panel.id} className="min-w-[16rem] rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{panel.section}</p>
                  <p className="mt-1 font-medium">{panel.visual}</p>
                  {panel.onScreenText && <p className="mt-1 text-sm text-muted-foreground">On-screen: {panel.onScreenText}</p>}
                  <Badge variant="outline" className="mt-2">{panel.evidenceClass}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {["all", "a-cam", "b-roll", "screen", "insert"].map((camera) => (
              <Button
                key={camera}
                size="sm"
                variant={cameraFilter === camera ? "default" : "outline"}
                onClick={() => setCameraFilter(camera)}
                data-testid={`button-camera-${camera}`}
              >
                {camera}
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Shots</CardTitle>
              <CardDescription>Duration hints from teleprompter pace or the model — both inferred.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {shots.map((shot, index) => (
                <div key={`${shot.panelId}-${index}`} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{shot.shot}</p>
                    <Badge variant="outline">
                      {shot.camera}
                      {shot.durationHintSec ? ` · ${shot.durationHintSec}s inferred` : ""}
                    </Badge>
                  </div>
                  {shot.broll && <p className="mt-1 text-sm text-muted-foreground">B-roll: {shot.broll}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          {clipBriefs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Shorts / clip briefs</CardTitle>
                <CardDescription>Grouped from this board. Planning only — inferred.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {clipBriefs.map((brief) => (
                  <div key={`${brief.sectionTitle}-${brief.title}`} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{brief.title}</p>
                      <Badge variant="outline">{brief.evidenceClass} · ~{brief.estimatedSec}s</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{brief.hook}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/package" className="underline">Back to Package</Link>
        {" · "}
        <Link href="/video" className="underline">Render</Link>
      </p>
    </div>
  );
}
