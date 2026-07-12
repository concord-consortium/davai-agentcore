import { test, expect } from "@playwright/test";
test("DAVAI parity: modify interaction creates a graph in the document", async ({ page }) => {
  page.on("dialog", d => d.accept());
  await page.setViewportSize({ width: 1500, height: 950 });
  const di = encodeURIComponent("https://localhost:8080/?mode=development");
  await page.goto(`https://localhost:8080/app/?sample=mammals&dashboard&di=${di}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const plugin = page.frameLocator(".codap-web-view-iframe");
  await expect(plugin.getByTestId("chat-input-textarea")).toBeVisible({ timeout: 60000 });
  await plugin.getByTestId("llm-select").selectOption('{"id":"gpt-4o-mini","provider":"OpenAI"}');
  await expect.poll(async () => plugin.getByTestId("llm-select").evaluate((el: HTMLSelectElement) => el.value)).toContain("gpt-4o-mini");

  // count CODAP graph components before
  const graphsBefore = await page.locator('[class*="codap-graph"], .graph-plot, [data-testid*="graph"]').count().catch(() => 0);
  console.log("graphs before:", graphsBefore);

  await plugin.getByTestId("chat-input-textarea").fill("Make a scatterplot of Height versus Mass.");
  await plugin.getByTestId("chat-input-send").click();

  // Wait for the tool round-trip to complete without error and a graph to appear.
  await expect.poll(async () => {
    const t = await plugin.getByTestId("chat-transcript").innerText().catch(() => "");
    if (/Failed to handle message submit|ran into an error/.test(t)) return "ERROR";
    const graphs = await page.locator('[class*="codap-graph"], .graph-plot, [data-testid*="graph"]').count().catch(() => 0);
    return graphs > graphsBefore ? "GRAPH" : "WAIT";
  }, { timeout: 120000, intervals: [3000] }).toBe("GRAPH");

  const graphsAfter = await page.locator('[class*="codap-graph"], .graph-plot, [data-testid*="graph"]').count();
  console.log("graphs after:", graphsAfter, "(document-state delta confirmed)");
});
