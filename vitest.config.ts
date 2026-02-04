import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@test": path.resolve(__dirname, "./tests"),
      "@scripts": path.resolve(__dirname, "./scripts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "spx/**/*.test.ts", "specs/**/*.test.ts"],
    // TODO: Make exclusion more fine-grained - only exclude fixture stubs, not actual tests in fixtures
    exclude: ["**/node_modules/**", "**/dist/**", "tests/fixtures/**/*.test.ts"],
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
