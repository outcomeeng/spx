/**
 * Level 2 Integration Tests: ESLint Rules
 *
 * Tests that custom ESLint rules integrate correctly with real ESLint.
 *
 * - Uses real ESLint instance with production config
 * - Verifies plugin loading and rule registration
 * - Verifies file-type filtering (test vs non-test files)
 * - Does NOT duplicate every valid/invalid case from unit tests
 */
import { NO_BARE_STRING_UNIONS_RULE_ID } from "@eslint-rules/no-bare-string-unions";
import { NO_DEEP_RELATIVE_IMPORTS_RULE_ID } from "@eslint-rules/no-deep-relative-imports";
import { NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID } from "@eslint-rules/no-import-source-extensions";
import { NO_REGISTRY_POSITION_ACCESS_RULE_ID } from "@eslint-rules/no-registry-position-access";
import { NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID } from "@eslint-rules/no-test-owned-domain-constants";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_TEST_FILE } from "@root/spx/41-validation.enabler/32-typescript-validation.enabler/tests/support";

const unmanifestedSpecTestFile = "spx/31-spec-domain.capability/tests/new.mapping.l1.test.ts";

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
  const projectRoot = process.cwd();

  beforeAll(() => {
    eslint = new ESLint({
      cwd: projectRoot,
    });
  });

  function severityOf(ruleConfig: unknown): number | undefined {
    if (typeof ruleConfig === "number") return ruleConfig;
    if (Array.isArray(ruleConfig) && typeof ruleConfig[0] === "number") return ruleConfig[0];
    return undefined;
  }

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

    it("GIVEN eslint config WHEN calculating config THEN test-owned constant rule is registered", async () => {
      const config = await eslint.calculateConfigForFile(unmanifestedSpecTestFile);

      expect(config.rules).toHaveProperty(NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID);
    });

    it("GIVEN eslint config WHEN calculating config THEN registry position rule is registered", async () => {
      const config = await eslint.calculateConfigForFile("test.test.ts");

      expect(config.rules).toHaveProperty(NO_REGISTRY_POSITION_ACCESS_RULE_ID);
    });

    it("GIVEN eslint config WHEN calculating config for TS file THEN import hygiene rules are registered", async () => {
      const config = await eslint.calculateConfigForFile(TYPESCRIPT_VALIDATION_TEST_FILE);

      expect(config.rules).toHaveProperty(NO_BARE_STRING_UNIONS_RULE_ID);
      expect(config.rules).toHaveProperty(NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID);
      expect(config.rules).toHaveProperty(NO_DEEP_RELATIVE_IMPORTS_RULE_ID);
    });

    it("GIVEN eslint config WHEN calculating config for TS file THEN no-spec-references rule is registered", async () => {
      const config = await eslint.calculateConfigForFile(TYPESCRIPT_VALIDATION_TEST_FILE);

      expect(config.rules).toHaveProperty("spx/no-spec-references");
    });

    it("GIVEN eslint config WHEN calculating config for TS file THEN no-restricted-syntax is active", async () => {
      const config = await eslint.calculateConfigForFile(TYPESCRIPT_VALIDATION_TEST_FILE);

      expect(config.rules).toHaveProperty("no-restricted-syntax");
    });
  });

  describe("import hygiene detection", () => {
    it("GIVEN bare string union WHEN linting THEN reports violation", async () => {
      const results = await eslint.lintText(
        `type Tier = "free" | "pro";`,
        { filePath: TYPESCRIPT_VALIDATION_TEST_FILE },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({ ruleId: NO_BARE_STRING_UNIONS_RULE_ID }),
      );
    });

    it("GIVEN internal source extension WHEN linting THEN reports violation", async () => {
      const results = await eslint.lintText(
        `import "./local.js";`,
        { filePath: TYPESCRIPT_VALIDATION_TEST_FILE },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({ ruleId: NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID }),
      );
    });

    it("GIVEN deep parent import WHEN linting THEN reports violation", async () => {
      const results = await eslint.lintText(
        `import "../../config";`,
        { filePath: "src/commands/session/example.ts" },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({ ruleId: NO_DEEP_RELATIVE_IMPORTS_RULE_ID }),
      );
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

  describe("test-owned domain constant detection", () => {
    it("GIVEN test file outside debt manifest with top-level uppercase constant WHEN linting THEN reports error", async () => {
      const results = await eslint.lintText(
        `const NODE_KIND = "enabler";`,
        {
          filePath: unmanifestedSpecTestFile,
        },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({
          ruleId: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
          severity: 2,
        }),
      );
    });

    it("GIVEN test file inside debt manifest WHEN calculating config THEN only test-owned constant rule is downgraded", async () => {
      const config = await eslint.calculateConfigForFile(
        "spx/41-validation.enabler/21-validation-cli.enabler/tests/package-scripts.compliance.l1.test.ts",
      );

      expect(severityOf(config.rules[NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID])).toBe(1);
      expect(severityOf(config.rules["spx/no-hardcoded-statuses"])).toBe(2);
    });

    it("GIVEN test file inside debt manifest with top-level uppercase constant WHEN linting THEN reports warning", async () => {
      const results = await eslint.lintText(
        `const NODE_KIND = "enabler";`,
        {
          filePath: "spx/41-validation.enabler/21-validation-cli.enabler/tests/package-scripts.compliance.l1.test.ts",
        },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({
          ruleId: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
          severity: 1,
        }),
      );
    });
  });

  describe("registry position detection", () => {
    it("GIVEN test file with positional registry read WHEN linting THEN reports violation", async () => {
      const results = await eslint.lintText(
        `import { DECISION_KINDS } from "@/lib/spec-tree/config"; const kind = DECISION_KINDS[0];`,
        { filePath: "test.test.ts" },
      );

      expect(results[0].messages).toContainEqual(
        expect.objectContaining({ ruleId: NO_REGISTRY_POSITION_ACCESS_RULE_ID }),
      );
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
