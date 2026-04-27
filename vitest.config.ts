import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": `${root}/src`,
      "@root": root,
      "@test": `${root}/tests`,
      "@scripts": `${root}/scripts`,
      "@eslint-rules": `${root}/eslint-rules`,
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "spx/**/*.test.ts", "specs/**/*.test.ts"],
    // TODO: Make exclusion more fine-grained - only exclude fixture stubs, not actual tests in fixtures
    exclude: ["**/node_modules/**", "**/dist/**", "tests/fixtures/**/*.test.ts"],
    // Integration/e2e tests spawn subprocesses; under full concurrency (130 files, forks pool) isolation runs of 4–9s can exceed 15s
    testTimeout: 30_000,
    // Use forks instead of threads for integration tests that need process.chdir()
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "scripts/**/*.ts", "tests/harness/**/*.ts"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.config.ts",
        "tests/fixtures/**/*",
      ],
    },
  },
});
