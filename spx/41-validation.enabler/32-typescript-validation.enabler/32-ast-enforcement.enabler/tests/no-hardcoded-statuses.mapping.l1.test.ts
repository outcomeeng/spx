import { describe } from "vitest";

import rule, { NO_HARDCODED_STATUSES_RULE_NAME } from "@eslint-rules/no-hardcoded-statuses";
import { noHardcodedStatusesCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("hardcoded status rule", () => {
  runValidationRuleTester({
    ruleName: NO_HARDCODED_STATUSES_RULE_NAME,
    rule,
    cases: noHardcodedStatusesCases(),
  });
});
