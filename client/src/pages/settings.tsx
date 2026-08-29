import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, FolderOpen, KeyRound, Loader2, Save, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { checkForDesktopUpdate, installDesktopUpdate } from "@/lib/desktop-updater";

interface ModelOption {
  id: string;
  label: string;
  description: string;
}

interface ApiKeyStatus {
  youtube: boolean;
  gemini: boolean;
  openrouter?: boolean;
  openaiCompatible?: boolean;
  ollama?: boolean;
  minimax?: boolean;
  aiProvider?: string;
  aiProviderOptions?: { id: string; label: string }[];
  secretsBackend?: "keychain" | "env";
  libraryPath?: string | null;
  preferences?: {
    assemblePreviewEnabled?: boolean;
    storyboardStillsEnabled?: boolean;
    vimaxCompanionEnabled?: boolean;
  };
  assemblePreview?: {
    assemblePreviewEnabled: boolean;
    ffmpegAvailable: boolean;
    ffmpegPath: string | null;
    engine: string;
  };
  render?: {
    elevenLabs: boolean;
    voiceConsent: boolean;
    cinematicVeo: boolean;
    cinematicVeoEnabled?: boolean;
    hailuoH3?: boolean;
    youtubeUpload: boolean;
  };
  brandKit?: {
    channelName: string;
    voiceNotes: string;
    primaryColor: string;
    accentColor: string;
    fontPreference: string;
    thumbnailStyleNotes: string;
    forbiddenClaims: string[];
  };
  models: {
    text: string;
    image: string;
    textOptions: ModelOption[];
    imageOptions: ModelOption[];
    openrouterModel?: string;
    openaiModel?: string;
    ollamaModel?: string;
    openaiBaseUrl?: string;
    ollamaBaseUrl?: string;
    minimaxTextModel?: string;
  };
}

interface KeyFieldProps {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  providerUrl: string;
  providerLabel: string;
  children?: ReactNode;
}

