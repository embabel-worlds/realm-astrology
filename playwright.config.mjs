import { defineConfig } from "@playwright/test";

/* The harness drives the app's real HTML with the world runtime stubbed; it needs no server. */
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.mjs",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: { viewport: { width: 1280, height: 900 } },
});
