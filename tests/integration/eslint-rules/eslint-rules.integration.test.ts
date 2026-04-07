/**
 * Level 2 Integration Tests: ESLint Rules
 *
 * Tests that custom ESLint rules integrate correctly with real ESLint.
 *
 * Per ADR-21 (ESLint Testing Harness):
 * - Uses real ESLint instance with production config
 * - Verifies plugin loading and rule registration
 * - Verifies file-type filtering (test vs non-test files)
 * - Does NOT duplicate every valid/invalid case from unit tests
 *
 * @see decisions/adr-21_eslint-testing-harness.md
 */
import path from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

describe("ESLint Rules Integration", () => {
  /**
   * Test Levels for ESLint rules:
   *
   * Level 1 (Unit) - story-21/tests/ and story-32/tests/:
   * - AST detection logic via RuleTester
   * - Whitelist context checking
   * - Error message formatting
   *
   * Level 2 (Integration) - THIS FILE:
   * - Plugin registration in eslint.config.ts
   * - File pattern filtering (test vs non-test files)
   * - Cross-rule interaction
   * - Real ESLint instance with production config
   */

  let eslint: ESLint;

  // Project root where eslint.config.ts lives
  const projectRoot = path.resolve(import.meta.dirname, "../../..");

  beforeAll(() => {
    eslint = new ESLint({
      cwd: projectRoot,
    });
  });

  describe("plugin registration", () => {
    it("GIVEN eslint config WHEN calculating config for test file THEN spx rules are available", async () => {
      const config = await eslint.calculateConfigForFile("test.test.ts");

      // In ESLint flat config, plugins are keyed objects not string arrays
      // We verify the plugin is loaded by checking its rules are registered
      expect(config.rules).toHaveProperty("spx/no-bdd-try-catch-anti-pattern");
    });

    it("GIVEN eslint config WHEN calculating config THEN no-hardcoded-work-item-kinds rule is registered", async () => {
      const config = await eslint.calculateConfigForFile("test.test.ts");

      expect(config.rules).toHaveProperty("spx/no-hardcoded-work-item-kinds");
    });

    it("GIVEN eslint config WHEN calculating config THEN no-hardcoded-statuses rule is registered", async () => {
      const config = await eslint.calculateConfigForFile("test.test.ts");

      expect(config.rules).toHaveProperty("spx/no-hardcoded-statuses");
    });

    it("GIVEN eslint config WHEN calculating config for TS file THEN no-spec-references rule is registered", async () => {
      const config = await eslint.calculateConfigForFile("src/example.ts");

      expect(config.rules).toHaveProperty("spx/no-spec-references");
    });

    it("GIVEN eslint config WHEN calculating config for TS file THEN no-restricted-syntax is active", async () => {
      const config = await eslint.calculateConfigForFile("src/example.ts");

      expect(config.rules).toHaveProperty("no-restricted-syntax");
    });
  });

  describe("no-hardcoded-work-item-kinds detection", () => {
    it("GIVEN test file with hardcoded kind WHEN linting THEN reports violation", async () => {
      const results = await eslint.lintText(
        `expect(item.kind).toBe("story");`,
        { filePath: "test.test.ts" },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({ ruleId: "spx/no-hardcoded-work-item-kinds" }),
      );
    });

    it("GIVEN non-test file with hardcoded kind WHEN linting THEN no violation", async () => {
      const results = await eslint.lintText(
        `const kind = "story";`,
        { filePath: "src/parser.ts" },
      );

      const kindViolations = results[0].messages.filter(
        (m) => m.ruleId === "spx/no-hardcoded-work-item-kinds",
      );
      expect(kindViolations).toHaveLength(0);
    });
  });

  describe("no-hardcoded-statuses detection", () => {
    it("GIVEN test file with hardcoded status WHEN linting THEN reports violation", async () => {
      const results = await eslint.lintText(
        `expect(item.status).toBe("DONE");`,
        { filePath: "test.test.ts" },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({ ruleId: "spx/no-hardcoded-statuses" }),
      );
    });

    it("GIVEN non-test file with hardcoded status WHEN linting THEN no violation", async () => {
      const results = await eslint.lintText(
        `const status = "DONE";`,
        { filePath: "src/status.ts" },
      );

      const statusViolations = results[0].messages.filter(
        (m) => m.ruleId === "spx/no-hardcoded-statuses",
      );
      expect(statusViolations).toHaveLength(0);
    });

    it("GIVEN test file with DONE.md path WHEN linting THEN no violation (exact match only)", async () => {
      const results = await eslint.lintText(
        `expect(file).toBe("tests/DONE.md");`,
        { filePath: "test.test.ts" },
      );

      const statusViolations = results[0].messages.filter(
        (m) => m.ruleId === "spx/no-hardcoded-statuses",
      );
      expect(statusViolations).toHaveLength(0);
    });
  });

  describe("cross-rule interaction", () => {
    it("GIVEN test file with both kind and status violations WHEN linting THEN reports both", async () => {
      const results = await eslint.lintText(
        `
          expect(item.kind).toBe("story");
          expect(item.status).toBe("DONE");
        `,
        { filePath: "test.test.ts" },
      );

      const kindViolations = results[0].messages.filter(
        (m) => m.ruleId === "spx/no-hardcoded-work-item-kinds",
      );
      const statusViolations = results[0].messages.filter(
        (m) => m.ruleId === "spx/no-hardcoded-statuses",
      );

      expect(kindViolations).toHaveLength(1);
      expect(statusViolations).toHaveLength(1);
    });
  });
});
