import { describe, expect, it } from "vitest";

import rule, { NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME } from "@eslint-rules/no-async-spawn-outside-lifecycle";
import { noAsyncSpawnOutsideLifecycleCases } from "@testing/generators/validation/ast-enforcement";
import { observeValidationRuleRun } from "@testing/harnesses/validation/eslint";

describe("async child process lifecycle import rule", () => {
  it("maps generated asynchronous spawn import cases to lifecycle diagnostics", () => {
    const observation = observeValidationRuleRun({
      ruleName: NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME,
      rule,
      cases: noAsyncSpawnOutsideLifecycleCases(),
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
