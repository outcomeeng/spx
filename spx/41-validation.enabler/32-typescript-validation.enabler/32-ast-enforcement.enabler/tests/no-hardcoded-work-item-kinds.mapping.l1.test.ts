/**
 * Level 1 Unit Tests: no-hardcoded-work-item-kinds
 *
 * Tests the ESLint rule that detects hardcoded work item kind strings
 * ("capability", "feature", "story") in test assertions.
 *
 * - Uses ESLint RuleTester for fast, isolated rule testing
 * - Tests behavior (what violations are reported), not AST internals
 * - Integration with real ESLint is tested at Level 2
 */
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe } from "vitest";

import rule from "@eslint-rules/no-hardcoded-work-item-kinds";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tseslint.parser,
  },
});

describe("no-hardcoded-work-item-kinds", () => {
  /**
   * Test Levels for this rule:
   *
   * Level 1 (Unit) - THIS FILE:
   * - AST detection of hardcoded strings in assertions
   * - Whitelist context checking (test descriptions, type definitions)
   * - Error message formatting with actionable suggestions
   *
   * Level 2 - eslint-rules.scenario.l2.test.ts:
   * - Plugin registration in eslint.config.ts
   * - File pattern filtering (test vs non-test files)
   * - Cross-rule interaction
   */

  ruleTester.run("no-hardcoded-work-item-kinds", rule, {
    valid: [
      //
      // WHITELIST: Test descriptions (it/describe/test)
      //
      {
        name: "GIVEN describe() with kind string WHEN linting THEN no error (test description allowed)",
        code: `describe("story parsing", () => {})`,
        filename: "test.test.ts",
      },
      {
        name: "GIVEN it() with kind string WHEN linting THEN no error (test description allowed)",
        code: `it("handles feature correctly", () => {})`,
        filename: "test.test.ts",
      },
      {
        name: "GIVEN test() with kind string WHEN linting THEN no error (test description allowed)",
        code: `test("capability validation", () => {})`,
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Using source-owned registries instead of literals
      //
      {
        name: "GIVEN expect with imported WORK_ITEM_KINDS registry WHEN linting THEN no error",
        code: `import { WORK_ITEM_KINDS } from "@/types"; expect(item.kind).toBe(WORK_ITEM_KINDS[2])`,
        filename: "test.test.ts",
      },
      {
        name: "GIVEN expect with LEAF_KIND constant WHEN linting THEN no error",
        code: `import { LEAF_KIND } from "@/types"; expect(item.kind).toBe(LEAF_KIND)`,
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Type definitions
      //
      {
        name: "GIVEN type alias with kind literal WHEN linting THEN no error (type definition allowed)",
        code: `type Kind = "story"`,
        filename: "types.ts",
      },
      {
        name: "GIVEN registry-derived kind type WHEN linting THEN no error (type definition allowed)",
        code: `type WorkItemKind = (typeof WORK_ITEM_KINDS)[number]`,
        filename: "src/types.ts",
      },

      //
      // WHITELIST: Non-test files
      //
      {
        name: "GIVEN non-test file with kind literal WHEN linting THEN no error (rule only applies to test files)",
        code: `const kind = "story"`,
        filename: "src/parser.ts",
      },
      {
        name: "GIVEN production code with kind assignment WHEN linting THEN no error",
        code: `function check() { if (item.kind === "feature") { return true; } }`,
        filename: "src/scanner/walk.ts",
      },

      //
      // WHITELIST: Regex patterns
      //
      {
        name: "GIVEN regex pattern with kind string WHEN linting THEN no error",
        code: `const pattern = /^(capability|feature|story)-/`,
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Object keys (not values)
      //
      {
        name: "GIVEN object with kind as key WHEN linting THEN no error",
        code: `const map = { story: 1, feature: 2, capability: 3 }`,
        filename: "test.test.ts",
      },

      //
      // WHITELIST: Template literals in test descriptions
      //
      {
        name: "GIVEN template literal in describe WHEN linting THEN no error",
        code: "describe(`story parsing for ${name}`, () => {})",
        filename: "test.test.ts",
      },
    ],

    invalid: [
      //
      // DETECT: expect().toBe() with kind literals
      //
      {
        name: "GIVEN expect().toBe(\"story\") WHEN linting THEN error with useWorkItemKinds message",
        code: `expect(item.kind).toBe("story")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },
      {
        name: "GIVEN expect().toBe(\"feature\") WHEN linting THEN error with useWorkItemKinds message",
        code: `expect(item.kind).toBe("feature")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },
      {
        name: "GIVEN expect().toBe(\"capability\") WHEN linting THEN error with useWorkItemKinds message",
        code: `expect(item.kind).toBe("capability")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: expect().toEqual() with kind literals
      //
      {
        name: "GIVEN expect().toEqual(\"feature\") WHEN linting THEN error",
        code: `expect(kind).toEqual("feature")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: expect().toMatchObject() with kind literals in object
      //
      {
        name: "GIVEN expect().toMatchObject() with kind property WHEN linting THEN error",
        code: `expect(result).toMatchObject({ kind: "capability" })`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: expect().toContain() with kind literals
      //
      {
        name: "GIVEN expect().toContain(\"story\") WHEN linting THEN error",
        code: `expect(kinds).toContain("story")`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: Nested object assertions
      //
      {
        name: "GIVEN nested object with kind literal WHEN linting THEN error",
        code: `expect(tree.children[0]).toMatchObject({ item: { kind: "feature" } })`,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: Multiple violations in same file
      //
      {
        name: "GIVEN multiple hardcoded kinds WHEN linting THEN multiple errors",
        code: `
          expect(a.kind).toBe("story");
          expect(b.kind).toBe("feature");
        `,
        filename: "test.test.ts",
        errors: [{ messageId: "useWorkItemKinds" }, { messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: spec files (alternative test file pattern)
      //
      {
        name: "GIVEN .spec.ts file with hardcoded kind WHEN linting THEN error",
        code: `expect(item.kind).toBe("story")`,
        filename: "parser.spec.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: files in /tests/ directory
      //
      {
        name: "GIVEN file in /tests/ directory with hardcoded kind WHEN linting THEN error",
        code: `expect(item.kind).toBe("capability")`,
        filename: "tests/unit/scanner.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },

      //
      // DETECT: files in /__tests__/ directory
      //
      {
        name: "GIVEN file in /__tests__/ directory with hardcoded kind WHEN linting THEN error",
        code: `expect(item.kind).toBe("feature")`,
        filename: "src/__tests__/parser.ts",
        errors: [{ messageId: "useWorkItemKinds" }],
      },
    ],
  });
});
