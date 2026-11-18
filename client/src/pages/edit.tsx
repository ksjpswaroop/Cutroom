import { Link } from "wouter";
import { Clapperboard, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useProEnabled, FILMCRAFT_REPO_URL, FILMCRAFT_VERSION } from "@/lib/pro-commands";

/**
 * Cutroom Pro M0 — Edit tab.
 *
 * The editor is FilmCraft v0.20.1 by the ArtCraft team, vendored unmodified
 * under client/public/filmcraft-web/ and framed here in a same-origin
 * iframe. FilmCraft's own UI, name, and marks are left intact; the header
 * below states the version, author, licence, and links, and does not present
 * FilmCraft as Cutroom's own work.
 *
 * Known limits (M0): the vendored build is static only — no project is
 * handed to it yet (that is M1's assembler), and a live browser render was
 * not verified in this VM; see docs/CUTROOM_PRO_M0.md.
 */
export default function EditPage() {
  const { enabled, loading } = useProEnabled();

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
          <h1 className="text-2xl font-bold tracking-tight">Edit</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The Edit tab is a Cutroom Pro feature.
          </p>
        </div>
        <Alert>
          <Clapperboard className="h-4 w-4" />
          <AlertTitle>Cutroom Pro is off</AlertTitle>
          <AlertDescription>
            Turn on Cutroom Pro in Settings to open the editor. It is a local
            toggle only — no payment, no account, no cloud.
            <Button variant="outline" size="sm" className="ml-2" asChild>
              <Link href="/settings">Open Settings</Link>
            </Button>
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          When enabled, this tab opens FilmCraft v{FILMCRAFT_VERSION} by the
          ArtCraft team — the open-source video editor, vendored unmodified
          under MIT/Apache-2.0 — so you can cut, grade, caption, and export
          the video your Board planned.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            FilmCraft v{FILMCRAFT_VERSION} by the ArtCraft team, used under
            MIT/Apache-2.0 — the editor is FilmCraft, not Cutroom. Cutroom
            plans the video; FilmCraft cuts it.{" "}
            <a
              href={FILMCRAFT_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              storytold/filmcraft <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {" · "}
            <a href="/filmcraft-web/NOTICE" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              NOTICE
            </a>
            {" · "}
            <a href="/filmcraft-web/ATTRIBUTION.md" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Attribution
            </a>
            {" · "}
            <a href="/filmcraft-web/LICENSE-MIT" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              MIT
            </a>
            {" / "}
            <a href="/filmcraft-web/LICENSE-APACHE" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Apache-2.0
            </a>
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Alpha editor (FilmCraft's own estimate: ~56% ready for real work).
        Save and export inside FilmCraft; nothing is uploaded anywhere.
        Keyboard shortcuts go to the editor once you click into it.
      </p>
      <iframe
        src="/filmcraft-web/index.html"
        title="FilmCraft video editor"
        className="min-h-[560px] w-full flex-1 rounded-md border border-border bg-black"
        allow="fullscreen; clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"
        allowFullScreen
        data-testid="iframe-filmcraft"
      />
    </div>
  );
}
