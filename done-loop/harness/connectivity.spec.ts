import { test, expect } from "@playwright/test";
test("real CODAP loads in the browser", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  const resp = await page.goto("https://codap3.concord.org/?mouseSensor", { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("HTTP status:", resp?.status());
  expect(resp && resp.status()).toBeLessThan(400);
  await page.waitForTimeout(6000);
  const title = await page.title();
  console.log("PAGE TITLE:", title);
});
