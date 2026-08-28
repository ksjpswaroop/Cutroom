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

interface PublishPackage {
  titles?: { title: string }[];
  chapters?: { timestamp: string; title: string }[];
}

interface AssembleStatus {
  assemblePreviewEnabled: boolean;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  engine: "assemble";
}

interface AssembleResult {
  engine: "assemble";
  path: string;
  relativePath: string;
  durationSec: number;
}

export default function VideoPage() {
  const [, setLocation] = useLocation();
  const { state, goToStep, setPreviewData } = useWorkflow();
  const { toast } = useToast();
  const [status, setStatus] = useState<AssembleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssembleResult | null>(
    state.cachedPreview
      ? {
        engine: "assemble",
        path: state.cachedPreview.path,
        relativePath: state.cachedPreview.relativePath,
        durationSec: state.cachedPreview.durationSec,
      }
      : null,
  );
  const [previewRevision, setPreviewRevision] = useState(state.cachedPreview?.timestamp || 0);

  const publishPackage = (state.cachedPackage?.publishPackage || null) as PublishPackage | null;
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
        if (!response.ok) throw new Error(body.error || "Unable to load preview status.");
        setStatus(body as AssembleStatus);
      } catch (err: any) {
        setError(err?.message || "Unable to load preview status.");
      }
    };
    void load();
  }, []);

  const videoSrc = useMemo(() => {
    if (!state.id || !result) return null;
    return `/api/workflows/${encodeURIComponent(state.id)}/preview?t=${previewRevision}`;
  }, [state.id, result, previewRevision]);

  const handleAssemble = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = await apiRequest("POST", "/api/preview/assemble", {
        topic: topic || "Untitled",
        title,
        chapters: publishPackage?.chapters || [],
        scriptContent: state.cachedScript?.script || undefined,
        thumbnailDataUrl: state.cachedThumbnail?.thumbnailData || undefined,
        workflowId: state.id || undefined,
        workflowTitle: state.title || undefined,
      }) as AssembleResult;

      setResult(body);
      const stamp = Date.now();
      setPreviewRevision(stamp);
      setPreviewData({
        path: body.path,
        relativePath: body.relativePath,
        durationSec: body.durationSec,
        timestamp: stamp,
      });
      toast({
        title: "Preview assembled",
        description: `Wrote ${body.relativePath} (${Math.round(body.durationSec)}s).`,
      });
    } catch (err: any) {
      setError(err?.message || "Assemble failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      let previewDataUrl: string | undefined;
      if (state.id && result) {
        const response = await fetch(`/api/workflows/${encodeURIComponent(state.id)}/preview`, {
          cache: "no-store",
        });
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          previewDataUrl = `data:video/mp4;base64,${btoa(binary)}`;
        }
      }
      const exported = await exportProjectPack({
        topic: topic || "cutroom-project",
        workflowId: state.id,
        researchQuery: state.cachedResearch?.query,
        script: state.cachedScript?.script || undefined,
        thumbnailDataUrl: state.cachedThumbnail?.thumbnailData || undefined,
        publishPackage: state.cachedPackage?.publishPackage,
        productionBrief: state.cachedPackage?.productionBrief,
        previewDataUrl,
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assemble preview</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Local FFmpeg template only: title card, Ken Burns thumbnail, chapter cards, and narration captions.
            No generative video APIs.
          </p>
        </div>
        <Badge variant="outline">Optional · assemble</Badge>
      </div>

      {status && !status.assemblePreviewEnabled && (
        <Alert>
          <AlertTitle>Preview is Off</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Enable assemble preview in Settings (default Off).
            <Button variant="outline" size="sm" onClick={() => setLocation("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Open Settings
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {status?.assemblePreviewEnabled && !status.ffmpegAvailable && (
        <Alert variant="destructive">
          <AlertTitle>FFmpeg not found</AlertTitle>
          <AlertDescription>
            Install FFmpeg on this machine or set <code>FFMPEG_PATH</code> in the server environment.
          </AlertDescription>
        </Alert>
      )}

      {!publishPackage && (
        <Alert>
          <AlertTitle>Generate a publish package first</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Preview assembles titles, chapters, script, and thumbnail from the active workflow.
            <Button variant="outline" size="sm" asChild>
              <Link href="/package">Open Publish Package</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not continue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void handleAssemble()}
          disabled={busy || !status?.assemblePreviewEnabled || !status.ffmpegAvailable || !publishPackage}
          data-testid="button-assemble-preview"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
          Assemble preview.mp4
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleExport()}
          disabled={busy || !result}
          data-testid="button-export-with-preview"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
          Export pack with preview
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview player</CardTitle>
          <CardDescription>
            {result
              ? `${result.relativePath} · ${Math.round(result.durationSec)}s · engine ${result.engine}`
              : "No preview rendered yet for this workflow."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {videoSrc ? (
            <video
              key={videoSrc}
              controls
              className="aspect-video w-full rounded-md bg-black"
              src={videoSrc}
              data-testid="video-assemble-preview"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              Assemble to write preview.mp4 into the project folder.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
