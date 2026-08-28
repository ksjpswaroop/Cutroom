import { loadEnvFile } from "node:process";
import { getEnvFilePaths } from "./env-path";

const { envPath } = getEnvFilePaths();
try {
  loadEnvFile(envPath);
} catch (error: any) {
  if (error?.code !== "ENOENT") throw error;
}

if (process.env.CUTROOM_APP_DATA?.trim() || process.env.LEDGER_APP_DATA?.trim()) {
  try {
    loadEnvFile(".env");
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
}
