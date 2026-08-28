import { useEffect, useState } from "react";
import { Link } from "wouter";
import { FolderOpen, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface SetupStatus {
  youtube: boolean;
  gemini: boolean;
  libraryPath: string | null;
  isDesktop: boolean;
}

async function detectDesktop(): Promise<boolean> {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function FirstRunBanner() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState(false);
  const [dismissedLibrary, setDismissedLibrary] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const isDesktop = await detectDesktop();
        const response = await fetch("/api/settings/status", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) {
          setStatus({
            youtube: Boolean(body.youtube),
            gemini: Boolean(body.gemini),
            libraryPath: typeof body.libraryPath === "string" ? body.libraryPath : null,
            isDesktop,
          });
        }
      } catch {
        // ignore — banner is best-effort
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!status) return null;

  const needsKeys = !dismissedKeys && !(status.youtube && status.gemini);
  const needsLibrary = !dismissedLibrary && status.isDesktop && !status.libraryPath;

  if (!needsKeys && !needsLibrary) return null;

  return (
    <div className="space-y-0 border-b border-border">
      {needsLibrary && (
        <div className="px-4 py-3">
          <Alert>
            <FolderOpen className="h-4 w-4" />
            <AlertTitle>Choose a library folder</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>
                Pick a folder where Cutroom will save each workflow by topic name (research, scripts, thumbnails, packages).
              </span>
              <Button asChild size="sm" variant="default">
                <Link href="/settings">Choose folder</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissedLibrary(true)}>Later</Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      {needsKeys && (
        <div className="px-4 py-3">
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>Connect your local API keys</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>
                {!status.youtube && !status.gemini
                  ? "Add YouTube and Gemini keys to unlock research and AI generation."
                  : !status.youtube
                    ? "Add a YouTube Data API key to run Research."
                    : "Add a Gemini API key to unlock Insights, Script, Thumbnail, and Package."}
              </span>
              <Button asChild size="sm" variant="default">
                <Link href="/settings">Open Settings</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissedKeys(true)}>Dismiss</Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
