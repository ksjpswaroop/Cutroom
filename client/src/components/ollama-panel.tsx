import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
  capabilities: string[];
  remote: boolean;
}

export interface OllamaStatusResponse {
  running: boolean;
  baseUrl: string;
  model: string;
  models: OllamaModelInfo[];
  modelInstalled: boolean;
  suggestedModel?: string;
  error?: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

function formatContext(tokens?: number): string {
  if (!tokens) return "";
  return tokens >= 1000 ? `${Math.round(tokens / 1024)}K ctx` : `${tokens} ctx`;
}

/** One line of secondary detail for a model row. */
function modelDetail(model: OllamaModelInfo): string {
  return [
    model.parameterSize,
    formatSize(model.sizeBytes),
    formatContext(model.contextLength),
  ].filter(Boolean).join(" · ");
}

interface OllamaPanelProps {
  baseUrl: string;
  model: string;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
}

/**
 * Local model configuration.
 *
 * Ollama is the only provider whose availability Cutroom can verify directly,
 * so this panel reports the daemon state and the installed model list rather
 * than asking the user to type a model name and discover their mistake later,
 * mid-workflow, as an opaque HTTP 404.
 */
export function OllamaPanel({ baseUrl, model, onBaseUrlChange, onModelChange }: OllamaPanelProps) {
  const [status, setStatus] = useState<OllamaStatusResponse | null>(null);
  const [isProbing, setIsProbing] = useState(true);

  const probe = useCallback(async (probeBaseUrl: string, probeModel: string) => {
    setIsProbing(true);
    try {
      const params = new URLSearchParams();
      if (probeBaseUrl.trim()) params.set("baseUrl", probeBaseUrl.trim());
      if (probeModel.trim()) params.set("model", probeModel.trim());
      const response = await fetch(`/api/ai/ollama/status?${params}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      setStatus(await response.json() as OllamaStatusResponse);
    } catch {
      setStatus({
        running: false,
        baseUrl: probeBaseUrl,
        model: probeModel,
        models: [],
        modelInstalled: false,
        error: "Could not query the local model daemon from this page.",
      });
    } finally {
      setIsProbing(false);
    }
  }, []);

  // Debounced so that typing a host does not fire a probe per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => { void probe(baseUrl, model); }, 400);
    return () => clearTimeout(timer);
  }, [baseUrl, model, probe]);

  const running = status?.running ?? false;
  const models = status?.models ?? [];
  const localModels = models.filter((entry) => !entry.remote);
  const cloudModels = models.filter((entry) => entry.remote);
  const modelMissing = Boolean(status && running && !status.modelInstalled);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background/50 p-4" data-testid="panel-ollama">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <Label className="text-base">Ollama (local)</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Runs entirely on this machine. No API key, no per-token cost, and no prompt
              content leaves the device.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge isProbing={isProbing} running={running} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void probe(baseUrl, model)}
            disabled={isProbing}
            data-testid="button-ollama-refresh"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isProbing ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {!running && !isProbing && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
          role="status"
          data-testid="alert-ollama-offline"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">No local model daemon is running.</p>
            <p className="text-muted-foreground">
              {status?.error ?? `Nothing is answering at ${baseUrl}.`}
            </p>
            <p className="text-muted-foreground">
              Start it with <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ollama serve</code>,
              then choose Refresh.
            </p>
          </div>
        </div>
      )}

      {modelMissing && (
        <div
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
          role="status"
          data-testid="alert-ollama-model-missing"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-2">
            <p>
              <span className="font-medium">&quot;{status?.model}&quot;</span> is not installed.
            </p>
            {status?.suggestedModel ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  Did you mean <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{status.suggestedModel}</code>?
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onModelChange(status.suggestedModel!)}
                  data-testid="button-ollama-use-suggested"
                >
                  Use it
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Pull it with{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ollama pull {status?.model}</code>,
                or pick one below.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ollama-base-url">Host</Label>
          <Input
            id="ollama-base-url"
            value={baseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder="http://127.0.0.1:11434"
            className="font-mono"
            spellCheck={false}
            data-testid="input-ollama-base-url"
          />
          <p className="text-xs text-muted-foreground">
            The Ollama daemon address. Leave as the default unless it runs on another machine.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ollama-model">Model</Label>
          {running && models.length > 0 ? (
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger id="ollama-model" data-testid="select-ollama-model">
                <SelectValue placeholder="Choose an installed model" />
              </SelectTrigger>
              <SelectContent>
                {/*
                  A configured-but-missing model has no matching item, which would
                  leave the trigger blank and read as a broken control. Carry it as
                  its own entry so the current selection stays visible and labelled.
                */}
                {modelMissing && model.trim() && (
                  <SelectItem value={model}>
                    <span className="font-mono">{model}</span>
                    <span className="ml-2 text-xs text-warning">not installed</span>
                  </SelectItem>
                )}
                {localModels.map((entry) => (
                  <SelectItem key={entry.name} value={entry.name}>
                    <span className="font-mono">{entry.name}</span>
                    {modelDetail(entry) && (
                      <span className="ml-2 text-xs text-muted-foreground">{modelDetail(entry)}</span>
                    )}
                  </SelectItem>
                ))}
                {cloudModels.map((entry) => (
                  <SelectItem key={entry.name} value={entry.name}>
                    <span className="font-mono">{entry.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">cloud-proxied</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="ollama-model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              placeholder="llama3.2:3b"
              className="font-mono"
              spellCheck={false}
              data-testid="input-ollama-model"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {running && models.length > 0
              ? `${localModels.length} installed locally${cloudModels.length ? `, ${cloudModels.length} cloud-proxied` : ""}.`
              : "Model names include a tag, for example llama3.2:3b."}
          </p>
        </div>
      </div>

      {running && models.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="text-ollama-no-models">
          The daemon is running but has no chat models installed. Pull one with{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ollama pull llama3.2:3b</code>.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ isProbing, running }: { isProbing: boolean; running: boolean }) {
  if (isProbing) {
    return (
      <Badge variant="outline" className="gap-1.5" data-testid="badge-ollama-status">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Checking
      </Badge>
    );
  }
  if (running) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-success/40 bg-success/10 text-success"
        data-testid="badge-ollama-status"
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Running
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-destructive/40 bg-destructive/10 text-destructive"
      data-testid="badge-ollama-status"
    >
      <XCircle className="h-3 w-3" aria-hidden="true" />
      Offline
    </Badge>
  );
}
