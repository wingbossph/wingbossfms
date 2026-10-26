import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run the real services against a disposable Postgres
// database (TEST_DATABASE_URL), migrated from scratch with its triggers.
const testDb = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/wingboss_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: { DATABASE_URL: testDb, DIRECT_URL: testDb, TEST_DATABASE_URL: testDb },
  },
});
