import { defineConfig } from "vitest/config";

import { VITEST_TEST_TIMEOUT } from "./testing/vitest-policy";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": `${root}/src`,
      "@root": root,
      "@testing": `${root}/testing`,
      "@scripts": `${root}/scripts`,
      "@eslint-rules": `${root}/eslint-rules`,
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["spx/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "testing/fixtures/**/*.test.ts"],
    // Integration/e2e tests spawn subprocesses; under full concurrency (130 files, forks pool) isolation runs of 4–9s can exceed 15s
    testTimeout: VITEST_TEST_TIMEOUT,
    // Use forks instead of threads for integration tests that need process.chdir()
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "scripts/**/*.ts", "testing/harnesses/**/*.ts", "eslint-rules/**/*.ts"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.config.ts",
        "testing/fixtures/**/*",
      ],
    },
  },
});
