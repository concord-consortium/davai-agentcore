import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "connectivity.spec.ts",
  use: { ignoreHTTPSErrors: true },
  timeout: 90000,
  reporter: "list",
});
