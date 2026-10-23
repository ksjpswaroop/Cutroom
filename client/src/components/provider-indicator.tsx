import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Cloud, HardDrive } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SettingsStatus {
  aiProvider?: string;
  aiProviderOptions?: { id: string; label: string }[];
  models?: { ollamaModel?: string };
}

interface OllamaStatus {
  running: boolean;
  modelInstalled: boolean;
  model: string;
}

/** Providers that execute on this machine rather than over the network. */
const LOCAL_PROVIDERS = new Set(["ollama"]);

const FALLBACK_LABELS: Record<string, string> = {
  gemini: "Gemini",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
  openai_compatible: "OpenAI-compatible",
  ollama: "Ollama",
};

/**
 * Shows which model provider the workflow will actually use.
 *
 * Where generation runs determines cost, latency and whether prompt content
 * leaves the machine, and those differ enough between a local model and a
 * hosted one that the answer belongs in the shell rather than buried in
 * Settings — especially when a local daemon can stop running mid-session.
 */
export function ProviderIndicator() {
  const { data: settings } = useQuery<SettingsStatus>({
    queryKey: ["/api/settings/status"],
    staleTime: 30_000,
  });

  const providerId = settings?.aiProvider ?? "gemini";
  const isLocal = LOCAL_PROVIDERS.has(providerId);
  const label = settings?.aiProviderOptions?.find((option) => option.id === providerId)?.label
    ?? FALLBACK_LABELS[providerId]
    ?? providerId;

  // Only the local daemon can be health-checked, and only it can fail silently
  // between page loads, so it is the only provider worth polling.
  const { data: ollama } = useQuery<OllamaStatus>({
    queryKey: ["/api/ai/ollama/status"],
    enabled: isLocal,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const degraded = isLocal && ollama !== undefined && (!ollama.running || !ollama.modelInstalled);

  const detail = (() => {
    if (!isLocal) return `${label} runs in the cloud. Prompts leave this machine and are billed per token.`;
    if (!ollama) return "Checking the local model daemon…";
    if (!ollama.running) return "The local model daemon is not running. Generation will fail until it is started.";
    if (!ollama.modelInstalled) return `"${ollama.model}" is not installed. Generation will fail until a model is selected.`;
    return `Running "${ollama.model}" on this machine. No prompt content leaves the device.`;
  })();

  const Icon = degraded ? AlertTriangle : isLocal ? HardDrive : Cloud;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/settings"
          aria-label={`AI provider: ${label}. ${detail} Open settings.`}
          data-testid="link-provider-indicator"
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            degraded
              ? "border-warning/40 bg-warning-subtle text-warning hover:bg-warning/20"
              : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          {isLocal && !degraded && (
            <span className="hidden text-[10px] uppercase tracking-wide opacity-70 md:inline">local</span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </TooltipContent>
    </Tooltip>
  );
}
