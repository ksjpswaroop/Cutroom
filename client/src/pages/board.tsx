import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Clapperboard, LayoutGrid, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useWorkflow } from "@/lib/workflow-context";
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
      </div>

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
