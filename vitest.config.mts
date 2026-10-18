import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    env: { PGLITE_DIR: "memory://", APP_ENV: "development", APP_URL: "http://localhost:3000", PAYMENTS_TEST_GATEWAY: "enabled" },
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: "forks",
  },
});
