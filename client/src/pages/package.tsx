import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardList, Download, Loader2, Package, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useWorkflow } from "@/lib/workflow-context";
import { exportProjectPack } from "@/lib/export-pack";

interface PublishPackage {
  titles: { title: string; rationale: string; evidenceClass: string }[];
  hooks: { hook: string; rationale: string; evidenceClass: string }[];
  description: string;
  tags: string[];
  chapters: { timestamp: string; title: string }[];
  pinnedComment: string;
  endScreenSuggestions: string[];
  measurementChecklist: { metric: string; why: string; requiresStudio: true }[];
}

interface ProductionBrief {
  shotList: { section: string; shot: string; broll?: string; onScreenText?: string }[];
  chapterMarkers: { timestamp: string; title: string }[];
  propsAndLocations: string[];
  teleprompterCues: string[];
}

export default function PackagePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { state, setPackageData, goToStep } = useWorkflow();
  const [busy, setBusy] = useState<"package" | "brief" | "export" | null>(null);
  const [publishPackage, setPublishPackage] = useState<PublishPackage | null>(null);
  const [productionBrief, setProductionBrief] = useState<ProductionBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    goToStep("package");
  }, [goToStep]);

  useEffect(() => {
    setPublishPackage((state.cachedPackage?.publishPackage as PublishPackage | null) || null);
    setProductionBrief((state.cachedPackage?.productionBrief as ProductionBrief | null) || null);
  }, [state.id, state.cachedPackage?.timestamp, state.cachedPackage?.publishPackage, state.cachedPackage?.productionBrief]);

  const topic = state.idea?.selectedIdea?.title
    || state.cachedScript?.topic
    || state.cachedResearch?.query
    || state.cachedThumbnail?.topic
    || "";

  const generatePackage = async () => {
    if (!topic.trim()) {
      setError("Select an idea or generate a script first so the package has a topic.");
      return;
    }
    setBusy("package");
    setError(null);
    try {
      const selectedIdea = state.idea?.selectedIdea ?? undefined;
      const evidenceContext =
        state.idea?.evidenceContext
        || state.cachedScript?.evidenceContext
        || undefined;
      const payload: Record<string, unknown> = {
        topic,
      };
      if (selectedIdea) payload.selectedIdea = selectedIdea;
      if (state.cachedScript?.script) payload.scriptContent = state.cachedScript.script;
      if (evidenceContext) payload.evidenceContext = evidenceContext;

      const body = await apiRequest("POST", "/api/package/generate", payload) as PublishPackage;
      setPublishPackage(body);
      setPackageData({
        topic,
        publishPackage: body,
        productionBrief,
        timestamp: Date.now(),
      });
      toast({ title: "Publish package ready", description: "Titles, hooks, and upload copy are drafted." });
    } catch (err: any) {
      setError(err?.message || "Unable to generate the publish package.");
    } finally {
      setBusy(null);
    }
  };

  const generateBrief = async () => {
    if (!state.cachedScript?.script) {
      setError("Generate a script first to build a production brief.");
      return;
    }
    setBusy("brief");
    setError(null);
    try {
      const evidenceContext = state.cachedScript.evidenceContext || undefined;
      const payload: Record<string, unknown> = {
        topic: topic || state.cachedScript.topic,
        scriptContent: state.cachedScript.script,
      };
      if (evidenceContext) payload.evidenceContext = evidenceContext;

      const body = await apiRequest("POST", "/api/package/production-brief", payload) as ProductionBrief;
      setProductionBrief(body);
      setPackageData({
        topic: topic || state.cachedScript.topic,
        publishPackage,
        productionBrief: body,
        timestamp: Date.now(),
      });
      toast({ title: "Production brief ready", description: "Shot list and teleprompter cues are available." });
    } catch (err: any) {
      setError(err?.message || "Unable to generate the production brief.");
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    setBusy("export");
    setError(null);
    try {
      const result = await exportProjectPack({
        topic: topic || "cutroom-project",
        workflowId: state.id,
        researchQuery: state.cachedResearch?.query,
        script: state.cachedScript?.script,
        thumbnailDataUrl: state.cachedThumbnail?.thumbnailData || undefined,
        publishPackage,
        productionBrief,
      });
      toast({
        title: result.mode === "desktop" ? "Exported to folder" : "Download started",
        description: result.path || "Project pack files were downloaded in the browser.",
      });
    } catch (err: any) {
      setError(err?.message || "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Publish package</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compose titles, hooks, description, tags, chapters, and a Studio measurement checklist from the active idea and script.
          </p>
        </div>
        <Badge variant="outline">Step 4 of 4</Badge>
      </div>

      {!topic && (
        <Alert>
          <AlertTitle>Continue from Research or Script</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Choose a grounded idea or generate a script first.
            <Button variant="outline" size="sm" onClick={() => setLocation("/")}>Research</Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/script")}>Script Writer</Button>
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
        <Button onClick={() => void generatePackage()} disabled={busy !== null || !topic}>
          {busy === "package" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
          Generate publish package
        </Button>
        <Button variant="secondary" onClick={() => void generateBrief()} disabled={busy !== null || !state.cachedScript?.script}>
          {busy === "brief" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
          Production brief
        </Button>
        <Button variant="outline" onClick={() => void handleExport()} disabled={busy !== null}>
          {busy === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export project pack
        </Button>
      </div>

      {publishPackage && (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Title & hook lab</CardTitle>
              <CardDescription>Observed vs inferred framing. Never invents search volume.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Titles</h3>
                {publishPackage.titles.map((item) => (
                  <div key={item.title} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge variant="outline">{item.evidenceClass}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.rationale}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Hooks</h3>
                {publishPackage.hooks.map((item) => (
                  <div key={item.hook} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{item.hook}</p>
                      <Badge variant="outline">{item.evidenceClass}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.rationale}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upload copy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold">Description</h3>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{publishPackage.description}</p>
              </div>
              <div>
                <h3 className="font-semibold">Tags</h3>
                <p className="mt-1 text-muted-foreground">{publishPackage.tags.join(", ")}</p>
              </div>
              <div>
                <h3 className="font-semibold">Chapters</h3>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {publishPackage.chapters.map((chapter) => (
                    <li key={`${chapter.timestamp}-${chapter.title}`}>{chapter.timestamp} — {chapter.title}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold">Pinned comment</h3>
                <p className="mt-1 text-muted-foreground">{publishPackage.pinnedComment}</p>
              </div>
              <div>
                <h3 className="font-semibold">End screen suggestions</h3>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {publishPackage.endScreenSuggestions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold">Studio measurement checklist</h3>
                <ul className="mt-1 space-y-2">
                  {publishPackage.measurementChecklist.map((item) => (
                    <li key={item.metric} className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.metric}</span>
                        <Badge variant="outline">Requires Studio</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{item.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {productionBrief && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Production brief</CardTitle>
            <CardDescription>Shot list, B-roll, and teleprompter cues from the script.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-2">
              {productionBrief.shotList.map((shot, index) => (
                <li key={`${shot.section}-${index}`} className="rounded-md border border-border p-3">
                  <p className="font-medium">{shot.section}</p>
                  <p className="mt-1 text-muted-foreground">{shot.shot}</p>
                  {shot.broll && <p className="mt-1 text-muted-foreground">B-roll: {shot.broll}</p>}
                  {shot.onScreenText && <p className="mt-1 text-muted-foreground">On-screen: {shot.onScreenText}</p>}
                </li>
              ))}
            </ul>
            {productionBrief.teleprompterCues.length > 0 && (
              <div>
                <h3 className="font-semibold">Teleprompter cues</h3>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {productionBrief.teleprompterCues.map((cue) => <li key={cue}>{cue}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Prefer a different thumbnail? <Link href="/thumbnail" className="underline">Open Thumbnail Creator</Link>.
      </p>
    </div>
  );
}
