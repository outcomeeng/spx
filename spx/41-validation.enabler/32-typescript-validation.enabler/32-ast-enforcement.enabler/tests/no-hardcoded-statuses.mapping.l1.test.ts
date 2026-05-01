/**
 * Level 1 Unit Tests: no-hardcoded-statuses
 *
 * Tests the ESLint rule that detects hardcoded work item status strings
 * ("OPEN", "IN_PROGRESS", "DONE") in test assertions.
 *
 * - Uses ESLint RuleTester for fast, isolated rule testing
 * - Tests behavior (what violations are reported), not AST internals
 * - Integration with real ESLint is tested at Level 2
 */
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe } from "vitest";

import rule from "@eslint-rules/no-hardcoded-statuses";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tseslint.parser,
  },
});

describe("no-hardcoded-statuses", () => {
  /**
   * Test Levels for this rule:
   *
   * Level 1 (Unit) - THIS FILE:
   * - AST detection of hardcoded status strings in assertions
   * - Whitelist context checking (test descriptions, type definitions)
   * - Error message formatting with actionable suggestions
   *
   * Level 2 - eslint-rules.scenario.l2.test.ts:
   * - Plugin registration in eslint.config.ts
   * - File pattern filtering (test vs non-test files)
   * - Cross-rule interaction
   */

  ruleTester.run("no-hardcoded-statuses", rule, {
    valid: [
      //
      // WHITELIST: Test descriptions (it/describe/test)
      //
      {
        name: "GIVEN describe() with status string WHEN linting THEN no error (test description allowed)",
        code: `describe("DONE status handling", () => {})`,
        filename: "test.test.ts",
      },
      {
        name: "GIVEN it() with status string WHEN linting THEN no error (test description allowed)",
        code: `it("marks item as IN_PROGRESS", () => {})`,
        filename: "test.test.ts",
      },
      {
        name: "GIVEN test() with status string WHEN linting THEN no error (test description allowed)",
        code: `test("OPEN items are returned first", () => {})`,
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Using source-owned registries instead of literals
      //
      {
        name: "GIVEN expect with imported WORK_ITEM_STATUSES registry WHEN linting THEN no error",
        code: `import { WORK_ITEM_STATUSES } from "@/types"; expect(item.status).toBe(WORK_ITEM_STATUSES[0])`,
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Type definitions
      //
      {
        name: "GIVEN type alias with status literal WHEN linting THEN no error (type definition allowed)",
        code: `type Status = "DONE"`,
        filename: "types.ts",
      },
      {
        name: "GIVEN registry-derived status type WHEN linting THEN no error (type definition allowed)",
        code: `type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number]`,
        filename: "src/types.ts",
      },

      //
      // WHITELIST: Non-test files
      //
      {
        name: "GIVEN non-test file with status literal WHEN linting THEN no error (rule only applies to test files)",
        code: `const status = "DONE"`,
        filename: "src/status.ts",
      },
      {
        name: "GIVEN production code with status comparison WHEN linting THEN no error",
        code: `function check() { if (item.status === "IN_PROGRESS") { return true; } }`,
        filename: "src/scanner/walk.ts",
      },

      //
      // WHITELIST: Object keys (not values)
      //
      {
        name: "GIVEN object with status as key WHEN linting THEN no error",
        code: `const map = { OPEN: 1, IN_PROGRESS: 2, DONE: 3 }`,
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Template literals in test descriptions
      //
      {
        name: "GIVEN template literal in describe WHEN linting THEN no error",
        code: "describe(`DONE status for ${name}`, () => {})",
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Strings that contain but don't match exactly
      //
      {
        name: "GIVEN partial match 'DONE.md' WHEN linting THEN no error",
        code: `expect(file).toBe("DONE.md")`,
        filename: "test.test.ts",
      },
      {
        name: "GIVEN partial match 'tests/DONE.md' WHEN linting THEN no error",
        code: `expect(path).toContain("tests/DONE.md")`,
        filename: "test.test.ts",
      },
    ],

    invalid: [
      //
      // DETECT: expect().toBe() with status literals
      //
      {
        name: "GIVEN expect().toBe(\"DONE\") WHEN linting THEN error with useWorkItemStatuses message",
        code: `expect(item.status).toBe("DONE")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },
      {
        name: "GIVEN expect().toBe(\"IN_PROGRESS\") WHEN linting THEN error with useWorkItemStatuses message",
        code: `expect(item.status).toBe("IN_PROGRESS")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },
      {
        name: "GIVEN expect().toBe(\"OPEN\") WHEN linting THEN error with useWorkItemStatuses message",
        code: `expect(item.status).toBe("OPEN")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: expect().toEqual() with status literals
      //
      {
        name: "GIVEN expect().toEqual(\"DONE\") WHEN linting THEN error",
        code: `expect(status).toEqual("DONE")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: expect().toMatchObject() with status literals in object
      //
      {
        name: "GIVEN expect().toMatchObject() with status property WHEN linting THEN error",
        code: `expect(result).toMatchObject({ status: "IN_PROGRESS" })`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: expect().toContain() with status literals
      //
      {
        name: "GIVEN expect().toContain(\"OPEN\") WHEN linting THEN error",
        code: `expect(statuses).toContain("OPEN")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: Nested object assertions
      //
      {
        name: "GIVEN nested object with status literal WHEN linting THEN error",
        code: `expect(tree.node).toMatchObject({ item: { status: "DONE" } })`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: Multiple violations in same file
      //
      {
        name: "GIVEN multiple hardcoded statuses WHEN linting THEN multiple errors",
        code: `
          expect(a.status).toBe("OPEN");
          expect(b.status).toBe("DONE");
        `,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemStatuses" }, { messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: spec files (alternative test file pattern)
      //
      {
        name: "GIVEN .spec.ts file with hardcoded status WHEN linting THEN error",
        code: `expect(item.status).toBe("DONE")`,
        filename: "status.spec.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: files in /tests/ directory
      //
      {
        name: "GIVEN file in /tests/ directory with hardcoded status WHEN linting THEN error",
        code: `expect(item.status).toBe("IN_PROGRESS")`,
        filename: "tests/unit/state.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },

      //
      // DETECT: files in /__tests__/ directory
      //
      {
        name: "GIVEN file in /__tests__/ directory with hardcoded status WHEN linting THEN error",
        code: `expect(item.status).toBe("OPEN")`,
        filename: "src/__tests__/state.ts",
        errors: [{ messageId: "useWorkItemStatuses" }],
      },
    ],
  });
});
