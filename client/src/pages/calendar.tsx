import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CalendarItem {
  id: string;
  theme: string;
  plannedDate?: string;
  status: "idea" | "scripted" | "packaged" | "published";
  notes: string;
  workflowId?: string;
  createdAt: number;
  updatedAt: number;
}

export default function CalendarPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/calendar", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load calendar.");
      setItems(body.items || []);
    } catch (err: any) {
      setError(err?.message || "Unable to load calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!theme.trim()) return;
    setSaving(true);
    try {
      const body = await apiRequest("POST", "/api/calendar", {
        theme: theme.trim(),
        ...(plannedDate ? { plannedDate } : {}),
        notes: notes.trim(),
        status: "idea",
      }) as { item: CalendarItem };
      setItems((current) => [body.item, ...current]);
      setTheme("");
      setPlannedDate("");
      setNotes("");
      toast({ title: "Added to calendar", description: "Local batch pipeline item saved on this machine." });
    } catch (err: any) {
      toast({ title: "Could not add item", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id: string, status: CalendarItem["status"]) => {
    try {
      const body = await apiRequest("PUT", `/api/calendar/${encodeURIComponent(id)}`, { status }) as { item: CalendarItem };
      setItems((current) => current.map((item) => (item.id === id ? body.item : item)));
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/calendar/${encodeURIComponent(id)}`);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Local batch pipeline: theme → status. No Google Calendar sync — planning only on this machine.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Calendar unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Plan a theme</CardTitle>
          <CardDescription>Capture ideas for a publishing batch without leaving Cutroom.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cal-theme">Theme</Label>
                <Input id="cal-theme" value={theme} onChange={(e) => setTheme(e.target.value)} required data-testid="input-calendar-theme" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cal-date">Planned date</Label>
                <Input id="cal-date" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} data-testid="input-calendar-date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-notes">Notes</Label>
              <Textarea id="cal-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <Button type="submit" disabled={saving || !theme.trim()} data-testid="button-calendar-add">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
              Add to calendar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming / backlog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No planned themes yet.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.theme}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.plannedDate || "No date"} · updated {new Date(item.updatedAt).toLocaleString()}
                  </p>
                  {item.notes && <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={item.status} onValueChange={(value) => void handleStatus(item.id, value as CalendarItem["status"])}>
                    <SelectTrigger className="w-[130px]" aria-label={`Status for ${item.theme}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="idea">idea</SelectItem>
                      <SelectItem value="scripted">scripted</SelectItem>
                      <SelectItem value="packaged">packaged</SelectItem>
                      <SelectItem value="published">published</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline">{item.status}</Badge>
                  <Button type="button" size="icon" variant="ghost" onClick={() => void handleDelete(item.id)} aria-label={`Delete ${item.theme}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
