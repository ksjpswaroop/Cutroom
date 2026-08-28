/**
 * Desktop update check (L-507). Uses GitHub Releases latest.json signed with the Cutroom updater key.
 */
export async function checkForDesktopUpdate(): Promise<{
  available: boolean;
  version?: string;
  notes?: string;
  error?: string;
}> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return { available: false, error: "Updates are only available in the desktop app." };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return { available: false };
    return {
      available: true,
      version: update.version,
      notes: update.body || undefined,
    };
  } catch (error: any) {
    return {
      available: false,
      error: error?.message || "Unable to check for updates.",
    };
  }
}

export async function installDesktopUpdate(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return { ok: false, error: "Updates are only available in the desktop app." };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const update = await check();
    if (!update) return { ok: false, error: "No update available." };
    await update.downloadAndInstall();
    await relaunch();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Update install failed." };
  }
}
