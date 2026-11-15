import { useEffect, useState } from "react";
import { KanbanSquare, Trash2 } from "lucide-react";
import type { Channel, ProductionItem, ProductionStage } from "@shared/creator-modules";
import { productionStages } from "@shared/creator-modules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const STAGE_LABELS: Record<ProductionStage, string> = {
  idea: "Idea",
  research: "Research",
  scripting: "Scripting",
  review: "Review",
  published: "Published",
};

export default function OperationsPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const { activeChannelId, setActiveChannelId } = useActiveChannel();
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [title, setTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<ProductionStage | null>(null);
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
      setItems([]);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(`/api/production?channelId=${encodeURIComponent(active.id)}`, { cache: "no-store" });
        const body = await response.json();
        if (response.ok) setItems(body.items || []);
      } catch {
        setItems([]);
      }
    })();
  }, [active?.id]);

  const add = async () => {
    if (!active || !title.trim()) return;
    try {
      const body = await apiRequest("POST", "/api/production", {
        channelId: active.id,
        title: title.trim(),
      }) as { item: ProductionItem };
      setItems((current) => [...current, body.item]);
      setTitle("");
    } catch (err: any) {
      toast({ title: "Could not add item", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  const moveTo = async (stage: ProductionStage) => {
    const id = dragId;
    setDragId(null);
    setHoverStage(null);
    if (!id) return;
    const previous = items;
    setItems((current) => current.map((it) => (it.id === id ? { ...it, stage } : it)));
    try {
      await apiRequest("PATCH", `/api/production/${encodeURIComponent(id)}`, { stage });
    } catch (err: any) {
      setItems(previous);
      toast({ title: "Move failed", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    const previous = items;
    setItems((current) => current.filter((it) => it.id !== id));
    try {
      await apiRequest("DELETE", `/api/production/${encodeURIComponent(id)}`);
    } catch (err: any) {
      setItems(previous);
      toast({ title: "Delete failed", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kanban pipeline — move work from idea to published. Local to this machine.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Operations unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2"><KanbanSquare className="h-4 w-4" />Pipeline</span>
            <div className="flex items-center gap-2">
              <Select value={active?.id || ""} onValueChange={(v) => setActiveChannelId(v)}>
                <SelectTrigger className="w-[180px]" aria-label="Active channel"><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!active ? (
            <p className="text-sm text-muted-foreground">Add a channel on the Channels page first.</p>
          ) : (
            <>
              <div className="mb-4 flex gap-2">
                <Input
                  value={title}
                  placeholder="New item title…"
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
                  data-testid="input-production-title"
                />
                <Button type="button" onClick={() => void add()} disabled={!title.trim()}>Add</Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {productionStages.map((stage) => {
                  const cards = items.filter((it) => it.stage === stage);
                  return (
                    <div
                      key={stage}
                      className={`rounded-md border p-2 ${hoverStage === stage ? "border-primary bg-primary/5" : "border-border"}`}
                      onDragOver={(e) => { e.preventDefault(); setHoverStage(stage); }}
                      onDragLeave={() => setHoverStage((h) => (h === stage ? null : h))}
                      onDrop={() => void moveTo(stage)}
                    >
                      <div className="mb-2 flex items-center justify-between px-1 text-sm font-medium">
                        <span>{STAGE_LABELS[stage]}</span>
                        <Badge variant="secondary">{cards.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {cards.map((card) => (
                          <div
                            key={card.id}
                            className="cursor-grab rounded-md border border-border bg-card p-2 text-sm active:cursor-grabbing"
                            draggable
                            onDragStart={() => setDragId(card.id)}
                            onDragEnd={() => { setDragId(null); setHoverStage(null); }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="min-w-0 break-words font-medium">{card.title}</span>
                              <button type="button" onClick={() => void remove(card.id)} aria-label={`Delete ${card.title}`} className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
