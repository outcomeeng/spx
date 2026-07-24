import { describe, expect, it } from "vitest";

import rule, { NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_NAME } from "@eslint-rules/no-process-cwd-for-product-roots";
import { noProcessCwdForProductRootsCases } from "@testing/generators/validation/ast-enforcement";
import { observeValidationRuleRun } from "@testing/harnesses/validation/eslint";

describe("process cwd product-root rule", () => {
  it("maps generated process cwd cases to product-root diagnostics", () => {
    const observation = observeValidationRuleRun({
      ruleName: NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_NAME,
      rule,
      cases: noProcessCwdForProductRootsCases(),
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
