import { describe } from "vitest";

import rule, { NO_REGISTRY_POSITION_ACCESS_RULE_NAME } from "@eslint-rules/no-registry-position-access";
import { noRegistryPositionAccessCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("registry positional access rule", () => {
  runValidationRuleTester({
    ruleName: NO_REGISTRY_POSITION_ACCESS_RULE_NAME,
    rule,
    cases: noRegistryPositionAccessCases(),
  });
});
