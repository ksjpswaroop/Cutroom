/**
 * Phase 7 smoke: Board/render contracts + local API if TEST_URL is up.
 * Does not call live YouTube, Gemini, Veo, or ElevenLabs.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.TEST_URL || process.env.CUTROOM_SMOKE_URL || "";

async function runUnitTests(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import", "tsx",
        "--test",
        "shared/board-contracts.test.ts",
        "shared/render-contracts.test.ts",
        "server/cinematic-render.test.ts",
        "server/render-engine.test.ts",
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Phase 7 unit tests exited ${code}`));
    });
  });
}

async function smokeApi(base: string): Promise<void> {
  const statusRes = await fetch(`${base}/api/preview/status`, { cache: "no-store" });
  const status = await statusRes.json() as {
    render?: { engines?: string[]; youtubeUpload?: boolean };
  };
  if (!statusRes.ok) throw new Error(`preview/status ${statusRes.status}`);
  assert.equal(status.render?.youtubeUpload, false);
  assert.ok(status.render?.engines?.includes("shoot"));
  assert.ok(status.render?.engines?.includes("slides"));
  assert.ok(status.render?.engines?.includes("cinematic"));

  const shootRes = await fetch(`${base}/api/preview/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engine: "shoot", topic: "Smoke shoot pack" }),
  });
  const shoot = await shootRes.json() as { engine?: string; path?: string; evidenceClass?: string };
  assert.equal(shootRes.ok, true, shoot && JSON.stringify(shoot));
  assert.equal(shoot.engine, "shoot");
  assert.equal(shoot.path, undefined);
  assert.equal(shoot.evidenceClass, "inferred");

  const cinematicRes = await fetch(`${base}/api/preview/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engine: "cinematic", topic: "Smoke cinematic" }),
  });
  assert.equal(cinematicRes.status, 400);

  const quoteRes = await fetch(`${base}/api/preview/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const quote = await quoteRes.json() as { needsConfirm?: boolean; maxShots?: number; evidenceClass?: string };
  assert.equal(quoteRes.ok, true);
  assert.equal(quote.needsConfirm, true);
  assert.equal(quote.maxShots, 5);
  assert.equal(quote.evidenceClass, "inferred");

  for (const route of ["/board", "/video", "/package", "/settings"]) {
    const page = await fetch(`${base}${route}`);
    assert.ok(page.ok, `${route} ${page.status}`);
  }
}

async function main() {
  await runUnitTests();
  if (!BASE) {
    console.log("Phase 7 unit smoke passed. Set TEST_URL to hit a running Cutroom server.");
    return;
  }
  await smokeApi(BASE.replace(/\/$/, ""));
  console.log(`Phase 7 API smoke passed against ${BASE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