function KeyField({
  id,
  label,
  description,
  configured,
  inputRef,
  providerUrl,
  providerLabel,
  children,
}: KeyFieldProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label htmlFor={id} className="text-base">{label}</Label>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge
          variant="outline"
          className={configured
            ? "border-green-500/40 bg-green-500/10 text-green-500"
            : "text-muted-foreground"}
        >
          {configured ? "Configured" : "Not configured"}
        </Badge>
      </div>

      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          name={id}
          type={showKey ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder={configured ? "Enter a replacement key" : "Paste API key"}
          className="pr-11 font-mono"
          data-testid={`input-${id}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0"
          onClick={() => setShowKey((visible) => !visible)}
          aria-label={showKey ? `Hide ${label}` : `Show ${label}`}
        >
          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      {children}

      <a
        href={providerUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {providerLabel}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

async function isTauri(): Promise<boolean> {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<ApiKeyStatus>({
    youtube: false,
    gemini: false,
    libraryPath: null,
    aiProvider: "gemini",
    models: { text: "", image: "", textOptions: [], imageOptions: [] },
  });
  const [geminiTextModel, setGeminiTextModel] = useState("");
  const [geminiImageModel, setGeminiImageModel] = useState("");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [openrouterModel, setOpenrouterModel] = useState("openrouter/auto");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("https://api.openai.com/v1");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://127.0.0.1:11434/v1");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLibrary, setIsSavingLibrary] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [isSavingBrandKit, setIsSavingBrandKit] = useState(false);
  const [brandChannel, setBrandChannel] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [brandPrimary, setBrandPrimary] = useState("#0A66C2");
  const [brandAccent, setBrandAccent] = useState("#378FE9");
  const [brandFont, setBrandFont] = useState("");
  const [brandThumbNotes, setBrandThumbNotes] = useState("");
  const [brandForbidden, setBrandForbidden] = useState("");
  const [studioStatus, setStudioStatus] = useState<{
    configured: boolean;
    connected: boolean;
    label: string;
    evidenceClass: string;
    message: string;
  } | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [libraryDraft, setLibraryDraft] = useState("");
  const youtubeKeyRef = useRef<HTMLInputElement>(null);
  const geminiKeyRef = useRef<HTMLInputElement>(null);
  const openrouterKeyRef = useRef<HTMLInputElement>(null);
  const openaiKeyRef = useRef<HTMLInputElement>(null);
  const minimaxKeyRef = useRef<HTMLInputElement>(null);
  const elevenLabsKeyRef = useRef<HTMLInputElement>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("");
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [cinematicVeoEnabled, setCinematicVeoEnabled] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const loadStatus = async () => {
      try {
        setIsDesktop(await isTauri());
        const response = await fetch("/api/settings/status", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load settings.");
        const nextStatus = data as ApiKeyStatus;
        setStatus(nextStatus);
        setLibraryDraft(nextStatus.libraryPath || "");
        setGeminiTextModel(nextStatus.models.text);
        setGeminiImageModel(nextStatus.models.image);
        setAiProvider(nextStatus.aiProvider || "gemini");
        setOpenrouterModel(nextStatus.models.openrouterModel || "openrouter/auto");
        setOpenaiModel(nextStatus.models.openaiModel || "gpt-4o-mini");
        setOpenaiBaseUrl(nextStatus.models.openaiBaseUrl || "https://api.openai.com/v1");
        setOllamaModel(nextStatus.models.ollamaModel || "llama3.2");
        setOllamaBaseUrl(nextStatus.models.ollamaBaseUrl || "http://127.0.0.1:11434/v1");
        setVoiceConsent(Boolean(nextStatus.render?.voiceConsent));
        setCinematicVeoEnabled(Boolean(nextStatus.render?.cinematicVeoEnabled ?? nextStatus.render?.cinematicVeo));
        if (nextStatus.brandKit) {
          setBrandChannel(nextStatus.brandKit.channelName || "");
          setBrandVoice(nextStatus.brandKit.voiceNotes || "");
          setBrandPrimary(nextStatus.brandKit.primaryColor || "#0A66C2");
          setBrandAccent(nextStatus.brandKit.accentColor || "#378FE9");
          setBrandFont(nextStatus.brandKit.fontPreference || "");
          setBrandThumbNotes(nextStatus.brandKit.thumbnailStyleNotes || "");
          setBrandForbidden((nextStatus.brandKit.forbiddenClaims || []).join("\n"));
        }
        try {
          const studioRes = await fetch("/api/studio/status", { cache: "no-store" });
          if (studioRes.ok) setStudioStatus(await studioRes.json());
        } catch {
          /* optional mirror */
        }
      } catch (error: any) {
        setLoadError(error?.message || "Unable to load settings.");
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();
  }, []);

  const persistLibraryPath = async (nextPath: string) => {
    const trimmed = nextPath.trim();
    if (!trimmed) {
      toast({
        title: "Folder path required",
        description: "Enter an absolute folder path, or clear the library to use app data.",
        variant: "destructive",
      });
      return;
    }
    if (!trimmed.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
      toast({
        title: "Absolute path required",
        description: "Use a full path like /Users/you/Cutroom or C:\\Videos\\Cutroom.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingLibrary(true);
    try {
      const response = await apiRequest("PUT", "/api/settings/library", { path: trimmed }) as {
        success: boolean;
        libraryPath: string | null;
      };
      const saved = typeof response.libraryPath === "string" ? response.libraryPath : trimmed;
      // Re-read from server so the UI cannot drift from disk.
      const statusRes = await fetch("/api/settings/status", { cache: "no-store", credentials: "include" });
      const statusBody = await statusRes.json().catch(() => ({}));
      const confirmed =
        statusRes.ok && typeof statusBody.libraryPath === "string"
          ? statusBody.libraryPath
          : saved;
      setStatus((current) => ({ ...current, libraryPath: confirmed }));
      setLibraryDraft(confirmed);
      const unchanged = confirmed === status.libraryPath;
      toast({
        title: unchanged ? "Library folder unchanged" : "Library folder saved",
        description: unchanged
          ? `Still using ${confirmed}. New workflows continue there.`
          : `Now saving new workflows under ${confirmed}. Existing workflows stay in their previous folders.`,
      });
    } catch (error: any) {
      toast({
        title: "Could not save library folder",
        description: error?.message || "Choose a writable folder and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingLibrary(false);
    }
  };

  const handleChooseLibrary = async () => {
    if (await isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const nextPath = await invoke<string | null>("cmd_pick_library_folder");
        if (!nextPath) {
          toast({ title: "No folder selected", description: "Library location was left unchanged." });
          return;
        }
        setLibraryDraft(nextPath);
        await persistLibraryPath(nextPath);
      } catch (error: any) {
        toast({
          title: "Could not open folder picker",
          description: error?.message || "Try entering the path manually below.",
          variant: "destructive",
        });
      }
      return;
    }

    await persistLibraryPath(libraryDraft || status.libraryPath || "");
  };

  const handleClearLibrary = async () => {
    setIsSavingLibrary(true);
    try {
      const response = await apiRequest("DELETE", "/api/settings/library") as {
        success: boolean;
        libraryPath: string | null;
      };
      setStatus((current) => ({ ...current, libraryPath: response.libraryPath }));
      setLibraryDraft("");
      toast({
        title: "Using app data storage",
        description: "Workflows will store under the Cutroom app-data directory until you choose a library again.",
      });
    } catch (error: any) {
      toast({
        title: "Could not clear library folder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingLibrary(false);
    }
  };

  const handleTogglePreference = async (
    key: "assemblePreviewEnabled" | "storyboardStillsEnabled" | "vimaxCompanionEnabled",
    enabled: boolean,
  ) => {
    setIsSavingPreferences(true);
    try {
      const response = await apiRequest("PUT", "/api/settings/preferences", {
        [key]: enabled,
      }) as {
        success: boolean;
        preferences: ApiKeyStatus["preferences"];
        assemblePreview: ApiKeyStatus["assemblePreview"];
      };
      setStatus((current) => ({
        ...current,
        preferences: response.preferences,
        assemblePreview: response.assemblePreview,
      }));
      const labels = {
        assemblePreviewEnabled: enabled
          ? "Assemble preview enabled"
          : "Assemble preview disabled",
        storyboardStillsEnabled: enabled ? "Storyboard stills enabled" : "Storyboard stills remain Off",
        vimaxCompanionEnabled: enabled
          ? "Companion folder export enabled (still does not spawn ViMax)"
          : "ViMax companion remains Off",
      };
      toast({
        title: labels[key],
        description: key === "assemblePreviewEnabled"
          ? (enabled
            ? "Assemble engine on Render writes preview.mp4 (FFmpeg only)."
            : "Assemble engine stays hidden unless you turn it on.")
          : key === "storyboardStillsEnabled"
            ? "Stills are inferred when generated. Default Off."
            : "Cutroom never launches ViMax. Settings never store VIMAX_* sidecar keys.",
      });
    } catch (error: any) {
      toast({
        title: "Could not update preferences",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleToggleAssemblePreview = async (enabled: boolean) => {
    await handleTogglePreference("assemblePreviewEnabled", enabled);
  };

  const handleSaveBrandKit = async () => {
    setIsSavingBrandKit(true);
    try {
      const response = await apiRequest("PUT", "/api/settings/brand-kit", {
        channelName: brandChannel,
        voiceNotes: brandVoice,
        primaryColor: brandPrimary,
        accentColor: brandAccent,
        fontPreference: brandFont,
        thumbnailStyleNotes: brandThumbNotes,
        forbiddenClaims: brandForbidden
          .split(/\n|,/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 20),
      }) as { success: boolean; brandKit: ApiKeyStatus["brandKit"] };
      setStatus((current) => ({ ...current, brandKit: response.brandKit }));
      toast({
        title: "Brand kit saved",
        description: "Style memory applies to thumbnails and publish packages on this machine.",
      });
    } catch (error: any) {
      toast({
        title: "Could not save brand kit",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingBrandKit(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const youtubeApiKey = youtubeKeyRef.current?.value.trim() || "";
    const geminiApiKey = geminiKeyRef.current?.value.trim() || "";
    const openrouterApiKey = openrouterKeyRef.current?.value.trim() || "";
    const openaiApiKey = openaiKeyRef.current?.value.trim() || "";
    const minimaxApiKey = minimaxKeyRef.current?.value.trim() || "";
    const elevenLabsApiKey = elevenLabsKeyRef.current?.value.trim() || "";
    const modelsChanged = geminiTextModel !== status.models.text
      || geminiImageModel !== status.models.image;
    const providerChanged = aiProvider !== (status.aiProvider || "gemini")
      || openrouterModel !== (status.models.openrouterModel || "openrouter/auto")
      || openaiModel !== (status.models.openaiModel || "gpt-4o-mini")
      || openaiBaseUrl !== (status.models.openaiBaseUrl || "https://api.openai.com/v1")
      || ollamaModel !== (status.models.ollamaModel || "llama3.2")
      || ollamaBaseUrl !== (status.models.ollamaBaseUrl || "http://127.0.0.1:11434/v1")
      || elevenLabsVoiceId.trim() !== ""
      || voiceConsent !== Boolean(status.render?.voiceConsent)
      || cinematicVeoEnabled !== Boolean(status.render?.cinematicVeoEnabled ?? status.render?.cinematicVeo);

    if (!youtubeApiKey && !geminiApiKey && !openrouterApiKey && !openaiApiKey && !minimaxApiKey && !elevenLabsApiKey
      && !modelsChanged && !providerChanged) {
      toast({
        title: "No changes to save",
        description: "Enter a replacement key or choose a different provider/model.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiRequest("PUT", "/api/settings/api-keys", {
        ...(youtubeApiKey ? { youtubeApiKey } : {}),
        ...(geminiApiKey ? { geminiApiKey } : {}),
        ...(openrouterApiKey ? { openrouterApiKey } : {}),
        ...(openaiApiKey ? { openaiApiKey } : {}),
        ...(minimaxApiKey ? { minimaxApiKey } : {}),
        ...(elevenLabsApiKey ? { elevenLabsApiKey } : {}),
        ...(elevenLabsVoiceId.trim() ? { elevenLabsVoiceId: elevenLabsVoiceId.trim() } : {}),
        voiceConsent,
        cinematicVeoEnabled,
        geminiTextModel,
        geminiImageModel,
        aiProvider,
        openrouterModel,
        openaiModel,
        openaiBaseUrl,
        ollamaModel,
        ollamaBaseUrl,
      }) as { success: boolean; status: ApiKeyStatus };

      setStatus((current) => ({
        ...response.status,
        libraryPath: current.libraryPath,
      }));
      setGeminiTextModel(response.status.models.text);
      setGeminiImageModel(response.status.models.image);
      setAiProvider(response.status.aiProvider || "gemini");
      setOpenrouterModel(response.status.models.openrouterModel || "openrouter/auto");
      setOpenaiModel(response.status.models.openaiModel || "gpt-4o-mini");
      setOpenaiBaseUrl(response.status.models.openaiBaseUrl || "https://api.openai.com/v1");
      setOllamaModel(response.status.models.ollamaModel || "llama3.2");
      setOllamaBaseUrl(response.status.models.ollamaBaseUrl || "http://127.0.0.1:11434/v1");
      if (youtubeKeyRef.current) youtubeKeyRef.current.value = "";
      if (geminiKeyRef.current) geminiKeyRef.current.value = "";
      if (openrouterKeyRef.current) openrouterKeyRef.current.value = "";
      if (openaiKeyRef.current) openaiKeyRef.current.value = "";
      if (minimaxKeyRef.current) minimaxKeyRef.current.value = "";
      if (elevenLabsKeyRef.current) elevenLabsKeyRef.current.value = "";
      setVoiceConsent(Boolean(response.status.render?.voiceConsent));
      setCinematicVeoEnabled(Boolean(response.status.render?.cinematicVeoEnabled ?? response.status.render?.cinematicVeo));
      toast({
        title: "API settings saved",
        description: "The local server is using the updated provider settings.",
      });
    } catch (error: any) {
      toast({
        title: "Could not save settings",
        description: error?.message || "Check the key and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <div className="flex items-center gap-2 text-primary">
          <KeyRound className="h-5 w-5" />
          <span className="text-sm font-medium">Local connections</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold">Settings</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Connect providers and choose where Cutroom saves generated workflow data.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Stored locally</AlertTitle>
        <AlertDescription>
          Keys are written to the OS keychain when available (desktop), otherwise to the
          server&apos;s ignored <code>.env</code> file with owner-only permissions. Workflow
          libraries are arranged by topic name on disk. Saved API values are never returned
          to the browser. Settings changes are accepted only from this machine.
          {status.secretsBackend ? (
            <> Current secrets backend: <code>{status.secretsBackend}</code>.</>
          ) : null}
        </AlertDescription>
      </Alert>

      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Settings unavailable</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="library" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
          <TabsTrigger value="library" data-testid="tab-settings-library">Library</TabsTrigger>
          <TabsTrigger value="api" data-testid="tab-settings-api">API</TabsTrigger>
          <TabsTrigger value="brand" data-testid="tab-settings-brand">Brand</TabsTrigger>
          <TabsTrigger value="desktop" data-testid="tab-settings-desktop">Desktop</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Workflow library
          </CardTitle>
          <CardDescription>
            {isDesktop
              ? "Choose a folder for all generated Cutroom data. Each workflow is saved in a topic-named subfolder with script, package, and thumbnail mirrors."
              : "Set an absolute folder path for topic-arranged workflow storage. On desktop, Cutroom opens a native folder picker."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Current library</p>
              <p className="mt-1 break-all font-mono text-sm" data-testid="text-library-path">
                {status.libraryPath || "Not set — using app-data workflows storage"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="library-path-input">
                {isDesktop ? "Folder path (or use Browse)" : "Absolute folder path"}
              </Label>
              <Input
                id="library-path-input"
                value={libraryDraft}
                onChange={(event) => setLibraryDraft(event.target.value)}
                placeholder="/Users/you/Cutroom Library"
                disabled={isSavingLibrary || Boolean(loadError)}
                data-testid="input-library-path"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Only new workflows use this folder. Existing topic folders stay where they were created.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDesktop && (
              <Button
                type="button"
                onClick={() => void handleChooseLibrary()}
                disabled={isSavingLibrary || Boolean(loadError)}
                data-testid="button-choose-library"
              >
                {isSavingLibrary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                Browse…
              </Button>
            )}
            <Button
              type="button"
              variant={isDesktop ? "outline" : "default"}
              onClick={() => {
                const input = document.getElementById("library-path-input") as HTMLInputElement | null;
                void persistLibraryPath(input?.value ?? libraryDraft);
              }}
              disabled={isSavingLibrary || Boolean(loadError)}
              data-testid="button-save-library"
            >
              {isSavingLibrary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save library path
            </Button>
            {status.libraryPath && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClearLibrary()}
                disabled={isSavingLibrary || Boolean(loadError)}
                data-testid="button-clear-library"
              >
                Use app data instead
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assemble preview</CardTitle>
          <CardDescription>
            Optional packaging animatic (preview.mp4) on Render. Default Off. Local FFmpeg only — not slides+voice and not cinematic.
            Board and Render stay in the sidebar either way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-4">
            <div>
              <p className="text-sm font-medium">Enable /video assemble preview</p>
              <p className="mt-1 text-xs text-muted-foreground">
                FFmpeg: {status.assemblePreview?.ffmpegAvailable
                  ? (status.assemblePreview.ffmpegPath || "available")
                  : "not found on PATH"}
              </p>
            </div>
            <Button
              type="button"
              variant={status.preferences?.assemblePreviewEnabled || status.assemblePreview?.assemblePreviewEnabled
                ? "default"
                : "outline"}
              disabled={isSavingPreferences || Boolean(loadError)}
              onClick={() => void handleToggleAssemblePreview(
                !(status.preferences?.assemblePreviewEnabled || status.assemblePreview?.assemblePreviewEnabled),
              )}
              data-testid="button-toggle-assemble-preview"
            >
              {isSavingPreferences ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {(status.preferences?.assemblePreviewEnabled || status.assemblePreview?.assemblePreviewEnabled)
                ? "On"
                : "Off"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-4">
            <div>
              <p className="text-sm font-medium">Storyboard stills (optional)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Gemini image stills on the Board. Default Off. Always labeled inferred.
              </p>
            </div>
            <Button
              type="button"
              variant={status.preferences?.storyboardStillsEnabled ? "default" : "outline"}
              disabled={isSavingPreferences || Boolean(loadError)}
              onClick={() => void handleTogglePreference("storyboardStillsEnabled", !status.preferences?.storyboardStillsEnabled)}
              data-testid="button-toggle-storyboard-stills"
            >
              {status.preferences?.storyboardStillsEnabled ? "On" : "Off"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-4">
            <div>
              <p className="text-sm font-medium">ViMax companion export</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional script2video folder shape. Default Off. Cutroom never spawns ViMax and never uses VIMAX_* env.
              </p>
            </div>
            <Button
              type="button"
              variant={status.preferences?.vimaxCompanionEnabled ? "default" : "outline"}
              disabled={isSavingPreferences || Boolean(loadError)}
              onClick={() => void handleTogglePreference("vimaxCompanionEnabled", !status.preferences?.vimaxCompanionEnabled)}
              data-testid="button-toggle-vimax-companion"
            >
              {status.preferences?.vimaxCompanionEnabled ? "On" : "Off"}
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="desktop" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card>
        <CardHeader>
          <CardTitle>YouTube Studio mirror</CardTitle>
          <CardDescription>
            Optional owner-only metrics. Never mixed into public Research evidence. Labeled Observed-for-owner /
            requires_studio when enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {studioStatus ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{studioStatus.configured ? "OAuth client present" : "Not configured"}</Badge>
                <Badge variant="outline">{studioStatus.connected ? "Connected" : "Disconnected"}</Badge>
                <Badge variant="secondary">{studioStatus.label}</Badge>
                <Badge variant="secondary">{studioStatus.evidenceClass}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{studioStatus.message}</p>
              <p className="text-xs text-muted-foreground">
                Set YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, and YOUTUBE_OAUTH_REFRESH_TOKEN in the
                local environment to connect. Core Cutroom works without this.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Studio status unavailable.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Desktop updates</CardTitle>
          <CardDescription>
            Signed updates from GitHub Releases (latest.json). Web builds do not auto-update.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isDesktop || updateBusy}
              onClick={() => {
                void (async () => {
                  setUpdateBusy(true);
                  setUpdateMessage(null);
                  const result = await checkForDesktopUpdate();
                  if (result.error) setUpdateMessage(result.error);
                  else if (result.available) setUpdateMessage(`Update ${result.version} available.${result.notes ? ` ${result.notes}` : ""}`);
                  else setUpdateMessage("You are on the latest desktop build.");
                  setUpdateBusy(false);
                })();
              }}
              data-testid="button-check-updates"
            >
              {updateBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Check for updates
            </Button>
            <Button
              type="button"
              disabled={!isDesktop || updateBusy}
              onClick={() => {
                void (async () => {
                  setUpdateBusy(true);
                  const result = await installDesktopUpdate();
                  if (result.error) {
                    setUpdateMessage(result.error);
                    setUpdateBusy(false);
                  }
                })();
              }}
              data-testid="button-install-update"
            >
              Download & install
            </Button>
          </div>
          {updateMessage && <p className="text-sm text-muted-foreground">{updateMessage}</p>}
          {!isDesktop && (
            <p className="text-xs text-muted-foreground">Open the Cutroom desktop app to check for updates.</p>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="brand" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card>
        <CardHeader>
          <CardTitle>Brand kit</CardTitle>
          <CardDescription>
            Style memory across workflows: voice, colors, thumbnail notes, and claims you never want invented.
            Applied to thumbnails and publish packages. Stored locally only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brand-channel">Channel name</Label>
              <Input id="brand-channel" value={brandChannel} onChange={(e) => setBrandChannel(e.target.value)} data-testid="input-brand-channel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-font">Font preference</Label>
              <Input id="brand-font" value={brandFont} onChange={(e) => setBrandFont(e.target.value)} placeholder="Heavy sans, condensed display…" data-testid="input-brand-font" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-primary">Primary color</Label>
              <Input id="brand-primary" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} className="font-mono" data-testid="input-brand-primary" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-accent">Accent color</Label>
              <Input id="brand-accent" value={brandAccent} onChange={(e) => setBrandAccent(e.target.value)} className="font-mono" data-testid="input-brand-accent" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-voice">Voice & tone</Label>
            <Textarea id="brand-voice" value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} rows={3} data-testid="input-brand-voice" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-thumb">Thumbnail style notes</Label>
            <Textarea id="brand-thumb" value={brandThumbNotes} onChange={(e) => setBrandThumbNotes(e.target.value)} rows={3} data-testid="input-brand-thumb" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-forbidden">Forbidden claims (one per line)</Label>
            <Textarea id="brand-forbidden" value={brandForbidden} onChange={(e) => setBrandForbidden(e.target.value)} rows={3} placeholder="guaranteed results&#10;overnight success" data-testid="input-brand-forbidden" />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => void handleSaveBrandKit()} disabled={isSavingBrandKit || Boolean(loadError)} data-testid="button-save-brand-kit">
              {isSavingBrandKit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save brand kit
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="api" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card>
        <CardHeader>
          <CardTitle>API connections</CardTitle>
          <CardDescription>
            Leave a configured field blank to keep its current value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading connection status
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <KeyField
                id="youtube-api-key"
                label="YouTube Data API"
                description="Required for video search and research data."
                configured={status.youtube}
                inputRef={youtubeKeyRef}
                providerUrl="https://console.cloud.google.com/apis/credentials"
                providerLabel="Open Google Cloud credentials"
              />
              <KeyField
                id="gemini-api-key"
                label="Gemini API"
                description="Required for research insights, ideas, scripts, and thumbnail generation."
                configured={status.gemini}
                inputRef={geminiKeyRef}
                providerUrl="https://aistudio.google.com/apikey"
                providerLabel="Open Google AI Studio"
              >
                <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gemini-text-model">Research and writing model</Label>
                    <Select value={geminiTextModel} onValueChange={setGeminiTextModel}>
                      <SelectTrigger id="gemini-text-model" data-testid="select-gemini-text-model">
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {status.models.textOptions.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {status.models.textOptions.find((model) => model.id === geminiTextModel)?.description}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gemini-image-model">Thumbnail image model</Label>
                    <Select value={geminiImageModel} onValueChange={setGeminiImageModel}>
                      <SelectTrigger id="gemini-image-model" data-testid="select-gemini-image-model">
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {status.models.imageOptions.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {status.models.imageOptions.find((model) => model.id === geminiImageModel)?.description}
                    </p>
                  </div>
                </div>

                <a
                  href="https://ai.google.dev/gemini-api/docs/models"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  Review the official Gemini model catalog
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </KeyField>

              <KeyField
                id="minimax-api-key"
                label="MiniMax"
                description="One BYOK key for MiniMax-M3 text, image-01 thumbnails, T2A speech, and Hailuo H3 cinematic video. Never returned to this window."
                configured={Boolean(status.minimax)}
                inputRef={minimaxKeyRef}
                providerUrl="https://platform.minimax.io/user-center/basic-information/interface-key"
                providerLabel="Open MiniMax API keys"
              >
                <p className="text-xs text-muted-foreground">
                  Text model {status.models.minimaxTextModel || "MiniMax-M3"}. Hailuo H3 writes a quoted 9:16 Short after you confirm cost on Render. Uncheck to keep MiniMax for text/TTS/image only (Ken Burns stills).
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    id="cinematic-veo"
                    checked={cinematicVeoEnabled}
                    onCheckedChange={(value) => setCinematicVeoEnabled(value === true)}
                    data-testid="checkbox-cinematic-veo"
                  />
                  <span>
                    Use MiniMax Hailuo H3 for cinematic Shorts (quote-before-run; inferred). Off keeps Ken Burns stills. No YouTube upload.
                  </span>
                </label>
              </KeyField>

              <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4">
                <div>
                  <Label htmlFor="ai-text-provider" className="text-base">
                    AI text provider
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Used for Insights, Ideas, Script, Package, Board, and thumbnails when MiniMax is selected.
                    Gemini remains the default. Keys are never shown again after save.
                  </p>
                </div>
                <Select value={aiProvider} onValueChange={setAiProvider}>
                  <SelectTrigger id="ai-text-provider" data-testid="select-ai-provider">
                    <SelectValue placeholder="Choose a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {(status.aiProviderOptions || [
                      { id: "gemini", label: "Gemini" },
                      { id: "minimax", label: "MiniMax" },
                      { id: "openrouter", label: "OpenRouter" },
                      { id: "openai_compatible", label: "OpenAI-compatible" },
                      { id: "ollama", label: "Ollama (local)" },
                    ]).map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {aiProvider === "openrouter" && (
                <KeyField
                  id="openrouter-api-key"
                  label="OpenRouter"
                  description="Routes Package JSON through OpenRouter chat completions."
                  configured={Boolean(status.openrouter)}
                  inputRef={openrouterKeyRef}
                  providerUrl="https://openrouter.ai/keys"
                  providerLabel="Open OpenRouter keys"
                >
                  <div className="space-y-2 border-t border-border pt-4">
                    <Label htmlFor="openrouter-model">Model</Label>
                    <Input
                      id="openrouter-model"
                      value={openrouterModel}
                      onChange={(event) => setOpenrouterModel(event.target.value)}
                      placeholder="openrouter/auto"
                      className="font-mono"
                      data-testid="input-openrouter-model"
                    />
                  </div>
                </KeyField>
              )}

              {aiProvider === "openai_compatible" && (
                <KeyField
                  id="openai-api-key"
                  label="OpenAI-compatible"
                  description="Any OpenAI chat-completions endpoint (OpenAI, Azure gateway, local proxy)."
                  configured={Boolean(status.openaiCompatible)}
                  inputRef={openaiKeyRef}
                  providerUrl="https://platform.openai.com/api-keys"
                  providerLabel="Open OpenAI API keys"
                >
                  <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="openai-base-url">Base URL</Label>
                      <Input
                        id="openai-base-url"
                        value={openaiBaseUrl}
                        onChange={(event) => setOpenaiBaseUrl(event.target.value)}
                        placeholder="https://api.openai.com/v1"
                        className="font-mono"
                        data-testid="input-openai-base-url"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="openai-model">Model</Label>
                      <Input
                        id="openai-model"
                        value={openaiModel}
                        onChange={(event) => setOpenaiModel(event.target.value)}
                        placeholder="gpt-4o-mini"
                        className="font-mono"
                        data-testid="input-openai-model"
                      />
                    </div>
                  </div>
                </KeyField>
              )}

              {aiProvider === "ollama" && (
                <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Label className="text-base">Ollama (local)</Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Uses the local OpenAI-compatible API. No cloud key required.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-green-500/40 bg-green-500/10 text-green-500"
                    >
                      Local
                    </Badge>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ollama-base-url">Base URL</Label>
                      <Input
                        id="ollama-base-url"
                        value={ollamaBaseUrl}
                        onChange={(event) => setOllamaBaseUrl(event.target.value)}
                        placeholder="http://127.0.0.1:11434/v1"
                        className="font-mono"
                        data-testid="input-ollama-base-url"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ollama-model">Model</Label>
                      <Input
                        id="ollama-model"
                        value={ollamaModel}
                        onChange={(event) => setOllamaModel(event.target.value)}
                        placeholder="llama3.2"
                        className="font-mono"
                        data-testid="input-ollama-model"
                      />
                    </div>
                  </div>
                </div>
              )}

              <KeyField
                id="elevenlabs-api-key"
                label="ElevenLabs (optional clone)"
                description="Your voice only. Cutroom never clones creators from Research. Key is not shown again after save."
                configured={Boolean(status.render?.elevenLabs)}
                inputRef={elevenLabsKeyRef}
                providerUrl="https://elevenlabs.io/app/settings/api-keys"
                providerLabel="Open ElevenLabs API keys"
              >
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="elevenlabs-voice-id">Voice id (yours)</Label>
                    <Input
                      id="elevenlabs-voice-id"
                      value={elevenLabsVoiceId}
                      onChange={(event) => setElevenLabsVoiceId(event.target.value)}
                      placeholder="Leave blank to keep the current voice id"
                      className="font-mono"
                      autoComplete="off"
                      data-testid="input-elevenlabs-voice-id"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      id="voice-consent"
                      checked={voiceConsent}
                      onCheckedChange={(value) => setVoiceConsent(value === true)}
                      data-testid="checkbox-voice-consent"
                    />
                    <span>
                      I confirm this is my own voice (or a voice I have rights to). Do not clone anyone from the research snapshot.
                    </span>
                  </label>
                </div>
              </KeyField>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSaving || Boolean(loadError)} data-testid="button-save-api-settings">
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save and apply
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
