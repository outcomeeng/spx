import type { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import {
  validationConfigSeverityScenarios,
  validationLintScenarios,
  validationRuleRegistrationCases,
} from "@testing/generators/validation/ast-enforcement";
import {
  createValidationEslint,
  lintValidationText,
  messagesForRule,
  severityOf,
} from "@testing/harnesses/validation/eslint";

describe("ESLint rules integration", () => {
  let eslint: ESLint;

  beforeAll(() => {
    eslint = createValidationEslint();
  });

  describe("plugin registration", () => {
    for (const testCase of validationRuleRegistrationCases()) {
      it(testCase.title, async () => {
        const config = await eslint.calculateConfigForFile(testCase.filePath);

        for (const ruleId of testCase.ruleIds) {
          expect(config.rules).toHaveProperty(ruleId);
        }
      });
    }
  });

  describe("configured severity", () => {
    for (const testCase of validationConfigSeverityScenarios()) {
      it(testCase.title, async () => {
        const config = await eslint.calculateConfigForFile(testCase.filePath);

        for (const expectation of testCase.expectations) {
          expect(severityOf(config.rules[expectation.ruleId])).toBe(expectation.severity);
        }
      });
    }
  });

  describe("production lint behavior", () => {
    for (const testCase of validationLintScenarios()) {
      it(testCase.title, async () => {
        const result = await lintValidationText(eslint, testCase);

        for (const expectation of testCase.expectations) {
          const messages = messagesForRule(result, expectation.ruleId);

          expect(messages).toHaveLength(expectation.count);

          if (expectation.severity !== undefined) {
            for (const message of messages) {
              expect(message.severity).toBe(expectation.severity);
            }
          }
        }
      });
    }
  });
});
