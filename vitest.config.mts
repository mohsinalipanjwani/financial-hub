import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env so DB-backed tests (the sync engine) can reach PostgreSQL.
config();

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    globals: false,
    // DB integration tests share one connection; keep them serial for stability.
    fileParallelism: false,
    testTimeout: 20000,
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
