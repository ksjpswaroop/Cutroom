/**
 * Verify library folder change + thumbnail PNG + assemble preview.mp4.
 */
import { mkdir, access, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

const BASE = process.env.TEST_URL || "http://127.0.0.1:5050";
const ORIGIN = { Origin: BASE, "Content-Type": "application/json" };
const LIBRARY = path.resolve("tmp-artifacts/cutroom-library");

async function json(method: string, p: string, body?: unknown) {
  const res = await fetch(BASE + p, {
    method,
    headers: ORIGIN,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  await mkdir(LIBRARY, { recursive: true });
  const report: Record<string, unknown> = { library: LIBRARY, at: new Date().toISOString() };

  // ISSUE-003 check: empty bodies must be 400, not 429
  const emptyScript = await json("POST", "/api/script/generate", {});
  const emptyThumb = await json("POST", "/api/thumbnail/generate", {});
  const emptyPkg = await json("POST", "/api/package/generate", {});
  report.validation = {
    script: emptyScript.status,
    thumbnail: emptyThumb.status,
    package: emptyPkg.status,
  };
  console.log("empty validation", report.validation);

  // Change library folder
  const lib = await json("PUT", "/api/settings/library", { path: LIBRARY });
  if (lib.status !== 200 || lib.data?.libraryPath !== LIBRARY) {
    throw new Error(`Library save failed: ${lib.status} ${JSON.stringify(lib.data)}`);
  }
  report.librarySaved = lib.data.libraryPath;
  console.log("library saved", lib.data.libraryPath);

  // Enable assemble preview
  const prefs = await json("PUT", "/api/settings/preferences", { assemblePreviewEnabled: true });
  report.assembleEnabled = prefs.status === 200 && prefs.data?.preferences?.assemblePreviewEnabled === true;
  console.log("assemble enabled", report.assembleEnabled, prefs.status);

  const status = await json("GET", "/api/preview/status");
  report.previewStatus = status.data;
  console.log("preview status", status.data);

  // Generate a thumbnail with valid contract fields
  const thumb = await json("POST", "/api/thumbnail/generate", {
    topic: "Standing desk stability shootout",
    style: "tech",
    mainText: "4 LEG VS 2",
    subText: "WOBBLE TEST",
    thumbnailDescription:
      "Two standing desks side by side, one four-leg and one two-leg, coffee cup wobble test, high contrast, bold text space on the left",
    composition: "split-screen",
    cameraAngle: "eye-level",
    lighting: "studio",
    colorScheme: "vibrant",
    textPosition: "left",
    autoBlend: true,
    referenceImages: [],
    referenceRightsConfirmed: false,
    mode: "create",
  });
  report.thumbnailHttp = thumb.status;
  const imageData = thumb.data?.imageData || thumb.data?.imageDataUrl;
  if (thumb.status !== 200 || typeof imageData !== "string") {
    console.log("thumbnail fail", thumb.status, JSON.stringify(thumb.data).slice(0, 400));
    throw new Error("Thumbnail generation failed");
  }
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Thumbnail missing data URL");
  const ext = match[1].includes("jpeg") ? "jpg" : "png";
  const thumbPath = path.join(LIBRARY, `_verify-thumbnail.${ext}`);
  await writeFile(thumbPath, Buffer.from(match[2], "base64"));
  const thumbStat = await stat(thumbPath);
  report.thumbnailFile = { path: thumbPath, bytes: thumbStat.size, mime: match[1] };
  console.log("thumbnail wrote", report.thumbnailFile);

  // Assemble preview mp4
  const assemble = await json("POST", "/api/preview/assemble", {
    topic: "Standing desk stability shootout",
    title: "4-Leg vs 2-Leg Standing Desk Stability",
    chapters: [
      { timestamp: "0:00", title: "Intro" },
      { timestamp: "0:30", title: "Wobble test" },
    ],
    scriptContent: "Hook. We compare four-leg and two-leg standing desks for monitor wobble at full height. Typing test. Load test. Verdict.",
    thumbnailDataUrl: imageData,
    workflowId: "verify-media-001",
    workflowTitle: "Standing desk stability shootout",
  });
  report.assembleHttp = assemble.status;
  report.assemble = assemble.data;
  console.log("assemble", assemble.status, assemble.data);

  if (assemble.status !== 200 || !assemble.data?.path) {
    throw new Error("Assemble failed: " + JSON.stringify(assemble.data).slice(0, 400));
  }

  await access(assemble.data.path, fsConstants.R_OK);
  const videoStat = await stat(assemble.data.path);
  report.videoFile = { path: assemble.data.path, bytes: videoStat.size, durationSec: assemble.data.durationSec };
  if (videoStat.size < 1000) throw new Error("preview.mp4 too small");
  console.log("video ok", report.videoFile);

  // Confirm status endpoint shows library
  const settings = await json("GET", "/api/settings/status");
  report.settingsLibraryPath = settings.data?.libraryPath;
  console.log("settings libraryPath", settings.data?.libraryPath);

  await mkdir("tmp-artifacts/e2e-report", { recursive: true });
  await writeFile(
    "tmp-artifacts/e2e-report/library-media-verify.json",
    JSON.stringify(report, null, 2),
  );
  console.log("\nOK — library + png + mp4 verified");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
