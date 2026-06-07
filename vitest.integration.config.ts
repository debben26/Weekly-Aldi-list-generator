import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests (*.itest.ts) run against the real Postgres (Docker). Kept separate from the
// fast, DB-free unit suite. Requires `docker compose up -d` and a seeded DB.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
