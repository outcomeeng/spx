import { describe } from "vitest";

import rule, { NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME } from "@eslint-rules/no-test-owned-domain-constants";
import { noTestOwnedDomainConstantsCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("test-owned domain constant rule", () => {
  runValidationRuleTester({
    ruleName: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME,
    rule,
    cases: noTestOwnedDomainConstantsCases(),
  });
});
