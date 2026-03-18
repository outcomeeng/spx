/**
 * Integration tests for TypeScript checking of scripts/ directory
 *
 * ADR-021: Tests use isolated fixture projects, never modify the live repo.
 * Configuration tests verify tsconfig.json structure (Level 1).
 * Behavior tests use isolated fixtures (Level 2).
 */

import { execa } from "execa";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to isolated fixture project with known type errors */
const TYPE_ERROR_FIXTURE = join(__dirname, "../../fixtures/projects/with-type-errors");

describe("TypeScript checking for scripts/", () => {
  describe("GIVEN project tsconfig.json", () => {
    it("WHEN checking include patterns THEN scripts/ is included", async () => {
      // Level 1: Verify tsconfig.json configuration (no subprocess needed)
      const tsconfigPath = join(process.cwd(), "tsconfig.json");
      const content = await readFile(tsconfigPath, "utf-8");

      // Then: scripts is in the include patterns (check raw content since tsconfig may have comments)
      expect(content).toMatch(/["']scripts\/\*\*\/\*["']/);
    });
  });

  describe("GIVEN isolated fixture with type errors", () => {
    it("WHEN running tsc THEN catches errors", async () => {
      // Level 2: Test TypeScript detection with isolated fixture (ADR-021)

      // When: Run tsc on fixture project
      const result = await execa("npx", ["tsc", "--noEmit"], {
        cwd: TYPE_ERROR_FIXTURE,
        reject: false,
      });

      // Then: TypeScript fails due to type error in fixture
      // tsc outputs errors to stdout; stderr may contain unrelated npm warnings (Node 24+)
      expect(result.exitCode).not.toBe(0);
      const tscOutput = result.stdout;
      expect(tscOutput).toContain("has-type-error.ts");
      expect(tscOutput).toContain(
        "Type 'string' is not assignable to type 'number'",
      );
    });
  });

  describe("GIVEN validate.ts with no any types", () => {
    it("WHEN checking logging functions THEN they use string types", async () => {
      // Given: Read validate.ts
      const { readFile } = await import("fs/promises");
      const validatePath = join(process.cwd(), "scripts", "run", "validate.ts");
      const content = await readFile(validatePath, "utf-8");

      // Then: Log functions use string, not any
      const logSection = content.slice(
        content.indexOf("const log = {"),
        content.indexOf("};", content.indexOf("const log = {")) + 2,
      );

      expect(logSection).toContain("message?: string");
      expect(logSection).toContain("optionalParams: unknown[]");
      expect(logSection).not.toContain("message?: any");
      expect(logSection).not.toContain("optionalParams: any[]");
      expect(logSection).not.toContain("@typescript-eslint/no-explicit-any");
    });
  });
});
