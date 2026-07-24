import { describe, expect, it } from "vitest";

import rule, { NO_REGISTRY_POSITION_ACCESS_RULE_NAME } from "@eslint-rules/no-registry-position-access";
import { noRegistryPositionAccessCases } from "@testing/generators/validation/ast-enforcement";
import { observeValidationRuleRun } from "@testing/harnesses/validation/eslint";

describe("registry positional access rule", () => {
  it("maps generated registry-position cases to access diagnostics", () => {
    const observation = observeValidationRuleRun({
      ruleName: NO_REGISTRY_POSITION_ACCESS_RULE_NAME,
      rule,
      cases: noRegistryPositionAccessCases(),
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
