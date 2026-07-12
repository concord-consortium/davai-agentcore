import { test, expect } from "@playwright/test";
// Loads the LOCALLY SERVED DAVAI plugin inside real CODAP (proxied same-origin on :8080).
test("DAVAI plugin renders inside CODAP", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const di = encodeURIComponent("https://localhost:8080/?mode=development");
  const resp = await page.goto(`https://localhost:8080/app/?di=${di}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("CODAP page status:", resp?.status());
  const plugin = page.frameLocator(".codap-web-view-iframe");
  await expect(plugin.getByTestId("chat-input-textarea")).toBeVisible({ timeout: 60000 });
  console.log("PASS: DAVAI chat input rendered inside CODAP");
});
