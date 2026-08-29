import { chromium } from "playwright";

const BASE = process.env.TEST_URL || "http://127.0.0.1:5050";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(90_000);
  await page.goto(BASE + "/script");
  await page.getByTestId("button-generate-script").click();
  await page.waitForTimeout(600);
  const err =
    (await page.getByTestId("error-topic").textContent().catch(() => null))
    || (await page.getByText("Topic is required").textContent().catch(() => null));
  console.log("empty-topic-error:", err);
  if (!err || !/Topic is required/i.test(err)) throw new Error("Expected Topic is required");

  await page.getByTestId("input-topic").fill("Desk stability shootout");
  await page.getByTestId("button-generate-script").click();
  for (let i = 0; i < 50; i++) {
    if (await page.getByRole("button", { name: /Play/i }).isVisible().catch(() => false)) break;
    await page.waitForTimeout(1500);
  }
  const topic = await page.getByTestId("input-topic").inputValue();
  console.log("topic-after-generate:", JSON.stringify(topic));
  if (/undefined$/i.test(topic)) throw new Error("Topic still ends with undefined");
  console.log("ISSUE-001/005 recheck OK");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
