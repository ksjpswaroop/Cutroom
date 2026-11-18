import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bot, Clapperboard, Loader2, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useProEnabled } from "@/lib/pro-commands";
import { useWorkflow } from "@/lib/workflow-context";
import type { AgentPlan, AgentRunReceipt } from "@shared/orchestrator";

/**
 * Cutroom Pro M2 — Agents view.
 *
 * Plan first (inspect it, then Approve to run): the Orchestrator builds a
 * visible plan, delegates each step through the Pro command registry, QA-gates
 * the result, then hands the Board to the M1 assembler. Live mode uses the
 * provider configured in Settings and is paused by the spend cap
 * (default $0 — no paid call runs unless the creator raises it). Stub mode
 * is deterministic and costs $0: it uses the desk's fixture snapshot, never
 * a live call. Every run receipt, the QA report, the Cost Ledger, and the
 * per-project agent memory are shown here — nothing about the agents is
 * hidden. Agent memory is a plain JSON file the creator can edit or delete.
 */

type LedgerResponse = {
  ledger: { totals: { costUsd: number | null; quotaUnits: number; tokens: number | null; tokensUnknown: boolean } };
  runs: Array<{ runId: string; status: string; startedAt: string }>;
};

type AgentMemory = {
  projectId: string;
  channelFormatDna: string[];
  packagingOutcomes: string[];
  premiseNotes: string[];
};

const toLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const fromLines = (lines: string[]) => lines.join("\n");

