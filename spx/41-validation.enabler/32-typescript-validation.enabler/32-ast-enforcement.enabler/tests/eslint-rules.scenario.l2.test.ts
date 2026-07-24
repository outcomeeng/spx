import type { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import {
  validationConfigSeverityScenarios,
  validationLintScenarios,
  validationRuleRegistrationCases,
  validationTypeScriptExclusionsScenario,
} from "@testing/generators/validation/ast-enforcement";
import {
  createValidationEslint,
  lintValidationText,
  messagesForRule,
  observeMissingTypeScriptConfigError,
  observePackageTypeScriptExcludeGlobs,
  observeRelativeTypeScriptExcludeGlobs,
  readLintDebtManifestEntries,
  readValidationConfigRules,
  severityOf,
} from "@testing/harnesses/validation/eslint";
import { observeTestOwnedConstantDebtAddition } from "@testing/harnesses/validation/lint-policy-observation";

const lintDebtManifests = readLintDebtManifestEntries();

describe("ESLint rules integration", () => {
  let eslint: ESLint;

  beforeAll(() => {
    eslint = createValidationEslint();
  });

  describe("plugin registration", () => {
    for (const testCase of validationRuleRegistrationCases()) {
      it(testCase.title, async () => {
        const rules = await readValidationConfigRules(eslint, testCase.filePath);
        for (const ruleId of testCase.ruleIds) expect(rules).toHaveProperty(ruleId);
      });
    }
  });

  const configSeverityScenarios = validationConfigSeverityScenarios(lintDebtManifests);
  if (configSeverityScenarios.length > 0) {
    describe("configured severity", () => {
      for (const testCase of configSeverityScenarios) {
        it(testCase.title, async () => {
          const rules = await readValidationConfigRules(eslint, testCase.filePath);
          for (const expectation of testCase.expectations) {
            expect(severityOf(rules[expectation.ruleId])).toBe(expectation.severity);
          }
        });
      }
    });
  }

  describe("production lint behavior", () => {
    for (const testCase of validationLintScenarios(lintDebtManifests)) {
      it(testCase.title, async () => {
        const result = await lintValidationText(eslint, testCase);
        for (const expectation of testCase.expectations) {
          const messages = messagesForRule(result, expectation.ruleId);
          expect(messages).toHaveLength(expectation.count);
          if (expectation.severity !== undefined) {
            for (const message of messages) expect(message.severity).toBe(expectation.severity);
          }
        }
      });
    }
  });

  it("rejects test-owned-constant debt added beyond the committed baseline", async () => {
    const observation = await observeTestOwnedConstantDebtAddition();
    expect(observation.result.ok).toBe(false);
    if (!observation.result.ok) {
      expect(observation.result.error).toContain(observation.manifestPath);
      expect(observation.result.error).toContain(observation.addedPath);
    }
  });

  describe("TypeScript config exclusions", () => {
    it("fails loudly when the configured TypeScript config cannot be read", () => {
      const testCase = validationTypeScriptExclusionsScenario();
      expect(observeMissingTypeScriptConfigError(testCase)).toContain(testCase.missingConfigFile);
    });

    it("reads exclusions through relative TypeScript config extends", async () => {
      const testCase = validationTypeScriptExclusionsScenario();
      expect(await observeRelativeTypeScriptExcludeGlobs(testCase)).toEqual(
        expect.arrayContaining([...testCase.expectedGlobs]),
      );
    });

    it("reads exclusions through package TypeScript config extends", async () => {
      const testCase = validationTypeScriptExclusionsScenario();
      expect(await observePackageTypeScriptExcludeGlobs(testCase)).toEqual(
        expect.arrayContaining([...testCase.expectedPackageGlobs]),
      );
    });
  });
});
