import path from "node:path";

/**
 * Prefer CUTROOM_APP_DATA (set by the Tauri host; LEDGER_APP_DATA still accepted)
 * so packaged apps write secrets next to user data, not the install directory.
 */
function appDataRoot(): string | undefined {
  const value = process.env.CUTROOM_APP_DATA?.trim() || process.env.LEDGER_APP_DATA?.trim();
  return value || undefined;
}

export function getEnvFilePaths() {
  const root = appDataRoot() ? path.resolve(appDataRoot()!) : process.cwd();
  return {
    root,
    envPath: path.join(root, ".env"),
    envTempPath: path.join(root, ".env.tmp"),
  };
}

export function loadCutroomEnvFiles(loadEnvFile: (path: string) => void) {
  const { envPath } = getEnvFilePaths();
  try {
    loadEnvFile(envPath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (appDataRoot()) {
    try {
      loadEnvFile(".env");
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

/** @deprecated Use loadCutroomEnvFiles */
export const loadLedgerEnvFiles = loadCutroomEnvFiles;
