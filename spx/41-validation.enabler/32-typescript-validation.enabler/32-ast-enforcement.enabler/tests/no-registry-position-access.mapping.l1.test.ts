import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe } from "vitest";

import rule, {
  NO_REGISTRY_POSITION_ACCESS_RULE_NAME,
  REGISTRY_POSITION_ACCESS_MESSAGE_ID,
} from "@eslint-rules/no-registry-position-access";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tseslint.parser,
  },
});

describe("no-registry-position-access", () => {
  ruleTester.run(NO_REGISTRY_POSITION_ACCESS_RULE_NAME, rule, {
    valid: [
      {
        name: "GIVEN non-registry array index WHEN linting THEN no error",
        code: `const first = values[0];`,
        filename: "spx/sample.enabler/tests/registry.mapping.l1.test.ts",
      },
      {
        name: "GIVEN registry indexed access type WHEN linting THEN no error",
        code: `type NodeKind = (typeof NODE_KINDS)[number];`,
        filename: "spx/sample.enabler/tests/registry.mapping.l1.test.ts",
      },
      {
        name: "GIVEN named registry access WHEN linting THEN no error",
        code: `const kind = WORK_ITEM_KINDS.STORY;`,
        filename: "spx/sample.enabler/tests/registry.mapping.l1.test.ts",
      },
      {
        name: "GIVEN legacy work-item registry numeric index WHEN linting THEN no error",
        code: `const status = WORK_ITEM_STATUSES[2];`,
        filename: "spx/sample.enabler/tests/registry.mapping.l1.test.ts",
      },
      {
        name: "GIVEN generator module samples registry by position WHEN linting THEN no error",
        code: `const kind = NODE_KINDS[0];`,
        filename: "testing/generators/spec-tree.ts",
      },
    ],
    invalid: [
      {
        name: "GIVEN DECISION_KINDS numeric index WHEN linting THEN error",
        code: `const kind = DECISION_KINDS[0];`,
        filename: "spx/sample.enabler/tests/registry.mapping.l1.test.ts",
        errors: [{ messageId: REGISTRY_POSITION_ACCESS_MESSAGE_ID }],
      },
      {
        name: "GIVEN NODE_KINDS numeric index in assertion WHEN linting THEN error",
        code: `expect(node.kind).toBe(NODE_KINDS[1]);`,
        filename: "spx/sample.enabler/tests/registry.mapping.l1.test.ts",
        errors: [{ messageId: REGISTRY_POSITION_ACCESS_MESSAGE_ID }],
      },
    ],
  });
});
