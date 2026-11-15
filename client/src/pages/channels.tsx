import { FormEvent, useEffect, useState } from "react";
import { BarChart3, Loader2, Plus, Trash2, Tv } from "lucide-react";
import type { Channel, ChannelIntelligence } from "@shared/creator-modules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useActiveChannel } from "@/lib/active-channel";

interface ChannelMemory {
  production: number;
  personas: number;
  stageBreakdown: Record<string, number>;
}

export default function ChannelsPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [subscribers, setSubscribers] = useState("");
  const [saving, setSaving] = useState(false);
  const { activeChannelId, setActiveChannelId } = useActiveChannel();
  const [analysis, setAnalysis] = useState<ChannelIntelligence | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [memory, setMemory] = useState<ChannelMemory | null>(null);

  const active = channels.find((c) => c.id === activeChannelId) || channels[0] || null;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/channels", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load channels.");
      setChannels(body.channels || []);
    } catch (err: any) {
      setError(err?.message || "Unable to load channels.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!active) {
      setMemory(null);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(`/api/channels/${encodeURIComponent(active.id)}/memory`, { cache: "no-store" });
        const body = await response.json();
        if (response.ok) setMemory(body.memory);
      } catch {
        setMemory(null);
      }
    })();
  }, [active?.id]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = await apiRequest("POST", "/api/channels", {
        name: name.trim(),
        niche: niche.trim(),
        ...(subscribers ? { subscribers: Number(subscribers) || 0 } : {}),
      }) as { channel: Channel };
      setChannels((current) => [body.channel, ...current]);
      setActiveChannelId(body.channel.id);
      setName("");
      setNiche("");
      setSubscribers("");
      toast({ title: "Channel added", description: "Saved locally on this machine." });
    } catch (err: any) {
      toast({ title: "Could not add channel", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/channels/${encodeURIComponent(id)}`);
      setChannels((current) => current.filter((c) => c.id !== id));
      if (activeChannelId === id) setActiveChannelId(null);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  const runAnalysis = async () => {
    if (!active) return;
    setAnalyzing(true);
    try {
      const body = await apiRequest("POST", "/api/channels/intelligence", {
        niche: active.niche || active.name,
        scriptTitles: [],
      }) as { intelligence: ChannelIntelligence };
      setAnalysis(body.intelligence);
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Channels</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage channels, switch the active workspace, and review inferred channel intelligence and local memory.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Channels unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Tv className="h-4 w-4" />Channels ({channels.length})</CardTitle>
          <CardDescription>Each channel keeps its own production board and audience personas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels yet. Add one below.</p>
          ) : (
            channels.map((c) => {
              const isActive = c.id === active?.id;
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{c.name}</p>
                      {isActive && <Badge variant="default">Active</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.niche || "No niche set"} · {c.subscribers.toLocaleString()} subs</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={isActive} onClick={() => setActiveChannelId(c.id)}>
                      {isActive ? "Active" : "Set active"}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => void handleDelete(c.id)} aria-label={`Delete ${c.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Add channel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="ch-name">Name</Label>
                <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AI Builders" required data-testid="input-channel-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ch-niche">Niche</Label>
                <Input id="ch-niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. AI tooling for developers" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ch-subs">Subscribers</Label>
                <Input id="ch-subs" type="number" value={subscribers} onChange={(e) => setSubscribers(e.target.value)} placeholder="0" />
              </div>
            </div>
            <Button type="submit" disabled={saving || !name.trim()} data-testid="button-channel-add">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add channel
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Channel intelligence</span>
              <Button type="button" size="sm" disabled={!active || analyzing} onClick={() => void runAnalysis()}>
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Run analysis
              </Button>
            </CardTitle>
            <CardDescription>{active ? `Inferred analysis for “${active.name}”.` : "Add a channel first."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!analysis ? (
              <p className="text-sm text-muted-foreground">Run an analysis to surface performance, gaps, and growth recommendations.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <Badge variant="outline">Inferred · {analysis.confidence} confidence</Badge>
                <div><b>Performance</b><p className="mt-1 text-muted-foreground">{analysis.performance}</p></div>
                <div><b>Content gaps</b><ul className="mt-1 list-disc pl-5 text-muted-foreground">{analysis.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
                <div><b>Growth</b><ul className="mt-1 list-disc pl-5 text-muted-foreground">{analysis.growth.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
                <div><b>Benchmark</b><p className="mt-1 text-muted-foreground">{analysis.benchmark}</p></div>
                <p className="text-xs text-muted-foreground">{analysis.limitations[0]}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel memory</CardTitle>
            <CardDescription>{active ? `Local knowledge for “${active.name}”.` : "No active channel."}</CardDescription>
          </CardHeader>
          <CardContent>
            {!active || !memory ? (
              <p className="text-sm text-muted-foreground">No active channel.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border p-3"><span className="text-muted-foreground">Board items</span><div className="text-xl font-semibold">{memory.production}</div></div>
                <div className="rounded-md border border-border p-3"><span className="text-muted-foreground">Personas</span><div className="text-xl font-semibold">{memory.personas}</div></div>
                <div className="col-span-2 rounded-md border border-border p-3">
                  <span className="text-muted-foreground">Pipeline</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Object.entries(memory.stageBreakdown).map(([stage, n]) => <Badge key={stage} variant="outline">{stage}: {n}</Badge>)}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
