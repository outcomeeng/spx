import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe } from "vitest";

import rule, {
  NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME,
  TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID,
  TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID,
} from "@eslint-rules/no-test-owned-domain-constants";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tseslint.parser,
  },
});

describe("no-test-owned-domain-constants", () => {
  ruleTester.run(NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME, rule, {
    valid: [
      {
        name: "GIVEN imported source-owned constant WHEN linting THEN no error",
        code: `import { NODE_KINDS } from "@/lib/spec-tree/config"; expect(kind).toBe(NODE_KINDS[0]);`,
        filename: "spx/sample.enabler/tests/source-owned.mapping.l1.test.ts",
      },
      {
        name: "GIVEN uppercase type alias WHEN linting THEN no error",
        code: `type NODE_KIND = "enabler";`,
        filename: "spx/sample.enabler/tests/support.ts",
      },
      {
        name: "GIVEN uppercase class declaration WHEN linting THEN no error",
        code: `class NODE_BUILDER { build(): string { return "node"; } }`,
        filename: "spx/sample.enabler/tests/support.ts",
      },
      {
        name: "GIVEN lower-case generated helper value WHEN linting THEN no error",
        code: `const generatedNodeKind = sampleNodeKind(registry);`,
        filename: "spx/sample.enabler/tests/support.ts",
      },
      {
        name: "GIVEN local uppercase constant inside test callback WHEN linting THEN no error",
        code:
          `it("uses generated input", () => { const GENERATED_KIND = sampleNodeKind(registry); expect(GENERATED_KIND).toBeDefined(); });`,
        filename: "spx/sample.enabler/tests/source-owned.mapping.l1.test.ts",
      },
      {
        name: "GIVEN production uppercase constant WHEN linting THEN no error",
        code: `const NODE_KIND = "enabler";`,
        filename: "src/spec-tree/source.ts",
      },
    ],
    invalid: [
      {
        name: "GIVEN top-level uppercase test constant WHEN linting THEN error",
        code: `const NODE_KIND = "enabler";`,
        filename: "spx/sample.enabler/tests/source-owned.mapping.l1.test.ts",
        errors: [{ messageId: TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID }],
      },
      {
        name: "GIVEN exported uppercase support constant WHEN linting THEN error",
        code: `export const NODE_KIND = "enabler";`,
        filename: "spx/sample.enabler/tests/support.ts",
        errors: [{ messageId: TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID }],
      },
      {
        name: "GIVEN top-level as const object registry WHEN linting THEN error",
        code: `const sectionModes = { STRICT: "strict", LENIENT: "lenient" } as const;`,
        filename: "spx/sample.enabler/tests/support.ts",
        errors: [{ messageId: TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID }],
      },
      {
        name: "GIVEN top-level as const tuple registry WHEN linting THEN error",
        code: `const sectionModes = ["strict", "lenient"] as const;`,
        filename: "spx/sample.enabler/tests/source-owned.mapping.l1.test.ts",
        errors: [{ messageId: TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID }],
      },
    ],
  });
});
