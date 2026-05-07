import { describe } from "vitest";

import rule, { NO_HARDCODED_WORK_ITEM_KINDS_RULE_NAME } from "@eslint-rules/no-hardcoded-work-item-kinds";
import { noHardcodedWorkItemKindsCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("hardcoded work item kind rule", () => {
  runValidationRuleTester({
    ruleName: NO_HARDCODED_WORK_ITEM_KINDS_RULE_NAME,
    rule,
    cases: noHardcodedWorkItemKindsCases(),
  });
});
