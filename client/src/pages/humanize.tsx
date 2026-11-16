import { useState } from "react";
import { Copy, Loader2, Wand2 } from "lucide-react";
import { humanizeSummary, type HumanizeResult } from "@shared/creator-modules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function HumanizePage() {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<HumanizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const summary = result ? humanizeSummary(result) : null;

  const run = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    try {
      const body = await apiRequest("POST", "/api/humanize", { text: input }) as { result: HumanizeResult };
      setOutput(body.result.output);
      setResult(body.result);
    } catch (err: any) {
      toast({ title: "Humanize failed", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    void navigator.clipboard?.writeText(output);
    toast({ title: "Copied", description: "Humanized text copied to the clipboard." });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Humanize</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Strip robotic phrasing and improve flow. Runs through your active Cutroom provider (Gemini, Ollama, and others),
          with a local deterministic rewrite when no provider is configured.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" />Humanize text</CardTitle>
          <CardDescription>Paste an AI-generated draft. Nothing leaves this machine unless a hosted provider is active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <b className="text-sm">Draft</b>
              <Textarea
                className="mt-2 min-h-[300px]"
                value={input}
                placeholder="Paste AI-generated text…"
                onChange={(e) => setInput(e.target.value)}
                data-testid="input-humanize-draft"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <b className="text-sm">Humanized</b>
                {summary && (
                  <Badge variant={summary.isFallback ? "secondary" : "outline"}>
                    {summary.provider} · {summary.headline}
                  </Badge>
                )}
              </div>
              {summary?.isFallback && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="text-humanize-fallback">
                  No provider configured — used the local deterministic rewrite. Configure a provider in Settings for a fuller rewrite.
                </p>
              )}
              <Textarea
                className="mt-2 min-h-[300px]"
                value={output}
                placeholder="Result appears here…"
                onChange={(e) => setOutput(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void run()} disabled={busy || !input.trim()} data-testid="button-humanize">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Humanize
            </Button>
            <Button type="button" variant="outline" onClick={copy} disabled={!output}>
              <Copy className="mr-2 h-4 w-4" />Copy result
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
