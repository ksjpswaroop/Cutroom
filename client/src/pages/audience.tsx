import { useEffect, useState } from "react";
import { Download, Loader2, Trash2, Users } from "lucide-react";
import type { AudiencePersona, Channel } from "@shared/creator-modules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useActiveChannel } from "@/lib/active-channel";

export default function AudiencePage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const { activeChannelId, setActiveChannelId } = useActiveChannel();
  const [personas, setPersonas] = useState<AudiencePersona[]>([]);
  const [avatar, setAvatar] = useState("");
  const [busyPersona, setBusyPersona] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = channels.find((c) => c.id === activeChannelId) || channels[0] || null;

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/channels", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load channels.");
        setChannels(body.channels || []);
      } catch (err: any) {
        setError(err?.message || "Unable to load channels.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!active) {
      setPersonas([]);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(`/api/personas?channelId=${encodeURIComponent(active.id)}`, { cache: "no-store" });
        const body = await response.json();
        if (response.ok) setPersonas(body.personas || []);
      } catch {
        setPersonas([]);
      }
    })();
  }, [active?.id]);

  const generatePersona = async () => {
    if (!active) return;
    setBusyPersona(true);
    try {
      const body = await apiRequest("POST", "/api/personas", {
        channelId: active.id,
        channelName: active.name,
        niche: active.niche || "",
      }) as { persona: AudiencePersona };
      setPersonas((current) => [body.persona, ...current]);
    } catch (err: any) {
      toast({ title: "Could not generate persona", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setBusyPersona(false);
    }
  };

  const deletePersona = async (id: string) => {
    const previous = personas;
    setPersonas((current) => current.filter((p) => p.id !== id));
    try {
      await apiRequest("DELETE", `/api/personas/${encodeURIComponent(id)}`);
    } catch (err: any) {
      setPersonas(previous);
      toast({ title: "Delete failed", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  const buildAvatar = async () => {
    if (!active) return;
    setBusyAvatar(true);
    try {
      const body = await apiRequest("POST", "/api/audience/avatar", {
        channelName: active.name,
        niche: active.niche || "",
      }) as { avatar: { markdown: string } };
      setAvatar(body.avatar.markdown);
    } catch (err: any) {
      toast({ title: "Could not build avatar", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setBusyAvatar(false);
    }
  };

  const exportAvatar = () => {
    if (!avatar) return;
    const blob = new Blob([avatar], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audience-avatar.md";
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "Avatar exported", description: "Saved audience-avatar.md." });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audience</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inferred personas and an exportable audience avatar. Synthesized, not measured from YouTube Studio.
          </p>
        </div>
        <Select value={active?.id || ""} onValueChange={(v) => setActiveChannelId(v)}>
          <SelectTrigger className="w-[180px]" aria-label="Active channel"><SelectValue placeholder="Select channel" /></SelectTrigger>
          <SelectContent>
            {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Audience unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Users className="h-4 w-4" />Personas</span>
              <Button type="button" size="sm" disabled={!active || busyPersona} onClick={() => void generatePersona()}>
                {busyPersona ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Generate
              </Button>
            </CardTitle>
            <CardDescription>Demographics, pain points, intent, and how to speak to them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {personas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No personas yet. Generate one above.</p>
            ) : (
              personas.map((p) => (
                <div key={p.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b>{p.name}</b>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Inferred</Badge>
                      <button type="button" onClick={() => void deletePersona(p.id)} aria-label={`Delete ${p.name}`} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-muted-foreground">{p.demographics}</p>
                  <p className="mt-2"><b className="text-xs">Intent:</b> <span className="text-muted-foreground">{p.intent}</span></p>
                  <div className="mt-2">
                    <b className="text-xs">Pain points</b>
                    <ul className="list-disc pl-5 text-muted-foreground">{p.painPoints.map((pt, i) => <li key={i}>{pt}</li>)}</ul>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">{p.interests.map((it, i) => <Badge key={i} variant="secondary">{it}</Badge>)}</div>
                  <p className="mt-2 text-muted-foreground"><b className="text-xs">Messaging:</b> {p.messaging}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Audience avatar</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!active || busyAvatar} onClick={() => void buildAvatar()}>
                  {busyAvatar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Build
                </Button>
                <Button type="button" size="sm" disabled={!avatar} onClick={exportAvatar}>
                  <Download className="mr-2 h-4 w-4" />Export
                </Button>
              </div>
            </CardTitle>
            <CardDescription>A complete, narrative profile of your ideal viewer.</CardDescription>
          </CardHeader>
          <CardContent>
            {avatar ? (
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{avatar}</pre>
            ) : (
              <p className="text-sm text-muted-foreground">No avatar yet. Build one above.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
