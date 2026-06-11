import { defineConfig, devices } from "@playwright/test";

// E2E suite runs against a real `next dev` server backed by the seeded Postgres (Docker).
// Prereqs: `docker compose up -d` and `npm run db:seed` so the default store/household/sections exist.
// A dedicated port (3100) keeps E2E isolated from any dev server you have running.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Tests share one database; run them serially for deterministic state.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  // Generous timeouts: `next dev` compiles routes on first hit, and server actions trigger a
  // navigation + compile of the target route.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --hostname 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    // E2E mutates data through the UI; point it at the local Docker DB via E2E_DATABASE_URL so
    // it never touches the live database in .env. NOTE: reuseExistingServer means an already-
    // running dev server (with its own DATABASE_URL) bypasses this override.
    env: {
      ...process.env,
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    },
  },
});
