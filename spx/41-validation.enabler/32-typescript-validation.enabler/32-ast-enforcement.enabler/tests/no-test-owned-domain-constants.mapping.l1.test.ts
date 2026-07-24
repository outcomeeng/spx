import { describe, expect, it } from "vitest";

import rule, { NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME } from "@eslint-rules/no-test-owned-domain-constants";
import { noTestOwnedDomainConstantsCases } from "@testing/generators/validation/ast-enforcement";
import { observeValidationRuleRun } from "@testing/harnesses/validation/eslint";

describe("test-owned domain constant rule", () => {
  it("maps generated test-owned domain bindings to ownership diagnostics", () => {
    const observation = observeValidationRuleRun({
      ruleName: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_NAME,
      rule,
      cases: noTestOwnedDomainConstantsCases(),
    });
    for (const testCase of observation.valid) expect(testCase.messages).toHaveLength(0);
    for (const testCase of observation.invalid) {
      expect(testCase.messages).toHaveLength(testCase.expectedErrors.length);
      for (const [index, expected] of testCase.expectedErrors.entries()) {
        const actual = testCase.messages[index];
        expect(actual?.messageId ?? actual?.message).toBe(expected.messageId ?? expected.message);
      }
      if (testCase.expectedOutput !== undefined) {
        expect(testCase.actualOutput).toBe(testCase.expectedOutput ?? testCase.source);
      }
    }
  });
});
