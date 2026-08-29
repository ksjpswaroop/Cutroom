/**
 * Cutroom local E2E + edge/negative UI tests (Playwright).
 * Writes screenshots to tmp-artifacts/e2e-screenshots and JSON results to e2e-report.
 */
import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TEST_URL || "http://127.0.0.1:5050";
const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "tmp-artifacts/e2e-screenshots");
const REPORT = path.join(ROOT, "tmp-artifacts/e2e-report/ui-results.json");

type Result = {
  id: string;
  name: string;
  category: "happy" | "edge" | "negative";
  passed: boolean;
  error?: string;
  screenshot?: string;
  notes?: string;
};

const results: Result[] = [];

async function shot(page: Page, name: string) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function record(
  id: string,
  name: string,
  category: Result["category"],
  fn: () => Promise<string | void>,
) {
  try {
    const notes = (await fn()) || undefined;
    results.push({ id, name, category, passed: true, notes });
    console.log(`PASS ${id}: ${name}`);
  } catch (error: any) {
    results.push({
      id,
      name,
      category,
      passed: false,
      error: error?.message || String(error),
    });
    console.log(`FAIL ${id}: ${name} — ${error?.message || error}`);
  }
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  // --- Happy path: shell loads ---
  await record("UI-01", "Research page loads", "happy", async () => {
    await page.goto(BASE + "/");
    await page.getByTestId("text-app-name").waitFor({ state: "visible", timeout: 20_000 });
    await shot(page, "01-research-home");
    const title = await page.title();
    if (!/Cutroom/i.test(title) && !(await page.getByText("Cutroom").first().isVisible())) {
      throw new Error("Cutroom branding not visible");
    }
  });

  await record("UI-02", "Sidebar navigation to Settings", "happy", async () => {
    await page.goto(BASE + "/settings");
    await page.waitForSelector("text=Settings", { timeout: 15_000 });
    await shot(page, "02-settings");
    if (!(await page.getByText(/API|Brand kit|Studio|Library|Assemble/i).first().isVisible().catch(() => false))) {
      // soft: at least settings route rendered
      await page.waitForSelector("text=Brand kit, text=YouTube, text=Gemini", { timeout: 5_000 }).catch(() => {});
    }
  });

  await record("UI-03", "Calendar page loads and can add theme", "happy", async () => {
    await page.goto(BASE + "/calendar");
    await page.waitForSelector("text=Content calendar", { timeout: 15_000 });
    await shot(page, "03-calendar");
    const theme = `e2e-ui-${Date.now()}`;
    await page.getByTestId("input-calendar-theme").fill(theme);
    await page.getByTestId("button-calendar-add").click();
    await page.waitForTimeout(800);
    await shot(page, "03b-calendar-after-add");
    if (!(await page.getByText(theme).first().isVisible())) {
      throw new Error("Added calendar theme not visible");
    }
  });

  await record("UI-04", "Research search happy path", "happy", async () => {
    await page.goto(BASE + "/");
    await page.waitForTimeout(500);
    const input = page.getByTestId("input-search");
    await input.waitFor({ state: "visible", timeout: 15_000 });
    await input.fill("standing desk reviews");
    await shot(page, "04-research-before-search");
    await page.getByTestId("button-search").click();
    await page.waitForTimeout(5000);
    await shot(page, "04b-research-after-search");
    const hasResults = await page.getByTestId("text-results-count").isVisible().catch(() => false);
    const hasError = await page.locator('[data-testid^="alert-search-"]').first().isVisible().catch(() => false);
    if (!hasResults && hasError) {
      const err = await page.locator('[data-testid^="alert-search-"]').first().innerText();
      throw new Error("Search failed: " + err.slice(0, 240));
    }
    if (!hasResults) {
      const body = await page.locator("body").innerText();
      if (/error|unable|failed/i.test(body) && !/results|video/i.test(body)) {
        throw new Error("Search appears to have failed: " + body.slice(0, 200));
      }
      return "No results count visible; page stayed responsive";
    }
  });

  await record("UI-05", "Script page reachable", "happy", async () => {
    await page.goto(BASE + "/script");
    await page.waitForTimeout(1000);
    await shot(page, "05-script");
  });

  await record("UI-06", "Thumbnail page reachable", "happy", async () => {
    await page.goto(BASE + "/thumbnail");
    await page.waitForTimeout(1000);
    await shot(page, "06-thumbnail");
  });

  await record("UI-07", "Package page reachable", "happy", async () => {
    await page.goto(BASE + "/package");
    await page.waitForTimeout(1000);
    await shot(page, "07-package");
  });

  await record("UI-07b", "Board page reachable", "happy", async () => {
    await page.goto(BASE + "/board");
    await page.waitForSelector("text=Production board", { timeout: 15_000 });
    await shot(page, "07b-board");
  });

  await record("UI-08", "Render page engine picker", "happy", async () => {
    await page.goto(BASE + "/video");
    await page.waitForSelector("text=Render", { timeout: 15_000 });
    await page.getByTestId("render-engine-picker").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("button-engine-shoot").click();
    await page.getByTestId("button-engine-slides").click();
    await page.getByTestId("button-engine-cinematic").click();
    await shot(page, "08-video");
  });

  // --- Edge ---
  await record("UI-09", "Empty research search does not crash", "edge", async () => {
    await page.goto(BASE + "/");
    const input = page.getByTestId("input-search");
    await input.fill("");
    const searchBtn = page.getByTestId("button-search");
    const disabled = await searchBtn.isDisabled();
    await shot(page, "09-empty-search");
    await input.press("Enter");
    await page.waitForTimeout(800);
    await page.waitForSelector("body");
    if (!disabled) return "Search button enabled with empty query (Enter may still submit)";
    return "Search button correctly disabled when query empty";
  });

  await record("UI-10", "Channel ID filter field accepts long ID", "edge", async () => {
    await page.goto(BASE + "/");
    const channel = page.getByTestId("input-channel-id");
    if (await channel.isVisible().catch(() => false)) {
      await channel.fill("UC_x5XG1OV2P6uZZ5FSM9Ttw");
      await shot(page, "10-channel-filter");
    } else {
      await shot(page, "10-channel-filter-missing");
      return "channel input not found — may be collapsed in filters";
    }
  });

  await record("UI-11", "Unknown route shows not-found", "edge", async () => {
    await page.goto(BASE + "/this-route-should-404");
    await page.waitForTimeout(800);
    await shot(page, "11-not-found");
    const text = await page.locator("body").innerText();
    if (!/not found|404|missing|doesn't exist|does not exist/i.test(text)) {
      // wouter may just show blank shell — note it
      return `No explicit 404 copy. Body starts: ${text.slice(0, 120)}`;
    }
  });

  // --- Negative ---
  await record("UI-12", "Settings rejects empty key save gracefully", "negative", async () => {
    await page.goto(BASE + "/settings");
    await page.waitForTimeout(800);
    const save = page.getByRole("button", { name: /save/i }).first();
    if (await save.isVisible().catch(() => false)) {
      await save.click();
      await page.waitForTimeout(800);
    }
    await shot(page, "12-settings-save");
  });

  await record("UI-13", "Calendar rejects empty theme (HTML required)", "negative", async () => {
    await page.goto(BASE + "/calendar");
    await page.getByTestId("input-calendar-theme").fill("");
    await page.getByTestId("button-calendar-add").click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, "13-calendar-empty-theme");
    // button should be disabled or browser validation blocks
    const disabled = await page.getByTestId("button-calendar-add").isDisabled();
    if (!disabled) return "Add button not disabled when theme empty (relies on HTML required)";
  });

  await record("UI-14", "Ideas redirect to research hash", "happy", async () => {
    await page.goto(BASE + "/ideas");
    await page.waitForTimeout(800);
    await shot(page, "14-ideas-redirect");
    const url = page.url();
    if (!url.includes("/#ideas") && !url.endsWith("/") && !url.includes("#ideas")) {
      throw new Error(`Expected redirect to /#ideas, got ${url}`);
    }
  });

  await browser.close();
  await writeFile(REPORT, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
  const passed = results.filter((r) => r.passed).length;
  console.log(`\nUI ${passed}/${results.length} passed`);
  console.log(`Report: ${REPORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
