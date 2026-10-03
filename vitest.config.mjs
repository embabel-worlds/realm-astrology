import { defineConfig } from "vitest/config";

/*
 * The unit and live-ephemeris battery only. The browser harnesses are Playwright specs — they share
 * the tests/ directory but not the runner, and vitest tries to execute them unless told otherwise.
 */
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
