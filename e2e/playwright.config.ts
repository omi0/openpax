import { defineConfig } from "@playwright/test";

/**
 * Runs the real server (API + built dashboard + built widget) against a
 * throwaway Postgres database, with a Mailpit-compatible SMTP endpoint when
 * MAILPIT_URL is set (defaults to a console email provider otherwise).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", locale: "en-GB" },
  webServer: {
    command: "node scripts/start-server.mjs",
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { E2E_PORT: String(PORT) },
  },
});