export default function AgentsPage() {
  const { enabled, loading } = useProEnabled();
  const { toast } = useToast();
  const { state } = useWorkflow();
  const [topic, setTopic] = useState(state.cachedPackage?.topic || state.cachedScript?.topic || "");
  const [channel, setChannel] = useState("");
  const [snapshotId, setSnapshotId] = useState(state.cachedScript?.evidenceContext?.snapshotId || "");
  const [provider, setProvider] = useState<"stub" | "live">("stub");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [receipt, setReceipt] = useState<AgentRunReceipt | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [memory, setMemory] = useState<AgentMemory | null>(null);
  const [memoryDraft, setMemoryDraft] = useState({ channelFormatDna: "", packagingOutcomes: "", premiseNotes: "" });
  const [memoryBusy, setMemoryBusy] = useState(false);

  const board = state.cachedBoard?.board ?? null;
  const projectId = "default";

  useEffect(() => {
    if (!enabled) return;
    apiRequest("GET", "/api/agents/ledger").then((data) => setLedger(data as LedgerResponse)).catch(() => undefined);
    apiRequest("GET", `/api/agents/memory?projectId=${projectId}`)
      .then((data) => {
        const m = (data as { memory: AgentMemory }).memory;
        setMemory(m);
        setMemoryDraft({
          channelFormatDna: fromLines(m.channelFormatDna),
          packagingOutcomes: fromLines(m.packagingOutcomes),
          premiseNotes: fromLines(m.premiseNotes),
        });
      })
      .catch(() => undefined);
  }, [enabled]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <p className="text-sm text-muted-foreground">Loading Cutroom Pro status…</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The agent team is a Cutroom Pro feature.
          </p>
        </div>
        <Alert>
          <Bot className="h-4 w-4" />
          <AlertTitle>Cutroom Pro is off</AlertTitle>
          <AlertDescription>
            Turn on Cutroom Pro in Settings to use the agent team. It is a local
            toggle only — no payment, no account, no cloud.
            <Button variant="outline" size="sm" className="ml-2" asChild>
              <Link href="/settings">Open Settings</Link>
            </Button>
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          When enabled, the Orchestrator plans a run (Researcher → Insight Auditor
          → Scriptwriter → Packaging → QA → Assembler), shows the plan for your
          approval, then runs it — every step through the command registry, every
          cost in the ledger, every claim with an evidence pointer.
        </p>
      </div>
    );
  }

  const goal = { topic: topic.trim(), channel: channel.trim() || undefined, snapshotId: snapshotId.trim() || undefined, provider };

  const handlePlan = async () => {
    if (!goal.topic && !goal.snapshotId) {
      setError("Give the team a topic, or an existing snapshot id.");
      return;
    }
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const data = (await apiRequest("POST", "/api/agents/plan", { ...goal, board: board ?? undefined })) as { plan: AgentPlan };
      setPlan(data.plan);
      toast({ title: "Agent plan ready", description: `${data.plan.steps.length} steps. Review it, then approve the run.` });
    } catch (err: any) {
      setError(err?.message || "Unable to build the agent plan.");
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await apiRequest("POST", "/api/agents/run", { ...goal, board: board ?? undefined })) as { receipt: AgentRunReceipt };
      setReceipt(data.receipt);
      setPlan(data.receipt.plan);
      const ledgerData = (await apiRequest("GET", "/api/agents/ledger")) as LedgerResponse;
      setLedger(ledgerData);
      toast({
        title: data.receipt.status === "ok" ? "Agent run complete" : `Agent run ${data.receipt.status}`,
        description:
          data.receipt.status === "needs-human"
            ? data.receipt.escalation?.message || "The run paused for a human decision."
            : `${data.receipt.receipts.length} agent steps · QA ${data.receipt.qa?.status ?? "—"} · ledger $${data.receipt.ledger.totals.costUsd ?? "—"}`,
      });
    } catch (err: any) {
      setError(err?.message || "Unable to run the agent team.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMemory = async () => {
    setMemoryBusy(true);
    setError(null);
    try {
      const data = (await apiRequest("PUT", `/api/agents/memory?projectId=${projectId}`, {
        channelFormatDna: toLines(memoryDraft.channelFormatDna),
        packagingOutcomes: toLines(memoryDraft.packagingOutcomes),
        premiseNotes: toLines(memoryDraft.premiseNotes),
      })) as { memory: AgentMemory };
      setMemory(data.memory);
      toast({ title: "Agent memory saved", description: "The agents read this file; they never trust a summary over the ledger." });
    } catch (err: any) {
      setError(err?.message || "Unable to save agent memory.");
    } finally {
      setMemoryBusy(false);
    }
  };

  const handleDeleteMemory = async () => {
    setMemoryBusy(true);
    try {
      await apiRequest("DELETE", `/api/agents/memory?projectId=${projectId}`);
      setMemory({ projectId, channelFormatDna: [], packagingOutcomes: [], premiseNotes: [] });
      setMemoryDraft({ channelFormatDna: "", packagingOutcomes: "", premiseNotes: "" });
      toast({ title: "Agent memory deleted", description: "The file is gone; agents start from the ledger only." });
    } catch (err: any) {
      setError(err?.message || "Unable to delete agent memory.");
    } finally {
      setMemoryBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The Orchestrator plans the run, shows it to you, and only runs it when
          you approve. Stub mode is deterministic and costs $0. Live mode uses
          your Settings provider and pauses at the spend cap (default $0).
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Goal</CardTitle>
          <CardDescription>
            A topic, or an existing Research snapshot. {board ? "A Board is cached — the assembler step will use it." : "No Board is cached yet — the assembler step will be skipped, and the plan will say so."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agents-topic">Topic</Label>
              <Input id="agents-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="How to sharpen a kitchen knife" data-testid="input-agents-topic" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agents-channel">Channel (optional)</Label>
              <Input id="agents-channel" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Your channel name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agents-snapshot">Existing snapshot id (optional)</Label>
              <Input id="agents-snapshot" value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} placeholder="snap-…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agents-provider">Provider mode</Label>
              <select
                id="agents-provider"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value as "stub" | "live")}
              >
                <option value="stub">Stub — deterministic, $0, no live calls</option>
                <option value="live">Live — Settings provider, spend cap applies</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handlePlan()} disabled={busy} data-testid="button-agents-plan">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Build plan
            </Button>
            <Button type="button" variant="default" onClick={() => void handleRun()} disabled={busy || !plan} data-testid="button-agents-run">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Approve &amp; run
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Nothing runs until you approve. A QA Fail blocks the assembler; a paid-call
            failure or a spend-cap hit pauses the run as needs-human.
          </p>
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>Plan — {plan.status}</CardTitle>
            <CardDescription>
              Run {plan.runId} · {plan.provider} mode · spend cap ${plan.spendCapUsd} · estimated cost{" "}
              {plan.steps.some((s) => s.estimatedCostUsd === null)
                ? "unknown (live, not yet run)"
                : `$${plan.steps.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0)}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {plan.steps.map((step) => (
                <li key={step.agent} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{step.agent} <span className="font-normal text-muted-foreground">· {step.command}</span></p>
                    <p className="text-xs text-muted-foreground">{step.label}{step.estimatedCostUsd === null ? " · cost unknown until run" : ` · est. $${step.estimatedCostUsd}`}</p>
                    {step.skipReason && <p className="text-xs text-amber-600">Skipped: {step.skipReason}</p>}
                  </div>
                  <Badge variant={step.status === "ok" ? "default" : step.status === "failed" || step.status === "needs-human" ? "destructive" : "secondary"}>
                    {step.status}
                  </Badge>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {receipt && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Run receipt — {receipt.status}</CardTitle>
              <CardDescription>
                Run {receipt.runId} · started {receipt.startedAt} · finished {receipt.finishedAt ?? "—"} · cost ${receipt.ledger.totals.costUsd ?? "not reported"} · quota {receipt.ledger.totals.quotaUnits} · tokens {receipt.ledger.totals.tokens ?? "not reported"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {receipt.escalation && (
                <Alert>
                  <AlertTitle>Escalated: {receipt.escalation.reason}</AlertTitle>
                  <AlertDescription>{receipt.escalation.message}</AlertDescription>
                </Alert>
              )}
              {receipt.receipts.map((r) => (
                <div key={r.agent} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.agent} <span className="font-normal text-muted-foreground">· {r.command} · {r.attempts} attempt(s)</span></p>
                    <Badge variant={r.status === "ok" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                  </div>
                  {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                  {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
                  {r.handoff && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.handoff.claims.length} claim(s) · cost so far ${r.handoff.costSoFarUsd ?? "not reported"} · open questions: {r.handoff.openQuestions.length ? r.handoff.openQuestions.join("; ") : "none"} · did not verify: {r.handoff.notVerified.join("; ") || "—"}
                    </p>
                  )}
                </div>
              ))}
              {receipt.assemblerReceipt && (
                <p className="text-xs text-muted-foreground">
                  Assembler receipt {receipt.assemblerReceipt.runId} — {receipt.assemblerReceipt.status}
                  {receipt.assemblerReceipt.export.path ? ` · export ${receipt.assemblerReceipt.export.bytes ?? "?"} bytes` : ""}.
                </p>
              )}
            </CardContent>
          </Card>

          {receipt.qa && (
            <Card>
              <CardHeader>
                <CardTitle>QA report — {receipt.qa.status}</CardTitle>
                <CardDescription>Deterministic checks, no model call. A Fail blocks Render and the assembler.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {receipt.qa.checks.map((check) => (
                    <li key={check.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{check.id}</p>
                        <p className="text-xs text-muted-foreground">{check.reason}</p>
                      </div>
                      <Badge variant={check.status === "pass" ? "default" : check.status === "fail" ? "destructive" : "secondary"}>{check.status}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cost Ledger</CardTitle>
          <CardDescription>
            Every step records provider, model, tokens if reported (never invented),
            quota units, and cost. Totals so far: ${ledger?.ledger.totals.costUsd ?? "—"} · quota {ledger?.ledger.totals.quotaUnits ?? "—"} · tokens {ledger?.ledger.totals.tokens ?? "not reported"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ledger && ledger.runs.length > 0 ? (
            <ul className="space-y-1">
              {ledger.runs.map((run) => (
                <li key={run.runId} className="flex justify-between gap-2 text-sm">
                  <span className="font-mono text-xs">{run.runId}</span>
                  <span className="text-muted-foreground">{run.status} · {run.startedAt}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No agent runs yet — the ledger is empty.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent memory</CardTitle>
          <CardDescription>
            Plain JSON the agents read — channel format DNA, packaging outcomes,
            premise notes. Edit it, or delete it; agents never trust a previous
            agent&apos;s summary over the ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agents-memory-dna">Channel format DNA (one per line)</Label>
            <Textarea id="agents-memory-dna" rows={3} value={memoryDraft.channelFormatDna} onChange={(e) => setMemoryDraft((d) => ({ ...d, channelFormatDna: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agents-memory-packaging">Packaging outcomes (one per line)</Label>
            <Textarea id="agents-memory-packaging" rows={3} value={memoryDraft.packagingOutcomes} onChange={(e) => setMemoryDraft((d) => ({ ...d, packagingOutcomes: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agents-memory-premise">Premise notes (one per line)</Label>
            <Textarea id="agents-memory-premise" rows={3} value={memoryDraft.premiseNotes} onChange={(e) => setMemoryDraft((d) => ({ ...d, premiseNotes: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleSaveMemory()} disabled={memoryBusy} data-testid="button-agents-memory-save">
              {memoryBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save memory
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleDeleteMemory()} disabled={memoryBusy} data-testid="button-agents-memory-delete">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete memory
            </Button>
          </div>
          {memory && <p className="text-xs text-muted-foreground">Stored at agent-memory/{memory.projectId}.json under the app-data root.</p>}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clapperboard className="h-3.5 w-3.5" />
        MiniMax / cinematic quotes stay quote-then-charge and are not part of M2 — a run that hits one records it as &ldquo;not run in M2&rdquo;, not as a charge.
      </p>
    </div>
  );
}
