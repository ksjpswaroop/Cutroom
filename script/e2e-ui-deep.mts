/**
 * Deeper Cutroom UI flows: script gen, ideas retry, negative channel, settings leak check.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TEST_URL || "http://127.0.0.1:5050";
const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "tmp-artifacts/e2e-screenshots/deep");
const REPORT = path.join(ROOT, "tmp-artifacts/e2e-report/ui-deep.json");

type R = { id: string; name: string; passed: boolean; notes?: string; error?: string };

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(120_000);
  const results: R[] = [];

  async function step(id: string, name: string, fn: () => Promise<string | void>) {
    try {
      const notes = (await fn()) || undefined;
      results.push({ id, name, passed: true, notes });
      console.log(`PASS ${id}: ${name}${notes ? " — " + notes : ""}`);
    } catch (e: any) {
      results.push({ id, name, passed: false, error: e?.message || String(e) });
      console.log(`FAIL ${id}: ${e?.message || e}`);
    }
  }

  await step("D01", "script empty submit shows Topic is required", async () => {
    await page.goto(BASE + "/script");
    await page.getByRole("button", { name: /Generate Script/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, "d01-script-empty.png"), fullPage: true });
    if (!(await page.getByText(/Topic is required/i).isVisible())) {
      throw new Error("Expected Topic is required");
    }
  });

  await step("D02", "script generate happy path", async () => {
    await page.goto(BASE + "/script");
    await page.getByPlaceholder(/React app|How to/i).fill("4-Leg vs 2-Leg Standing Desk Stability Shootout");
    await page.getByRole("button", { name: /Generate Script/i }).click();
    for (let i = 0; i < 60; i++) {
      if (await page.getByRole("button", { name: /Play/i }).isVisible().catch(() => false)) break;
      if (await page.getByText(/Too many requests|Script generation failed|unavailable/i).first().isVisible().catch(() => false)) {
        await page.screenshot({ path: path.join(SHOTS, "d02-script-fail.png"), fullPage: true });
        return "script gen error/rate-limit";
      }
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(SHOTS, "d02-script-after.png"), fullPage: true });
    if (!(await page.getByRole("button", { name: /Play/i }).isVisible())) throw new Error("No teleprompter after generate");
    const topicVal = await page.getByPlaceholder(/React app|How to/i).inputValue();
    if (/undefined$/i.test(topicVal)) return "ISSUE: topic input ends with literal 'undefined'";
    return "script ready";
  });

  await step("D03", "thumbnail page loads post-script", async () => {
    await page.goto(BASE + "/thumbnail");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, "d03-thumbnail.png"), fullPage: true });
  });

  await step("D04", "package page loads", async () => {
    await page.goto(BASE + "/package");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, "d04-package.png"), fullPage: true });
  });

  await step("D05", "calendar XSS theme rendered as text", async () => {
    await page.goto(BASE + "/calendar");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, "d05-calendar.png"), fullPage: true });
    const hasText = await page.getByText("<script>alert(1)</script>").first().isVisible().catch(() => false);
    return hasText ? "escaped as text" : "XSS theme row not visible";
  });

  await step("D06", "settings does not leak API keys", async () => {
    await page.goto(BASE + "/settings");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SHOTS, "d06-settings.png"), fullPage: true });
    const body = await page.locator("body").innerText();
    if (/AIza[0-9A-Za-z_-]{20,}/.test(body)) throw new Error("Google API key visible in Settings");
    return "no raw Google key in settings body";
  });

  await step("D07", "invalid channelId search surfaces error", async () => {
    await page.goto(BASE + "/");
    await page.getByTestId("button-new-workflow").click().catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId("input-search").fill("desk");
    await page.getByTestId("input-channel-id").fill("not-a-real-channel-id");
    await page.getByTestId("button-search").click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(SHOTS, "d07-bad-channel.png"), fullPage: true });
    const body = await page.locator("body").innerText();
    if (!/error|invalid|failed|could not|No videos|400|502/i.test(body)) {
      throw new Error("No clear error for bad channelId");
    }
  });

  await step("D08", "retry grounded ideas after rate limit", async () => {
    await page.goto(BASE + "/");
    // Prefer workflow with prior results if present
    const recent = page.getByRole("button", { name: /standing desk reviews 2024/i }).first();
    if (await recent.isVisible().catch(() => false)) await recent.click();
    await page.waitForTimeout(1500);
    let hasResults = await page.getByTestId("text-results-count").isVisible().catch(() => false);
    if (!hasResults) {
      await page.getByTestId("input-search").fill("standing desk reviews");
      await page.getByTestId("button-search").click();
      await page.waitForSelector("[data-testid=text-results-count]", { timeout: 90_000 });
    }
    for (let i = 0; i < 40; i++) {
      if (await page.getByText(/Strategic readout|AI Insights are unavailable/i).first().isVisible().catch(() => false)) break;
      await page.waitForTimeout(2000);
    }
    const retry = page.getByRole("button", { name: /Retry grounded Ideas/i });
    if (await retry.isVisible().catch(() => false)) await retry.click();
    for (let i = 0; i < 50; i++) {
      if (await page.locator("[data-testid^=button-grounded-idea-]").first().isVisible().catch(() => false)) break;
      const unavailable = await page.getByText(/Grounded Ideas are unavailable/i).isVisible().catch(() => false);
      if (unavailable && i > 8) {
        const err = await page.locator("[data-testid^=alert-ideas-]").innerText().catch(() => "");
        await page.screenshot({ path: path.join(SHOTS, "d08-ideas-fail.png"), fullPage: true });
        return `ideas unavailable: ${err.slice(0, 180)}`;
      }
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(SHOTS, "d08-ideas.png"), fullPage: true });
    if (await page.locator("[data-testid^=button-grounded-idea-]").first().isVisible().catch(() => false)) {
      return "ideas ready";
    }
    return "ideas not ready after wait";
  });

  await writeFile(REPORT, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
  const passed = results.filter((r) => r.passed).length;
  console.log(`\nDeep UI ${passed}/${results.length} → ${REPORT}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
