import { describe, expect, it } from "vitest";

import rule, {
  NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME,
} from "@eslint-rules/no-hardcoded-session-frontmatter-keys";
import { noHardcodedSessionFrontmatterKeysCases } from "@testing/generators/validation/ast-enforcement";
import { observeValidationRuleRun } from "@testing/harnesses/validation/eslint";

describe("hardcoded session frontmatter key rule", () => {
  it("maps generated session frontmatter key cases to ownership diagnostics", () => {
    const observation = observeValidationRuleRun({
      ruleName: NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_NAME,
      rule,
      cases: noHardcodedSessionFrontmatterKeysCases(),
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
