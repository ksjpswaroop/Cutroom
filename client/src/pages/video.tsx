import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Clapperboard, Loader2, Settings, Film } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useWorkflow } from "@/lib/workflow-context";
import { apiRequest } from "@/lib/queryClient";
import { exportProjectPack } from "@/lib/export-pack";
import type { ProductionBoardOutput } from "@shared/board-contracts";
import type { CinematicQuote } from "@shared/render-contracts";

interface PublishPackage {
  titles?: { title: string }[];
  chapters?: { timestamp: string; title: string }[];
}

interface RenderStatus {
  assemblePreviewEnabled: boolean;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  engine: string;
  render?: {
    engines: string[];
    youtubeUpload: boolean;
    elevenLabs: boolean;
    voiceConsent: boolean;
    cinematicVeo: boolean;
    hailuoH3?: boolean;
    videoModel?: string;
    evidenceClass: "inferred";
  };
}

interface WatchFile {
  engine: string;
  path: string;
  relativePath: string;
  durationSec: number;
  evidenceClass: "inferred";
  playKind: "preview" | "render";
  voiceSource?: string;
}

type RenderEngine = "shoot" | "slides" | "cinematic" | "assemble";

export default function VideoPage() {
  const [, setLocation] = useLocation();
  const { state, goToStep, setPreviewData } = useWorkflow();
  const { toast } = useToast();
  const [status, setStatus] = useState<RenderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<RenderEngine>("slides");
  const [quote, setQuote] = useState<CinematicQuote | null>(null);
  const [result, setResult] = useState<WatchFile | null>(
    state.cachedPreview
      ? {
        engine: state.cachedPreview.engine || "assemble",
        path: state.cachedPreview.path,
        relativePath: state.cachedPreview.relativePath,
        durationSec: state.cachedPreview.durationSec,
        evidenceClass: "inferred",
        playKind: state.cachedPreview.playKind || "preview",
      }
      : null,
  );
  const [previewRevision, setPreviewRevision] = useState(state.cachedPreview?.timestamp || 0);

  const publishPackage = (state.cachedPackage?.publishPackage || null) as PublishPackage | null;
  const board = (state.cachedBoard?.board || null) as ProductionBoardOutput | null;
  const topic = state.cachedPackage?.topic
    || state.cachedScript?.topic
    || state.idea?.selectedIdea?.title
    || state.idea?.niche
    || state.cachedResearch?.query
    || "";
  const title = publishPackage?.titles?.[0]?.title || topic || "Cutroom preview";

  useEffect(() => {
    goToStep("video");
  }, [goToStep]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/preview/status", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load render status.");
        setStatus(body as RenderStatus);
      } catch (err: any) {
        setError(err?.message || "Unable to load render status.");
      }
    };
    void load();
  }, []);

  const videoSrc = useMemo(() => {
    if (!state.id || !result) return null;
    const kind = result.playKind === "render" ? "render" : "preview";
    return `/api/workflows/${encodeURIComponent(state.id)}/${kind}?t=${previewRevision}`;
  }, [state.id, result, previewRevision]);

  const renderPayload = () => ({
    topic: topic || "Untitled",
    title,
    chapters: publishPackage?.chapters || [],
    scriptContent: state.cachedScript?.script || undefined,
    thumbnailDataUrl: state.cachedThumbnail?.thumbnailData || undefined,
    workflowId: state.id || undefined,
    workflowTitle: state.title || undefined,
    snapshotId: state.cachedScript?.evidenceContext?.snapshotId,
    board: board || undefined,
    voiceConsent: status?.render?.voiceConsent ? true as const : undefined,
  });

  const persistWatchFile = (body: {
    engine: string;
    path?: string;
    relativePath?: string;
    durationSec?: number;
    playKind: "preview" | "render";
    voiceSource?: string;
  }) => {
    if (!body.path || !body.relativePath) return;
    const stamp = Date.now();
    const next: WatchFile = {
      engine: body.engine,
      path: body.path,
      relativePath: body.relativePath,
      durationSec: body.durationSec || 0,
      evidenceClass: "inferred",
      playKind: body.playKind,
      voiceSource: body.voiceSource,
    };
    setResult(next);
    setPreviewRevision(stamp);
    setPreviewData({
      path: next.path,
      relativePath: next.relativePath,
      durationSec: next.durationSec,
      timestamp: stamp,
      engine: next.engine,
      evidenceClass: "inferred",
      playKind: next.playKind,
    });
  };

  const handleQuote = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = await apiRequest("POST", "/api/preview/quote", { board }) as CinematicQuote;
      setQuote(body);
    } catch (err: any) {
      setError(err?.message || "Unable to quote cinematic.");
    } finally {
      setBusy(false);
    }
  };

  const handleRender = async (confirmCinematic = false) => {
    setBusy(true);
    setError(null);
    try {
      if (engine === "assemble") {
        const body = await apiRequest("POST", "/api/preview/assemble", renderPayload()) as {
          engine: string;
          path: string;
          relativePath: string;
          durationSec: number;
        };
        persistWatchFile({ ...body, playKind: "preview" });
        toast({ title: "Preview assembled", description: `Wrote ${body.relativePath} (inferred packaging animatic).` });
        return;
      }

      if (engine === "cinematic" && !confirmCinematic) {
        await handleQuote();
        return;
      }

      const body = await apiRequest("POST", "/api/preview/render", {
        ...renderPayload(),
        engine,
        ...(engine === "cinematic" ? { confirmCinematic: true as const, maxShots: 5 } : {}),
      }) as {
        engine: string;
        path?: string;
        relativePath?: string;
        durationSec?: number;
        evidenceClass: "inferred";
        voiceSource?: string;
      };

      if (engine === "shoot") {
        toast({
          title: "Shoot pack ready",
          description: "No generated video. Export the pack and film from the Board / teleprompter.",
        });
        return;
      }

      persistWatchFile({ ...body, playKind: "render" });
      toast({
        title: "Render ready",
        description: `${body.relativePath} · inferred · ${body.voiceSource || "captions"}`,
      });
      setQuote(null);
    } catch (err: any) {
      setError(err?.message || "Render failed.");
    } finally {
      setBusy(false);
    }
  };

  const fetchDataUrl = async (kind: "preview" | "render"): Promise<string | undefined> => {
    if (!state.id) return undefined;
    const response = await fetch(`/api/workflows/${encodeURIComponent(state.id)}/${kind}`, { cache: "no-store" });
    if (!response.ok) return undefined;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:video/mp4;base64,${btoa(binary)}`;
  };

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const previewDataUrl = await fetchDataUrl("preview");
      const renderDataUrl = await fetchDataUrl("render");
      const exported = await exportProjectPack({
        topic: topic || "cutroom-project",
        workflowId: state.id,
        researchQuery: state.cachedResearch?.query,
        script: state.cachedScript?.script || undefined,
        thumbnailDataUrl: state.cachedThumbnail?.thumbnailData || undefined,
        publishPackage: state.cachedPackage?.publishPackage,
        productionBrief: state.cachedPackage?.productionBrief,
        productionBoard: board,
        previewDataUrl,
        renderDataUrl,
      });
      toast({
        title: "Project pack exported",
        description: exported.mode === "desktop"
          ? `Saved to ${exported.path}`
          : "Downloads started in the browser.",
      });
    } catch (err: any) {
      setError(err?.message || "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const ffmpegReady = Boolean(status?.ffmpegAvailable);
  const assembleOn = Boolean(status?.assemblePreviewEnabled);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Render</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Shoot myself (filmable pack), slides + voice, or cinematic Shorts. Generated pixels and clones are inferred.
            Cutroom never uploads to YouTube.
          </p>
        </div>
        <Badge variant="outline">inferred · no upload</Badge>
      </div>

      {!board && (
        <Alert>
          <AlertTitle>Generate a Board first</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Render modes use the throughline-bound storyboard.
            <Button variant="outline" size="sm" asChild>
              <Link href="/board">Open Board</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {status?.render?.youtubeUpload === false && (
        <p className="text-xs text-muted-foreground">
          Voice clone uses your Settings voice id only — never a creator from Research.
          {status.render.voiceConsent ? " Consent is on." : " Consent is off until you confirm in Settings."}
          {status.render.hailuoH3
            ? " Cinematic uses MiniMax Hailuo H3 after a cost quote."
            : ""}
        </p>
      )}

      {engine === "assemble" && !assembleOn && (
        <Alert>
          <AlertTitle>Assemble preview is Off</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Optional packaging animatic. Enable it in Settings if you want preview.mp4 without a voice key.
            <Button variant="outline" size="sm" onClick={() => setLocation("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Open Settings
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {(engine === "slides" || engine === "cinematic" || engine === "assemble") && !ffmpegReady && (
        <Alert variant="destructive">
          <AlertTitle>FFmpeg not found</AlertTitle>
          <AlertDescription>
            Install FFmpeg on this machine or set <code>FFMPEG_PATH</code> in the server environment.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not continue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2" data-testid="render-engine-picker">
        {([
          { id: "shoot" as const, label: "Shoot myself" },
          { id: "slides" as const, label: "Slides + voice" },
          { id: "cinematic" as const, label: "Cinematic Shorts" },
          { id: "assemble" as const, label: "Assemble preview" },
        ]).map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={engine === item.id ? "default" : "outline"}
            onClick={() => {
              setEngine(item.id);
              setQuote(null);
            }}
            data-testid={`button-engine-${item.id}`}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {quote && engine === "cinematic" && (
        <Alert>
          <AlertTitle>Confirm cinematic ({quote.shotCount} shots · {quote.currency} {quote.estimatedUsd.toFixed(2)})</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{quote.note}</p>
            <Button
              size="sm"
              onClick={() => void handleRender(true)}
              disabled={busy || !ffmpegReady}
              data-testid="button-confirm-cinematic"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm and render
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void handleRender(false)}
          disabled={busy || (engine !== "shoot" && !ffmpegReady) || (engine === "assemble" && !assembleOn) || (engine !== "assemble" && !board)}
          data-testid="button-run-render"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
          {engine === "shoot"
            ? "Prepare shoot pack"
            : engine === "cinematic"
              ? (quote ? "Quote again" : "Quote cinematic")
              : engine === "assemble"
                ? "Assemble preview.mp4"
                : "Render slides + voice"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleExport()}
          disabled={busy}
          data-testid="button-export-with-preview"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
          Export pack
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review player</CardTitle>
          <CardDescription>
            {result
              ? `${result.relativePath} · ${Math.round(result.durationSec)}s · ${result.engine} · ${result.evidenceClass}`
              : "No watch file yet. Slides and cinematic write render.mp4. Shoot exports the pack only."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {videoSrc ? (
            <video
              key={videoSrc}
              controls
              className="aspect-video w-full rounded-md bg-black"
              src={videoSrc}
              data-testid="video-review-player"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              Play a generated render.mp4 here, or export a filmable pack.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
