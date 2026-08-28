/**
 * Desktop teleprompter helpers (L-309 / L-502).
 * Uses Tauri window APIs when available; falls back to document fullscreen on web.
 */
export async function isTauriDesktop(): Promise<boolean> {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface TeleprompterDesktopState {
  fullscreen: boolean;
  alwaysOnTop: boolean;
  mirrored: boolean;
}

export async function setTeleprompterDesktopMode(enabled: boolean): Promise<void> {
  if (!(await isTauriDesktop())) {
    return;
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.setFullscreen(enabled);
  await win.setAlwaysOnTop(enabled);
}

export async function toggleDocumentFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return;
  if (document.fullscreenElement) await document.exitFullscreen();
  else await element.requestFullscreen();
}
